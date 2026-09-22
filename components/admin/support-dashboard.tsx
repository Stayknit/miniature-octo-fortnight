"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import type {
  AdminTicketRow,
  AdminUserRow,
  AdminUserDetail,
  AdminUserStats,
  AdminPromoCode,
  DormantUserRow,
} from "@/app/actions/admin-support"
import {
  createPromoCode,
  getPlanPrices,
  getVatSetting,
  setVatSetting,
  getTicketThread,
  getUserDetail,
  listAudit,
  listDormantUsers,
  listPromoCodes,
  listTickets,
  listUsers,
  regenerateAiDraft,
  replyToTicket,
  sendDormantOutreach,
  sendUserResetEmail,
  setPlanPrice,
  setPromoCodeActive,
  setTicketStatus,
  updateUserContact,
  updateUserPlan,
  checkEmailHealth,
  sendDiagnosticEmail,
} from "@/app/actions/admin-support"
import type { PlanPriceRow, EmailHealth } from "@/app/actions/admin-support"
import type { VatConfig } from "@/lib/vat"
import type { AdminAuditLog, SupportMessage } from "@/lib/types"
import { CheckCircle2, XCircle, Loader2 } from "lucide-react"

type Tab = "tickets" | "users" | "dormant" | "codes" | "pricing" | "audit" | "email"

// Currencies whose monthly fee can be edited, with display symbols. ZAR leads
// (StayKnit's home/charge market); NAD is billed as ZAR but shown separately.
const PRICE_CURRENCIES: { code: string; label: string; symbol: string }[] = [
  { code: "zar", label: "ZAR", symbol: "R" },
  { code: "usd", label: "USD", symbol: "$" },
  { code: "eur", label: "EUR", symbol: "€" },
  { code: "gbp", label: "GBP", symbol: "£" },
  { code: "nad", label: "NAD", symbol: "N$" },
]

const PLAN_OPTIONS = [
  { key: "trial", label: "Free trial" },
  { key: "starter", label: "Starter" },
  { key: "host", label: "Host" },
  { key: "professional", label: "Professional" },
  { key: "business", label: "Business" },
  { key: "enterprise", label: "Enterprise" },
]

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"

function fmtDate(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return "—"
  // Render date and time separately with explicit 12-hour time. In 24-hour
  // locales (en-ZA/en-GB — StayKnit's home market) the old combined
  // `timeStyle: "short"` produced e.g. "16 Sept 2026, 20:18", where the time
  // "20:18" sits next to the year and reads like "2018". Forcing hour12 and a
  // "·" separator removes any 4-digit time that could be mistaken for a year.
  const date = d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true })
  return `${date} · ${time}`
}

export function SupportDashboard({
  initialTickets,
  initialUsers,
  initialUserStats,
}: {
  initialTickets: AdminTicketRow[]
  initialUsers: AdminUserRow[]
  initialUserStats: AdminUserStats
}) {
  const [tab, setTab] = useState<Tab>("tickets")

  return (
    <div className="flex flex-1 flex-col">
      <UserStatsBar stats={initialUserStats} />

      <nav className="mb-4 flex flex-wrap gap-1 border-b border-border">
        {(
          [
            ["tickets", "Tickets"],
            ["users", "Users"],
            ["dormant", "Dormant"],
            ["codes", "Codes"],
            ["pricing", "Pricing"],
            ["audit", "Audit log"],
            ["email", "Email"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "tickets" && <TicketsTab initialTickets={initialTickets} />}
      {tab === "users" && <UsersTab initialUsers={initialUsers} />}
      {tab === "dormant" && <DormantTab />}
      {tab === "codes" && <CodesTab />}
      {tab === "pricing" && <PricingTab />}
      {tab === "audit" && <AuditTab />}
      {tab === "email" && <EmailTab />}
    </div>
  )
}

// ---- User count summary ----------------------------------------------------

// Compact totals bar shown above every tab so the operator always sees the
// size of the user base at a glance. Figures come from COUNT queries server-
// side (see getUserStats), so they stay accurate beyond the 200-row user list.
function UserStatsBar({ stats }: { stats: AdminUserStats }) {
  const nf = useMemo(() => new Intl.NumberFormat(undefined), [])
  const cards: { label: string; value: number; hint: string }[] = [
    { label: "Total users", value: stats.total, hint: "All registered accounts" },
    { label: "Verified", value: stats.verified, hint: "Confirmed their email" },
    { label: "Paying", value: stats.paying, hint: "Active paid plan (excl. comp)" },
    { label: "New (30 days)", value: stats.newLast30, hint: "Signed up in the last 30 days" },
  ]
  return (
    <section aria-label="User totals" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-border bg-card p-3">
          <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{nf.format(c.value)}</p>
          <p className="mt-0.5 text-xs font-medium text-foreground">{c.label}</p>
          <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{c.hint}</p>
        </div>
      ))}
    </section>
  )
}

