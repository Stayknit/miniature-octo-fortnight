'use client'

import { channelTint, dateRange } from '@/lib/format'
import { daysInMonth, monthName, monthYearLabel, todayParts } from '@/lib/today'
import type { Booking, Property } from '@/lib/types'
import { useMemo, useState } from 'react'

const STAYS_PREVIEW = 8

// Clamp a booking to the given month, returning [startDay, endDayExclusive].
function span(b: Booking, year: number, month: number, days: number): { start: number; end: number } | null {
  const [iy, im, id] = b.checkIn.split('-').map(Number)
  const [oy, om, od] = b.checkOut.split('-').map(Number)
  const inThis = im === month && iy === year
  const outThis = om === month && oy === year
  if (!inThis && !outThis) return null
  const start = inThis ? id : 1
  const end = outThis ? od : days + 1
  if (end <= start) return null
  return { start, end }
}

export function OwnerCalendar({
  bookings,
  properties,
}: {
  bookings: Booking[]
  properties: Property[]
}) {
  const [showAllStays, setShowAllStays] = useState(false)
  const { year, month, day: todayDay } = todayParts()

  // Pick ONE month that both the occupancy bars and the stay list below are
  // computed for, so they can never disagree (the old page showed "0% booked"
  // beside a full stay list because occupancy was locked to the real current
  // month while the list showed every booking regardless of month). Prefer the
  // current month; if it has no stays, fall back to the month that holds the
  // most bookings so the page lands on real data instead of an empty grid.
  const { activeYear, activeMonth } = useMemo(() => {
    const counts = new Map<string, number>()
    for (const b of bookings) {
      const [y, m] = b.checkIn.split('-').map(Number)
      const key = `${y}-${m}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    if (counts.get(`${year}-${month}`) || counts.size === 0) {
      return { activeYear: year, activeMonth: month }
    }
    let bestKey = ''
    let best = -1
    for (const [key, n] of counts) {
      const [y, m] = key.split('-').map(Number)
      // Tie-break to the earliest month so the choice is stable.
      if (n > best || (n === best && (y < Number(bestKey.split('-')[0]) || (y === Number(bestKey.split('-')[0]) && m < Number(bestKey.split('-')[1]))))) {
        best = n
        bestKey = key
      }
    }
    const [y, m] = bestKey.split('-').map(Number)
    return { activeYear: y, activeMonth: m }
  }, [bookings, year, month])

  const isCurrentMonth = activeYear === year && activeMonth === month
  const days = daysInMonth(activeYear, activeMonth)
  const monthAbbr = monthName(activeMonth).slice(0, 3).toUpperCase()

  // Both the bars and the list read from the same month-scoped, sorted set.
  const monthStays = useMemo(
    () =>
      bookings
        .filter((b) => span(b, activeYear, activeMonth, days) !== null)
        .sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
    [bookings, activeYear, activeMonth, days],
  )
  const visibleStays = showAllStays ? monthStays : monthStays.slice(0, STAYS_PREVIEW)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-5 pt-4 lg:px-8 lg:pt-6">
      <div>
        <h1 className="font-sans text-2xl font-extrabold">
          {monthYearLabel({ year: activeYear, month: activeMonth, day: isCurrentMonth ? todayDay : 1 })}
        </h1>
        <p className="mono-label mt-1 text-[10px] text-muted-foreground">Your units · read-only</p>
      </div>

      {/* Occupancy bars per unit */}
      <div className="grid gap-4 lg:grid-cols-2">
        {properties.map((p) => {
          const bars = bookings
            .filter((b) => b.propertyName === p.name)
            .map((b) => ({ booking: b, s: span(b, activeYear, activeMonth, days) }))
            .filter((x): x is { booking: Booking; s: { start: number; end: number } } => x.s !== null)
          const booked = bars.reduce((a, x) => a + (x.s.end - x.s.start), 0)
          return (
            <div key={p.id} className="rounded-xl border border-border bg-surface-2 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{p.name}</p>
                <span className="mono-label text-[9px] text-primary">{Math.round((booked / days) * 100)}% booked</span>
              </div>
              {/* month strip */}
              <div className="relative mt-3 h-7 overflow-hidden rounded-md border border-border">
                {isCurrentMonth && (
                  <div
                    className="absolute top-0 bottom-0 z-10 w-px bg-primary/50"
                    style={{ left: `${((todayDay - 1) / days) * 100}%` }}
                  />
                )}
                {bars.map(({ booking, s }) => {
                  const tint = channelTint(booking.channel)
                  const isBlock = booking.status === 'block'
                  return (
                    <div
                      key={booking.id}
                      title={`${dateRange(booking.checkIn, booking.checkOut)} · ${booking.channel}`}
                      className="absolute top-0 bottom-0"
                      style={{
                        left: `${((s.start - 1) / days) * 100}%`,
                        width: `${((s.end - s.start) / days) * 100}%`,
                        background: isBlock
                          ? 'repeating-linear-gradient(45deg,#1b2427,#1b2427 4px,#131b1d 4px,#131b1d 8px)'
                          : `${tint}55`,
                        borderLeft: `2px solid ${isBlock ? '#3a474b' : tint}`,
                      }}
                    />
                  )
                })}
              </div>
              <div className="mt-2 flex justify-between">
                <span className="mono-label text-[8px] text-muted-foreground">1 {monthAbbr}</span>
                <span className="mono-label text-[8px] text-muted-foreground">{days} {monthAbbr}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Stay list */}
      <div>
        <h2 className="mono-label mb-2 text-[10px] text-muted-foreground">All stays this month</h2>
        <div className="grid gap-2 lg:grid-cols-2">
          {monthStays.length === 0 && (
            <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground lg:col-span-2">
              No stays this month.
            </p>
          )}
          {visibleStays.map((b) => {
            const tint = channelTint(b.channel)
            const isBlock = b.status === 'block'
            return (
              <div key={b.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-4 py-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: isBlock ? '#3a474b' : tint }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{isBlock ? 'Blocked' : b.propertyName}</p>
                  <p className="mono-label truncate text-[9px] text-muted-foreground">{dateRange(b.checkIn, b.checkOut)}</p>
                </div>
                <span className="mono-label shrink-0 text-[9px]" style={{ color: isBlock ? '#92a3a8' : tint }}>
                  {b.channel}
                </span>
              </div>
            )
          })}
        </div>
        {monthStays.length > STAYS_PREVIEW && (
          <button
            onClick={() => setShowAllStays((v) => !v)}
            className="mono-label mt-2 mb-2 w-full rounded-lg border border-border py-2.5 text-[10px] text-primary transition-colors hover:border-primary"
          >
            {showAllStays ? 'Show fewer' : `Show all ${monthStays.length} stays`}
          </button>
        )}
      </div>
    </div>
  )
}
