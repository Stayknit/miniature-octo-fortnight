"use client"

import { useEffect, useState, useTransition } from "react"
import { RefreshCw, CheckCircle2, AlertCircle, RotateCcw, Undo2, Ban } from "lucide-react"
import {
  getRefundRequests,
  approveRefundRequest,
  rejectRefundRequest,
  type RefundRequestRow,
} from "@/app/actions/admin-refunds"

// Exact money incl. cents so a pro-rata balance (e.g. R132.67) reads correctly.
function money(amountCents: number, currency: string): string {
  const symbol = currency === "ZAR" ? "R" : currency === "EUR" ? "€" : currency === "USD" ? "$" : `${currency} `
  return `${symbol}${(amountCents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  approved: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  rejected: "bg-muted text-muted-foreground",
  canceled: "bg-muted text-muted-foreground",
  failed: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
}

export function RefundRequestsPanel() {
  const [rows, setRows] = useState<RefundRequestRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, startLoad] = useTransition()
  const [busyId, setBusyId] = useState<number | null>(null)
  const [confirm, setConfirm] = useState<{ id: number; action: "approve" | "reject" } | null>(null)
  const [rowNote, setRowNote] = useState<{ id: number; ok: boolean; msg: string } | null>(null)

  function load() {
    setError(null)
    startLoad(async () => {
      try {
        setRows(await getRefundRequests())
      } catch {
        setError("Couldn't load refund requests.")
        setRows([])
      }
    })
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function resolve(id: number, action: "approve" | "reject") {
    setBusyId(id)
    setRowNote(null)
    startLoad(async () => {
      const res = action === "approve" ? await approveRefundRequest(id) : await rejectRefundRequest(id)
      setBusyId(null)
      setConfirm(null)
      if (!res.ok) {
        setRowNote({ id, ok: false, msg: res.error ?? "Something went wrong." })
        return
      }
      setRowNote({
        id,
        ok: true,
        msg:
          action === "approve"
            ? "Refund submitted to Paystack. It reflects on the card within 5–10 business days, depending on the bank."
            : "Refund declined. The host's cancellation still stands.",
      })
      load()
    })
  }

  const pendingCount = rows?.filter((r) => r.status === "pending").length ?? 0

  return (
    <section aria-label="Cancellation refund requests">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Refund requests
            {pendingCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                {pendingCount} pending
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Pro-rata balances owed on cancellations. Approve to refund the card, or decline.
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
          Loading refund requests…
        </p>
      ) : rows && rows.length === 0 && !error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-4 py-6 text-sm text-muted-foreground">
          <Undo2 className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>No refund requests. Cancellations that owe a balance will appear here for approval.</span>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows?.map((r) => {
            const note = rowNote?.id === r.id ? rowNote : null
            const confirming = confirm?.id === r.id
            const busy = busyId === r.id
            const who = r.businessName || r.name || r.email || "Host"
            return (
              <li key={r.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-bold tabular-nums tracking-tight text-foreground">
                      {money(r.amountCents, r.currency)}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-foreground">{who}</p>
                    {r.email && r.email !== who && (
                      <p className="truncate text-xs text-muted-foreground">{r.email}</p>
                    )}
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLES[r.status] ?? "bg-muted text-muted-foreground"}`}
                  >
                    {r.status}
                  </span>
                </div>

                <dl className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {r.note && (
                    <div className="flex justify-between gap-2">
                      <dt className="shrink-0">Details</dt>
                      <dd className="text-right text-foreground">{r.note}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-2">
                    <dt className="shrink-0">Transaction</dt>
                    <dd className="truncate font-mono text-foreground" title={r.paymentRef}>
                      {r.paymentRef}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Requested</dt>
                    <dd className="text-foreground">{fmtDate(r.requestedAt)}</dd>
                  </div>
                  {r.status !== "pending" && (
                    <div className="flex justify-between gap-2">
                      <dt>Resolved</dt>
                      <dd className="text-foreground">
                        {fmtDate(r.resolvedAt)}
                        {r.resolvedBy ? ` · ${r.resolvedBy}` : ""}
                      </dd>
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

                {r.status === "pending" && !note?.ok && (
                  <div className="mt-3">
                    {confirming ? (
                      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-2 p-3">
                        <p className="text-xs text-foreground">
                          {confirm?.action === "approve" ? (
                            <>
                              Refund <span className="font-semibold">{money(r.amountCents, r.currency)}</span> to {who}?
                              This charges Paystack and cannot be undone.
                            </>
                          ) : (
                            <>Decline this refund? The host keeps their cancellation but gets no money back.</>
                          )}
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => resolve(r.id, confirm!.action)}
                            disabled={busy}
                            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white transition disabled:opacity-60 ${
                              confirm?.action === "approve"
                                ? "bg-emerald-600 hover:bg-emerald-700"
                                : "bg-rose-600 hover:bg-rose-700"
                            }`}
                          >
                            <RotateCcw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
                            {busy
                              ? confirm?.action === "approve"
                                ? "Refunding…"
                                : "Declining…"
                              : confirm?.action === "approve"
                                ? "Confirm refund"
                                : "Confirm decline"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirm(null)}
                            disabled={busy}
                            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-card disabled:opacity-60"
                          >
                            Back
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setRowNote(null)
                            setConfirm({ id: r.id, action: "approve" })
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 px-3 py-1.5 text-sm font-medium text-emerald-600 transition hover:bg-emerald-500/10 dark:text-emerald-400"
                        >
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          Approve refund
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRowNote(null)
                            setConfirm({ id: r.id, action: "reject" })
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-surface-2"
                        >
                          <Ban className="h-4 w-4" aria-hidden="true" />
                          Decline
                        </button>
                      </div>
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
