"use client"

import { useEffect, useState, useTransition } from "react"
import { RefreshCw, Send, CheckCircle2, AlertCircle, MailWarning } from "lucide-react"
import {
  getAbandonedCheckouts,
  sendCheckoutRecoveryEmail,
  type AbandonedCheckoutRow,
} from "@/app/actions/admin-recovery"

// Exact money incl. cents, matching the payments panel so a R2,388.00 attempt
// reads correctly.
function money(amountCents: number, currency: string): string {
  const symbol = currency === "ZAR" ? "R" : currency === "EUR" ? "€" : currency === "USD" ? "$" : `${currency} `
  return `${symbol}${(amountCents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })
}

const SUB_STATUS_STYLES: Record<string, string> = {
  trialing: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  past_due: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  canceled: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  none: "bg-muted text-muted-foreground",
}

export function AbandonedCheckoutsPanel() {
  const [rows, setRows] = useState<AbandonedCheckoutRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, startLoad] = useTransition()

  // Which host is mid-send, which have already been reminded this session, and
  // any per-row error/success note.
  const [busyUser, setBusyUser] = useState<string | null>(null)
  const [sentUsers, setSentUsers] = useState<Set<string>>(new Set())
  const [rowNote, setRowNote] = useState<{ userId: string; ok: boolean; msg: string } | null>(null)

  function load() {
    setError(null)
    startLoad(async () => {
      const res = await getAbandonedCheckouts()
      if (!res.ok) {
        setError(res.error)
        setRows([])
        return
      }
      setRows(res.rows)
    })
  }

  // Load once on mount. Kept client-side (not in the page's server load) so a
  // slow or misconfigured Paystack never blocks the rest of the Accounts page.
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function sendReminder(userId: string) {
    setBusyUser(userId)
    setRowNote(null)
    startLoad(async () => {
      const res = await sendCheckoutRecoveryEmail(userId)
      setBusyUser(null)
      if (!res.ok) {
        setRowNote({ userId, ok: false, msg: res.error })
        return
      }
      setRowNote({ userId, ok: true, msg: "Reminder sent — reply-friendly, from support@stayknit.org." })
      setSentUsers((prev) => new Set(prev).add(userId))
    })
  }

  return (
    <section aria-label="Abandoned checkouts">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Abandoned checkouts</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Hosts who opened the payment page but didn&apos;t finish. Send a one-tap reminder to bring them back.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {error && (
        <p className="mb-3 flex items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {rows === null && !error ? (
        <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Loading abandoned checkouts…
        </p>
      ) : rows && rows.length === 0 && !error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-4 py-6 text-sm text-muted-foreground">
          <MailWarning className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>No abandoned checkouts. Hosts who drop off at the payment step will appear here.</span>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows?.map((r) => {
            const note = rowNote?.userId === r.userId ? rowNote : null
            const busy = busyUser === r.userId
            const sent = sentUsers.has(r.userId)
            return (
              <li key={r.userId} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{r.businessName || r.name || "—"}</p>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">{r.email}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-lg font-bold tabular-nums tracking-tight text-foreground">
                      {money(r.amountCents, r.currency)}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${SUB_STATUS_STYLES[r.subStatus] ?? "bg-muted text-muted-foreground"}`}
                    >
                      {r.subStatus.replace("_", " ")}
                    </span>
                  </div>
                </div>

                <dl className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  <div className="flex justify-between gap-2">
                    <dt className="shrink-0">Reference</dt>
                    <dd className="truncate font-mono text-foreground" title={r.reference}>
                      {r.reference || "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Attempted</dt>
                    <dd className="text-foreground">{fmtDate(r.attemptedAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Payment</dt>
                    <dd className="capitalize text-foreground">{r.txStatus}</dd>
                  </div>
                </dl>

                {note && (
                  <p
                    className={`mt-2 flex items-start gap-1.5 text-xs ${note.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
                  >
                    {note.ok ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    ) : (
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    )}
                    {note.msg}
                  </p>
                )}

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => sendReminder(r.userId)}
                    disabled={busy || sent}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 px-3 py-1.5 text-sm font-medium text-primary transition hover:bg-primary/10 disabled:opacity-60"
                  >
                    {sent ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        Reminder sent
                      </>
                    ) : (
                      <>
                        <Send className={`h-4 w-4 ${busy ? "animate-pulse" : ""}`} aria-hidden="true" />
                        {busy ? "Sending…" : "Send reminder"}
                      </>
                    )}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
