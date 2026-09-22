'use client'

import { channelTint, dateRange } from '@/lib/format'
import { useMoney, useCurrency } from '@/components/currency-context'
import { totalCost } from '@/lib/costing'
import { buildOwnerStatement } from '@/lib/owner-statement'
import { monthName, todayIso, todayParts } from '@/lib/today'
import type { Booking, CostLine, OwnerClient, Property } from '@/lib/types'
import { CalendarDays, Home, MoveRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

const UNITS_PREVIEW = 6
const STAYS_PREVIEW = 6

export function OwnerDashboard({
  self,
  bookings,
  properties,
  costLines,
  vat,
  onNavigate,
}: {
  self: OwnerClient | undefined
  bookings: Booking[]
  properties: Property[]
  costLines: CostLine[]
  vat: { enabled: boolean; rate: number }
  onNavigate: (t: string) => void
}) {
  const money = useMoney()
  const currency = useCurrency()
  const [query, setQuery] = useState('')

  // Overview payout figures come from the SAME shared builder the Statement
  // page uses, so nights / gross / net always match between the two tabs.
  const statement = useMemo(
    () => buildOwnerStatement({ self, bookings, costLines, vat, currency }),
    [self, bookings, costLines, vat, currency],
  )
  const gross = statement?.gross ?? 0
  const net = statement?.net ?? 0
  const nights = statement?.nights ?? 0
  const totalFees = statement ? totalCost(statement.lines) : 0
  const [showAllUnits, setShowAllUnits] = useState(false)
  const [showAllStays, setShowAllStays] = useState(false)

  const today = todayIso()
  const { month } = todayParts()
  const thisMonth = monthName(month)
  const nextMonth = monthName((month % 12) + 1)
  const upcoming = useMemo(
    () =>
      bookings
        .filter((b) => b.status !== 'block' && b.checkOut >= today)
        .sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
    [bookings, today],
  )

  // A single search box filters both units and their stays, so an owner with a
  // long portfolio can jump to one property instead of scrolling everything.
  const q = query.trim().toLowerCase()
  const filteredUnits = useMemo(
    () => (q ? properties.filter((p) => p.name.toLowerCase().includes(q)) : properties),
    [properties, q],
  )
  const filteredStays = useMemo(
    () => (q ? upcoming.filter((b) => b.propertyName.toLowerCase().includes(q)) : upcoming),
    [upcoming, q],
  )

  const visibleUnits = showAllUnits ? filteredUnits : filteredUnits.slice(0, UNITS_PREVIEW)
  const visibleStays = showAllStays ? filteredStays : filteredStays.slice(0, STAYS_PREVIEW)
  const manyUnits = properties.length > UNITS_PREVIEW

  // Count upcoming stays per unit so each unit card is scannable at a glance.
  const staysPerUnit = useMemo(() => {
    const map = new Map<string, number>()
    for (const b of upcoming) map.set(b.propertyName, (map.get(b.propertyName) ?? 0) + 1)
    return map
  }, [upcoming])

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-5 pt-4 lg:px-8 lg:pt-6">
      <div>
        <p className="mono-label text-[10px] text-muted-foreground">Welcome back</p>
        <h1 className="mt-1 font-sans text-2xl font-extrabold">{self?.name ?? 'Your portfolio'}</h1>
        <p className="mono-label mt-1 text-[10px] text-muted-foreground">
          {properties.length} {properties.length === 1 ? 'unit' : 'units'} · read-only
        </p>
      </div>

      {/* Payout card */}
      <div className="rounded-xl border border-border-strong bg-primary-dim px-4 py-4">
        <p className="mono-label text-[9px] text-primary">You receive · {thisMonth}</p>
        <p className="mt-1.5 font-sans text-3xl font-extrabold text-primary">{money(net)}</p>
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
          <span className="mono-label text-[9px] text-primary-muted">Gross {money(gross)}</span>
          <span className="mono-label text-[9px] text-primary-muted">Fees &amp; costs −{money(totalFees)}</span>
        </div>
        <p className="mono-label mt-2.5 text-[9px] text-primary-muted">Statement sends on 1 {nextMonth}</p>
      </div>

      <section className="grid grid-cols-3 gap-2">
        <Stat value={String(nights)} label="Nights booked" />
        <Stat value={money(gross)} label="Gross revenue" small />
        <Stat value={String(properties.length)} label="Your units" />
      </section>

      {/* One search box scopes both the unit grid and the stay list below. Only
          shown once the portfolio is large enough to be worth filtering. */}
      {properties.length > 3 && (
        <label className="relative block">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your units…"
            className="w-full rounded-lg border border-border bg-surface-2 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary"
          />
        </label>
      )}

      {/* Your units — responsive grid, capped with a show-all toggle so height
          stays bounded no matter how many units an owner has. */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="mono-label text-[10px] text-muted-foreground">Your units</h2>
          {q && (
            <span className="mono-label text-[10px] text-muted-foreground">
              {filteredUnits.length} of {properties.length}
            </span>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visibleUnits.length === 0 && (
            <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
              No units match “{query}”.
            </p>
          )}
          {visibleUnits.map((p) => {
            const count = staysPerUnit.get(p.name) ?? 0
            return (
              <div key={p.id} className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-3.5 py-3">
                <Home size={15} className="shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold">{p.name}</p>
                  <p className="mono-label mt-0.5 text-[9px] text-muted-foreground">
                    {count} upcoming {count === 1 ? 'stay' : 'stays'}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
        {manyUnits && !q && (
          <button
            onClick={() => setShowAllUnits((v) => !v)}
            className="mono-label mt-2 w-full rounded-lg border border-border py-2.5 text-[10px] text-primary transition-colors hover:border-primary"
          >
            {showAllUnits ? 'Show fewer' : `Show all ${filteredUnits.length} units`}
          </button>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="mono-label text-[10px] text-muted-foreground">Upcoming stays</h2>
          <button
            onClick={() => onNavigate('calendar')}
            className="mono-label flex items-center gap-1 text-[10px] text-primary"
          >
            Calendar <MoveRight size={12} />
          </button>
        </div>
        <div className="grid gap-2 lg:grid-cols-2">
          {visibleStays.length === 0 && (
            <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground lg:col-span-2">
              {q ? `No upcoming stays for “${query}”.` : 'No upcoming stays yet.'}
            </p>
          )}
          {visibleStays.map((b) => {
            const tint = channelTint(b.channel)
            return (
              <div key={b.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-4 py-3">
                <CalendarDays size={16} className="shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{b.propertyName}</p>
                  <p className="mono-label truncate text-[10px] text-muted-foreground">
                    {dateRange(b.checkIn, b.checkOut)} · {b.nights} nights
                  </p>
                </div>
                <span className="mono-label shrink-0 text-[9px]" style={{ color: tint }}>
                  {b.channel}
                </span>
              </div>
            )
          })}
        </div>
        {filteredStays.length > STAYS_PREVIEW && (
          <button
            onClick={() => setShowAllStays((v) => !v)}
            className="mono-label mt-2 w-full rounded-lg border border-border py-2.5 text-[10px] text-primary transition-colors hover:border-primary"
          >
            {showAllStays ? 'Show fewer' : `Show all ${filteredStays.length} stays`}
          </button>
        )}
      </section>

      <p className="pb-2 text-center text-[11px] leading-relaxed text-muted-foreground">
        This is a read-only view of your units. Your host manages bookings and pricing.
      </p>
    </div>
  )
}

function Stat({ value, label, small }: { value: string; label: string; small?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-3">
      <p className={`font-sans font-extrabold ${small ? 'text-sm' : 'text-xl'}`}>{value}</p>
      <p className="mono-label mt-1 text-[8px] leading-tight text-muted-foreground">{label}</p>
    </div>
  )
}
