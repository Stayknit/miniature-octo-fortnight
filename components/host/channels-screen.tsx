'use client'

import {
  addFeed,
  disablePropertyFeed,
  enablePropertyFeed,
  importIcalFeeds,
  regeneratePropertyFeed,
  removeChannel,
  removeFeed,
  toggleChannel,
  updateChannel,
  updateFeed,
} from '@/app/actions/stayknit'
import { agoLabel, channelTint } from '@/lib/format'
import type { Channel, Feed, IcalImportResult, Property, StayKnitData } from '@/lib/types'
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  Copy,
  Link2,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  RotateCw,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useEffect, useState, useTransition } from 'react'

export function ChannelsScreen({ data }: { data: StayKnitData }) {
  const live = data.channels.filter((c) => c.live).length
  const feeds = data.feeds

  const [importing, startImport] = useTransition()
  const [result, setResult] = useState<IcalImportResult | null>(null)
  const [showConnect, setShowConnect] = useState(false)
  const [showInfo, setShowInfo] = useState(false)

  function runImport() {
    startImport(async () => {
      const r = await importIcalFeeds()
      setResult(r)
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-5 pt-4 lg:px-8 lg:pt-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-sans text-2xl font-extrabold">Channels</h1>
          <p className="mono-label mt-1 text-[10px] text-muted-foreground">
            {live} of {data.channels.length} live · connected under your profile
          </p>
        </div>
        <button
          onClick={() => setShowConnect((v) => !v)}
          className="mono-label flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[10px] text-primary transition-colors hover:border-primary"
        >
          <Plus size={13} /> Connect feed
        </button>
      </div>

      <div className="rounded-lg border border-border-strong bg-primary-dim px-4 py-3">
        <button
          onClick={() => setShowInfo((v) => !v)}
          aria-expanded={showInfo}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="mono-label text-[9px] text-primary">Managed under StayKnit</span>
          <span className="mono-label flex items-center gap-1 text-[9px] text-primary-muted">
            {showInfo ? 'Hide' : 'How it works'}
            <ChevronDown size={13} className={`transition-transform ${showInfo ? 'rotate-180' : ''}`} />
          </span>
        </button>
        {showInfo && (
          <p className="mt-2 text-[12px] leading-relaxed text-primary-muted">
            Add one iCal feed per listing site a unit is on — a cottage on Airbnb and Booking.com gets two feeds.
            StayKnit merges every feed into one calendar so a stay booked on any site blocks the same dates everywhere.
            Guest messages and cancellations still live on the original site — tap through when you need them.
          </p>
        )}
      </div>

      <CrossSiteBlockingGuide />

      {showConnect && (
        <ConnectFeed
          properties={data.properties.map((p) => p.name)}
          channels={data.channels.map((c) => c.name)}
          onDone={() => setShowConnect(false)}
        />
      )}

      {/* iCal import */}
      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold">Import availability</p>
            <p className="mono-label mt-0.5 text-[9px] text-muted-foreground">
              {feeds.length} iCal {feeds.length === 1 ? 'feed' : 'feeds'} connected
            </p>
          </div>
          <button
            onClick={runImport}
            disabled={importing || feeds.length === 0}
            className="mono-label flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2.5 text-[10px] text-primary-foreground transition-opacity disabled:opacity-60"
          >
            <RefreshCw size={13} className={importing ? 'animate-spin' : ''} />
            {importing ? 'Importing…' : 'Import iCal now'}
          </button>
        </div>

        {result && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px]">
              <Check size={14} className="text-primary" />
              <span className="font-medium">{result.imported} new</span>
              <span className="text-muted-foreground">
                imported
                {result.updated > 0 && <> · {result.updated} updated</>}
                {result.removed > 0 && <> · {result.removed} cancelled removed</>}{' '}
                · {result.skipped} unchanged · {result.reachable}/{result.feeds} feeds reachable
              </span>
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {result.errors.map((e) => (
                  <li key={e} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                    <TriangleAlert size={12} className="mt-0.5 shrink-0 text-danger" />
                    {e}
                  </li>
                ))}
              </ul>
            )}
            {result.feeds === 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                No feeds connected yet. Use “Connect feed” to paste a listing’s iCal export URL.
              </p>
            )}
          </div>
        )}

        {feeds.length > 0 && (
          <ul className="mt-3 flex max-h-80 flex-col gap-2 overflow-y-auto border-t border-border pt-3 pr-1">
            {feeds.map((f) => (
              <FeedRow
                key={f.id}
                feed={f}
                properties={data.properties.map((p) => p.name)}
                channels={data.channels.map((c) => c.name)}
              />
            ))}
          </ul>
        )}
      </div>

      <OutgoingFeeds properties={data.properties} />

      <div className="grid gap-2.5 lg:grid-cols-2">
        {data.channels.map((c) => (
          <ChannelRow key={c.id} channel={c} stats={deriveChannelStats(c.name, feeds)} />
        ))}
      </div>
    </div>
  )
}

