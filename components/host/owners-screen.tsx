'use client'

import {
  addOwner,
  addProperty,
  createOwnerLogin,
  deleteOwner,
  emailStatementToHost,
  sendOwnerPasswordReset,
  saveStatementConfig,
  setBookingPaid,
  toggleOwnerAccess,
  updateOwner,
} from '@/app/actions/stayknit'
import { CostingCard } from '@/components/host/costing-card'
import { Field, Modal, inputClass } from '@/components/modal'
import { useMoney, useCurrency } from '@/components/currency-context'
import { currencySymbol } from '@/lib/currency'
import { dateRange } from '@/lib/format'
import {
  buildHost,
  downloadStatement,
  paidSplit,
  STATEMENT_FORMATS,
  type StatementFormat,
  type StatementHost,
  type StatementOwner,
  type StatementProperty,
} from '@/lib/statement'
import { computeStatement, costLineToInput, totalCost, type PropertySlice, type VatConfig } from '@/lib/costing'
import { lockedUnitNames } from '@/lib/plans'
import type { Booking, CostLine, OwnerClient, StayKnitData } from '@/lib/types'
import { Check, CheckSquare, Copy, Download, Home, KeyRound, Lock, Mail, Pencil, Plus, Square, Trash2, UserPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

export function OwnersScreen({ data, user }: { data: StayKnitData; user: { name: string; email: string } }) {
  const money = useMoney()
  const currency = useCurrency()
  const router = useRouter()
  const [selected, setSelected] = useState<OwnerClient | null>(null)
  const [addOwnerOpen, setAddOwnerOpen] = useState(false)
  const [addPropertyOpen, setAddPropertyOpen] = useState(false)
  const [, startVat] = useTransition()

  const host = useMemo(
    () =>
      buildHost({
        hostName: user.name,
        hostEmail: user.email,
        businessName: data.settings.businessName,
        businessEmail: data.settings.businessEmail,
        businessPhone: data.settings.businessPhone,
      }),
    [user.name, user.email, data.settings.businessName, data.settings.businessEmail, data.settings.businessPhone],
  )

  const vat = useMemo<VatConfig>(
    () => ({ enabled: data.settings.vatEnabled, rate: data.settings.vatRate }),
    [data.settings.vatEnabled, data.settings.vatRate],
  )

  // Live payout figures for every owner, computed from their real bookings and
  // the host's cost lines (same builder the statement sheet uses). Owners with
  // no bookings fall back to their stored aggregate inside scopeOwner, so the
  // card never regresses to blank. This replaces the stale stored net/nights
  // columns the card used to read directly.
  const liveByOwner = useMemo(() => {
    const map = new Map<number, StatementOwner>()
    for (const o of data.owners) {
      map.set(o.id, scopeOwner(o, data.bookings, null, data.costLines, host, currency, vat))
    }
    return map
  }, [data.owners, data.bookings, data.costLines, host, currency, vat])

  const unitCount = data.owners.reduce((a, o) => a + o.units.length, 0)
  const totalPayout = data.owners.reduce((a, o) => a + (liveByOwner.get(o.id)?.net ?? o.net), 0)
  // Listings past the trial cap are locked until the host upgrades.
  const lockedUnits = new Set(lockedUnitNames(data.subscription, data.properties))

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-5 pt-4 lg:px-8 lg:pt-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-sans text-2xl font-extrabold">Owners</h1>
          <p className="mono-label mt-1 text-[10px] text-muted-foreground">
            {data.owners.length} clients · {unitCount} units
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setAddPropertyOpen(true)}
            className="mono-label flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[10px] text-primary transition-colors hover:border-primary"
          >
            <Home size={14} /> Property
          </button>
          <button
            onClick={() => setAddOwnerOpen(true)}
            className="mono-label flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[10px] text-primary transition-colors hover:border-primary"
          >
            <Plus size={14} /> Client
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface-2 px-4 py-3.5">
        <p className="mono-label text-[9px] text-muted-foreground">Owner payouts this month</p>
        <p className="mt-1 font-sans text-2xl font-extrabold text-primary">{money(totalPayout)}</p>
        <p className="mono-label mt-1 text-[9px] text-muted-foreground">Statements send on the 1st</p>
      </div>

      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <CostingCard
          costLines={data.costLines}
          properties={data.properties.map((p) => p.name)}
          commission={data.settings.commission}
          vatEnabled={data.settings.vatEnabled}
          vatRate={data.settings.vatRate}
          onConfigChange={(patch) =>
            startVat(async () => {
              await saveStatementConfig(patch)
              // Re-read `data` so VAT changes flow into every statement immediately.
              router.refresh()
            })
          }
        />
      </div>

      <div className="grid gap-2.5 lg:grid-cols-2">
        {data.owners.map((o) => {
          const live = liveByOwner.get(o.id)
          const net = live?.net ?? o.net
          const nights = live?.nights ?? o.nights
          return (
          <button
            key={o.id}
            onClick={() => setSelected(o)}
            className="rounded-xl border border-border bg-surface-2 p-4 text-left transition-colors hover:border-border-strong"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold">{o.name}</p>
                <p className="mono-label mt-0.5 truncate text-[9px] text-muted-foreground">
                  {o.units.join(' · ').toUpperCase()}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[15px] font-bold text-primary">{money(net)}</p>
                <p className="mono-label mt-0.5 text-[9px] text-muted-foreground">{nights} nights</p>
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {!o.hasAccess && (
                <span className="mono-label inline-block rounded border border-border px-2 py-0.5 text-[8px] text-muted-foreground">
                  Portal invite pending
                </span>
              )}
              {o.units.some((u) => lockedUnits.has(u)) && (
                <span className="mono-label inline-flex items-center gap-1 rounded border border-primary/40 bg-primary-dim px-2 py-0.5 text-[8px] text-primary">
                  <Lock size={9} /> Listing locked · upgrade
                </span>
              )}
            </div>
          </button>
          )
        })}
      </div>

      {selected && (
        <OwnerSheet
          owner={data.owners.find((o) => o.id === selected.id) ?? selected}
          bookings={data.bookings}
          costLines={data.costLines}
          host={host}
          vat={{ enabled: data.settings.vatEnabled, rate: data.settings.vatRate }}
          onClose={() => setSelected(null)}
        />
      )}
      {addOwnerOpen && <AddOwnerModal onClose={() => setAddOwnerOpen(false)} />}
      {addPropertyOpen && <AddPropertyModal data={data} onClose={() => setAddPropertyOpen(false)} />}
    </div>
  )
}

