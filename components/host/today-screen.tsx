'use client'

import { acknowledgeBooking, addBlock, addDirectBooking, cancelDirectBooking } from '@/app/actions/stayknit'
import { Field, Modal, inputClass } from '@/components/modal'
import { channelLogin, channelTint, dateRange, openChannelLogin } from '@/lib/format'
import { useMoney, useCurrencySymbol } from '@/components/currency-context'
import { clashPairs, findClashes, findClashesFor } from '@/lib/overlap'
import { lockedUnitNames } from '@/lib/plans'
import { addDaysIso, todayIso } from '@/lib/today'
import type { Booking, Property, StayKnitData } from '@/lib/types'
import { AlertTriangle, ArrowRight, ArrowUpRight, CalendarPlus, Check, ChevronDown, House, Info, Lock, LogOut, MoveRight, Plus, Radio, Trash2, Users } from 'lucide-react'
import { useMemo, useState, useTransition } from 'react'

const ALL = 'All units'

export function TodayScreen({ data, onNavigate }: { data: StayKnitData; onNavigate: (t: string) => void }) {
  const TODAY = todayIso()
  const [isPending, startTransition] = useTransition()
  const [blockOpen, setBlockOpen] = useState(false)
  const [directOpen, setDirectOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [viewing, setViewing] = useState(ALL)

  // On the free trial every listing past the first is locked until upgrade.
  // Locked units are hidden from views, stats, and booking/block targets.
  const locked = useMemo(
    () => new Set(lockedUnitNames(data.subscription, data.properties)),
    [data.subscription, data.properties],
  )
  const activeProperties = data.properties.filter((p) => !locked.has(p.name))

  const inScope = (name: string) => (viewing === ALL ? !locked.has(name) : name === viewing)
  const scoped = data.bookings.filter((b) => inScope(b.propertyName))

  const pending = scoped.filter((b) => b.status === 'pending')
  const arrivals = scoped.filter((b) => b.checkIn === TODAY && b.status !== 'block')
  const departures = scoped.filter((b) => b.checkOut === TODAY && b.status !== 'block')

  // Host-created direct bookings that can be cancelled, scoped to the view.
  const directBookings = scoped.filter((b) => b.channel === 'DIRECT')

  // Only count each double booking once, scoped to the current view.
  const clashes = useMemo(
    () => clashPairs(scoped).filter(([a]) => inScope(a.propertyName)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.bookings, viewing],
  )

  const viewingOwner = viewing === ALL ? 'All owners' : ownerFor(viewing, data.properties)

  function ack(id: number) {
    startTransition(() => acknowledgeBooking(id))
  }

  // Brand-new accounts start with nothing. Guide the host to their first step
  // instead of showing empty stats and quiet-day placeholders.
  if (data.properties.length === 0) {
    return <EmptyOnboarding onNavigate={onNavigate} />
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 pt-4 lg:gap-6 lg:px-8 lg:pt-6">
      {/* Viewing switcher */}
      <button
        onClick={() => setViewOpen(true)}
        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-4 py-3 text-left transition-colors hover:border-primary"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-dim text-primary">
            <House size={17} />
          </span>
          <span className="min-w-0">
            <span className="mono-label block text-[9px] text-muted-foreground">Viewing</span>
            <span className="block truncate text-sm font-semibold">{viewing}</span>
            <span className="mono-label block truncate text-[9px] text-primary-muted">{viewingOwner}</span>
          </span>
        </span>
        <span className="mono-label flex shrink-0 items-center gap-1 text-[10px] text-primary">
          Change <ChevronDown size={14} />
        </span>
      </button>

      {/* Portfolio strip */}
      <section className="grid grid-cols-3 gap-2 lg:gap-4">
        <Stat value={String(viewing === ALL ? activeProperties.length : 1)} label="Units in view" />
        <Stat value={String(data.feeds.length)} label="Feeds connected" accent />
        <Stat value={String(arrivals.length)} label="Arriving today" />
      </section>

      {/* Double bookings — highest priority */}
      {clashes.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="mono-label flex items-center gap-1.5 text-[10px] text-danger">
            <AlertTriangle size={13} /> Double bookings · {clashes.length}
          </h2>
          {clashes.map(([a, b]) => (
            <ClashCard key={`${a.id}-${b.id}`} a={a} b={b} />
          ))}
        </section>
      )}

      {/* Needs you — pending requests */}
      {pending.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="mono-label text-[10px] text-muted-foreground">Needs you</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {pending.map((b) => (
              <PendingCard
                key={b.id}
                booking={b}
                clashes={findClashes(b, data.bookings)}
                busy={isPending}
                onAck={() => ack(b.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Arrivals */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="mono-label text-[10px] text-muted-foreground">Arrivals today</h2>
          <span className="mono-label text-[10px] text-primary-muted">{arrivals.length} checking in</span>
        </div>
        <div className="grid gap-2 lg:grid-cols-2">
          {arrivals.length === 0 && <Empty>No check-ins today. A quiet one.</Empty>}
          {arrivals.map((b) => (
            <ArrivalRow key={b.id} booking={b} kind="in" />
          ))}
        </div>
      </section>

      {/* Departures */}
      {departures.length > 0 && (
        <section>
          <h2 className="mono-label mb-2 text-[10px] text-muted-foreground">Checking out</h2>
          <div className="grid gap-2 lg:grid-cols-2">
            {departures.map((b) => (
              <ArrivalRow key={b.id} booking={b} kind="out" />
            ))}
          </div>
        </section>
      )}

      {/* Direct bookings & owner stays — cancellable */}
      {directBookings.length > 0 && (
        <section>
          <h2 className="mono-label mb-2 text-[10px] text-muted-foreground">Direct bookings & owner stays</h2>
          <div className="grid gap-2 lg:grid-cols-2">
            {directBookings.map((b) => (
              <DirectBookingRow
                key={b.id}
                booking={b}
                busy={isPending}
                onCancel={() => startTransition(() => cancelDirectBooking(b.id))}
              />
            ))}
          </div>
        </section>
      )}

      {/* Quick actions */}
      <section className="grid grid-cols-2 gap-2 pb-2 lg:max-w-2xl lg:grid-cols-3">
        <button
          onClick={() => setDirectOpen(true)}
          className="col-span-2 flex items-center justify-center gap-2 rounded-lg border border-primary bg-primary-dim py-3.5 text-sm font-medium text-primary transition-colors hover:opacity-90 lg:col-span-1"
        >
          <Plus size={16} />
          New direct booking
        </button>
        <button
          onClick={() => setBlockOpen(true)}
          className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 py-3.5 text-sm font-medium transition-colors hover:border-primary"
        >
          <CalendarPlus size={16} className="text-primary" />
          Block dates
        </button>
        <button
          onClick={() => onNavigate('calendar')}
          className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 py-3.5 text-sm font-medium transition-colors hover:border-primary"
        >
          <MoveRight size={16} className="text-primary" />
          Open calendar
        </button>
      </section>

      {viewOpen && (
        <ViewingPicker
          data={data}
          locked={locked}
          current={viewing}
          onPick={(v) => {
            setViewing(v)
            setViewOpen(false)
          }}
          onClose={() => setViewOpen(false)}
        />
      )}
      {blockOpen && <BlockModal data={data} units={activeProperties} onClose={() => setBlockOpen(false)} />}
      {directOpen && (
        <DirectBookingModal
          data={data}
          units={activeProperties}
          defaultUnit={viewing === ALL ? undefined : viewing}
          onClose={() => setDirectOpen(false)}
        />
      )}
    </div>
  )
}

function ownerFor(unit: string, properties: Property[]): string {
  return properties.find((p) => p.name === unit)?.ownerName || 'Unassigned'
}

function EmptyOnboarding({ onNavigate }: { onNavigate: (t: string) => void }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 pt-8 lg:px-8 lg:pt-12">
      <div className="flex flex-col items-center text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-dim text-primary">
          <House size={26} />
        </span>
        <span className="mono-label mt-5 text-[10px] text-primary-muted">Welcome to StayKnit</span>
        <h1 className="mt-2 text-balance font-sans text-2xl font-extrabold tracking-tight lg:text-3xl">
          Let&apos;s set up your first property
        </h1>
        <p className="mt-3 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
          Your workspace is empty and ready. Add a property to start syncing calendars, tracking bookings, and keeping
          owners in the loop.
        </p>
        <button
          onClick={() => onNavigate('owners')}
          className="mt-6 flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus size={16} /> Add your first property
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <p className="mono-label px-1 text-[9px] text-muted-foreground">What happens next</p>
        <StepRow
          icon={<House size={16} />}
          title="Add a property"
          body="Name your unit and its owner so bookings and statements land in the right place."
          onClick={() => onNavigate('owners')}
          active
        />
        <StepRow
          icon={<Radio size={16} />}
          title="Connect your channels"
          body="Paste iCal links from Airbnb, Booking.com and Vrbo to sync availability automatically."
          onClick={() => onNavigate('channels')}
        />
        <StepRow
          icon={<Users size={16} />}
          title="Invite your owners"
          body="Give owners their own read-only view of stays, income and statements."
          onClick={() => onNavigate('owners')}
        />
      </div>
    </div>
  )
}

function StepRow({
  icon,
  title,
  body,
  onClick,
  active,
}: {
  icon: React.ReactNode
  title: string
  body: string
  onClick: () => void
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-lg border px-4 py-3.5 text-left transition-colors ${
        active ? 'border-primary bg-primary-dim' : 'border-border bg-surface-2 hover:border-border-strong'
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
          active ? 'bg-primary text-primary-foreground' : 'bg-primary-dim text-primary'
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-[12px] leading-relaxed text-muted-foreground">{body}</span>
      </span>
      <ArrowRight size={16} className="shrink-0 text-muted-foreground" />
    </button>
  )
}

function DirectBookingRow({ booking, busy, onCancel }: { booking: Booking; busy: boolean; onCancel: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const tint = channelTint(booking.channel)
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-4 py-2.5">
      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: tint }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{booking.guest}</p>
        <p className="mono-label truncate text-[9px] text-muted-foreground">
          {booking.propertyName} · {dateRange(booking.checkIn, booking.checkOut)}
        </p>
      </div>
      {confirming ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={onCancel}
            disabled={busy}
            className="mono-label rounded border border-danger px-2 py-1 text-[8px] text-danger hover:bg-danger/10 disabled:opacity-60"
          >
            Confirm
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="mono-label rounded border border-border px-2 py-1 text-[8px] text-muted-foreground hover:border-primary hover:text-primary"
          >
            Keep
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          aria-label="Cancel booking"
          className="mono-label flex shrink-0 items-center gap-1 rounded border border-border px-2 py-1 text-[8px] text-muted-foreground hover:border-danger hover:text-danger"
        >
          <Trash2 size={11} /> Cancel
        </button>
      )}
    </div>
  )
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-3">
      <p className={`font-sans text-xl font-extrabold ${accent ? 'text-primary' : 'text-foreground'}`}>{value}</p>
      <p className="mono-label mt-1 text-[8px] leading-tight text-muted-foreground">{label}</p>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">{children}</p>
}

function ClashCard({ a, b }: { a: Booking; b: Booking }) {
  return (
    <div className="animate-slidein overflow-hidden rounded-xl border border-danger bg-danger/10">
      <div className="flex items-center gap-1.5 px-4 pt-3">
        <AlertTriangle size={13} className="text-danger" />
        <span className="mono-label text-[10px] text-danger">Overlapping dates · {a.propertyName}</span>
      </div>
      <div className="grid grid-cols-1 gap-px px-4 pb-3 pt-2 sm:grid-cols-2">
        {[a, b].map((x) => (
          <div key={x.id}>
            <p className="text-sm font-semibold">{x.guest}</p>
            <p className="mono-label mt-0.5 text-[10px]" style={{ color: channelTint(x.channel) }}>
              {x.channel} · {dateRange(x.checkIn, x.checkOut)}
            </p>
          </div>
        ))}
      </div>
      <p className="border-t border-danger/30 px-4 py-2.5 text-[12px] leading-relaxed text-danger/90">
        Two stays share the same nights. Cancel one on its channel, then re-sync so the dates block everywhere.
      </p>
    </div>
  )
}

function PendingCard({
  booking,
  clashes,
  busy,
  onAck,
}: {
  booking: Booking
  clashes: Booking[]
  busy: boolean
  onAck: () => void
}) {
  const money = useMoney()
  const tint = channelTint(booking.channel)
  const [confirming, setConfirming] = useState(false)
  const hasClash = clashes.length > 0
  const login = channelLogin(booking.channel)
  const channelShort = booking.channel.split('.')[0].split(' ')[0]

  function handleAccept() {
    if (hasClash && !confirming) {
      setConfirming(true)
      return
    }
    // Hold the dates locally, then hand off to the channel to complete the real
    // accept: the native host app on mobile, or the website on desktop.
    // iCal can't confirm on the channel for us.
    if (login) openChannelLogin(login)
    onAck()
  }

  return (
    <div className={`animate-slidein overflow-hidden rounded-xl border ${hasClash ? 'border-danger' : 'border-primary'} bg-primary-dim`}>
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="mono-label text-[10px]" style={{ color: tint }}>
          Request to book · {booking.channel}
        </span>
        <span className="mono-label text-[10px] text-primary-muted">Held</span>
      </div>
      <div className="px-4 pb-3 pt-1">
        <p className="font-sans text-xl font-bold leading-tight">
          {booking.guest} · {booking.propertyName}
        </p>
        <p className="mono-label mt-1 text-[11px] text-primary-muted">
          {dateRange(booking.checkIn, booking.checkOut)} · {booking.nights} nights · {money(booking.amount)}
        </p>
      </div>

      {hasClash ? (
        <div className="mx-3 mb-1 rounded-lg border border-danger bg-danger/10 px-3 py-2.5">
          <p className="mono-label flex items-center gap-1.5 text-[10px] text-danger">
            <AlertTriangle size={12} /> Overlaps an existing stay
          </p>
          {clashes.map((c) => (
            <p key={c.id} className="mt-1 text-[12px] text-danger/90">
              {c.guest} · {c.channel} · {dateRange(c.checkIn, c.checkOut)}
            </p>
          ))}
        </div>
      ) : null}

      {/* How accepting works — set expectations before the host taps Accept. */}
      <div className="mx-3 mb-1 mt-1 flex gap-2 rounded-lg border border-border-strong bg-surface-2 px-3 py-2.5">
        <Info size={13} className="mt-0.5 shrink-0 text-primary" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          StayKnit holds these dates so no other site can take them. Tapping{' '}
          <span className="text-foreground">Accept</span> opens the {channelShort} app on your phone (or the website on
          desktop) to sign in and confirm the guest — the booking is only final once you accept on {channelShort}.
        </p>
      </div>

      <div className="p-3 pt-2">
        <button
          onClick={handleAccept}
          disabled={busy}
          className="mono-label flex w-full items-center justify-center gap-1.5 rounded-lg py-3 text-[11px] text-primary-foreground disabled:opacity-60"
          style={{ background: hasClash ? 'var(--danger)' : 'var(--primary)' }}
        >
          {confirming ? (
            <>
              <AlertTriangle size={14} /> Accept anyway on {channelShort}
            </>
          ) : (
            <>
              <Check size={14} /> Accept on {channelShort} <ArrowUpRight size={14} />
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function ArrivalRow({ booking, kind }: { booking: Booking; kind: 'in' | 'out' }) {
  const tint = channelTint(booking.channel)
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-4 py-3">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
        style={{ background: `${tint}22`, color: tint }}
      >
        {kind === 'in' ? <MoveRight size={16} /> : <LogOut size={16} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{booking.guest}</p>
        <p className="mono-label truncate text-[10px] text-muted-foreground">
          {booking.propertyName} · {booking.nights} nights
        </p>
      </div>
      <span className="mono-label shrink-0 text-[10px]" style={{ color: tint }}>
        {booking.channel}
      </span>
    </div>
  )
}

function ViewingPicker({
  data,
  locked,
  current,
  onPick,
  onClose,
}: {
  data: StayKnitData
  locked: Set<string>
  current: string
  onPick: (v: string) => void
  onClose: () => void
}) {
  const hasLocked = locked.size > 0
  return (
    <Modal title="Change view" onClose={onClose}>
      <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
        Focus Today on a single unit and its owner, or see the whole portfolio.
      </p>
      <div className="flex flex-col gap-2">
        <PickRow label={ALL} sub="Whole portfolio" active={current === ALL} onClick={() => onPick(ALL)} />
        {data.properties.map((p) =>
          locked.has(p.name) ? (
            <LockedRow key={p.id} label={p.name} sub={p.ownerName || 'Unassigned'} />
          ) : (
            <PickRow
              key={p.id}
              label={p.name}
              sub={p.ownerName || 'Unassigned'}
              active={current === p.name}
              onClick={() => onPick(p.name)}
            />
          ),
        )}
      </div>
      {hasLocked && (
        <p className="mono-label mt-4 rounded-lg border border-primary/40 bg-primary-dim px-3 py-2.5 text-[10px] leading-relaxed text-primary">
          Your free trial covers one listing. Upgrade on the Plan tab to unlock the rest.
        </p>
      )}
    </Modal>
  )
}

function PickRow({ label, sub, active, onClick }: { label: string; sub: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${
        active ? 'border-primary bg-primary-dim' : 'border-border bg-surface-2 hover:border-border-strong'
      }`}
    >
      <span>
        <span className={`block text-sm font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>{label}</span>
        <span className="mono-label block text-[9px] text-muted-foreground">{sub}</span>
      </span>
      {active && <Check size={16} className="text-primary" />}
    </button>
  )
}

function LockedRow({ label, sub }: { label: string; sub: string }) {
  return (
    <div
      aria-disabled
      className="flex items-center justify-between rounded-lg border border-dashed border-border bg-surface-2/50 px-4 py-3 opacity-60"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-muted-foreground">{label}</span>
        <span className="mono-label block text-[9px] text-muted-foreground">{sub}</span>
      </span>
      <span className="mono-label flex shrink-0 items-center gap-1 text-[9px] text-muted-foreground">
        <Lock size={12} /> Locked
      </span>
    </div>
  )
}

function DirectBookingModal({
  data,
  units,
  defaultUnit,
  onClose,
}: {
  data: StayKnitData
  units: Property[]
  defaultUnit?: string
  onClose: () => void
}) {
  const symbol = useCurrencySymbol()
  const [, startTransition] = useTransition()
  const [propertyName, setPropertyName] = useState(defaultUnit ?? units[0]?.name ?? '')
  const [guest, setGuest] = useState('')
  const [checkIn, setCheckIn] = useState(() => todayIso())
  const [checkOut, setCheckOut] = useState(() => addDaysIso(todayIso(), 1))
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clashes = findClashesFor(propertyName, checkIn, checkOut, data.bookings)
  const hasClash = clashes.length > 0 && checkOut > checkIn

  function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    startTransition(async () => {
      const res = await addDirectBooking({ propertyName, guest, checkIn, checkOut, amount: Number(amount) })
      if (!res.ok) {
        setError(res.error)
        setSaving(false)
        return
      }
      onClose()
    })
  }

  return (
    <Modal title="New direct booking" onClose={onClose}>
      <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
        A booking StayKnit owns. Confirming it blocks these dates on every linked channel over iCal, so no site can
        double-book the unit.
      </p>
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="Unit">
          <select value={propertyName} onChange={(e) => setPropertyName(e.target.value)} className={inputClass}>
            {units.map((p) => (
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
          {saving ? 'Blocking across channels…' : hasClash ? 'Book anyway & block channels' : 'Confirm & block all channels'}
        </button>
      </form>
    </Modal>
  )
}

function BlockModal({ data, units, onClose }: { data: StayKnitData; units: Property[]; onClose: () => void }) {
  const [, startTransition] = useTransition()
  const [propertyName, setPropertyName] = useState(units[0]?.name ?? '')
  const [checkIn, setCheckIn] = useState(() => todayIso())
  const [checkOut, setCheckOut] = useState(() => addDaysIso(todayIso(), 1))
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    startTransition(async () => {
      const res = await addBlock({ propertyName, checkIn, checkOut, reason })
      if (!res.ok) {
        setError(res.error)
        setSaving(false)
        return
      }
      onClose()
    })
  }

  return (
    <Modal title="Block dates" onClose={onClose}>
      <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
        Blocking dates pushes an unavailability to every linked channel over iCal, so the unit stops taking bookings for
        that window.
      </p>
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="Unit">
          <select value={propertyName} onChange={(e) => setPropertyName(e.target.value)} className={inputClass}>
            {units.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className={inputClass} />
          </Field>
          <Field label="To">
            <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field label="Reason (optional)">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Owner stay, maintenance…"
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
          className="mono-label mt-1 rounded-lg bg-primary py-3.5 text-[11px] text-primary-foreground disabled:opacity-60"
        >
          {saving ? 'Pushing to channels…' : 'Block across all channels'}
        </button>
      </form>
    </Modal>
  )
}
