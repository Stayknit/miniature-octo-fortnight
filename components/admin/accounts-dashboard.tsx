"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Pencil, Trash2, Check, X, RefreshCw, Inbox, FileText, Download } from "lucide-react"
import { formatMoney } from "@/lib/pricing"
import {
  addRunningCost,
  updateRunningCost,
  deleteRunningCost,
  approveInvoice,
  dismissInvoice,
  scanInvoicesNow,
  getAccountStatement,
  type AccountStats,
  type AccountRow,
  type RunningCostRow,
  type PendingInvoiceRow,
} from "@/app/actions/admin-accounts"
import {
  lastMonths,
  currentStatementMonth,
  type AccountStatement,
} from "@/lib/account-statement"
import { PaymentsPanel } from "@/components/admin/payments-panel"
import { RefundRequestsPanel } from "@/components/admin/refund-requests-panel"
import { AbandonedCheckoutsPanel } from "@/components/admin/abandoned-checkouts-panel"

const zar = (cents: number) => formatMoney(cents, "zar")

// Currencies a running cost can be recorded in. ZAR is the base; EUR/USD costs
// are converted to ZAR at a rate locked to the cost's date.
const COST_CURRENCIES = ["zar", "eur", "usd"] as const
type CostCurrency = (typeof COST_CURRENCIES)[number]
const CURRENCY_SYMBOL: Record<CostCurrency, string> = { zar: "R", eur: "€", usd: "$" }
const CURRENCY_LABEL: Record<CostCurrency, string> = { zar: "ZAR (R)", eur: "EUR (€)", usd: "USD ($)" }

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })
}

const todayISO = () => new Date().toISOString().slice(0, 10)

const PERIOD_LABEL: Record<string, string> = {
  monthly: "Monthly",
  six_month: "6 months",
  yearly: "1 year",
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  trialing: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  past_due: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  canceled: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? "bg-muted text-muted-foreground"
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {status.replace("_", " ")}
    </span>
  )
}