function OwnerSheet({
  owner,
  bookings,
  costLines,
  host,
  vat,
  onClose,
}: {
  owner: OwnerClient
  bookings: Booking[]
  costLines: CostLine[]
  host: StatementHost
  vat: VatConfig
  onClose: () => void
}) {
  const money = useMoney()
  const currency = useCurrency()
  const [, startTransition] = useTransition()
  const router = useRouter()
  const [delArm, setDelArm] = useState(false)
  const [editing, setEditing] = useState(false)
  const [format, setFormat] = useState<StatementFormat>('pdf')
  const [scopeUnit, setScopeUnit] = useState<string | null>(null)
  const [emailing, startEmail] = useTransition()
  const [emailedTo, setEmailedTo] = useState<string | null>(null)
  const [emailErr, setEmailErr] = useState<string | null>(null)

  function sendStatementToMe() {
    setEmailErr(null)
    startEmail(async () => {
      try {
        const r = await emailStatementToHost(owner.id)
        setEmailedTo(r.to)
      } catch (e) {
        setEmailErr(e instanceof Error ? e.message : 'Could not send statement')
      }
    })
  }

  const multiUnit = owner.units.length > 1
  const scoped = useMemo(
    () => scopeOwner(owner, bookings, scopeUnit, costLines, host, currency, vat),
    [owner, bookings, scopeUnit, costLines, host, currency, vat],
  )
  // Individual revenue bookings for this owner (scoped to the selected unit),
  // each with a host-controlled "payment processed" tick box.
  const bookingRows = useMemo(
    () => revenueBookings(bookings, scopeUnit ? [scopeUnit] : owner.units),
    [bookings, scopeUnit, owner.units],
  )

  if (editing) {
    return <EditOwnerModal owner={owner} onDone={() => setEditing(false)} onClose={onClose} />
  }

  return (
    <Modal title={owner.name} onClose={onClose}>
      <div className="flex items-center justify-between">
        <p className="mono-label text-[9px] text-muted-foreground">{owner.units.join(' · ').toUpperCase()}</p>
        <button
          onClick={() => setEditing(true)}
          className="mono-label flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-[10px] text-primary transition-colors hover:border-primary"
        >
          <Pencil size={12} /> Edit
        </button>
      </div>

      {multiUnit && (
        <div className="mt-4">
          <p className="mono-label mb-2 text-[9px] text-muted-foreground">View property</p>
          <div className="flex flex-wrap gap-1.5">
            <ScopeChip label="All properties" active={scopeUnit === null} onClick={() => setScopeUnit(null)} />
            {owner.units.map((u) => (
              <ScopeChip key={u} label={u} active={scopeUnit === u} onClick={() => setScopeUnit(u)} />
            ))}
          </div>
        </div>
      )}

      <div className={`overflow-hidden rounded-xl border border-border ${multiUnit ? 'mt-3' : 'mt-4'}`}>
        <Line label="Nights booked" value={`${scoped.nights}`} />
        <Line label="Gross revenue" value={money(scoped.gross)} />
        {scoped.lines.map((l) => (
          <Line key={l.label} label={l.label} value={`− ${money(l.amount)}`} muted />
        ))}
        <div className="flex items-center justify-between bg-primary-dim px-4 py-3.5">
          <span className="mono-label text-[10px] text-primary">Net payout</span>
          <span className="font-sans text-lg font-extrabold text-primary">{money(scoped.net)}</span>
        </div>
      </div>

      {/* Paid / due summary — driven by the per-booking payment ticks below */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border bg-surface-2 px-3.5 py-2.5">
          <p className="mono-label text-[8px] text-muted-foreground">Paid to date</p>
          <p className="mt-0.5 font-sans text-base font-bold">{money(scoped.paid ?? 0)}</p>
        </div>
        <div className={`rounded-lg border px-3.5 py-2.5 ${(scoped.due ?? 0) > 0 ? 'border-primary/40 bg-primary-dim' : 'border-border bg-surface-2'}`}>
          <p className={`mono-label text-[8px] ${(scoped.due ?? 0) > 0 ? 'text-primary' : 'text-muted-foreground'}`}>Due to owner</p>
          <p className={`mt-0.5 font-sans text-base font-bold ${(scoped.due ?? 0) > 0 ? 'text-primary' : 'text-foreground'}`}>{money(scoped.due ?? 0)}</p>
        </div>
      </div>

      {/* Detailed per-property breakdown when viewing all of a multi-unit owner */}
      {multiUnit && scopeUnit === null && scoped.properties && (
        <div className="mt-3">
          <p className="mono-label mb-2 text-[9px] text-muted-foreground">By property</p>
          <div className="flex flex-col gap-2">
            {scoped.properties.map((p) => (
              <div key={p.name} className="rounded-lg border border-border bg-surface-2 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-[13px] font-medium">{p.name}</span>
                  <span className="text-[13px] font-bold text-primary">{money(p.net)}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span className="mono-label text-[8px] text-muted-foreground">{p.nights} nights · {p.bookings} bkgs</span>
                  <span className="mono-label text-[8px] text-muted-foreground">Paid {money(p.paid)}</span>
                  <span className={`mono-label text-[8px] ${p.due > 0 ? 'text-primary' : 'text-muted-foreground'}`}>Due {money(p.due)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-booking payment tracking */}
      <div className="mt-4">
        <p className="mono-label mb-2 text-[9px] text-muted-foreground">Bookings — payment status</p>
        {bookingRows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-4 text-center text-[12px] text-muted-foreground">
            No bookings for this property yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {bookingRows.map((b) => (
              <BookingPayRow key={b.id} booking={b} />
            ))}
          </div>
        )}
      </div>

      {/* Statement actions */}
      <div className="mt-3 flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-1">
        {STATEMENT_FORMATS.map((f) => {
          const active = format === f.key
          return (
            <button
              key={f.key}
              onClick={() => setFormat(f.key)}
              aria-pressed={active}
              className={`mono-label flex-1 rounded-md py-2 text-[10px] transition-colors ${
                active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          )
        })}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          onClick={() => downloadStatement(scoped, format)}
          className="mono-label flex items-center justify-center gap-1.5 rounded-lg border border-border py-3 text-[10px] text-primary transition-colors hover:border-primary"
        >
          <Download size={14} /> Download {format.toUpperCase()}
        </button>
        <button
          onClick={sendStatementToMe}
          disabled={emailing}
          className="mono-label flex items-center justify-center gap-1.5 rounded-lg border border-border py-3 text-[10px] text-primary transition-colors hover:border-primary disabled:opacity-60"
        >
          {emailedTo ? <Check size={14} /> : <Mail size={14} />}{' '}
          {emailing ? 'Sending…' : emailedTo ? 'Sent to you' : 'Email to me'}
        </button>
      </div>
      <p className="mono-label mt-1.5 text-center text-[9px] text-muted-foreground">
        {emailErr ? (
          <span style={{ color: 'var(--danger)' }}>{emailErr}</span>
        ) : emailedTo ? (
          `Statement emailed to ${emailedTo}`
        ) : (
          `Emails your filed copy of ${owner.name}'s statement to you · owners view their own in the portal`
        )}
      </p>

      <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-surface-2 px-4 py-3">
        <span>
          <span className="block text-sm font-medium">Owner portal access</span>
          <span className="block text-[12px] text-muted-foreground">Read-only calendar & statements</span>
        </span>
        <button
          onClick={() =>
            startTransition(async () => {
              await toggleOwnerAccess(owner.id, !owner.hasAccess)
              router.refresh()
            })
          }
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${owner.hasAccess ? 'bg-primary' : 'bg-border'}`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition-all ${owner.hasAccess ? 'left-[18px]' : 'left-0.5'}`}
          />
        </button>
      </div>

      <OwnerLoginCard owner={owner} />

      <button
        onClick={() => {
          if (!delArm) {
            setDelArm(true)
            return
          }
          startTransition(async () => {
            await deleteOwner(owner.id)
            router.refresh()
            onClose()
          })
        }}
        className="mono-label mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border py-3 text-[10px] transition-colors"
        style={{ color: delArm ? 'var(--danger)' : 'var(--muted-foreground)', borderColor: delArm ? 'var(--danger)' : 'var(--border)' }}
      >
        <Trash2 size={13} /> {delArm ? 'Tap again to remove client' : 'Remove client'}
      </button>
    </Modal>
  )
}

// One booking row on the Owners tab with a "payment processed" tick box the
// host toggles. The flag is stored per booking and never editable by owners.
function BookingPayRow({ booking }: { booking: Booking }) {
  const money = useMoney()
  const [saving, startSaving] = useTransition()
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{booking.guest}</p>
        <p className="mono-label truncate text-[9px] text-muted-foreground">
          {booking.propertyName} · {dateRange(booking.checkIn, booking.checkOut)} · {money(booking.amount)}
        </p>
      </div>
      <button
        onClick={() => startSaving(() => setBookingPaid(booking.id, !booking.paid))}
        disabled={saving}
        aria-pressed={booking.paid}
        className={`mono-label flex shrink-0 items-center gap-1.5 rounded border px-2.5 py-1.5 text-[9px] transition-colors disabled:opacity-60 ${
          booking.paid
            ? 'border-primary bg-primary-dim text-primary'
            : 'border-border text-muted-foreground hover:border-primary hover:text-primary'
        }`}
      >
        {booking.paid ? <CheckSquare size={12} /> : <Square size={12} />}
        {booking.paid ? 'Paid' : 'Mark paid'}
      </button>
    </div>
  )
}

function EditOwnerModal({ owner, onDone, onClose }: { owner: OwnerClient; onDone: () => void; onClose: () => void }) {
  const [, startTransition] = useTransition()
  const router = useRouter()
  const [name, setName] = useState(owner.name)
  const [email, setEmail] = useState(owner.email)
  const [units, setUnits] = useState(owner.units.join(', '))
  const [saving, setSaving] = useState(false)

  function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    startTransition(async () => {
      await updateOwner({ id: owner.id, name, email, units })
      router.refresh()
      onDone()
    })
  }

  return (
    <Modal title="Edit client" onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="Client name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Email (for statements & invite)">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Units (comma separated)">
          <input value={units} onChange={(e) => setUnits(e.target.value)} className={inputClass} />
        </Field>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onDone}
            className="mono-label rounded-lg border border-border py-3.5 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="mono-label rounded-lg bg-primary py-3.5 text-[11px] text-primary-foreground disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Host provisions a real login for this owner. The owner signs in with the
// email on file plus a generated temporary password, and lands in a read-only
// owner portal scoped to their units — their date requests reach this host.
function OwnerLoginCard({ owner }: { owner: OwnerClient }) {
  const [pending, startTransition] = useTransition()
  const [sending, startSending] = useTransition()
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [copied, setCopied] = useState(false)
  const hasEmail = !!owner.email && owner.email.includes('@')
  const hasLogin = owner.hasAccess

  function create() {
    setError(null)
    setSent(false)
    startTransition(async () => {
      try {
        const result = await createOwnerLogin(owner.id)
        setCreds(result)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not create login')
      }
    })
  }

  function sendReset() {
    setError(null)
    setSent(false)
    startSending(async () => {
      try {
        await sendOwnerPasswordReset(owner.id)
        setSent(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not send reset email')
      }
    })
  }

  async function copy() {
    if (!creds) return
    try {
      await navigator.clipboard.writeText(`${creds.email} / ${creds.password}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard unavailable — credentials are still shown on screen.
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-border bg-surface-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="mono-label text-[9px] text-muted-foreground">Owner login</span>
        <div className="flex flex-wrap items-center gap-2">
          {hasEmail && hasLogin && (
            <button
              onClick={sendReset}
              disabled={sending || pending}
              className="mono-label flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-[10px] text-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
            >
              <Mail size={12} /> {sending ? 'Sending…' : 'Send reset email'}
            </button>
          )}
          <button
            onClick={create}
            disabled={pending || sending || !hasEmail}
            className="mono-label flex items-center gap-1.5 rounded border border-border-strong px-2.5 py-1.5 text-[10px] text-primary transition-colors hover:border-primary disabled:opacity-60"
          >
            <KeyRound size={12} /> {pending ? 'Creating…' : hasLogin ? 'Reset password' : 'Create login'}
          </button>
        </div>
      </div>

      {!hasEmail && (
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          Add an email for this owner (via Edit) to create their login.
        </p>
      )}

      {hasEmail && !hasLogin && !creds && !error && (
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
            Creates a sign-in for <span className="text-foreground">{owner.email}</span> to view their own units,
            bookings and statements — read-only.
        </p>
      )}

      {hasEmail && hasLogin && !creds && !error && !sent && (
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          Email a reset link so <span className="text-foreground">{owner.email}</span> sets their own password, or
          reset it to a new temporary one you share directly.
        </p>
      )}

      {sent && (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] leading-relaxed text-primary">
          <Check size={13} /> Reset link sent to {owner.email}. It expires in 1 hour.
        </p>
      )}

      {error && <p className="mt-2 text-[12px] leading-relaxed text-destructive">{error}</p>}

      {creds && (
        <div className="mt-3 rounded-lg border border-primary/40 bg-primary-dim p-3">
          <p className="mono-label text-[8px] text-primary">Share these once — the password isn&apos;t stored</p>
          <div className="mt-2 flex flex-col gap-1 font-mono text-[12px] text-foreground">
            <span className="break-all">{creds.email}</span>
            <span className="break-all">{creds.password}</span>
          </div>
          <button
            onClick={copy}
            className="mono-label mt-2.5 flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-[9px] text-primary transition-colors hover:border-primary"
          >
            {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'Copied' : 'Copy email & password'}
          </button>
        </div>
      )}
    </div>
  )
}

function ScopeChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`mono-label rounded-full border px-3 py-1.5 text-[10px] transition-colors ${
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-surface-2 text-muted-foreground hover:border-border-strong'
      }`}
    >
      {label}
    </button>
  )
}

// Revenue-bearing reservations for a set of units (blocks never count).
function revenueBookings(bookings: Booking[], units: string[]): Booking[] {
  const set = new Set(units)
  return bookings.filter(
    (b) => set.has(b.propertyName) && b.status !== 'block' && b.channel.toUpperCase() !== 'BLOCK',
  )
}

// Build a statement-shaped view of an owner scoped to one unit or all of them.
// Gross and nights come from the owner's revenue bookings (all units, or just
// the selected one); the host's cost lines are then applied to that gross and
// booking count so the deductions always reflect the current costing settings.
function scopeOwner(
  owner: OwnerClient,
  bookings: Booking[],
  unit: string | null,
  costLines: CostLine[],
  host: StatementHost,
  currency: string,
  vat: VatConfig,
): StatementOwner {
  const symbol = currencySymbol(currency)
  const inputs = costLines.map(costLineToInput)
  const all = revenueBookings(bookings, owner.units)
  const rows = unit ? all.filter((b) => b.propertyName === unit) : all
  const grossFromBookings = rows.reduce((a, b) => a + b.amount, 0)
  const nightsFromBookings = rows.reduce((a, b) => a + b.nights, 0)
  // With no booking rows (e.g. a manually keyed owner) fall back to the stored
  // aggregate so the statement isn't blank.
  const gross = !unit && grossFromBookings === 0 ? owner.gross : grossFromBookings
  const nights = !unit && nightsFromBookings === 0 ? owner.nights : nightsFromBookings
  const count = rows.length

  // Per-property breakdown across the units in scope — also the slices the
  // costing engine applies property-scoped charges against.
  const scopeUnits = unit ? [unit] : owner.units
  const unitSlices = scopeUnits.map((u) => {
    const urows = all.filter((b) => b.propertyName === u)
    return {
      name: u,
      gross: urows.reduce((a, b) => a + b.amount, 0),
      nights: urows.reduce((a, b) => a + b.nights, 0),
      bookings: urows.length,
      rows: urows,
    }
  })
  const sliceGross = unitSlices.reduce((a, s) => a + s.gross, 0)
  const slices: PropertySlice[] =
    sliceGross > 0
      ? unitSlices.map((s) => ({ name: s.name, gross: s.gross, bookings: s.bookings }))
      : [{ name: scopeUnits[0] ?? '', gross, bookings: count }]

  const lines = computeStatement(inputs, slices, vat, symbol).lines
  const net = gross - totalCost(lines)
  const split = paidSplit(rows.map((b) => ({ amount: b.amount, paid: b.paid })), net)

  const properties: StatementProperty[] = unitSlices.map((s) => {
    const ulines = computeStatement(inputs, [{ name: s.name, gross: s.gross, bookings: s.bookings }], vat, symbol).lines
    const unet = s.gross - totalCost(ulines)
    const usplit = paidSplit(s.rows.map((b) => ({ amount: b.amount, paid: b.paid })), unet)
    return { name: s.name, nights: s.nights, bookings: s.bookings, gross: s.gross, net: unet, paid: usplit.paid, due: usplit.due }
  })

  return {
    name: owner.name,
    email: owner.email || undefined,
    property: unit ?? (owner.units.length > 1 ? 'All properties' : owner.units[0] ?? 'All properties'),
    host,
    currency,
    nights,
    bookings: count,
    gross,
    lines,
    net,
    paid: split.paid,
    due: split.due,
    properties,
  }
}

function Line({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3 last:border-b-0">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className={`text-[13px] font-medium ${muted ? 'text-muted-foreground' : 'text-foreground'}`}>{value}</span>
    </div>
  )
}

function AddOwnerModal({ onClose }: { onClose: () => void }) {
  const [, startTransition] = useTransition()
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [units, setUnits] = useState('')
  const [saving, setSaving] = useState(false)

  function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    startTransition(async () => {
      await addOwner({ name, email, units })
      router.refresh()
      onClose()
    })
  }

  return (
    <Modal title="Add a client" onClose={onClose}>
      <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
        Create an owner profile and link their units. You can give them a read-only login once created.
      </p>
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="Client name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. M. Dlamini" className={inputClass} />
        </Field>
        <Field label="Email (for statements & invite)">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@email.com" className={inputClass} />
        </Field>
        <Field label="Units (comma separated)">
          <input value={units} onChange={(e) => setUnits(e.target.value)} placeholder="Sea Cottage, Loft 2" className={inputClass} />
        </Field>
        <button
          type="submit"
          disabled={saving}
          className="mono-label mt-1 flex items-center justify-center gap-2 rounded-lg bg-primary py-3.5 text-[11px] text-primary-foreground disabled:opacity-60"
        >
          <UserPlus size={15} /> {saving ? 'Creating…' : 'Create profile & link'}
        </button>
      </form>
    </Modal>
  )
}

const KINDS = [
  { key: 'house', label: 'House' },
  { key: 'cottage', label: 'Cottage' },
  { key: 'room', label: 'Room' },
]

function AddPropertyModal({ data, onClose }: { data: StayKnitData; onClose: () => void }) {
  const [, startTransition] = useTransition()
  const router = useRouter()
  const [name, setName] = useState('')
  const [specs, setSpecs] = useState('')
  const [kind, setKind] = useState('cottage')
  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [saving, setSaving] = useState(false)

  const existingOwners = data.owners.map((o) => o.name)

  function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    startTransition(async () => {
      await addProperty({ name, kind, specs, ownerName, ownerEmail })
      router.refresh()
      onClose()
    })
  }

  return (
    <Modal title="Add a property" onClose={onClose}>
      <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
        Add a unit, choose its type, and link it to an owner. Connect its iCal feeds afterwards in the Channels tab.
      </p>
      <form onSubmit={save} className="flex flex-col gap-4">
        <p className="mono-label text-[9px] text-muted-foreground">Property information</p>
        <Field label="Property name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sea Cottage" className={inputClass} />
        </Field>
        <Field label="Details">
          <input
            value={specs}
            onChange={(e) => setSpecs(e.target.value)}
            placeholder="2 bed · sleeps 4 · Kalk Bay"
            className={inputClass}
          />
        </Field>

        <div>
          <span className="mono-label mb-2 block text-[10px] text-muted-foreground">Type</span>
          <div className="grid grid-cols-3 gap-2">
            {KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setKind(k.key)}
                className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                  kind === k.key
                    ? 'border-primary bg-primary-dim text-primary'
                    : 'border-border bg-surface-2 text-muted-foreground hover:border-border-strong'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="mono-label mb-3 text-[9px] text-muted-foreground">Owner link</p>
          <div className="flex flex-col gap-4">
            <Field label="Owner name">
              <input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="e.g. M. Dlamini"
                list="owner-names"
                className={inputClass}
              />
              <datalist id="owner-names">
                {existingOwners.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </Field>
            <Field label="Owner email">
              <input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="owner@email.com"
                className={inputClass}
              />
            </Field>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="mono-label mt-1 flex items-center justify-center gap-2 rounded-lg bg-primary py-3.5 text-[11px] text-primary-foreground disabled:opacity-60"
        >
          <Home size={15} /> {saving ? 'Adding…' : 'Add property & link owner'}
        </button>
      </form>
    </Modal>
  )
}
