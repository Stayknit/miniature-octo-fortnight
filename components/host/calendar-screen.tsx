'use client'

import { updateDirectBooking, cancelDirectBooking, setBookingPrice } from '@/app/actions/stayknit'
import { Modal, Field, inputClass } from '@/components/modal'
import { useMoney, useCurrencySymbol } from '@/components/currency-context'
import { channelTint, dateRange } from '@/lib/format'
import { clashingIds, findClashesFor } from '@/lib/overlap'
import { todayParts } from '@/lib/today'
import type { Booking, StayKnitData } from '@/lib/types'
import { AlertTriangle, ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const CELL = 34 // px per day
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

// Clamp a booking to the visible month, returning [startDay, endDayExclusive].
function span(b: Booking, year: number, month: number, days: number): { start: number; end: number } | null {
  const [iy, im, id] = b.checkIn.split('-').map(Number)
  const [oy, om, od] = b.checkOut.split('-').map(Number)
  const startsBefore = iy < year || (iy === year && im < month)
  const endsAfter = oy > year || (oy === year && om > month)
  const inThis = im === month && iy === year
  const outThis = om === month && oy === year
  if (!inThis && !outThis && !(startsBefore && endsAfter)) return null
  const start = inThis ? id : 1
  const end = outThis ? od : days + 1
  if (end <= start) return null
  return { start, end }
}

export function CalendarScreen({ data }: { data: StayKnitData }) {
  // Real current date. The "today" marker only shows when this month is in view.
  const DEMO_TODAY = todayParts()
  const [filter, setFilter] = useState('All units')
  const [editing, setEditing] = useState<Booking | null>(null)
  const [pricing, setPricing] = useState<Booking | null>(null)
  const [view, setView] = useState({ year: DEMO_TODAY.year, month: DEMO_TODAY.month })
  const properties = data.properties
  const shown = filter === 'All units' ? properties : properties.filter((p) => p.name === filter)

  const days = daysInMonth(view.year, view.month)
  const isTodayMonth = view.year === DEMO_TODAY.year && view.month === DEMO_TODAY.month

  function shiftMonth(delta: number) {
    setView((v) => {
      const next = new Date(v.year, v.month - 1 + delta, 1)
      return { year: next.getFullYear(), month: next.getMonth() + 1 }
    })
  }

  const rows = useMemo(
    () =>
      shown.map((p) => ({
        property: p,
        bars: data.bookings
          .filter((b) => b.propertyName === p.name)
          .map((b) => ({ booking: b, span: span(b, view.year, view.month, days) }))
          .filter((x): x is { booking: Booking; span: { start: number; end: number } } => x.span !== null),
      })),
    [shown, data.bookings, view.year, view.month, days],
  )

  // Every host-owned direct booking, respecting the active unit filter, newest
  // check-in first. These are the only bookings the host can edit or cancel.
  const directBookings = useMemo(() => {
    const names = new Set(shown.map((p) => p.name))
    return data.bookings
      .filter((b) => b.channel === 'DIRECT' && names.has(b.propertyName))
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
  }, [shown, data.bookings])

  // Imported reservations pulled from listing-site iCal feeds. Their dates and
  // guest are owned by the feed (read-only), but the price never comes over
  // iCal — the host sets it here so the stay counts on statements and payouts.
  const channelBookings = useMemo(() => {
    const names = new Set(shown.map((p) => p.name))
    return data.bookings
      .filter((b) => b.channel !== 'DIRECT' && b.status !== 'block' && names.has(b.propertyName))
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
  }, [shown, data.bookings])

  const clashes = useMemo(() => clashingIds(data.bookings), [data.bookings])
  const clashCount = useMemo(() => {
    const ids = clashingIds(shown.flatMap((p) => data.bookings.filter((b) => b.propertyName === p.name)))
    return ids.size
  }, [shown, data.bookings])

  // Whether the month in view actually shows any stays. When it doesn't, a host
  // can mistake an empty grid for "sync isn't working" — so we surface the next
  // upcoming stay (imported feeds land on their real, often future, dates) with
  // a one-tap jump to that month. Only counts stays for the units in view.
  const monthHasStays = useMemo(() => rows.some((r) => r.bars.length > 0), [rows])
  const nextStay = useMemo(() => {
    const names = new Set(shown.map((p) => p.name))
    const todayIso = `${DEMO_TODAY.year}-${String(DEMO_TODAY.month).padStart(2, '0')}-${String(DEMO_TODAY.day).padStart(2, '0')}`
    return (
      data.bookings
        .filter((b) => names.has(b.propertyName) && b.checkOut > todayIso)
        .sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0] ?? null
    )
  }, [shown, data.bookings, DEMO_TODAY])

  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // On the current month land on today's week; otherwise start at day 1.
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = isTodayMonth ? Math.max(0, (DEMO_TODAY.day - 4) * CELL) : 0
    }
  }, [isTodayMonth, view.year, view.month])

  return (
    <div className="flex flex-col gap-4 pt-4 lg:pt-6">
      <div className="px-5 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-sans text-2xl font-extrabold">
              {MONTH_NAMES[view.month - 1]} {view.year}
            </h1>
            <p className="mono-label mt-1 text-[10px] text-muted-foreground">
              One timeline · every channel merged over iCal
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {!isTodayMonth && (
              <button
                onClick={() => setView({ year: DEMO_TODAY.year, month: DEMO_TODAY.month })}
                className="mono-label rounded-md border border-border px-2.5 py-2 text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                Today
              </button>
            )}
            <button
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="rounded-md border border-border p-2 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              className="rounded-md border border-border p-2 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {clashCount > 0 && (
        <div className="mx-5 flex items-center gap-2 rounded-lg border border-danger bg-danger/10 px-4 py-3 lg:mx-8">
          <AlertTriangle size={15} className="shrink-0 text-danger" />
          <p className="text-[13px] text-danger">
            <span className="font-semibold">Double booking detected.</span> Overlapping stays are outlined in red on the
            timeline.
          </p>
        </div>
      )}

      {/* Unit filter */}
      <div className="app-scroll flex gap-2 overflow-x-auto px-5 pb-1 lg:px-8">
        {['All units', ...properties.map((p) => p.name)].map((name) => (
          <button
            key={name}
            onClick={() => setFilter(name)}
            className={`mono-label whitespace-nowrap rounded-full border px-3 py-1.5 text-[10px] transition-colors ${
              filter === name
                ? 'border-primary bg-primary-dim text-primary'
                : 'border-border text-muted-foreground hover:border-border-strong'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {!monthHasStays && nextStay && (
        <button
          type="button"
          onClick={() => {
            const [ny, nm] = nextStay.checkIn.split('-').map(Number)
            setView({ year: ny, month: nm })
          }}
          className="mx-5 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2/60 px-4 py-3 text-left transition-colors hover:border-primary lg:mx-8"
        >
          <span className="text-[13px] text-muted-foreground">
            No stays in {MONTH_NAMES[view.month - 1]}. Next:{' '}
            <span className="font-semibold text-foreground">
              {nextStay.status === 'block' ? 'Blocked' : nextStay.guest}
            </span>{' '}
            at {nextStay.propertyName} · {dateRange(nextStay.checkIn, nextStay.checkOut)}
          </span>
          <span className="mono-label shrink-0 text-[10px] text-primary">
            Jump to {MONTH_NAMES[Number(nextStay.checkIn.split('-')[1]) - 1]}{' '}
            {nextStay.checkIn.split('-')[0]}
          </span>
        </button>
      )}

      {/* Timeline */}
      <div ref={scrollRef} className="app-scroll overflow-x-auto pb-2 lg:px-8">
        <div style={{ width: 120 + days * CELL }}>
          {/* Day header */}
          <div className="flex border-b border-border">
            <div className="sticky left-0 z-10 w-[120px] shrink-0 bg-panel" />
            {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
              <div
                key={d}
                className={`shrink-0 py-2 text-center text-[10px] ${
                  isTodayMonth && d === DEMO_TODAY.day ? 'font-bold text-primary' : 'text-muted-foreground'
                }`}
                style={{ width: CELL }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Property rows */}
          {rows.map(({ property, bars }) => (
            <div key={property.id} className="flex items-stretch border-b border-border">
              <div className="sticky left-0 z-10 flex w-[120px] shrink-0 flex-col justify-center border-r border-border bg-panel px-3 py-3">
                <span className="truncate text-[13px] font-semibold">{property.name}</span>
                <span className="mono-label truncate text-[8px] text-muted-foreground">{property.ownerName}</span>
              </div>
              <div className="relative" style={{ width: days * CELL, minHeight: 46 }}>
                {/* today marker — only on the current month */}
                {isTodayMonth && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-primary/30"
                    style={{ left: (DEMO_TODAY.day - 1) * CELL + CELL / 2 }}
                  />
                )}
                {bars.map(({ booking, span }) => {
                  const tint = channelTint(booking.channel)
                  const isBlock = booking.status === 'block'
                  const isClash = clashes.has(booking.id)
                  return (
                    <div
                      key={booking.id}
                      title={
                        isClash
                          ? `Double booking · ${booking.guest} · ${booking.channel}`
                          : `${booking.guest} · ${booking.channel}`
                      }
                      className="absolute top-1/2 flex -translate-y-1/2 items-center gap-1 overflow-hidden rounded-md px-2"
                      style={{
                        left: (span.start - 1) * CELL + 3,
                        width: (span.end - span.start) * CELL - 6,
                        height: 30,
                        background: isClash
                          ? 'var(--danger-dim, rgba(224,90,90,0.16))'
                          : isBlock
                            ? 'repeating-linear-gradient(45deg,#1b2427,#1b2427 5px,#131b1d 5px,#131b1d 10px)'
                            : `${tint}26`,
                        border: `1px solid ${isClash ? 'var(--danger)' : isBlock ? '#3a474b' : tint}`,
                        boxShadow: isClash ? '0 0 0 1px var(--danger)' : undefined,
                      }}
                    >
                      {isClash && <AlertTriangle size={11} className="shrink-0 text-danger" />}
                      <span
                        className="truncate text-[10px] font-medium"
                        style={{ color: isClash ? 'var(--danger)' : isBlock ? '#92a3a8' : tint }}
                      >
                        {isBlock ? 'Blocked' : booking.guest}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Direct bookings — the only stays the host can edit here */}
      <div className="px-5 lg:px-8">
        <div className="flex items-baseline justify-between">
          <h2 className="font-sans text-base font-bold">Direct bookings</h2>
          <span className="mono-label text-[10px] text-muted-foreground">
            {directBookings.length} {directBookings.length === 1 ? 'stay' : 'stays'}
          </span>
        </div>
        <p className="mono-label mt-1 text-[10px] leading-relaxed text-muted-foreground">
          StayKnit-owned stays. Channel &amp; iCal reservations are read-only.
        </p>

        <div className="mt-3 flex flex-col gap-2 pb-4">
          {directBookings.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-surface-2/40 px-4 py-6 text-center">
              <p className="text-[13px] text-muted-foreground">No direct bookings for this view.</p>
              <p className="mono-label mt-1 text-[9px] text-muted-foreground">Add one from the Today tab.</p>
            </div>
          ) : (
            directBookings.map((b) => (
              <DirectBookingRow
                key={b.id}
                booking={b}
                isClash={clashes.has(b.id)}
                onEdit={() => setEditing(b)}
              />
            ))
          )}
        </div>
      </div>

      {/* Channel bookings — dates sync from the listing site; price entered here */}
      <div className="px-5 lg:px-8">
        <div className="flex items-baseline justify-between">
          <h2 className="font-sans text-base font-bold">Channel bookings</h2>
          <span className="mono-label text-[10px] text-muted-foreground">
            {channelBookings.length} {channelBookings.length === 1 ? 'stay' : 'stays'}
          </span>
        </div>
        <p className="mono-label mt-1 text-[10px] leading-relaxed text-muted-foreground">
          Dates sync from the listing site. iCal never sends the price &mdash; tap a stay to add it so it counts on
          statements &amp; payouts.
        </p>

        <div className="mt-3 flex flex-col gap-2 pb-4">
          {channelBookings.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-surface-2/40 px-4 py-6 text-center">
              <p className="text-[13px] text-muted-foreground">No channel bookings for this view.</p>
              <p className="mono-label mt-1 text-[9px] text-muted-foreground">Imported stays appear here after a sync.</p>
            </div>
          ) : (
            channelBookings.map((b) => (
              <ChannelBookingRow
                key={b.id}
                booking={b}
                isClash={clashes.has(b.id)}
                onSetPrice={() => setPricing(b)}
              />
            ))
          )}
        </div>
      </div>

      {editing && (
        <EditDirectBookingModal
          data={data}
          booking={editing}
          onClose={() => setEditing(null)}
        />
      )}
      {pricing && <SetPriceModal booking={pricing} onClose={() => setPricing(null)} />}
    </div>
  )
}

function DirectBookingRow({
  booking,
  isClash,
  onEdit,
}: {
  booking: Booking
  isClash: boolean
  onEdit: () => void
}) {
  const money = useMoney()
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const tint = channelTint(booking.channel)

  function remove() {
    if (!confirm(`Cancel ${booking.guest}'s direct booking? This frees the dates on every linked channel.`)) return
    startTransition(async () => {
      await cancelDirectBooking(booking.id)
      router.refresh()
    })
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border bg-surface-2 px-3.5 py-3 ${
        isClash ? 'border-danger' : 'border-border'
      }`}
    >
      <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: tint }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{booking.guest}</span>
          {isClash && <AlertTriangle size={12} className="shrink-0 text-danger" />}
        </div>
        <span className="mono-label block truncate text-[9px] text-muted-foreground">
          {booking.propertyName} · {dateRange(booking.checkIn, booking.checkOut)}
        </span>
      </div>
      <span className="shrink-0 text-[13px] font-semibold tabular-nums">{money(booking.amount)}</span>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={onEdit}
          aria-label={`Edit ${booking.guest}`}
          className="rounded-md border border-border p-2 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={remove}
          disabled={pending}
          aria-label={`Cancel ${booking.guest}`}
          className="rounded-md border border-border p-2 text-muted-foreground transition-colors hover:border-danger hover:text-danger disabled:opacity-50"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

function EditDirectBookingModal({
  data,
  booking,
  onClose,
}: {
  data: StayKnitData
  booking: Booking
  onClose: () => void
}) {
  const symbol = useCurrencySymbol()
  const [, startTransition] = useTransition()
  const router = useRouter()
  const [propertyName, setPropertyName] = useState(booking.propertyName)
  const [guest, setGuest] = useState(booking.guest)
  const [checkIn, setCheckIn] = useState(booking.checkIn)
  const [checkOut, setCheckOut] = useState(booking.checkOut)
  const [amount, setAmount] = useState(String(booking.amount))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Exclude this booking from clash checks so editing it doesn't clash with itself.
  const others = useMemo(() => data.bookings.filter((b) => b.id !== booking.id), [data.bookings, booking.id])
  const clashes = findClashesFor(propertyName, checkIn, checkOut, others)
  const hasClash = clashes.length > 0 && checkOut > checkIn

  function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    startTransition(async () => {
      const res = await updateDirectBooking({ id: booking.id, propertyName, guest, checkIn, checkOut, amount: Number(amount) })
      if (!res.ok) {
        setError(res.error)
        setSaving(false)
        return
      }
      router.refresh()
      onClose()
    })
  }

  return (
    <Modal title="Edit direct booking" onClose={onClose}>
      <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
        Changes re-sync to every linked channel over iCal, keeping the dates blocked everywhere.
      </p>
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="Unit">
          <select value={propertyName} onChange={(e) => setPropertyName(e.target.value)} className={inputClass}>
            {data.properties.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Guest name">
          <input value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="e.g. Walk-in guest" className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Check in">
            <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Check out">
            <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field label={`Amount (${symbol})`}>
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="3300"
            className={inputClass}
          />
        </Field>

        {hasClash && (
          <div className="rounded-lg border border-danger bg-danger/10 px-3 py-2.5">
            <p className="mono-label flex items-center gap-1.5 text-[10px] text-danger">
              <AlertTriangle size={12} /> These dates overlap an existing stay
            </p>
            {clashes.map((c) => (
              <p key={c.id} className="mt-1 text-[12px] text-danger/90">
                {c.guest} · {c.channel} · {dateRange(c.checkIn, c.checkOut)}
              </p>
            ))}
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-danger bg-danger/10 px-3 py-2.5 text-[12px] text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving || checkOut <= checkIn}
          className="mono-label mt-1 rounded-lg py-3.5 text-[11px] text-primary-foreground disabled:opacity-60"
          style={{ background: hasClash ? 'var(--danger)' : 'var(--primary)' }}
        >
          {saving ? 'Saving…' : hasClash ? 'Save anyway' : 'Save changes'}
        </button>
      </form>
    </Modal>
  )
}

// An imported channel reservation. Dates and guest are owned by the listing
// site's feed and stay read-only; the host can only set the price, which iCal
// never carries. A stay with no price yet is nudged with a "Set price" pill.
function ChannelBookingRow({
  booking,
  isClash,
  onSetPrice,
}: {
  booking: Booking
  isClash: boolean
  onSetPrice: () => void
}) {
  const money = useMoney()
  const tint = channelTint(booking.channel)
  const needsPrice = !booking.amount

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border bg-surface-2 px-3.5 py-3 ${
        isClash ? 'border-danger' : 'border-border'
      }`}
    >
      <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: tint }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{booking.guest}</span>
          {isClash && <AlertTriangle size={12} className="shrink-0 text-danger" />}
        </div>
        <span className="mono-label block truncate text-[9px] text-muted-foreground">
          {booking.channel} · {booking.propertyName} · {dateRange(booking.checkIn, booking.checkOut)}
        </span>
      </div>
      {needsPrice ? (
        <button
          onClick={onSetPrice}
          className="shrink-0 rounded-md border border-primary/60 px-2.5 py-2 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10"
        >
          Set price
        </button>
      ) : (
        <>
          <span className="shrink-0 text-[13px] font-semibold tabular-nums">{money(booking.amount)}</span>
          <button
            onClick={onSetPrice}
            aria-label={`Edit price for ${booking.guest}`}
            className="shrink-0 rounded-md border border-border p-2 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Pencil size={14} />
          </button>
        </>
      )}
    </div>
  )
}

// Price-only editor for an imported stay. Only the amount is editable; the
// entered value persists across future syncs (reconcile never touches amount).
function SetPriceModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const symbol = useCurrencySymbol()
  const [, startTransition] = useTransition()
  const router = useRouter()
  const [amount, setAmount] = useState(booking.amount ? String(booking.amount) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    startTransition(async () => {
      const res = await setBookingPrice(booking.id, Number(amount) || 0)
      if (!res.ok) {
        setError(res.error)
        setSaving(false)
        return
      }
      router.refresh()
      onClose()
    })
  }

  return (
    <Modal title="Set booking price" onClose={onClose}>
      <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
        {booking.channel} sends only the dates over iCal, never the price. Enter what {booking.guest} paid for{' '}
        {booking.propertyName} ({dateRange(booking.checkIn, booking.checkOut)}) so it shows on statements and owner
        payouts. The dates stay in sync with the listing site.
      </p>
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label={`Amount (${symbol})`}>
          <input
            inputMode="numeric"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="3300"
            className={inputClass}
          />
        </Field>

        {error && (
          <p role="alert" className="rounded-lg border border-danger bg-danger/10 px-3 py-2.5 text-[12px] text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="mono-label mt-1 rounded-lg py-3.5 text-[11px] text-primary-foreground disabled:opacity-60"
          style={{ background: 'var(--primary)' }}
        >
          {saving ? 'Saving…' : 'Save price'}
        </button>
      </form>
    </Modal>
  )
}
