"use client"

import { useEffect, useState, useTransition } from "react"
import { RefreshCw, RotateCcw, CheckCircle2, AlertCircle, CreditCard } from "lucide-react"
import { getRecentPayments, refundPayment, type PaymentRow } from "@/app/actions/admin-payments"

// Exact money incl. cents (unlike formatMoney, which rounds to whole Rand) so a
// R19.90 charge reads correctly in a refund context.
function money(amountCents: number, currency: string): string {
  const symbol = currency === "ZAR" ? "R" : currency === "EUR" ? "€" : currency === "USD" ? "$" : `${currency} `
  return `${symbol}${(amountCents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })
}

const STATUS_STYLES: Record<string, string> = {
  success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  failed: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  abandoned: "bg-muted text-muted-foreground",
}

export function PaymentsPanel() {
  const [payments, setPayments] = useState<PaymentRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, startLoad] = useTransition()

  // Refund flow: which reference is awaiting confirmation, which is in flight,
  // and any per-row error/success note.
  const [confirmRef, setConfirmRef] = useState<string | null>(null)
  const [busyRef, setBusyRef] = useState<string | null>(null)
  const [rowNote, setRowNote] = useState<{ ref: string; ok: boolean; msg: string } | null>(null)

  function load() {
    setError(null)
    startLoad(async () => {
      const res = await getRecentPayments()
      if (!res.ok) {
        setError(res.error)
        setPayments([])
        return
      }
      setPayments(res.payments)
    })
  }

  // Load once on mount. Kept client-side (not in the page's server load) so a
  // slow or misconfigured Paystack never blocks the rest of the Accounts page.
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function doRefund(ref: string) {
    setBusyRef(ref)
    setRowNote(null)
    startLoad(async () => {
      const res = await refundPayment(ref)
      setBusyRef(null)
      setConfirmRef(null)
      if (!res.ok) {
        setRowNote({ ref, ok: false, msg: res.error })
        return
      }
      setRowNote({ ref, ok: true, msg: "Refund submitted. It reflects on the card within 5–10 business days, depending on the bank." })
      // Reflect the new refunded state.
      setPayments((prev) => (prev ? prev.map((p) => (p.reference === ref ? { ...p, refunded: true } : p)) : prev))
    })
  }

  return (
    <section aria-label="Payments and refunds">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Payments &amp; refunds</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Recent Paystack charges. Refund a transaction back to the customer&apos;s card.
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

      {payments === null && !error ? (
        <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Loading payments…
        </p>
      ) : payments && payments.length === 0 && !error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-4 py-6 text-sm text-muted-foreground">
          <CreditCard className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>No Paystack transactions yet. Successful charges will appear here.</span>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {payments?.map((p) => {
            const canRefund = p.status === "success" && !p.refunded
            const note = rowNote?.ref === p.reference ? rowNote : null
            const confirming = confirmRef === p.reference
            const busy = busyRef === p.reference
            return (
              <li key={p.reference || p.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-bold tabular-nums tracking-tight text-foreground">
                      {money(p.amountCents, p.currency)}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">{p.email ?? "—"}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLES[p.status] ?? "bg-muted text-muted-foreground"}`}
                    >
                      {p.status}
                    </span>
                    {p.refunded && (
                      <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                        refunded
                      </span>
                    )}
                  </div>
                </div>

                <dl className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  <div className="flex justify-between gap-2">
                    <dt className="shrink-0">Reference</dt>
                    <dd className="truncate font-mono text-foreground" title={p.reference}>
                      {p.reference || "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Paid</dt>
                    <dd className="text-foreground">{fmtDate(p.paidAt)}</dd>
                  </div>
                  {p.channel && (
                    <div className="flex justify-between gap-2">
                      <dt>Channel</dt>
                      <dd className="capitalize text-foreground">{p.channel}</dd>
                    </div>
                  )}
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

                {canRefund && !note?.ok && (
                  <div className="mt-3">
                    {confirming ? (
                      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-2 p-3">
                        <p className="text-xs text-foreground">
                          Refund <span className="font-semibold">{money(p.amountCents, p.currency)}</span> to{" "}
                          {p.email ?? "the customer"}? This cannot be undone.
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => doRefund(p.reference)}
                            disabled={busy}
                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-60"
                          >
                            <RotateCcw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
                            {busy ? "Refunding…" : "Confirm refund"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRef(null)}
                            disabled={busy}
                            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-card disabled:opacity-60"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setRowNote(null)
                          setConfirmRef(p.reference)
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 px-3 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-500/10 dark:text-rose-400"
                      >
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        Refund
                      </button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
