# Channel sync layer

A channel-agnostic backend for mirroring reservations across listing sites. The
sync engine talks to a single `ChannelAdapter` interface, so adding a real
integration (Booking.com, Airbnb, …) means filling in **one adapter file** —
nothing else in the system changes.

## What's here

| File | Role |
| --- | --- |
| `types.ts` | Shared models (`Reservation`, `FinancialBreakdown`, `ChannelConnection`) and the `ChannelAdapter` contract. |
| `schema.ts` | Drizzle tables: `channel_connection`, `reservation`, `financial_breakdown`, `nightly_rate`, `change_log`, `channel_audit_log`. Imports `property` from the existing app schema. |
| `ical-adapter.ts` | **Functional.** Parses real iCal feeds with `node-ical`. Dates + status only; declares `financials: false` and can never emit a price. |
| `booking-com-adapter.ts` | Stub. Throws `AwaitingCredentialsError` until Connectivity Partner credentials exist. |
| `airbnb-adapter.ts` | Stub. Throws until Preferred/Software Partner OAuth exists. |
| `lekkerslaap-adapter.ts` | Stub. Throws until channel-manager API access exists. |
| `nightsbridge-adapter.ts` | Stub. Throws until a BridgeIT partner key exists. |
| `sync-engine.ts` | Orchestrator: idempotent upsert on `(channel, externalBookingId)`, diffs + logs changes, skips not-ready adapters, drops out-of-capability financials. |

## Design guarantees

1. **Availability and money are separate.** `Reservation` has no price field.
   Money lives in `FinancialBreakdown`, only writable by an adapter that
   declares `financials: true`. The engine drops (and audits) financial data
   from any adapter that doesn't. The iCal path therefore *cannot* invent a
   price — it's a structural guarantee, not a convention.
2. **Honest about what's connected.** A not-ready adapter is skipped and written
   to `channel_audit_log` as `skipped_awaiting_credentials`. Nothing is ever
   reported as synced when it wasn't.
3. **Idempotent + auditable.** Re-running a sync updates in place; every changed
   availability field is written to `change_log`.

## Relationship to the existing app

This layer is **additive and not yet wired in.** The live app still uses
`lib/ical.ts` + the `booking`/`feed` tables + the `importIcalFeeds` action. These
new tables stand alongside those and reference only the existing `property`
table. Adopt this layer deliberately — it does not change current behaviour on
its own.

## Wiring it up

### 1. Migrate the schema

The new tables are not auto-migrated. Add them to your Drizzle migration set,
e.g. with `drizzle-kit`:

```bash
# ensure drizzle.config points at both lib/db/schema.ts and lib/channels/schema.ts
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

Or hand-write the equivalent `CREATE TABLE` statements. All tables carry a plain
`userId` for per-user scoping (no RLS on Neon) — keep that scoping in every query
you add on top.

### 2. Seed connections

Insert one `channel_connection` row per property per channel. For iCal set
`icalUrl` and `status = 'active'`; for API channels leave `credentialsPresent`
effectively false (`status = 'awaiting_credentials'`) until real keys exist.

### 3. Run a sync

```ts
import { syncAllConnections } from '@/lib/channels/sync-engine'
import type { ChannelConnection } from '@/lib/channels/types'

// Load connections for the current host from channel_connection, mapped to the
// ChannelConnection shape, then:
const outcomes = await syncAllConnections(connections)
// outcomes[].skipped === true with reason 'awaiting_credentials' for stubs.
```

Call this from a scheduled route (e.g. a Vercel cron hitting an authenticated
Route Handler) on whatever cadence you want, the same way the existing feed sync
is scheduled.

### 4. Fill in a real adapter later

When you're a certified Booking.com Connectivity Partner (or approved Airbnb
partner), implement `fetch` in that one adapter file: map each reservation to a
`Reservation` and a `FinancialBreakdown`, and flip nothing else. The engine
already accepts financial data from adapters whose `capabilities.financials` is
`true`.

---

## Ready-to-paste v0.app prompt (Channels UI + reservation detail)

> Build a **Channels settings screen** and a **reservation detail view** on top
> of my existing channel-sync backend in `lib/channels/`. Use my existing design
> system, components, and server-action patterns — match the current host app.
>
> **Data model** (already in `lib/channels/schema.ts`): `channel_connection`
> (per property per channel: `channel`, `icalUrl`, `status` of
> `active | awaiting_credentials | disabled | error`, `lastSyncedAt`,
> `lastStatus`, `lastError`), `reservation` (`channel`, `externalBookingId`,
> `guestName`, `checkIn`, `checkOut`, `status`), `financial_breakdown`
> (`grossAmount`, `channelCommission`, `cleaningFee`, `taxAmount`, `netPayout`,
> `currency`, `source` — amounts in minor units), and `change_log`
> (`field`, `oldValue`, `newValue`, `changedAt`). Adapters and their state come
> from `ADAPTERS` and the `ChannelAdapter` type in `lib/channels`.
>
> **Channels settings screen:**
> - List every channel (iCal, Booking.com, Airbnb, LekkerSlaap, NightsBridge)
>   with its connection status. Show iCal as connectable now; show the API
>   channels as **"Awaiting API credentials"** with a muted/disabled state and a
>   short note of the partner requirement — do not show a fake "Connect" success.
> - For iCal, let the host paste a feed URL per property and save it (server
>   action that upserts a `channel_connection` row with `status = 'active'`).
> - Show per-connection health: last synced time, ok/skipped/error badge, and the
>   last error if any. Add a "Sync now" button that calls a server action
>   wrapping `syncAllConnections` and then `router.refresh()`.
>
> **Reservation detail view:**
> - Show a reservation's guest, property, channel, dates, and status.
> - If a `financial_breakdown` exists, show gross, commission, fees, tax, and net
>   payout formatted in the reservation's currency, with the `source` labelled
>   (Channel API / Entered by host / Estimated from nightly rate). If none
>   exists, show an **"Add price"** action (channel bookings arrive with no price
>   over iCal) that writes a `financial_breakdown` with `source = 'manual'`.
> - Show a **change history** timeline from `change_log` for that reservation
>   ("Checkout moved from … to … · 3 Sep").
>
> Keep all money server-computed and per-user scoped by `userId`. Mobile-first,
> matching my existing calendar/channels screens. Do not modify the backend in
> `lib/channels/` — only build UI + server actions on top of it.
