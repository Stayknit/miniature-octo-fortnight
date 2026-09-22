'use client'

import { useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { CtaLink } from '@/components/marketing/cta-link'
import { CURRENCIES } from '@/lib/currency'

// Base statement figures, stored as plain numbers so the demo can re-render
// them in any currency symbol. Net is derived, never hardcoded, so the column
// always reconciles no matter which currency the visitor picks.
const STATEMENT_ROWS = [
  { label: 'Gross bookings', value: 8420 },
  { label: 'Cleaning & fees', value: -960 },
  { label: 'Management fee', value: -421 },
]
const NET = STATEMENT_ROWS.reduce((sum, row) => sum + row.value, 0)

const POINTS = [
  'Live occupancy and upcoming arrivals, updated as bookings land',
  'Itemised monthly statements owners can download themselves',
  'Read-only access scoped to each owner’s own properties',
]

function formatAmount(n: number, symbol: string): string {
  const sign = n < 0 ? '−' : ''
  return `${sign}${symbol}${Math.abs(n).toLocaleString('en-US')}`
}

export function OwnerPortalSection() {
  const [currency, setCurrency] = useState(CURRENCIES[0])

  return (
    <section id="owners" className="scroll-mt-20 border-y border-border bg-surface/40">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 lg:grid-cols-2">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="mono-label text-xs text-primary">Win the next mandate</span>
            <span className="inline-flex items-center rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
              Free on every plan
            </span>
          </div>
          <h2 className="mt-3 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
            Give every owner their own portal
          </h2>
          <p className="mt-4 text-pretty text-lg text-muted-foreground">
            Trust wins management contracts. StayKnit gives each property owner a live, transparent
            view of how their place is performing — and generates the statements for you.
          </p>
          <p className="mt-3 text-pretty text-sm text-muted-foreground">
            Owner statements and accounting are included free — there is never an add-on charge for them.
          </p>
          <ul className="mt-6 space-y-3">
            {POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3">
                <Check className="mt-0.5 size-5 shrink-0 text-primary" />
                <span className="text-muted-foreground">{point}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <CtaLink href="/sign-up" size="lg">
              Create your workspace
              <ArrowRight className="size-4" />
            </CtaLink>
          </div>
        </div>

        {/* In-DOM owner statement preview with a live currency switcher. */}
        <div className="rounded-xl border border-border bg-surface p-6 shadow-2xl shadow-black/40">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <p className="mono-label text-xs text-muted-foreground">Owner statement</p>
              <p className="mt-1 font-bold">Seaside Cottage · March</p>
            </div>
            <span className="rounded-md border border-border-strong bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
              92% occupancy
            </span>
          </div>

          <div
            role="group"
            aria-label="Preview currency"
            className="mt-4 flex flex-wrap gap-1.5"
          >
            {CURRENCIES.map((c) => {
              const active = c.code === currency.code
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => setCurrency(c)}
                  aria-pressed={active}
                  title={c.label}
                  className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground'
                  }`}
                >
                  {c.symbol}
                </button>
              )
            })}
          </div>

          <dl className="mt-4 space-y-3">
            {STATEMENT_ROWS.map((row) => (
              <div key={row.label} className="flex items-center justify-between text-sm">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="font-mono font-medium tabular-nums">
                  {formatAmount(row.value, currency.symbol)}
                </dd>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-border pt-3">
              <dt className="font-semibold">Net to owner</dt>
              <dd className="font-mono text-lg font-bold tabular-nums text-primary">
                {formatAmount(NET, currency.symbol)}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  )
}