// ---- Email diagnostics -----------------------------------------------------

// Owner-only panel to diagnose why transactional email (verification links,
// password resets, ticket mail) might not be arriving. "Run check" performs a
// live SMTP handshake to prove credentials work; the test send proves
// end-to-end delivery (and whether mail lands in spam).
function EmailTab() {
  const [health, setHealth] = useState<EmailHealth | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkErr, setCheckErr] = useState<string | null>(null)

  const [testTo, setTestTo] = useState("")
  const [sending, setSending] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const runCheck = useCallback(async () => {
    setChecking(true)
    setCheckErr(null)
    try {
      setHealth(await checkEmailHealth())
    } catch {
      setCheckErr("Couldn't run the check. Make sure you're signed in as the owner.")
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    void runCheck()
  }, [runCheck])

  async function sendTest(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setTestResult(null)
    try {
      const r = await sendDiagnosticEmail(testTo)
      setTestResult(
        r.ok
          ? { ok: true, msg: `Sent. Check ${testTo} (including spam). Message id: ${r.messageId}` }
          : { ok: false, msg: r.error },
      )
    } catch {
      setTestResult({ ok: false, msg: "Send failed unexpectedly." })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">SMTP connection</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Live handshake with the mail server. This proves the mailbox credentials work — it does not send anything.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={runCheck} disabled={checking}>
            {checking ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : "Run check"}
          </Button>
        </div>

        {checkErr && <p className="mt-4 text-sm text-destructive">{checkErr}</p>}

        {health && (
          <ul className="mt-4 flex flex-col gap-3">
            {health.checks.map((c) => (
              <li key={c.label} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-start gap-2">
                  {c.ok ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{c.label}</p>
                    <p className="mt-0.5 break-all text-xs text-muted-foreground">
                      {c.mailbox} · {c.host}:{c.port} · {c.secure ? "SSL" : "STARTTLS"} ·{" "}
                      {c.configured ? "password set" : "no password"}
                    </p>
                    {c.note && <p className="mt-1 text-xs text-muted-foreground">{c.note}</p>}
                    {c.error && <p className="mt-1 text-xs text-destructive">{c.error}</p>}
                    {c.ok && !c.error && <p className="mt-1 text-xs text-primary">Authenticated OK.</p>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">Send a test email</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Sends a real message from {`the primary mailbox`}. If it arrives, sending works; if it only shows up in spam,
          the issue is deliverability (DNS/DKIM), not sending.
        </p>
        <form onSubmit={sendTest} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            type="email"
            required
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="you@example.com"
            className={inputClass}
          />
          <Button type="submit" disabled={sending} className="shrink-0">
            {sending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : "Send test"}
          </Button>
        </form>
        {testResult && (
          <p className={`mt-3 text-sm ${testResult.ok ? "text-primary" : "text-destructive"}`}>{testResult.msg}</p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface-2 p-5">
        <h2 className="text-sm font-semibold text-foreground">If the check passes but mail still isn&apos;t received</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">
          <li>Ask the user to check their spam/junk folder and search for &quot;StayKnit&quot;.</li>
          <li>
            SPF and DMARC are configured for stayknit.org, but there is <strong>no DKIM record</strong>. Adding the
            Namecheap Private Email DKIM key (Private Email → domain → auto-configure, or the{" "}
            <code>default._domainkey</code> TXT record) in Vercel DNS improves inbox placement.
          </li>
          <li>Some providers greylist new senders; a second attempt a few minutes later often lands.</li>
        </ul>
      </section>
    </div>
  )
}

// ---- Tickets ---------------------------------------------------------------

function TicketsTab({ initialTickets }: { initialTickets: AdminTicketRow[] }) {
  const [tickets, setTickets] = useState(initialTickets)
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open")
  const [selected, setSelected] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  async function refresh(f: "open" | "resolved" | "all") {
    setFilter(f)
    setBusy(true)
    try {
      setTickets(await listTickets(f))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid flex-1 gap-4 md:grid-cols-[minmax(260px,340px)_1fr]">
      <div className="flex flex-col gap-2">
        <div className="flex gap-1">
          {(["open", "resolved", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => refresh(f)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${
                filter === f ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          {tickets.length === 0 && (
            <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
              {busy ? "Loading…" : "No tickets here."}
            </p>
          )}
          {tickets.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                selected === t.id ? "border-primary bg-surface-2" : "border-border bg-card hover:bg-surface-2"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-foreground">
                  {t.subject || "(no subject)"}
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                    t.status === "open" ? "bg-primary/15 text-primary" : "bg-surface-2 text-muted-foreground"
                  }`}
                >
                  {t.status}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {t.userName} · {t.category}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/80">{t.message}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        {selected == null ? (
          <div className="flex h-full min-h-48 items-center justify-center rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground">
            Select a ticket to view the conversation and reply.
          </div>
        ) : (
          <TicketThread
            key={selected}
            ticketId={selected}
            onChanged={() => refresh(filter)}
            disabled={busy}
          />
        )}
      </div>
    </div>
  )
}

function TicketThread({
  ticketId,
  onChanged,
}: {
  ticketId: number
  onChanged: () => void
  disabled?: boolean
}) {
  const [ticket, setTicket] = useState<AdminTicketRow | null>(null)
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [reply, setReply] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState("")

  async function load() {
    setLoading(true)
    try {
      const data = await getTicketThread(ticketId)
      if (data) {
        setTicket(data.ticket)
        setMessages(data.messages)
        setReply(data.ticket.aiDraft || "")
      }
    } finally {
      setLoading(false)
    }
  }

  // Load the thread when this ticket is selected. The parent remounts this
  // component per ticket (keyed by id), so this runs once per selection.
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId])

  async function onRegenerate() {
    setBusy(true)
    setNote("")
    try {
      const { draft } = await regenerateAiDraft(ticketId)
      setReply(draft || "")
      setNote(draft ? "AI draft regenerated." : "AI could not draft a reply. Write one below.")
    } finally {
      setBusy(false)
    }
  }

  async function onSend(resolve: boolean) {
    const body = reply.trim()
    if (!body) {
      setNote("Write a reply first.")
      return
    }
    setBusy(true)
    setNote("")
    try {
      const fromAi = ticket?.aiDraft ? body === ticket.aiDraft.trim() : false
      const res = await replyToTicket({ ticketId, body, fromAi, resolve })
      if (!res.ok) {
        setNote(res.error || "Could not send.")
        return
      }
      setReply("")
      await load()
      onChanged()
      setNote(resolve ? "Reply sent and ticket resolved." : "Reply sent to the user.")
    } finally {
      setBusy(false)
    }
  }

  async function onToggleStatus() {
    if (!ticket) return
    setBusy(true)
    try {
      await setTicketStatus(ticketId, ticket.status === "open" ? "resolved" : "open")
      await load()
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  if (loading || !ticket) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Loading…</div>
    )
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-foreground">{ticket.subject || "(no subject)"}</h2>
          <p className="text-xs text-muted-foreground">
            {ticket.userName} · {ticket.userEmail} · {ticket.category} · opened {fmtDate(ticket.createdAt)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onToggleStatus} disabled={busy}>
          {ticket.status === "open" ? "Mark resolved" : "Reopen"}
        </Button>
      </div>

      {/* Conversation */}
      <div className="flex flex-col gap-2">
        <Bubble author="user" name={ticket.userName} body={ticket.message} when={fmtDate(ticket.createdAt)} />
        {messages.map((m) => (
          <Bubble
            key={m.id}
            author={m.author as "user" | "ai" | "agent"}
            name={m.author === "user" ? ticket.userName : m.author === "ai" ? "AI (sent)" : "You"}
            body={m.body}
            when={fmtDate(m.createdAt)}
            emailed={m.emailed}
          />
        ))}
      </div>

      {/* AI draft + reply box */}
      <div className="rounded-lg border border-border bg-surface-2 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {ticket.aiDraft && reply === ticket.aiDraft ? "AI-drafted reply (edit before sending)" : "Your reply"}
          </span>
          <button
            onClick={onRegenerate}
            disabled={busy}
            className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
          >
            Regenerate AI draft
          </button>
        </div>
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={6}
          placeholder="Write your reply to the user…"
          className={`${inputClass} resize-y`}
        />
        <p className="mt-1 text-xs text-muted-foreground">This reply is emailed to {ticket.userEmail} and saved to the thread.</p>
        {note && <p className="mt-1 text-xs text-primary">{note}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onSend(false)} disabled={busy}>
            {busy ? "Working…" : "Send reply"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => onSend(true)} disabled={busy}>
            Send &amp; resolve
          </Button>
        </div>
      </div>
    </div>
  )
}

function Bubble({
  author,
  name,
  body,
  when,
  emailed,
}: {
  author: "user" | "ai" | "agent"
  name: string
  body: string
  when: string
  emailed?: boolean
}) {
  const isUser = author === "user"
  return (
    <div className={`flex flex-col ${isUser ? "items-start" : "items-end"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser ? "bg-surface-2 text-foreground" : "bg-primary/10 text-foreground"
        }`}
      >
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {name} · {when}
          {emailed ? " · emailed" : ""}
        </p>
        <p className="whitespace-pre-wrap">{body}</p>
      </div>
    </div>
  )
}

// ---- Users -----------------------------------------------------------------

function UsersTab({ initialUsers }: { initialUsers: AdminUserRow[] }) {
  const [users, setUsers] = useState(initialUsers)
  const [search, setSearch] = useState("")
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  async function runSearch(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      setUsers(await listUsers(search))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid flex-1 gap-4 md:grid-cols-[minmax(280px,380px)_1fr]">
      <div className="flex flex-col gap-2">
        <form onSubmit={runSearch} className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, business…"
            className={inputClass}
          />
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "…" : "Search"}
          </Button>
        </form>
        <div className="flex flex-col gap-1.5">
          {users.length === 0 && (
            <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
              No users found.
            </p>
          )}
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => setSelected(u.id)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                selected === u.id ? "border-primary bg-surface-2" : "border-border bg-card hover:bg-surface-2"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-foreground">{u.name}</span>
                <div className="flex shrink-0 gap-1">
                  {u.comp && (
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      comp
                    </span>
                  )}
                  {u.openTickets > 0 && (
                    <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                      {u.openTickets} open
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{u.email}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground/80">
                {u.businessName || "—"} · {u.planLabel} · {u.propertyCount} listings
              </p>
            </button>
          ))}
        </div>
      </div>

      <div>
        {selected == null ? (
          <div className="flex h-full min-h-48 items-center justify-center rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground">
            Select a user to view details and make changes.
          </div>
        ) : (
          <UserDetail key={selected} userId={selected} onChanged={() => void runSearchSilent()} />
        )}
      </div>
    </div>
  )

  async function runSearchSilent() {
    setUsers(await listUsers(search))
  }
}

function UserDetail({ userId, onChanged }: { userId: string; onChanged: () => void }) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState("")

  const [name, setName] = useState("")
  const [businessName, setBusinessName] = useState("")
  const [phone, setPhone] = useState("")
  const [telephone, setTelephone] = useState("")
  const [planKey, setPlanKey] = useState("trial")
  const [comp, setComp] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const d = await getUserDetail(userId)
      if (d) {
        setDetail(d)
        setName(d.name)
        setBusinessName(d.businessName)
        setPhone(d.phone)
        setTelephone(d.telephone)
        setPlanKey(d.planKey)
        setComp(d.comp)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function saveContact() {
    setBusy(true)
    setNote("")
    try {
      const res = await updateUserContact({ userId, name, businessName, phone, telephone })
      setNote(res.ok ? "Contact details saved." : res.error || "Could not save.")
      if (res.ok) onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function savePlan() {
    setBusy(true)
    setNote("")
    try {
      const res = await updateUserPlan({ userId, planKey, comp })
      setNote(res.ok ? "Plan updated." : res.error || "Could not update plan.")
      if (res.ok) {
        await load()
        onChanged()
      }
    } finally {
      setBusy(false)
    }
  }

  async function resetEmail() {
    setBusy(true)
    setNote("")
    try {
      const res = await sendUserResetEmail(userId)
      setNote(res.ok ? "Password reset email sent." : res.error || "Could not send email.")
    } finally {
      setBusy(false)
    }
  }

  if (loading || !detail) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Loading…</div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-foreground">{detail.name}</h2>
            <p className="text-xs text-muted-foreground">
              {detail.email}
              {detail.emailVerified ? " · verified" : " · unverified"} · {detail.role} · joined{" "}
              {fmtDate(detail.createdAt)}
            </p>
          </div>
          <span className="rounded bg-surface-2 px-2 py-1 text-xs text-muted-foreground">
            {detail.propertyCount} listings · {detail.bookingCount} bookings
          </span>
        </div>
        {detail.properties.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {detail.properties.map((p) => p.name).join(" · ")}
          </p>
        )}
      </div>

      {/* Contact details */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Contact details</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Full name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </Labeled>
          <Labeled label="Business name">
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} className={inputClass} />
          </Labeled>
          <Labeled label="Mobile">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
          </Labeled>
          <Labeled label="Landline">
            <input value={telephone} onChange={(e) => setTelephone(e.target.value)} className={inputClass} />
          </Labeled>
        </div>
        <Button size="sm" onClick={saveContact} disabled={busy} className="self-start">
          Save contact details
        </Button>
      </div>

      {/* Plan */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Plan &amp; access</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Plan tier">
            <select value={planKey} onChange={(e) => setPlanKey(e.target.value)} className={inputClass}>
              {PLAN_OPTIONS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </Labeled>
          <label className="flex items-end gap-2 pb-2">
            <input type="checkbox" checked={comp} onChange={(e) => setComp(e.target.checked)} className="size-4" />
            <span className="text-sm text-foreground">Complimentary (no expiry, no billing)</span>
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Complimentary applies to paid tiers only: the account stays active with no trial countdown, freeze, or
          renewal emails.
        </p>
        <Button size="sm" onClick={savePlan} disabled={busy} className="self-start">
          Update plan
        </Button>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Account actions</h3>
        <Button size="sm" variant="outline" onClick={resetEmail} disabled={busy} className="self-start">
          Send password reset email
        </Button>
        <p className="text-xs text-muted-foreground">
          Emails a secure &ldquo;set your password&rdquo; link to {detail.email}.
        </p>
      </div>

      {note && <p className="text-sm text-primary">{note}</p>}
    </div>
  )
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

// ---- Dormant users ---------------------------------------------------------

const DORMANCY_OPTIONS = [14, 30, 60, 90] as const

function DormantTab() {
  const [days, setDays] = useState<number>(30)
  const [rows, setRows] = useState<DormantUserRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [contacting, setContacting] = useState<DormantUserRow | null>(null)

  const load = useCallback(async (d: number) => {
    setLoading(true)
    try {
      setRows(await listDormantUsers(d))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(days)
  }, [days, load])

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Inactive for at least</span>
        {DORMANCY_OPTIONS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              days === d ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground"
            }`}
          >
            {d} days
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {rows === null ? "" : `${rows.length} dormant host${rows.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {loading || rows === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          No hosts have been inactive that long. Nice — everyone&apos;s engaged.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((u) => (
            <div
              key={u.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">{u.name || u.email}</span>
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                    {u.planLabel}
                  </span>
                  {u.neverSignedIn && (
                    <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] uppercase text-destructive">
                      Never signed in
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {u.email}
                  {u.businessName ? ` · ${u.businessName}` : ""} · {u.propertyCount} propert
                  {u.propertyCount === 1 ? "y" : "ies"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {u.daysInactive} days inactive ·{" "}
                  {u.lastActiveAt ? `last seen ${fmtDate(u.lastActiveAt)}` : `joined ${fmtDate(u.createdAt)}`}
                </p>
              </div>
              <Button type="button" size="sm" onClick={() => setContacting(u)} className="shrink-0">
                Contact
              </Button>
            </div>
          ))}
        </div>
      )}

      {contacting && (
        <ContactDialog
          user={contacting}
          onClose={() => setContacting(null)}
          onSent={() => {
            setContacting(null)
            void load(days)
          }}
        />
      )}
    </div>
  )
}

function ContactDialog({
  user,
  onClose,
  onSent,
}: {
  user: DormantUserRow
  onClose: () => void
  onSent: () => void
}) {
  const firstName = (user.name || "").trim().split(/\s+/)[0] || ""
  const [subject, setSubject] = useState("We miss you at StayKnit")
  const [message, setMessage] = useState(
    `It's been a little while since we saw you on StayKnit, so we wanted to check in.\n\n` +
      `Is there anything we can help with to get you up and running? We're happy to walk you through setting up your ` +
      `properties and syncing your calendars — just reply to this email and we'll sort it out.\n\n` +
      `We'd love to have you back.`,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function onSend() {
    setError("")
    setBusy(true)
    try {
      const res = await sendDormantOutreach({ userId: user.id, subject, message })
      if (!res.ok) {
        setError(res.error ?? "Could not send.")
        return
      }
      onSent()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Contact ${user.name || user.email}`}
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-lg flex-col gap-3 rounded-xl border border-border bg-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-base font-semibold text-foreground">Contact {firstName || user.name || "host"}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Sends from support@stayknit.org to {user.email}. Replies come back to the support inbox.
          </p>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Message</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={9}
            className={`${inputClass} resize-y`}
          />
          <span className="mt-0.5 block text-[10px] text-muted-foreground">
            {firstName ? `Greeted as "Hi ${firstName},"` : `Greeted as "Hi,"`} · signed "— StayKnit Support"
          </span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={onSend} disabled={busy}>
            {busy ? "Sending…" : "Send email"}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---- Promo / access codes --------------------------------------------------

function CodesTab() {
  const [codes, setCodes] = useState<AdminPromoCode[] | null>(null)
  const [copied, setCopied] = useState<string>("")

  // Form state
  const [kind, setKind] = useState<"access" | "promo">("access")
  const [prefix, setPrefix] = useState("")
  const [customCode, setCustomCode] = useState("")
  const [plan, setPlan] = useState("host")
  const [months, setMonths] = useState(1)
  const [percentOff, setPercentOff] = useState(20)
  const [maxRedemptions, setMaxRedemptions] = useState(1)
  const [expiresInDays, setExpiresInDays] = useState(0)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    void listPromoCodes().then(setCodes)
  }, [])

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setBusy(true)
    try {
      const result = await createPromoCode({
        kind,
        code: customCode.trim() || undefined,
        prefix: prefix.trim() || undefined,
        plan,
        months,
        percentOff,
        maxRedemptions,
        expiresInDays,
        note,
      })
      if (!result.ok) {
        setError(result.error ?? "Could not create the code.")
        return
      }
      setCodes(await listPromoCodes())
      setCustomCode("")
      setNote("")
      if (result.code) {
        // Auto-copy the fresh code so the operator can paste it straight into an email.
        void copy(result.code.code)
      }
    } finally {
      setBusy(false)
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(code)
      setTimeout(() => setCopied(""), 1500)
    } catch {
      // Clipboard may be unavailable; ignore.
    }
  }

  async function toggle(id: number, active: boolean) {
    await setPromoCodeActive(id, active)
    setCodes(await listPromoCodes())
  }

  return (
    <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(300px,380px)_1fr]">
      {/* Generator */}
      <form onSubmit={onCreate} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">Generate a code</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Create a code to email a user for instant access, or a discount code for future promotions.
          </p>
        </div>

        <div className="flex gap-1">
          {(
            [
              ["access", "Access"],
              ["promo", "Discount"],
            ] as [typeof kind, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${
                kind === k ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {kind === "access" ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Plan granted</span>
              <select value={plan} onChange={(e) => setPlan(e.target.value)} className={inputClass}>
                {PLAN_OPTIONS.filter((p) => p.key !== "trial").map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Months of access</span>
              <input
                type="number"
                min={1}
                max={60}
                value={months}
                onChange={(e) => setMonths(Number(e.target.value))}
                className={inputClass}
              />
            </label>
          </div>
        ) : (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Discount (% off)</span>
            <input
              type="number"
              min={1}
              max={100}
              value={percentOff}
              onChange={(e) => setPercentOff(Number(e.target.value))}
              className={inputClass}
            />
          </label>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Max redemptions</span>
            <input
              type="number"
              min={0}
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(Number(e.target.value))}
              className={inputClass}
            />
            <span className="mt-0.5 block text-[10px] text-muted-foreground">0 = unlimited</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Expires in (days)</span>
            <input
              type="number"
              min={0}
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Number(e.target.value))}
              className={inputClass}
            />
            <span className="mt-0.5 block text-[10px] text-muted-foreground">0 = never</span>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Custom code (optional)</span>
          <input
            value={customCode}
            onChange={(e) => setCustomCode(e.target.value)}
            placeholder="Leave blank to auto-generate"
            className={inputClass}
          />
        </label>

        {!customCode.trim() && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Prefix (optional)</span>
            <input
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="e.g. LAUNCH"
              className={inputClass}
            />
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Internal note (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Pilot host for Jane"
            className={inputClass}
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy} className="self-start">
          {busy ? "Creating…" : "Generate code"}
        </Button>
      </form>

      {/* Existing codes */}
      <div className="flex flex-col gap-2">
        {codes === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : codes.length === 0 ? (
          <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            No codes yet. Generate one on the left.
          </p>
        ) : (
          codes.map((c) => {
            const expired = c.expiresAt ? new Date(c.expiresAt).getTime() <= Date.now() : false
            const capped = c.maxRedemptions > 0 && c.redeemedCount >= c.maxRedemptions
            return (
              <div
                key={c.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => copy(c.code)}
                      className="font-mono text-sm font-semibold text-foreground hover:text-primary"
                      title="Click to copy"
                    >
                      {c.code}
                    </button>
                    {copied === c.code && <span className="text-[10px] text-primary">Copied</span>}
                    {!c.active && (
                      <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                        Disabled
                      </span>
                    )}
                    {(expired || capped) && c.active && (
                      <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] uppercase text-destructive">
                        {expired ? "Expired" : "Used up"}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {c.kind === "access"
                      ? `${PLAN_OPTIONS.find((p) => p.key === c.plan)?.label ?? c.plan} · ${c.months} mo access`
                      : `${c.percentOff}% off`}
                    {" · "}
                    {c.redeemedCount}
                    {c.maxRedemptions > 0 ? `/${c.maxRedemptions}` : ""} used
                    {c.expiresAt ? ` · expires ${fmtDate(c.expiresAt)}` : ""}
                    {c.note ? ` · ${c.note}` : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant={c.active ? "secondary" : "default"}
                  size="sm"
                  onClick={() => toggle(c.id, !c.active)}
                  className="shrink-0"
                >
                  {c.active ? "Disable" : "Enable"}
                </Button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ---- Audit -----------------------------------------------------------------

function AuditTab() {
  const [rows, setRows] = useState<AdminAuditLog[] | null>(null)

  useEffect(() => {
    void listAudit(150).then(setRows)
  }, [])

  if (rows === null) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-2 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">When</th>
            <th className="px-3 py-2 font-medium">Agent</th>
            <th className="px-3 py-2 font-medium">Action</th>
            <th className="px-3 py-2 font-medium">Detail</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-4 text-muted-foreground">
                No admin actions logged yet.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{fmtDate(r.createdAt)}</td>
              <td className="px-3 py-2 text-muted-foreground">{r.agentEmail}</td>
              <td className="px-3 py-2 font-medium text-foreground">{r.action}</td>
              <td className="px-3 py-2 text-muted-foreground">{r.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---- Pricing ---------------------------------------------------------------

// Raise or lower each paid tier's MONTHLY subscription fee. A change here flows
// to both what hosts are shown and what Paystack actually charges, because
// checkout and payment verification resolve prices through the same overrides.
// Longer-term (6-month / yearly) totals are derived from the monthly fee, so
// they move automatically. Editing is per-currency; ZAR is the home market.
function PricingTab() {
  const [currency, setCurrency] = useState("zar")
  const [rows, setRows] = useState<PlanPriceRow[] | null>(null)
  // Editable value per tier (kept as strings so the field can be cleared).
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string>("")
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")

  const symbol = PRICE_CURRENCIES.find((c) => c.code === currency)?.symbol ?? ""

  const load = useCallback(async (cur: string) => {
    setRows(null)
    const res = await getPlanPrices(cur)
    setRows(res.rows)
    setDraft(Object.fromEntries(res.rows.map((r) => [r.plan, String(r.currentAmount)])))
  }, [])

  useEffect(() => {
    void load(currency)
  }, [currency, load])

  async function save(plan: string) {
    setError("")
    setSaved("")
    const amount = Number(draft[plan])
    if (!Number.isFinite(amount) || amount < 1) {
      setError("Enter a whole amount of 1 or more.")
      return
    }
    setBusy(plan)
    try {
      const res = await setPlanPrice({ plan, currency, amount })
      if (!res.ok) {
        setError(res.error ?? "Could not save the price.")
        return
      }
      setSaved(plan)
      setTimeout(() => setSaved(""), 1500)
      await load(currency)
    } finally {
      setBusy("")
    }
  }

  async function reset(plan: string) {
    setError("")
    setSaved("")
    setBusy(plan)
    try {
      await setPlanPrice({ plan, currency, amount: null })
      await load(currency)
    } finally {
      setBusy("")
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <VatStatusPanel />

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold text-foreground">Monthly subscription fees</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Set the monthly price for each plan. This is what new hosts see and what Paystack charges — the 6-month and
          yearly totals are worked out from the monthly figure automatically. Existing prepaid terms are not affected.
        </p>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Currency</span>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}>
            {PRICE_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      {rows === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <div key={r.plan} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Default {symbol}
                    {r.defaultAmount.toLocaleString()}
                    {r.overridden ? " · custom price set" : ""}
                  </p>
                </div>
                {saved === r.plan && <span className="text-xs font-medium text-primary">Saved</span>}
              </div>

              <div className="flex items-end gap-2">
                <label className="flex-1">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Monthly fee</span>
                  <div className="flex items-stretch">
                    <span className="flex items-center rounded-l-lg border border-r-0 border-border bg-surface-2 px-3 text-sm text-muted-foreground">
                      {symbol}
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={1000000}
                      value={draft[r.plan] ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [r.plan]: e.target.value }))}
                      className={`${inputClass} rounded-l-none`}
                    />
                  </div>
                </label>
                <Button
                  onClick={() => save(r.plan)}
                  disabled={busy === r.plan || draft[r.plan] === String(r.currentAmount)}
                  className="shrink-0"
                >
                  {busy === r.plan ? "Saving…" : "Save"}
                </Button>
              </div>

              {r.overridden && (
                <button
                  type="button"
                  onClick={() => reset(r.plan)}
                  disabled={busy === r.plan}
                  className="self-start text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-60"
                >
                  Reset to default ({symbol}
                  {r.defaultAmount.toLocaleString()})
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// StayKnit's OWN VAT registration status. This controls how subscription
// invoices present VAT — NOT the price charged (an R199 plan stays R199). While
// off, invoices are plain receipts that state StayKnit is not VAT-registered.
// Switching it on (only possible with a SARS VAT number) turns them into proper
// tax invoices showing the 15% as already included. Confirm the final wording
// with your accountant before enabling in production.
function VatStatusPanel() {
  const [cfg, setCfg] = useState<VatConfig | null>(null)
  const [registered, setRegistered] = useState(false)
  const [number, setNumber] = useState("")
  const [rate, setRate] = useState("15")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    const c = await getVatSetting()
    setCfg(c)
    setRegistered(c.registered)
    setNumber(c.number)
    setRate(String(c.ratePct))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    setError("")
    setSaved(false)
    setBusy(true)
    try {
      const res = await setVatSetting({ registered, number, ratePct: Number(rate) })
      if (!res.ok) {
        setError(res.error ?? "Could not save VAT settings.")
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
      await load()
    } finally {
      setBusy(false)
    }
  }

  const dirty =
    cfg !== null && (registered !== cfg.registered || number.trim() !== cfg.number || Number(rate) !== cfg.ratePct)

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">VAT status</h2>
        {cfg && (
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              cfg.registered ? "bg-primary/15 text-primary" : "bg-surface-2 text-muted-foreground"
            }`}
          >
            {cfg.registered ? "Registered vendor" : "Not registered"}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Controls how VAT appears on subscription invoices — not the price charged. An R199 plan stays R199; when
        registered, the 15% is shown as already included. You cannot switch this on without a SARS VAT number. Confirm
        the final invoice wording with your accountant before enabling.
      </p>

      {cfg === null ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={registered}
              onChange={(e) => setRegistered(e.target.checked)}
              className="mt-0.5 size-4 shrink-0"
            />
            <span className="text-sm text-foreground">
              StayKnit is a registered VAT vendor
              <span className="block text-xs text-muted-foreground">
                Turn on only once SARS has issued your VAT number.
              </span>
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">SARS VAT registration number</span>
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="e.g. 4123456789"
              inputMode="numeric"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">VAT rate (%)</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className={inputClass}
            />
          </label>

          {error && (
            <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={busy || !dirty} className="shrink-0">
              {busy ? "Saving…" : "Save VAT status"}
            </Button>
            {saved && <span className="text-xs font-medium text-primary">Saved</span>}
          </div>
        </div>
      )}
    </div>
  )
}