export function AccountsDashboard({
  stats,
  pendingInvoices,
}: {
  stats: AccountStats
  pendingInvoices: PendingInvoiceRow[]
}) {
  const [query, setQuery] = useState("")
  const [planFilter, setPlanFilter] = useState<string>("all")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return stats.accounts.filter((a) => {
      if (planFilter !== "all" && a.plan !== planFilter) return false
      if (!q) return true
      return (
        a.email.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.businessName.toLowerCase().includes(q)
      )
    })
  }, [stats.accounts, query, planFilter])

  const headline: { label: string; value: string; hint: string }[] = [
    { label: "MRR", value: zar(stats.mrrCents), hint: "Monthly run-rate (paying, excl. comp)" },
    { label: "ARR", value: zar(stats.arrCents), hint: "MRR × 12" },
    { label: "Paying accounts", value: String(stats.paying), hint: "Active paid, excl. comp" },
    { label: "Complimentary", value: String(stats.comp), hint: "Pilot / comp grants" },
  ]

  const secondary: { label: string; value: number }[] = [
    { label: "Trialing", value: stats.trialing },
    { label: "Past due", value: stats.pastDue },
    { label: "Canceled", value: stats.canceled },
    { label: "Total subscriptions", value: stats.totalSubs },
  ]

  return (
    <div className="flex flex-1 flex-col gap-8">
      {/* Revenue headline */}
      <section aria-label="Revenue" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {headline.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{c.value}</p>
            <p className="mt-0.5 text-xs font-medium text-foreground">{c.label}</p>
            <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{c.hint}</p>
          </div>
        ))}
      </section>

      {/* Secondary status counts */}
      <section aria-label="Subscription status" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {secondary.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-3">
            <p className="text-xl font-bold tabular-nums tracking-tight text-foreground">
              {new Intl.NumberFormat("en-ZA").format(s.value)}
            </p>
            <p className="mt-0.5 text-xs font-medium text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </section>

      {/* Cancellation refund requests — pro-rata balances awaiting owner approval */}
      <RefundRequestsPanel />

      {/* Payments & refunds — recent Paystack charges, refundable in-app */}
      <PaymentsPanel />

      {/* Abandoned checkouts — hosts who opened the payment page but didn't finish */}
      <AbandonedCheckoutsPanel />

      {/* Invoice review queue (from info@stayknit.org) */}
      <PendingInvoices invoices={pendingInvoices} />

      {/* Running costs & profitability */}
      <RunningCosts stats={stats} />

      {/* Monthly statement — pick a month and download in PDF / Word / CSV / text */}
      <MonthlyStatement />

      {/* Revenue by plan */}
      <section aria-label="Revenue by plan">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">By plan</h2>
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Plan</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Paying</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Monthly value</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Share of MRR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stats.byPlan.map((p) => {
                const share = stats.mrrCents > 0 ? Math.round((p.monthlyValueCents / stats.mrrCents) * 100) : 0
                return (
                  <tr key={p.plan} className="bg-card">
                    <td className="px-4 py-2.5 font-medium text-foreground">{p.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{p.count}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{zar(p.monthlyValueCents)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{share}%</td>
                  </tr>
                )
              })}
              <tr className="bg-surface-2 font-semibold">
                <td className="px-4 py-2.5 text-foreground">Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{stats.paying}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{zar(stats.mrrCents)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Accounts table */}
      <section aria-label="Accounts">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Accounts ({filtered.length})
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search email, name, business…"
              aria-label="Search accounts"
              className="h-9 w-56 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              aria-label="Filter by plan"
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="all">All plans</option>
              {stats.byPlan.map((p) => (
                <option key={p.plan} value={p.plan}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            No paying or complimentary accounts match your filters yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Account</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Plan</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Billing</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Monthly</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Renews / ends</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((a: AccountRow) => (
                  <tr key={a.userId} className="bg-card align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{a.businessName || a.name || "—"}</p>
                      <p className="text-xs text-muted-foreground">{a.email}</p>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {a.planName}
                      {a.comp && (
                        <span className="ml-1.5 inline-flex items-center rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-600 dark:text-violet-400">
                          comp
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{PERIOD_LABEL[a.billingPeriod] ?? a.billingPeriod}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {a.monthlyCents == null ? "—" : zar(a.monthlyCents)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(a.cancelAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

// Review queue for invoices the scanner pulled from info@stayknit.org. Each
// approved row becomes a running cost (FX already locked to its invoice date);
// dismissed rows drop out. A manual "Scan now" supplements the scheduled cron.
function PendingInvoices({ invoices }: { invoices: PendingInvoiceRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<number | null>(null)
  const [scanMsg, setScanMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function runScan() {
    setError(null)
    setScanMsg(null)
    startTransition(async () => {
      const res = await scanInvoicesNow()
      if (!res.ok) {
        setError(res.error ?? "Scan failed.")
        return
      }
      setScanMsg(
        res.invoices > 0
          ? `Found ${res.invoices} new invoice${res.invoices === 1 ? "" : "s"}.`
          : res.processed > 0
            ? `Checked ${res.processed} new email${res.processed === 1 ? "" : "s"}; none were invoices.`
            : "No new email since the last scan.",
      )
      router.refresh()
    })
  }

  function approve(id: number) {
    setError(null)
    setBusyId(id)
    startTransition(async () => {
      const res = await approveInvoice(id)
      setBusyId(null)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  function dismiss(id: number) {
    setError(null)
    setBusyId(id)
    startTransition(async () => {
      await dismissInvoice(id)
      setBusyId(null)
      router.refresh()
    })
  }

  return (
    <section aria-label="Invoice review queue">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Invoices from info@stayknit.org
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Scanned automatically every 4 hours. Approve to add as a running cost, or dismiss.
          </p>
        </div>
        <button
          type="button"
          onClick={runScan}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} aria-hidden="true" />
          {pending ? "Scanning…" : "Scan now"}
        </button>
      </div>

      {scanMsg && <p className="mb-3 text-sm text-muted-foreground">{scanMsg}</p>}
      {error && <p className="mb-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      {invoices.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-4 py-6 text-sm text-muted-foreground">
          <Inbox className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>No invoices waiting for review. New bills sent to info@stayknit.org will appear here.</span>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {invoices.map((inv) => (
            <li
              key={inv.id}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{inv.vendor || "Unknown vendor"}</span>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {inv.confidence}% match
                  </span>
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground" title={inv.subject}>
                  {inv.summary || inv.subject}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {inv.fromAddress} · received {fmtDate(inv.receivedAt)}
                  {inv.invoiceDate ? ` · invoice dated ${fmtDate(inv.invoiceDate)}` : ""}
                </p>
              </div>

              <div className="flex items-center justify-between gap-4 sm:justify-end">
                <div className="text-right">
                  <p className="tabular-nums font-semibold text-foreground">
                    {formatMoney(inv.amountMinor, inv.currency)}
                    <span className="font-normal text-muted-foreground">{CADENCE_LABEL[inv.cadence]}</span>
                  </p>
                  {inv.currency !== "zar" && (
                    <p className="text-xs tabular-nums text-muted-foreground">
                      ≈ {zar(inv.amountZarCents)} · rate {fmtDate(inv.fxDate)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => approve(inv.id)}
                    disabled={pending && busyId === inv.id}
                    aria-label={`Approve invoice from ${inv.vendor}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => dismiss(inv.id)}
                    disabled={pending && busyId === inv.id}
                    aria-label={`Dismiss invoice from ${inv.vendor}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-surface-2 disabled:opacity-60"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                    Dismiss
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const CADENCE_LABEL: Record<string, string> = { monthly: "/mo", yearly: "/yr" }

// One-click presets for the infrastructure StayKnit actually runs on, so the
// owner can populate the tracker without retyping labels. Each seeds a row with
// its usual cadence and a note; the amount starts at R0 for the owner to fill in
// from the real invoice. Presets already present (matched by label) are hidden.
type CostPreset = { label: string; cadence: "monthly" | "yearly"; notes: string }
const COST_PRESETS: CostPreset[] = [
  { label: "Vercel", cadence: "monthly", notes: "Hosting & bandwidth (Vercel plan)" },
  { label: "Neon Postgres", cadence: "monthly", notes: "Database (Neon)" },
  { label: "Paystack fees", cadence: "monthly", notes: "Payment processing (~% of revenue)" },
  { label: "Domain", cadence: "yearly", notes: "stayknit.org domain renewal" },
  { label: "Email / SMTP", cadence: "monthly", notes: "Transactional & support email" },
  { label: "AI Gateway", cadence: "monthly", notes: "AI features (Vercel AI Gateway)" },
]

// Parse a Rand string like "1 299,50" or "1299.5" into integer cents.
function randToCents(input: string): number | null {
  const cleaned = input.replace(/[^\d.,]/g, "").replace(/\s/g, "").replace(",", ".")
  if (!cleaned) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.round(value * 100)
}

const STATEMENT_FORMATS: { key: string; label: string; hint: string }[] = [
  { key: "pdf", label: "PDF", hint: "Branded, print-ready" },
  { key: "docx", label: "Word", hint: "Editable .docx" },
  { key: "csv", label: "CSV", hint: "For spreadsheets" },
  { key: "txt", label: "Text", hint: "Plain summary" },
]

// Kicks off a download (or a print tab for PDF) from the gated statement route.
function openStatement(month: string, format: string) {
  const url = `/api/admin/accounts/statement?month=${encodeURIComponent(month)}&format=${format}`
  if (format === "pdf") {
    window.open(url, "_blank", "noopener")
    return
  }
  const a = document.createElement("a")
  a.href = url
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function MonthlyStatement() {
  const months = useMemo(() => lastMonths(12), [])
  const [month, setMonth] = useState(() => currentStatementMonth())
  const [preview, setPreview] = useState<AccountStatement | null>(null)
  const [loading, setLoading] = useState(true)
  const reqId = useRef(0)

  // Recompute the month's figures for the inline preview whenever the selected
  // month changes. A request counter guards against out-of-order responses.
  useEffect(() => {
    const id = ++reqId.current
    setLoading(true)
    getAccountStatement(month)
      .then((s) => {
        if (id === reqId.current) {
          setPreview(s)
          setLoading(false)
        }
      })
      .catch(() => {
        if (id === reqId.current) setLoading(false)
      })
  }, [month])

  const summary: { label: string; value: string; strong?: boolean }[] = preview
    ? [
        { label: "Paying accounts", value: String(preview.payingAccounts) },
        { label: "MRR", value: zar(preview.mrrCents) },
        { label: "Operating costs", value: `− ${zar(preview.runningCostMonthlyCents)}` },
        { label: "Net (monthly)", value: zar(preview.netMonthlyCents), strong: true },
      ]
    : []

  return (
    <section aria-label="Monthly statement">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Monthly statement</h2>
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <label htmlFor="statement-month" className="mb-1 block text-xs font-medium text-muted-foreground">
              Statement month
            </label>
            <select
              id="statement-month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              {months.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            {STATEMENT_FORMATS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => openStatement(month, f.key)}
                title={f.hint}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
              >
                {f.key === "pdf" ? <FileText className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Live preview of the selected month's figures */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {loading || !preview
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border bg-surface-2 p-3">
                  <div className="h-6 w-16 animate-pulse rounded bg-muted" />
                  <div className="mt-2 h-3 w-20 animate-pulse rounded bg-muted" />
                </div>
              ))
            : summary.map((s) => (
                <div key={s.label} className="rounded-xl border border-border bg-surface-2 p-3">
                  <p
                    className={`text-lg font-bold tabular-nums tracking-tight ${s.strong ? "text-primary" : "text-foreground"}`}
                  >
                    {s.value}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{s.label}</p>
                </div>
              ))}
        </div>

        <p className="mt-3 text-[11px] leading-tight text-muted-foreground">
          Run-rate snapshot for {preview ? preview.periodLabel : "the selected month"}, reconstructed from subscription
          and cost records as of month end. Billing is prepaid, so figures reflect the monthly run-rate attributable to
          this month, not cash collected.
        </p>
      </div>
    </section>
  )
}

function RunningCosts({ stats }: { stats: AccountStats }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const net = stats.netMonthlyCents
  const netPositive = net >= 0

  // Presets not yet added (case-insensitive label match against existing costs).
  const existingLabels = useMemo(
    () => new Set(stats.costs.map((c) => c.label.trim().toLowerCase())),
    [stats.costs],
  )
  const availablePresets = COST_PRESETS.filter((p) => !existingLabels.has(p.label.toLowerCase()))

  function refresh() {
    startTransition(() => router.refresh())
  }

  function quickAdd(preset: CostPreset) {
    setError(null)
    startTransition(async () => {
      const res = await addRunningCost({
        label: preset.label,
        amountCents: 0,
        cadence: preset.cadence,
        notes: preset.notes,
      })
      if (res.ok) router.refresh()
      else setError(res.error)
    })
  }

  return (
    <section aria-label="Running costs and profitability">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Running costs</h2>
        {!adding && (
          <button
            type="button"
            onClick={() => {
              setAdding(true)
              setError(null)
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add cost
          </button>
        )}
      </div>

      {/* Profitability summary */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{zar(stats.mrrCents)}</p>
          <p className="mt-0.5 text-xs font-medium text-foreground">Revenue / month</p>
          <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">MRR (paying, excl. comp)</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
            {zar(stats.runningCostMonthlyCents)}
          </p>
          <p className="mt-0.5 text-xs font-medium text-foreground">Running cost / month</p>
          <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">All costs normalised to monthly</p>
        </div>
        <div
          className={`rounded-2xl border p-4 ${
            netPositive ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5"
          }`}
        >
          <p
            className={`text-2xl font-bold tabular-nums tracking-tight ${
              netPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {netPositive ? "" : "−"}
            {zar(Math.abs(net))}
          </p>
          <p className="mt-0.5 text-xs font-medium text-foreground">Net / month</p>
          <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">Revenue minus running cost</p>
        </div>
      </div>

      {availablePresets.length > 0 && (
        <div className="mb-4 rounded-2xl border border-dashed border-border bg-card p-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Quick-add your infrastructure & third-party costs. Each starts at R0 — open the new row and enter the real
            amount from the invoice.
          </p>
          <div className="flex flex-wrap gap-2">
            {availablePresets.map((p) => (
              <button
                key={p.label}
                type="button"
                disabled={isPending}
                onClick={() => quickAdd(p)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary hover:text-primary disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="mb-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Cost</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Amount</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Monthly</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {adding && (
              <CostForm
                onCancel={() => setAdding(false)}
                onSubmit={(input) =>
                  startTransition(async () => {
                    const res = await addRunningCost(input)
                    if (res.ok) {
                      setAdding(false)
                      setError(null)
                      router.refresh()
                    } else {
                      setError(res.error)
                    }
                  })
                }
                pending={isPending}
              />
            )}
            {stats.costs.map((c) =>
              editId === c.id ? (
                <CostForm
                  key={c.id}
                  initial={c}
                  onCancel={() => setEditId(null)}
                  onSubmit={(input) =>
                    startTransition(async () => {
                      const res = await updateRunningCost(c.id, input)
                      if (res.ok) {
                        setEditId(null)
                        setError(null)
                        router.refresh()
                      } else {
                        setError(res.error)
                      }
                    })
                  }
                  pending={isPending}
                />
              ) : (
                <tr key={c.id} className="bg-card align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{c.label}</p>
                    {c.notes && <p className="text-xs text-muted-foreground">{c.notes}</p>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatMoney(c.amountMinor, c.currency)}
                    <span className="text-muted-foreground">{CADENCE_LABEL[c.cadence]}</span>
                    {c.currency !== "zar" && (
                      <p className="text-xs font-normal text-muted-foreground">
                        ≈ {zar(c.amountZarCents)} · rate {fmtDate(c.fxDate)}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{zar(c.monthlyCents)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditId(c.id)
                          setError(null)
                        }}
                        aria-label={`Edit ${c.label}`}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          if (!confirm(`Delete "${c.label}" from running costs?`)) return
                          startTransition(async () => {
                            await deleteRunningCost(c.id)
                            router.refresh()
                          })
                        }}
                        aria-label={`Delete ${c.label}`}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-50 dark:hover:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            )}
            {stats.costs.length === 0 && !adding && (
              <tr className="bg-card">
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No running costs tracked yet. Add your hosting, database, domain, and other monthly costs to see net
                  margin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function CostForm({
  initial,
  onSubmit,
  onCancel,
  pending,
}: {
  initial?: RunningCostRow
  onSubmit: (input: {
    label: string
    amountCents: number
    cadence: string
    currency: string
    fxDate?: string
    notes: string
  }) => void
  onCancel: () => void
  pending: boolean
}) {
  const [label, setLabel] = useState(initial?.label ?? "")
  const [amount, setAmount] = useState(initial ? (initial.amountMinor / 100).toString() : "")
  const [cadence, setCadence] = useState<string>(initial?.cadence ?? "monthly")
  const [currency, setCurrency] = useState<CostCurrency>(initial?.currency ?? "zar")
  const [fxDate, setFxDate] = useState<string>(initial?.fxDate ?? todayISO())
  const [notes, setNotes] = useState(initial?.notes ?? "")
  const [localError, setLocalError] = useState<string | null>(null)

  function submit() {
    const cents = randToCents(amount)
    if (!label.trim() || cents == null) {
      setLocalError("Enter a label and a valid amount.")
      return
    }
    setLocalError(null)
    onSubmit({
      label: label.trim(),
      amountCents: cents,
      cadence,
      currency,
      fxDate: currency === "zar" ? undefined : fxDate,
      notes: notes.trim(),
    })
  }

  return (
    <tr className="bg-surface-2/50 align-top">
      <td className="px-4 py-3">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Vercel hosting"
          aria-label="Cost label"
          className="mb-1.5 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What was this purchase for? (optional)"
          aria-label="What the purchase was for"
          className="h-8 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
        {localError && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{localError}</p>}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as CostCurrency)}
            aria-label="Currency"
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            {COST_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {CURRENCY_LABEL[c]}
              </option>
            ))}
          </select>
          <span className="text-sm text-muted-foreground">{CURRENCY_SYMBOL[currency]}</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            aria-label={`Cost amount in ${currency.toUpperCase()}`}
            className="h-9 w-24 rounded-lg border border-border bg-background px-3 text-right text-sm tabular-nums text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <select
            value={cadence}
            onChange={(e) => setCadence(e.target.value)}
            aria-label="Billing cadence"
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            <option value="monthly">/mo</option>
            <option value="yearly">/yr</option>
          </select>
        </div>
        {currency !== "zar" && (
          <div className="mt-1.5 flex items-center justify-end gap-1.5">
            <label htmlFor="fx-date" className="text-xs text-muted-foreground">
              Rate date
            </label>
            <input
              id="fx-date"
              type="date"
              value={fxDate}
              max={todayISO()}
              min="1999-01-04"
              onChange={(e) => setFxDate(e.target.value)}
              aria-label="Exchange rate date"
              className="h-8 rounded-lg border border-border bg-background px-2 text-xs tabular-nums text-foreground focus:border-primary focus:outline-none"
            />
          </div>
        )}
      </td>
      <td className="px-4 py-3" />
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            aria-label="Save cost"
            className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-50 dark:text-emerald-400"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            aria-label="Cancel"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </td>
    </tr>
  )
}
