'use client'

import { useMoney, useCurrency } from '@/components/currency-context'
import { totalCost } from '@/lib/costing'
import {
  downloadStatement,
  emailStatement,
  STATEMENT_FORMATS,
  type StatementFormat,
  type StatementHost,
  type StatementOwner,
} from '@/lib/statement'
import { buildOwnerStatement } from '@/lib/owner-statement'
import type { Booking, CostLine, OwnerClient } from '@/lib/types'
import { monthsAgoLabel, monthYearLabel } from '@/lib/today'
import { Download, Mail } from 'lucide-react'
import { useMemo, useState } from 'react'

// Illustrative prior-month payouts, derived from the current statement and
// labelled relative to the real current month.
function history(net: number) {
  return [
    { month: monthsAgoLabel(1), net: Math.round(net * 0.92) },
    { month: monthsAgoLabel(2), net: Math.round(net * 1.08) },
    { month: monthsAgoLabel(3), net: Math.round(net * 0.86) },
  ]
}

export function OwnerCosts({
  self,
  bookings,
  costLines,
  host,
  vat,
}: {
  self: OwnerClient | undefined
  bookings: Booking[]
  costLines: CostLine[]
  host: StatementHost
  vat: { enabled: boolean; rate: number }
}) {
  const money = useMoney()
  const currency = useCurrency()
  const [format, setFormat] = useState<StatementFormat>('pdf')

  // Build the statement from the owner's revenue bookings and the host's cost
  // lines via the shared builder — the exact same figures the Overview shows,
  // so the two pages can never disagree. Paid/due reflect the host's
  // per-booking payment ticks; the per-property breakdown is reconciled to the
  // headline totals.
  const statement = useMemo<StatementOwner | null>(
    () => buildOwnerStatement({ self, bookings, costLines, vat, currency, host }),
    [self, bookings, costLines, host, currency, vat],
  )

  const gross = statement?.gross ?? 0
  const net = statement?.net ?? 0
  const due = statement?.due ?? 0
  const paid = statement?.paid ?? 0
  const totalFees = statement ? totalCost(statement.lines) : 0
  const yourPct = gross > 0 ? Math.round((net / gross) * 100) : 0
  const feePct = Math.max(0, 100 - yourPct)
  const multiUnit = (statement?.properties?.length ?? 0) > 1

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 pt-4 lg:px-8 lg:pt-6">
      <div>
        <h1 className="font-sans text-2xl font-extrabold">Statement</h1>
        <p className="mono-label mt-1 text-[10px] text-muted-foreground">
          {monthYearLabel()} · {self?.name}
          {statement && statement.property !== self?.units[0] ? ` · ${statement.property}` : ''}
        </p>
      </div>

      {/* Payment status — reflects the host's per-booking payment ticks */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-border bg-surface-2 px-4 py-3.5">
          <p className="mono-label text-[9px] text-muted-foreground">Paid to date</p>
          <p className="mt-1 font-sans text-xl font-extrabold text-foreground">{money(paid)}</p>
        </div>
        <div className={`rounded-xl border px-4 py-3.5 ${due > 0 ? 'border-primary/40 bg-primary-dim' : 'border-border bg-surface-2'}`}>
          <p className={`mono-label text-[9px] ${due > 0 ? 'text-primary' : 'text-muted-foreground'}`}>Due to you</p>
          <p className={`mt-1 font-sans text-xl font-extrabold ${due > 0 ? 'text-primary' : 'text-foreground'}`}>{money(due)}</p>
        </div>
      </div>

      {/* Payout split — what you receive vs what the host keeps */}
      <div className="rounded-xl border border-border-strong bg-surface-2 p-4">
        <p className="mono-label text-[9px] text-muted-foreground">How this statement splits</p>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-background">
          <div className="h-full bg-primary" style={{ width: `${yourPct}%` }} />
          <div className="h-full bg-muted-foreground/40" style={{ width: `${feePct}%` }} />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
            <span className="text-[13px]">
              You receive <span className="font-semibold">{money(net)}</span>
            </span>
          </span>
          <span className="mono-label text-[10px] text-primary">{yourPct}%</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/40" />
            <span className="text-[13px] text-muted-foreground">
              Host fee + costs <span className="font-semibold">{money(totalFees)}</span>
            </span>
          </span>
          <span className="mono-label text-[10px] text-muted-foreground">{feePct}%</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <Line label="Nights booked" value={String(statement?.nights ?? 0)} />
        <Line label="Gross revenue" value={money(gross)} />
        {statement?.lines.map((l) => (
          <Line key={l.label} label={l.label} value={`− ${money(l.amount)}`} muted />
        ))}
        <div className="flex items-center justify-between bg-primary-dim px-4 py-4">
          <span className="mono-label text-[10px] text-primary">Net payout</span>
          <span className="font-sans text-xl font-extrabold text-primary">{money(net)}</span>
        </div>
      </div>

      {/* Detailed per-property breakdown for multi-unit owners */}
      {multiUnit && (
        <section>
          <h2 className="mono-label mb-2 text-[10px] text-muted-foreground">By property</h2>
          <div className="flex flex-col gap-2">
            {statement!.properties!.map((p) => (
              <div key={p.name} className="rounded-xl border border-border bg-surface-2 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-[14px] font-semibold">{p.name}</p>
                  <p className="text-[14px] font-bold text-primary">{money(p.net)}</p>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  <span className="mono-label text-[9px] text-muted-foreground">
                    {p.nights} nights · {p.bookings} bookings
                  </span>
                  <span className="mono-label text-[9px] text-muted-foreground">Gross {money(p.gross)}</span>
                  <span className="mono-label text-[9px] text-muted-foreground">Paid {money(p.paid)}</span>
                  <span className={`mono-label text-[9px] ${p.due > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                    Due {money(p.due)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div>
        <p className="mono-label mb-2 text-[10px] text-muted-foreground">Statement format</p>
        <div className="grid grid-cols-3 gap-2">
          {STATEMENT_FORMATS.map((f) => {
            const active = format === f.key
            return (
              <button
                key={f.key}
                onClick={() => setFormat(f.key)}
                aria-pressed={active}
                className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  active ? 'border-primary bg-primary-dim' : 'border-border bg-surface-2 hover:border-border-strong'
                }`}
              >
                <span className={`mono-label block text-[11px] ${active ? 'text-primary' : 'text-foreground'}`}>
                  {f.label}
                </span>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">{f.hint}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => statement && downloadStatement(statement, format)}
          disabled={!statement}
          className="mono-label flex items-center justify-center gap-2 rounded-lg border border-border py-3.5 text-[11px] text-primary transition-colors hover:border-primary disabled:opacity-60"
        >
          <Download size={15} /> Download {format.toUpperCase()}
        </button>
        <button
          onClick={() => statement && emailStatement(statement)}
          disabled={!statement}
          className="mono-label flex items-center justify-center gap-2 rounded-lg border border-border py-3.5 text-[11px] text-primary transition-colors hover:border-primary disabled:opacity-60"
        >
          <Mail size={15} /> Email to me
        </button>
      </div>

      <section>
        <h2 className="mono-label mb-2 text-[10px] text-muted-foreground">Payout history</h2>
        <div className="flex flex-col gap-2">
          {history(net).map((h) => (
            <div key={h.month} className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-4 py-3">
              <span className="text-[13px]">{h.month}</span>
              <span className="text-[13px] font-semibold">{money(h.net)}</span>
            </div>
          ))}
        </div>
      </section>

      <p className="pb-2 text-center text-[11px] leading-relaxed text-muted-foreground">
        StayKnit tracks these figures for your records — payment is arranged directly with your host, not through
        StayKnit. Questions? Contact your host.
      </p>
    </div>
  )
}

function Line({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3.5 last:border-b-0">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className={`text-[13px] font-medium ${muted ? 'text-muted-foreground' : 'text-foreground'}`}>{value}</span>
    </div>
  )
}
