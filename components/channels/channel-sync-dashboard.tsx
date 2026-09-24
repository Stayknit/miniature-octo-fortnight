'use client'

import {
  addChannelConnection,
  getReservationChanges,
  removeChannelConnection,
  setChannelEnabled,
  syncChannelsNow,
  type ChannelSyncData,
  type ConnectionView,
  type ReservationView,
} from '@/app/actions/channels-sync'
import type { ChannelId, SyncOutcome } from '@/lib/channels/types'
import { formatMoney } from '@/lib/pricing'
import { channelTint } from '@/lib/format'
import { Modal, Field, inputClass } from '@/components/modal'
import {
  ArrowLeft,
  Ban,
  CircleAlert,
  Link2,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

function statusPill(c: ConnectionView): { label: string; tone: 'ok' | 'warn' | 'muted' | 'danger' } {
  if (c.status === 'disabled') return { label: 'Disabled', tone: 'muted' }
  if (c.status === 'awaiting_credentials') return { label: 'Awaiting API access', tone: 'warn' }
  if (c.lastStatus === 'error') return { label: 'Error', tone: 'danger' }
  if (c.lastStatus === 'ok') return { label: 'Live', tone: 'ok' }
  if (c.lastStatus === 'skipped') return { label: 'Skipped', tone: 'warn' }
  return { label: 'Ready', tone: 'ok' }
}

const toneClass: Record<'ok' | 'warn' | 'muted' | 'danger', string> = {
  ok: 'border-primary/50 bg-primary/10 text-primary',
  warn: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  muted: 'border-border bg-surface-2 text-muted-foreground',
  danger: 'border-danger/50 bg-danger/10 text-danger',
}

function dateRange(a: string, b: string): string {
  const fmt = (iso: string) =>
    new Date(iso + 'T00:00:00Z').toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
  return `${fmt(a)} → ${fmt(b)}`
}

function money(cents: number): string {
  return formatMoney(cents, 'zar')
}

export function ChannelSyncDashboard({ data }: { data: ChannelSyncData }) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [showAdd, setShowAdd] = useState(false)
  const [detail, setDetail] = useState<ReservationView | null>(null)
  const [outcomes, setOutcomes] = useState<SyncOutcome[] | null>(null)
  const [ranAt, setRanAt] = useState<string | null>(null)

  const grouped = useMemo(() => {
    const byProperty = new Map<string, ConnectionView[]>()
    for (const c of data.connections) {
      const list = byProperty.get(c.propertyName) ?? []
      list.push(c)
      byProperty.set(c.propertyName, list)
    }
    return [...byProperty.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [data.connections])

  function runSync() {
    startTransition(async () => {
      const res = await syncChannelsNow()
      setOutcomes(res.outcomes)
      setRanAt(res.ranAt)
      router.refresh()
    })
  }

  const syncedReservations = data.reservations.length
  const priced = data.reservations.filter((r) => r.financial).length

  return (
    <div className="min-h-dvh bg-background pb-24 text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-5 py-4">
          <Link
            href="/"
            aria-label="Back to app"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-sans text-lg font-extrabold">Channel sync</h1>
            <p className="mono-label text-[10px] text-muted-foreground">
              {data.connections.length} {data.connections.length === 1 ? 'connection' : 'connections'} ·{' '}
              {syncedReservations} {syncedReservations === 1 ? 'reservation' : 'reservations'}
            </p>
          </div>
          <button
            onClick={runSync}
            disabled={busy || data.connections.length === 0}
            className="mono-label flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[11px] text-primary-foreground transition-opacity disabled:opacity-50"
          >
            <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
            {busy ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 pt-5">
        {/* How this layer behaves — set expectations honestly up front. */}
        <section className="rounded-xl border border-border-strong bg-primary-dim px-4 py-3.5">
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="shrink-0 text-primary" />
            <span className="mono-label text-[9px] text-primary">How channel sync works</span>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-primary-muted">
            iCal feeds sync availability today — dates and status only. They never carry a price, so imported
            reservations show no payout until a real channel API is connected. Booking.com and Airbnb stay{' '}
            <span className="font-semibold">awaiting API access</span> until partner credentials exist; the sync
            skips them honestly rather than faking a connection.
          </p>
        </section>

        {outcomes && <SyncReport outcomes={outcomes} ranAt={ranAt} onDismiss={() => setOutcomes(null)} />}

        {/* Connections */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-sans text-base font-bold">Connections</h2>
            <button
              onClick={() => setShowAdd(true)}
              disabled={data.properties.length === 0}
              className="mono-label flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[10px] text-primary transition-colors hover:border-primary disabled:opacity-50"
            >
              <Plus size={13} /> Connect
            </button>
          </div>

          {data.connections.length === 0 ? (
            <EmptyState
              icon={<Link2 size={18} className="text-muted-foreground" />}
              title="No channels connected"
              body={
                data.properties.length === 0
                  ? 'Add a unit in the main app first, then connect its listing-site calendars here.'
                  : 'Connect a unit’s iCal feed to start importing its reservations.'
              }
            />
          ) : (
            grouped.map(([propertyName, conns]) => (
              <div key={propertyName} className="rounded-xl border border-border bg-surface-2 p-3">
                <p className="mono-label mb-2 text-[9px] text-muted-foreground">{propertyName}</p>
                <div className="flex flex-col gap-2">
                  {conns.map((c) => (
                    <ConnectionRow key={c.id} conn={c} busy={busy} />
                  ))}
                </div>
              </div>
            ))
          )}
        </section>

        {/* Reservations */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-sans text-base font-bold">Reservations</h2>
            <span className="mono-label text-[9px] text-muted-foreground">
              {priced}/{syncedReservations} priced
            </span>
          </div>

          {data.reservations.length === 0 ? (
            <EmptyState
              icon={<RefreshCw size={18} className="text-muted-foreground" />}
              title="Nothing imported yet"
              body="Run a sync to pull reservations from your connected iCal feeds."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {data.reservations.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setDetail(r)}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3.5 py-3 text-left transition-colors hover:border-primary"
                >
                  <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: channelTint(r.channelLabel) }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">
                        {r.status === 'block' ? 'Blocked dates' : r.guestName || 'Reserved'}
                      </span>
                      {r.status === 'cancelled' && (
                        <span className="mono-label rounded bg-danger/10 px-1.5 py-0.5 text-[8px] text-danger">
                          Cancelled
                        </span>
                      )}
                    </div>
                    <span className="mono-label block truncate text-[9px] text-muted-foreground">
                      {r.channelLabel} · {r.propertyName} · {dateRange(r.checkIn, r.checkOut)}
                    </span>
                  </div>
                  <span className="shrink-0 text-right">
                    {r.financial ? (
                      <span className="text-[13px] font-semibold tabular-nums">{money(r.financial.netPayout)}</span>
                    ) : (
                      <span className="mono-label flex items-center gap-1 text-[9px] text-muted-foreground">
                        <Lock size={10} /> No price
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Audit trail — the "we refused to fake it" evidence. */}
        {data.audit.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="font-sans text-base font-bold">Recent activity</h2>
            <div className="flex flex-col gap-1.5">
              {data.audit.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2"
                >
                  <span className="mono-label shrink-0 text-[8px] text-muted-foreground">{a.channel}</span>
                  <span className="mono-label flex-1 truncate text-[9px] text-foreground">
                    {a.action.replace(/_/g, ' ')}
                  </span>
                  <span className="mono-label shrink-0 text-[8px] text-muted-foreground">
                    {new Date(a.createdAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {showAdd && (
        <AddConnectionModal
          properties={data.properties}
          catalog={data.catalog}
          onClose={() => setShowAdd(false)}
        />
      )}
      {detail && <ReservationDetailModal reservation={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

function ConnectionRow({ conn, busy }: { conn: ConnectionView; busy: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const pill = statusPill(conn)
  const disabled = busy || pending

  function toggle() {
    startTransition(async () => {
      await setChannelEnabled(conn.id, conn.status === 'disabled')
      router.refresh()
    })
  }
  function remove() {
    startTransition(async () => {
      await removeChannelConnection(conn.id)
      router.refresh()
    })
  }

  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <span className="h-7 w-1 shrink-0 rounded-full" style={{ background: channelTint(conn.channelLabel) }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{conn.channelLabel}</span>
            <span className={`mono-label shrink-0 rounded border px-1.5 py-0.5 text-[8px] ${toneClass[pill.tone]}`}>
              {pill.label}
            </span>
          </div>
          <span className="mono-label block text-[9px] text-muted-foreground">
            {conn.reservationCount} {conn.reservationCount === 1 ? 'stay' : 'stays'}
            {conn.lastSyncedAt
              ? ` · synced ${new Date(conn.lastSyncedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}`
              : ' · never synced'}
            {conn.financialsCapable ? ' · carries price' : ' · dates only'}
          </span>
        </div>
        {conn.channel === 'ICAL' && (
          <button
            onClick={toggle}
            disabled={disabled}
            aria-label={conn.status === 'disabled' ? 'Enable connection' : 'Disable connection'}
            className="mono-label shrink-0 rounded border border-border px-2 py-1.5 text-[9px] text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          >
            {conn.status === 'disabled' ? 'Enable' : 'Pause'}
          </button>
        )}
        {confirmDelete ? (
          <button
            onClick={remove}
            disabled={disabled}
            className="mono-label shrink-0 rounded border border-danger px-2 py-1.5 text-[9px] text-danger disabled:opacity-50"
          >
            Confirm
          </button>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            aria-label="Remove connection"
            className="shrink-0 rounded border border-border p-1.5 text-muted-foreground transition-colors hover:border-danger hover:text-danger"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
      {conn.lastError && conn.lastStatus === 'error' && (
        <p className="mono-label mt-1.5 flex items-center gap-1 text-[9px] text-danger">
          <CircleAlert size={10} /> {conn.lastError}
        </p>
      )}
    </div>
  )
}

function AddConnectionModal({
  properties,
  catalog,
  onClose,
}: {
  properties: { id: number; name: string }[]
  catalog: ChannelSyncData['catalog']
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? 0)
  const [channel, setChannel] = useState<ChannelId>('ICAL')
  const [icalUrl, setIcalUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  const meta = catalog.find((c) => c.id === channel)
  const isIcal = channel === 'ICAL'

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await addChannelConnection({
        propertyId,
        channel,
        icalUrl: isIcal ? icalUrl : undefined,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
      onClose()
    })
  }

  return (
    <Modal title="Connect a channel" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Unit">
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(Number(e.target.value))}
            className={inputClass}
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Channel">
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as ChannelId)}
            className={inputClass}
          >
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
                {c.financials ? '' : ' (dates only)'}
              </option>
            ))}
          </select>
        </Field>

        {isIcal ? (
          <Field label="iCal feed URL">
            <input
              value={icalUrl}
              onChange={(e) => setIcalUrl(e.target.value)}
              placeholder="https://…/calendar.ics"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              className={inputClass}
            />
          </Field>
        ) : (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-3">
            <p className="mono-label flex items-center gap-1.5 text-[9px] text-amber-600 dark:text-amber-400">
              <Lock size={11} /> Awaiting API access
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
              {meta?.displayName} needs certified partner credentials before it can sync. This connection is saved
              and stays skipped — never faked — until those credentials are in place.
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-danger bg-danger/10 px-3 py-2.5 text-[12px] text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mono-label mt-1 rounded-lg bg-primary py-3.5 text-[11px] text-primary-foreground disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save connection'}
        </button>
      </form>
    </Modal>
  )
}

function ReservationDetailModal({
  reservation,
  onClose,
}: {
  reservation: ReservationView
  onClose: () => void
}) {
  const [changes, setChanges] = useState<
    { field: string; oldValue: string | null; newValue: string | null; changedAt: string }[] | null
  >(null)
  const [loading, startTransition] = useTransition()

  function loadChanges() {
    if (changes) return
    startTransition(async () => {
      const rows = await getReservationChanges(reservation.channel, reservation.externalBookingId)
      setChanges(rows)
    })
  }

  const f = reservation.financial

  return (
    <Modal title={reservation.status === 'block' ? 'Blocked dates' : reservation.guestName || 'Reservation'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          <Info label="Channel" value={reservation.channelLabel} />
          <Info label="Unit" value={reservation.propertyName} />
          <Info label="Check-in" value={reservation.checkIn} />
          <Info label="Check-out" value={reservation.checkOut} />
          <Info label="Status" value={reservation.status} />
          <Info label="Booking ref" value={reservation.externalBookingId} mono />
        </div>

        <div className="rounded-lg border border-border bg-surface-2 p-3.5">
          <p className="mono-label mb-2 text-[9px] text-muted-foreground">Financials</p>
          {f ? (
            <div className="flex flex-col gap-1.5 text-[13px]">
              <Row label="Gross" value={money(f.grossAmount)} />
              <Row label="Channel commission" value={`− ${money(f.channelCommission)}`} />
              <Row label="Cleaning fee" value={money(f.cleaningFee)} />
              <Row label="Tax / VAT" value={money(f.taxAmount)} />
              <div className="my-1 h-px bg-border" />
              <Row label="Net payout" value={money(f.netPayout)} strong />
              <p className="mono-label mt-1 text-[8px] text-muted-foreground">
                source: {f.source.replace(/_/g, ' ')}
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <Lock size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                No price. This reservation came in over an availability feed, which never includes the amount a guest
                paid. A payout will appear here once {reservation.channelLabel} is synced through a real channel API.
              </p>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface-2 p-3.5">
          <div className="flex items-center justify-between">
            <p className="mono-label text-[9px] text-muted-foreground">Change history</p>
            {!changes && (
              <button
                onClick={loadChanges}
                disabled={loading}
                className="mono-label rounded border border-border px-2 py-1 text-[9px] text-primary transition-colors hover:border-primary disabled:opacity-50"
              >
                {loading ? 'Loading…' : 'Show'}
              </button>
            )}
          </div>
          {changes && changes.length === 0 && (
            <p className="mt-2 text-[12px] text-muted-foreground">No changes recorded since first import.</p>
          )}
          {changes && changes.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5">
              {changes.map((c, i) => (
                <div key={i} className="text-[11px]">
                  <span className="mono-label text-[9px] text-muted-foreground">
                    {c.field} · {new Date(c.changedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                  </span>
                  <p className="text-foreground">
                    <span className="text-muted-foreground line-through">{c.oldValue ?? '—'}</span> → {c.newValue ?? '—'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
      <span className="mono-label block text-[8px] text-muted-foreground">{label}</span>
      <span className={`block truncate text-[13px] ${mono ? 'mono-label text-[10px]' : 'font-medium'}`}>{value}</span>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? 'font-semibold' : 'text-muted-foreground'}>{label}</span>
      <span className={`tabular-nums ${strong ? 'font-bold' : ''}`}>{value}</span>
    </div>
  )
}

function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface-2/40 px-5 py-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface">{icon}</div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-xs text-[12px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  )
}

function SyncReport({
  outcomes,
  ranAt,
  onDismiss,
}: {
  outcomes: SyncOutcome[]
  ranAt: string | null
  onDismiss: () => void
}) {
  const ok = outcomes.filter((o) => !o.skipped && !o.error)
  const skipped = outcomes.filter((o) => o.skipped)
  const errored = outcomes.filter((o) => o.error)
  const upserted = ok.reduce((n, o) => n + o.reservationsUpserted, 0)
  const changed = ok.reduce((n, o) => n + o.reservationsChanged, 0)

  return (
    <section className="rounded-xl border border-border bg-surface-2 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-sans text-sm font-bold">Last sync</h2>
        <button
          onClick={onDismiss}
          className="mono-label rounded border border-border px-2 py-1 text-[9px] text-muted-foreground hover:border-primary hover:text-primary"
        >
          Dismiss
        </button>
      </div>
      {ranAt && (
        <p className="mono-label mt-0.5 text-[9px] text-muted-foreground">
          {new Date(ranAt).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="Imported" value={upserted} tone="ok" />
        <Stat label="Updated" value={changed} tone="ok" />
        <Stat label="Skipped" value={skipped.length} tone="warn" />
      </div>
      {errored.length > 0 && (
        <p className="mono-label mt-2 flex items-center gap-1 text-[9px] text-danger">
          <CircleAlert size={10} /> {errored.length} {errored.length === 1 ? 'error' : 'errors'} — see recent activity
        </p>
      )}
      {skipped.length > 0 && errored.length === 0 && (
        <p className="mono-label mt-2 flex items-center gap-1 text-[9px] text-muted-foreground">
          <Ban size={10} /> {skipped.length} channel{skipped.length === 1 ? '' : 's'} awaiting API access — skipped, not
          faked
        </p>
      )}
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'warn' }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-2 py-2.5">
      <p className={`text-lg font-extrabold tabular-nums ${tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-primary'}`}>
        {value}
      </p>
      <p className="mono-label text-[8px] text-muted-foreground">{label}</p>
    </div>
  )
}