// "Export availability" — the outgoing side of iCal. Each unit can publish a
// tokenised .ics feed that carries ONLY holds created inside StayKnit (manual
// blocks + direct bookings); OTA-imported reservations are never rebroadcast,
// so a site can safely import this without seeing its own bookings echoed back.
function OutgoingFeeds({ properties }: { properties: Property[] }) {
  const [open, setOpen] = useState(false)
  // Local token map so a publish/rotate/stop reflects immediately without a
  // full refetch (server actions still revalidate the workspace).
  const [tokens, setTokens] = useState<Record<number, string | null>>(() =>
    Object.fromEntries(properties.map((p) => [p.id, p.icalFeedToken ?? null])),
  )
  const [origin, setOrigin] = useState('')

  // window is only available after mount — set origin then to avoid an SSR
  // hydration mismatch on the feed URL.
  useEffect(() => setOrigin(window.location.origin), [])

  const publishedCount = Object.values(tokens).filter(Boolean).length

  if (properties.length === 0) return null

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-4">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2">
          <Radio size={15} className="text-primary" />
          <span className="text-[15px] font-semibold">Export availability</span>
        </span>
        <span className="mono-label flex items-center gap-1.5 text-[9px] text-primary-muted">
          {publishedCount > 0 ? `${publishedCount} published` : 'Set up'}
          <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Publish a unit&apos;s calendar so blocks you create in StayKnit — owner stays, maintenance and direct
            bookings — appear as unavailable on your booking sites. Paste the link below into each site&apos;s{' '}
            <span className="font-medium text-foreground">Import calendar</span> box. Only holds made here are shared;
            reservations imported from a site are never sent back to it.
          </p>

          <ul className="flex flex-col gap-2">
            {properties.map((p) => (
              <OutgoingFeedRow
                key={p.id}
                property={p}
                token={tokens[p.id] ?? null}
                origin={origin}
                onChange={(t) => setTokens((m) => ({ ...m, [p.id]: t }))}
              />
            ))}
          </ul>

          <div className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2.5">
            <TriangleAlert size={13} className="mt-0.5 shrink-0 text-warning" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Booking sites refresh imported calendars on their own schedule — usually every few hours. This feed is a
              best-effort convenience, not a live lock: for same-day and back-to-back dates, always confirm against the
              live calendar here before you commit. Anyone with a feed link can see that unit&apos;s blocked dates, so
              treat it as private and use <span className="font-medium text-foreground">Regenerate</span> if it leaks.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function OutgoingFeedRow({
  property,
  token,
  origin,
  onChange,
}: {
  property: Property
  token: string | null
  origin: string
  onChange: (token: string | null) => void
}) {
  const [pending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)
  const [confirmStop, setConfirmStop] = useState(false)
  const url = token ? `${origin}/ical/${token}.ics` : ''

  function publish() {
    startTransition(async () => {
      const r = await enablePropertyFeed(property.id)
      if (r.ok && r.token) onChange(r.token)
    })
  }
  function regenerate() {
    startTransition(async () => {
      const r = await regeneratePropertyFeed(property.id)
      if (r.ok && r.token) onChange(r.token)
    })
  }
  function stop() {
    startTransition(async () => {
      await disablePropertyFeed(property.id)
      onChange(null)
      setConfirmStop(false)
    })
  }
  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard blocked (e.g. insecure context) — no-op; the URL is visible.
    }
  }

  return (
    <li className="rounded-lg border border-border bg-background px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">{property.name}</p>
          <p className="mono-label mt-0.5 flex items-center gap-1 text-[9px]">
            {token ? (
              <>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span className="text-primary-muted">Published</span>
              </>
            ) : (
              <span className="text-muted-foreground">Not published</span>
            )}
          </p>
        </div>
        {!token && (
          <button
            onClick={publish}
            disabled={pending}
            className="mono-label flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2.5 text-[10px] text-primary-foreground transition-opacity disabled:opacity-60"
          >
            <Radio size={13} /> {pending ? 'Publishing…' : 'Publish feed'}
          </button>
        )}
      </div>

      {token && (
        <div className="mt-2.5 flex flex-col gap-2 border-t border-border pt-2.5">
          <div className="flex items-center gap-2">
            <code className="mono-label min-w-0 flex-1 truncate rounded-md border border-border bg-surface-2 px-2.5 py-2 text-[10px] text-foreground">
              {url || '…'}
            </code>
            <button
              onClick={copy}
              disabled={!url}
              aria-label={`Copy ${property.name} feed URL`}
              className="mono-label flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-2 text-[9px] text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
            >
              {copied ? <Check size={12} className="text-primary" /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            {confirmStop ? (
              <>
                <button
                  onClick={stop}
                  disabled={pending}
                  className="mono-label flex items-center gap-1 rounded-md border border-danger bg-danger/10 px-2 py-1.5 text-[9px] text-danger transition-opacity disabled:opacity-60"
                >
                  <X size={12} /> {pending ? 'Stopping…' : 'Confirm stop'}
                </button>
                <button
                  onClick={() => setConfirmStop(false)}
                  disabled={pending}
                  className="mono-label rounded-md border border-border px-2 py-1.5 text-[9px] text-muted-foreground"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={regenerate}
                  disabled={pending}
                  aria-label={`Regenerate ${property.name} feed URL`}
                  className="mono-label flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[9px] text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
                >
                  <RotateCw size={12} /> {pending ? 'Working…' : 'Regenerate'}
                </button>
                <button
                  onClick={() => setConfirmStop(true)}
                  disabled={pending}
                  aria-label={`Stop publishing ${property.name}`}
                  className="mono-label flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[9px] text-muted-foreground transition-colors hover:border-danger hover:text-danger disabled:opacity-60"
                >
                  <X size={12} /> Stop publishing
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

const BLOCKING_SITES: { name: string; where: string }[] = [
  { name: 'Airbnb', where: 'Listing → Calendar → Availability → Connect calendars → Export / Import' },
  { name: 'Booking.com', where: 'Extranet → Rates & Availability → Sync calendars → Export / Import' },
  { name: 'Nightsbridge', where: 'BridgeIT → Channel / iCal settings → Export URL & Import' },
  { name: 'LekkerSlaap', where: 'Property dashboard → Calendar sync → iCal export & import' },
  { name: 'Vrbo / other', where: 'Calendar → Sync / Import & Export calendar' },
]

function CrossSiteBlockingGuide() {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-lg border border-border bg-surface-2 px-4 py-3">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2">
          <ArrowLeftRight size={14} className="text-primary" />
          <span className="text-[14px] font-semibold">Block dates across your booking sites</span>
        </span>
        <span className="mono-label flex items-center gap-1 text-[9px] text-primary-muted">
          {open ? 'Hide' : 'Set up'}
          <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-4 border-t border-border pt-3">
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            StayKnit shows every booking in one calendar, but it does not change availability on the sites themselves.
            To stop a guest booking a date on Booking.com that is already taken on Airbnb, link your sites{' '}
            <span className="font-medium text-foreground">directly to each other</span> once. After that, a stay booked
            on one site automatically blocks the same dates on the others.
          </p>

          <div className="rounded-lg border border-border-strong bg-primary-dim px-3.5 py-3">
            <p className="mono-label text-[9px] text-primary">The rule</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-primary-muted">
              Every site has an <span className="font-medium">Export</span> link (a calendar URL it gives you) and an{' '}
              <span className="font-medium">Import</span> box (where you paste another site&apos;s URL). To keep two
              sites in sync you connect them <span className="font-medium">both ways</span>: paste site A&apos;s export
              into site B, and site B&apos;s export into site A.
            </p>
          </div>

          <ol className="flex flex-col gap-2.5">
            {[
              'On each site, find its calendar Export link (sometimes called “iCal link” or “Sync”). Copy it.',
              'Open the Import calendar box on every other site and paste that link. Give it a clear name like “Airbnb”.',
              'Repeat so every pair of sites has each other’s link — both directions. Three sites means each imports the other two.',
              'Do a test: block a date on one site and check it appears as booked on the others after their next refresh.',
            ].map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mono-label flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                  {i + 1}
                </span>
                <span className="text-[12px] leading-relaxed text-foreground">{step}</span>
              </li>
            ))}
          </ol>

          <div>
            <p className="mono-label mb-2 flex items-center gap-1.5 text-[9px] text-muted-foreground">
              <Link2 size={11} /> Where to find Export / Import
            </p>
            <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
              {BLOCKING_SITES.map((s) => (
                <li key={s.name} className="flex flex-col gap-0.5 bg-background px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
                  <span className="text-[12px] font-medium sm:w-28 sm:shrink-0">{s.name}</span>
                  <span className="mono-label text-[9px] leading-relaxed text-muted-foreground">{s.where}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2.5">
            <TriangleAlert size={13} className="mt-0.5 shrink-0 text-warning" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Sites refresh imported calendars on their own schedule — usually every few hours, sometimes up to a day.
              For same-day and back-to-back bookings, always confirm against the live calendar here in StayKnit before
              you commit a date.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// Relative label like "3h ago" from a Date/ISO string (feeds cross the RSC
// boundary, so the value may arrive as either).
function relAgo(value: Date | string | null): string {
  if (!value) return ''
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return ''
  return agoLabel(Math.max(0, Math.round((Date.now() - then) / 1000)))
}

// Real per-channel figures derived from the connected iCal feeds — the channel
// row used to show a hand-typed unit count and a fake "synced Ns ago" counter
// that never matched reality. A channel matches a feed when their listing-site
// labels are the same (case-insensitive), and units = the distinct properties
// carried by those feeds.
type ChannelStats = {
  feedCount: number
  units: number
  lastSyncedAt: Date | string | null
  failing: boolean
  syncedOk: boolean
}

function deriveChannelStats(name: string, feeds: Feed[]): ChannelStats {
  const key = name.trim().toLowerCase()
  const matched = feeds.filter((f) => (f.channel || '').trim().toLowerCase() === key)
  let lastSyncedAt: Date | string | null = null
  let latest = 0
  for (const f of matched) {
    if (!f.lastSyncedAt) continue
    const t = new Date(f.lastSyncedAt).getTime()
    if (!Number.isNaN(t) && t > latest) {
      latest = t
      lastSyncedAt = f.lastSyncedAt
    }
  }
  return {
    feedCount: matched.length,
    units: new Set(matched.map((f) => f.propertyName)).size,
    lastSyncedAt,
    failing: matched.some((f) => f.lastStatus === 'error'),
    syncedOk: matched.some((f) => f.lastStatus === 'ok'),
  }
}

function FeedRow({ feed, properties, channels }: { feed: Feed; properties: string[]; channels: string[] }) {
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const tint = channelTint(feed.channel || '')
  const failing = feed.lastStatus === 'error'
  const syncedOk = feed.lastStatus === 'ok'

  if (editing) {
    return (
      <li>
        <EditFeed
          feed={feed}
          properties={properties}
          channels={channels}
          onDone={() => setEditing(false)}
        />
      </li>
    )
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded font-mono text-[10px] font-semibold"
          style={{ background: `${tint}22`, color: tint }}
        >
          {(feed.channel || feed.propertyName).slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">
            {feed.propertyName}
            {feed.channel && <span className="text-muted-foreground"> · {feed.channel}</span>}
          </p>
          <p className="mono-label truncate text-[9px] text-muted-foreground">{feed.icalUrl}</p>
          {failing ? (
            <p className="mono-label mt-1 flex items-center gap-1 text-[9px] text-danger">
              <TriangleAlert size={11} className="shrink-0" />
              <span className="truncate">
                Sync failed{feed.lastError ? `: ${feed.lastError}` : ''} · will retry automatically
              </span>
            </p>
          ) : syncedOk ? (
            <p className="mono-label mt-1 flex items-center gap-1 text-[9px] text-primary-muted">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              Synced {relAgo(feed.lastSyncedAt)}
            </p>
          ) : (
            <p className="mono-label mt-1 text-[9px] text-muted-foreground">Not synced yet</p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {confirmDelete ? (
          <>
            <button
              onClick={() => startTransition(() => removeFeed(feed.id))}
              disabled={pending}
              className="mono-label flex items-center gap-1 rounded-md border border-danger bg-danger/10 px-2 py-1.5 text-[9px] text-danger transition-opacity disabled:opacity-60"
            >
              <Trash2 size={12} /> {pending ? 'Removing…' : 'Confirm'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              disabled={pending}
              className="mono-label rounded-md border border-border px-2 py-1.5 text-[9px] text-muted-foreground"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setEditing(true)}
              aria-label={`Edit ${feed.propertyName} ${feed.channel} feed`}
              className="mono-label flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[9px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <Pencil size={12} /> Edit
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              aria-label={`Remove ${feed.propertyName} ${feed.channel} feed`}
              className="mono-label flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[9px] text-muted-foreground transition-colors hover:border-danger hover:text-danger"
            >
              <X size={12} /> Remove
            </button>
          </>
        )}
      </div>
    </li>
  )
}

function EditFeed({
  feed,
  properties,
  channels,
  onDone,
}: {
  feed: Feed
  properties: string[]
  channels: string[]
  onDone: () => void
}) {
  const [propertyName, setPropertyName] = useState(feed.propertyName)
  const [channel, setChannel] = useState(feed.channel)
  const [icalUrl, setIcalUrl] = useState(feed.icalUrl)
  const [pending, startTransition] = useTransition()

  const field =
    'w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-primary'

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!propertyName || !icalUrl.trim()) return
    startTransition(async () => {
      await updateFeed({ id: feed.id, propertyName, channel, icalUrl })
      onDone()
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-surface-2 p-3.5">
      <p className="flex items-center gap-2 text-[13px] font-semibold">
        <Pencil size={14} className="text-primary" /> Edit iCal feed
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mono-label mb-1.5 block text-[9px] text-muted-foreground">Property</span>
          <select value={propertyName} onChange={(e) => setPropertyName(e.target.value)} className={field}>
            {[propertyName, ...properties.filter((p) => p !== propertyName)].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mono-label mb-1.5 block text-[9px] text-muted-foreground">Listing site</span>
          <input
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            list="channel-names"
            placeholder="e.g. Airbnb"
            className={field}
          />
          <datalist id="channel-names">
            {channels.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
      </div>
      <label className="block">
        <span className="mono-label mb-1.5 block text-[9px] text-muted-foreground">iCal export URL</span>
        <input
          value={icalUrl}
          onChange={(e) => setIcalUrl(e.target.value)}
          placeholder="https://www.airbnb.com/calendar/ical/12345.ics?s=…"
          className={field}
        />
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="mono-label flex-1 rounded-lg bg-primary py-2.5 text-[10px] text-primary-foreground disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="mono-label rounded-lg border border-border px-4 py-2.5 text-[10px] text-muted-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function ConnectFeed({
  properties,
  channels,
  onDone,
}: {
  properties: string[]
  channels: string[]
  onDone: () => void
}) {
  const [propertyName, setPropertyName] = useState(properties[0] ?? '')
  const [channel, setChannel] = useState(channels[0] ?? '')
  const [icalUrl, setIcalUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const field =
    'w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-primary'

  function submit(e: React.FormEvent) {
    e.preventDefault()
    // Surface the failure instead of silently doing nothing: a host with no
    // property selected (or none added yet) could otherwise believe the feed
    // saved.
    if (!propertyName) {
      setError(
        properties.length === 0
          ? 'Add a property first, then connect its feed.'
          : 'Select which property this feed belongs to.',
      )
      return
    }
    if (!icalUrl.trim()) {
      setError('Paste the iCal export URL for this listing.')
      return
    }
    setError(null)
    startTransition(async () => {
      await addFeed({ propertyName, channel, icalUrl })
      onDone()
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-border bg-surface-2 p-4">
      <p className="flex items-center gap-2 text-[13px] font-semibold">
        <Link2 size={15} className="text-primary" /> Connect an iCal feed
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mono-label mb-1.5 block text-[9px] text-muted-foreground">Property</span>
          <select
            value={propertyName}
            onChange={(e) => {
              setPropertyName(e.target.value)
              setError(null)
            }}
            className={field}
          >
            {properties.length === 0 && <option value="">No properties yet</option>}
            {properties.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mono-label mb-1.5 block text-[9px] text-muted-foreground">Listing site</span>
          <input
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            list="channel-names"
            placeholder="e.g. Airbnb"
            className={field}
          />
          <datalist id="channel-names">
            {channels.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
      </div>
      <label className="block">
        <span className="mono-label mb-1.5 block text-[9px] text-muted-foreground">iCal export URL</span>
        <input
          value={icalUrl}
          onChange={(e) => setIcalUrl(e.target.value)}
          placeholder="https://www.airbnb.com/calendar/ical/12345.ics?s=…"
          className={field}
        />
      </label>
      {error && (
        <p role="alert" className="rounded-lg border border-danger bg-danger/10 px-3 py-2 text-[12px] text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="mono-label flex-1 rounded-lg bg-primary py-2.5 text-[10px] text-primary-foreground disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save feed'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="mono-label rounded-lg border border-border px-4 py-2.5 text-[10px] text-muted-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function ChannelRow({ channel, stats }: { channel: Channel; stats: ChannelStats }) {
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [name, setName] = useState(channel.name)
  const tint = channelTint(channel.name)

  const field =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary'

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          startTransition(async () => {
            await updateChannel({ id: channel.id, name })
            setEditing(false)
          })
        }}
        className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-surface-2 p-4"
      >
        <p className="flex items-center gap-2 text-[13px] font-semibold">
          <Pencil size={14} className="text-primary" /> Edit channel
        </p>
        <label className="block">
          <span className="mono-label mb-1.5 block text-[9px] text-muted-foreground">Listing site</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Airbnb" className={field} />
        </label>
        <p className="mono-label text-[9px] leading-relaxed text-muted-foreground">
          {stats.feedCount === 0
            ? 'No feeds linked yet. Connect an iCal feed for this site above and its units will appear here automatically.'
            : `${stats.units} ${stats.units === 1 ? 'unit' : 'units'} linked · counted from your connected iCal feeds`}
        </p>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="mono-label flex-1 rounded-lg bg-primary py-2.5 text-[10px] text-primary-foreground disabled:opacity-60"
          >
            {isPending ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false)
              setName(channel.name)
            }}
            className="mono-label rounded-lg border border-border px-4 py-2.5 text-[10px] text-muted-foreground"
          >
            Cancel
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-md font-mono text-xs font-semibold"
            style={{ background: `${tint}22`, color: tint }}
          >
            {channel.name.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <p className="text-[15px] font-semibold">{channel.name}</p>
            <p className="mono-label mt-0.5 text-[9px] text-muted-foreground">
              {stats.feedCount === 0
                ? 'No feeds connected'
                : `${stats.units} ${stats.units === 1 ? 'unit' : 'units'} linked`}
            </p>
          </div>
        </div>
        <button
          onClick={() => startTransition(() => toggleChannel(channel.id, !channel.live))}
          className={`mono-label rounded-full border px-2.5 py-1 text-[9px] transition-colors ${
            channel.live ? 'border-primary/50 bg-primary-dim text-primary' : 'border-border text-muted-foreground'
          }`}
        >
          {channel.live ? 'Live' : 'Paused'}
        </button>
      </div>

      {confirmDelete ? (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-danger/30 pt-3">
          <span className="flex items-center gap-1.5 text-[11px] text-danger">
            <TriangleAlert size={13} className="shrink-0" />
            Remove {channel.name}?
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => startTransition(() => removeChannel(channel.id))}
              disabled={isPending}
              className="mono-label flex items-center gap-1 rounded-md border border-danger bg-danger/10 px-2.5 py-1.5 text-[9px] text-danger transition-opacity disabled:opacity-60"
            >
              <Trash2 size={12} /> {isPending ? 'Removing…' : 'Confirm'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              disabled={isPending}
              className="mono-label rounded-md border border-border px-2.5 py-1.5 text-[9px] text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
          <span className="mono-label flex items-center gap-1.5 text-[10px] text-muted-foreground">
            {!channel.live ? (
              'Sync paused'
            ) : stats.feedCount === 0 ? (
              'No feeds to sync'
            ) : stats.failing ? (
              <span className="flex items-center gap-1 text-danger">
                <TriangleAlert size={11} /> Sync failed — will retry
              </span>
            ) : stats.syncedOk && stats.lastSyncedAt ? (
              <>
                <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full" style={{ background: tint }} />
                Synced {relAgo(stats.lastSyncedAt)}
              </>
            ) : (
              'Not synced yet'
            )}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => startTransition(async () => { await importIcalFeeds() })}
              disabled={isPending || stats.feedCount === 0}
              aria-label={`Sync ${channel.name} now`}
              className="mono-label flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[9px] text-primary-muted transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
            >
              <RefreshCw size={12} className={isPending ? 'animate-spin' : ''} />
              Sync now
            </button>
            <button
              onClick={() => setEditing(true)}
              aria-label={`Edit ${channel.name}`}
              className="mono-label flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[9px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <Pencil size={12} /> Edit
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              aria-label={`Delete ${channel.name}`}
              className="mono-label flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[9px] text-muted-foreground transition-colors hover:border-danger hover:text-danger"
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
