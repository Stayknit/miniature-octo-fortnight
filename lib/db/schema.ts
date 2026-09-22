import { sql } from "drizzle-orm"
import { pgTable, text, timestamp, boolean, serial, integer, uniqueIndex, jsonb } from "drizzle-orm/pg-core"

// --- Better Auth required tables -------------------------------------------
// Column names are camelCase to match Better Auth's defaults. Do not rename.

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    // Plain unique (user_email_key) matches Better Auth's default. It is
    // case-SENSITIVE, so it alone would still allow John@x.com and john@x.com
    // as two accounts — the case-insensitive index below closes that gap.
    email: text("email").notNull().unique(),
    emailVerified: boolean("emailVerified").notNull().default(false),
    image: text("image"),
    // The host's trading/business name, collected as a required field at sign-up.
    // Nullable at the DB level so pre-existing accounts (and comp/test accounts)
    // aren't broken; the sign-up flow enforces it for all new hosts.
    businessName: text("businessName"),
    // Contact numbers collected at sign-up. `phone` (mobile) is required by the
    // sign-up flow; `telephone` (landline) is optional. Both nullable at the DB
    // level so pre-existing and comp/owner accounts aren't broken.
    phone: text("phone"),
    telephone: text("telephone"),
    // Set by the Better Auth two-factor plugin once a host completes TOTP
    // enrollment. When true, sign-in requires a second factor. The TOTP secret
    // and backup codes live in the separate `twoFactor` table below.
    twoFactorEnabled: boolean("twoFactorEnabled").notNull().default(false),
    // "host" manages properties for others; "owner" sees a read-only portal.
    role: text("role").notNull().default("host"),
    // For an owner login: the host whose workspace this owner belongs to. Owner
    // reads/writes are scoped to this host's data (their units only).
    hostUserId: text("hostUserId"),
    // Last time the user loaded their workspace. A profile untouched for 12 months
    // is purged automatically (see sweepInactiveProfiles). Refreshed on every read.
    lastActiveAt: timestamp("lastActiveAt").notNull().defaultNow(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({
    // Case-insensitive uniqueness on email. Guarantees one account per address
    // no matter the casing or which code path inserts it (app sign-up, the
    // Better Auth /sign-up/email endpoint, owner/comp provisioning, or raw
    // SQL). Backed by the live index user_email_lower_idx.
    emailLowerIdx: uniqueIndex("user_email_lower_idx").on(sql`lower(${t.email})`),
  }),
)

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
})

// Managed by the Better Auth two-factor plugin. One row per host who has
// enabled TOTP 2FA: `secret` is the TOTP shared secret and `backupCodes` holds
// the (encrypted) single-use recovery codes. Rows are created on enable and
// removed on disable; column names must match the plugin's defaults.
export const twoFactor = pgTable("twoFactor", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  secret: text("secret").notNull(),
  backupCodes: text("backupCodes").notNull(),
  verified: boolean("verified").notNull().default(true),
  failedVerificationCount: integer("failedVerificationCount").notNull().default(0),
  lockedUntil: timestamp("lockedUntil"),
})

// Security questions used to verify identity during password reset (no email
// provider is connected). Answers are stored hashed, never in plain text.
export const securityQuestion = pgTable("security_question", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  position: integer("position").notNull().default(0),
  question: text("question").notNull(),
  answerHash: text("answerHash").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// --- App tables ------------------------------------------------------------
// Every table carries a plain `userId` for per-user scoping (no RLS on Neon).

// A property/unit synced across channels.
export const property = pgTable(
  "property",
  {
    id: serial("id").primaryKey(),
    userId: text("userId").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("cottage"), // house | cottage | room
    specs: text("specs").notNull().default(""),
    icalUrl: text("icalUrl").notNull().default(""),
    ownerName: text("ownerName").notNull().default(""), // client that owns it
    // Secret token for this unit's OUTGOING iCal feed, served at
    // /ical/<token>.ics. NULL until the host enables publishing; the feed only
    // ever broadcasts StayKnit-origin holds (manual blocks + direct bookings),
    // never OTA-imported reservations, so an OTA never sees its own booking
    // echoed back. Regenerating rotates the token and instantly kills the old
    // URL. Kept globally unique (partial index) so a token maps to one unit.
    icalFeedToken: text("icalFeedToken"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    icalFeedTokenIdx: uniqueIndex("property_ical_feed_token_idx")
      .on(t.icalFeedToken)
      .where(sql`${t.icalFeedToken} IS NOT NULL`),
  }),
)

// A reservation mirrored across the linked channels.
export const booking = pgTable(
  "booking",
  {
    id: serial("id").primaryKey(),
    userId: text("userId").notNull(),
    propertyName: text("propertyName").notNull(),
    guest: text("guest").notNull(),
    channel: text("channel").notNull(), // AIRBNB | BOOKING.COM | LEKKERSLAAP | ... | DIRECT | BLOCK
    checkIn: text("checkIn").notNull(), // ISO date yyyy-mm-dd
    checkOut: text("checkOut").notNull(),
    nights: integer("nights").notNull().default(1),
    amount: integer("amount").notNull().default(0), // ZAR, whole rand
    status: text("status").notNull().default("confirmed"), // confirmed | pending | block | checkout
    reason: text("reason").notNull().default(""),
    paid: boolean("paid").notNull().default(false), // host marked payment as processed
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    // iCal reconciliation identity. Feed-imported rows carry the source feed id
    // and the event's stable identity (VEVENT UID, or a date fallback) so a
    // re-sync can update changed dates and remove cancelled reservations instead
    // of only ever inserting. NULL for manual/direct bookings and manual blocks,
    // which the importer must never touch.
    sourceUid: text("sourceUid"),
    sourceFeedId: integer("sourceFeedId"),
  },
  (t) => ({
    // DB-level idempotency guard: a feed event (identified by its owning feed +
    // stable UID) can exist at most once, so concurrent/overlapping imports of
    // the same feed can never insert duplicate rows — the race the app-level
    // dedupe couldn't fully close. Postgres treats NULLs as distinct, so manual
    // and direct bookings (NULL identity) are intentionally never constrained,
    // and genuine cross-feed double-bookings (distinct identities) still surface
    // as clashes rather than being silently blocked.
    feedIdentityIdx: uniqueIndex("booking_feed_identity_idx").on(t.sourceFeedId, t.sourceUid),
  }),
)

// A single iCal export URL for one property on one channel. A property can
// carry many feeds — one per listing site it appears on — so the importer can
// merge them all and a stay booked on any site blocks the same dates
// everywhere. This replaces the old single `property.icalUrl` field.
export const feed = pgTable("feed", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  propertyName: text("propertyName").notNull(),
  channel: text("channel").notNull().default(""), // listing site label, e.g. "Airbnb"
  icalUrl: text("icalUrl").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  // --- Per-feed sync health (drives the scheduled sync + UI status) ---------
  // When we last attempted a fetch, and when one last succeeded. A feed can have
  // attempted != synced (it errored) — the UI shows both.
  lastAttemptAt: timestamp("lastAttemptAt"),
  lastSyncedAt: timestamp("lastSyncedAt"),
  // 'ok' | 'error' | null (never synced). lastError is a short, host-readable
  // reason for the most recent failure (e.g. "feed unreachable").
  lastStatus: text("lastStatus"),
  lastError: text("lastError"),
  // Consecutive failures — drives exponential backoff. Reset to 0 on success.
  failureCount: integer("failureCount").notNull().default(0),
  // When the scheduled sync cron should next consider this feed. null = due now.
  // A success sets it to now + normal interval; a failure to now + backoff.
  nextRetryAt: timestamp("nextRetryAt"),
})

// A linked listing site (iCal channel).
export const channel = pgTable("channel", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  name: text("name").notNull(),
  icalUrl: text("icalUrl").notNull().default(""),
  live: boolean("live").notNull().default(true),
  units: integer("units").notNull().default(1),
  syncedSecondsAgo: integer("syncedSecondsAgo").notNull().default(60),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// The host's StayKnit plan. One row per host user.
export const subscription = pgTable("subscription", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  plan: text("plan").notNull().default("trial"), // trial | starter | host | professional | business | enterprise
  billingPeriod: text("billingPeriod").notNull().default("yearly"), // monthly | six_month | yearly
  status: text("status").notNull().default("trialing"), // trialing | active | past_due | canceled
  // Explicit complimentary / demo / pilot flag. When true the account is on a
  // paid tier but is NOT real revenue (demo accounts shown to prospects, pilot
  // grants, internal test accounts) and is excluded from MRR/ARR. This replaced
  // the old fragile "infer comp from data shape" approach, which could not tell
  // a genuine payer apart from a comp account.
  comp: boolean("comp").notNull().default(false),
  trialEndsAt: timestamp("trialEndsAt"),
  termsAcceptedAt: timestamp("termsAcceptedAt"),
  foundingRate: boolean("foundingRate").notNull().default(false),
  // The date access actually ends. On a live term this equals termEndsAt. Once
  // the host cancels, it is pulled in to the END OF THE NOTICE PERIOD (1 month
  // monthly, 2 months yearly, from the cancel date), capped at termEndsAt; when
  // it passes, the account reverts to the free trial (applyPendingCancellation).
  cancelAt: timestamp("cancelAt"),
  // The true end of the prepaid term, never shortened by a cancellation. Set at
  // activation alongside cancelAt so that RESUMING a cancelled plan can restore
  // access to the full paid term (cancelAt := termEndsAt). Legacy rows may be
  // null; callers fall back to cancelAt.
  termEndsAt: timestamp("termEndsAt"),
  // When the host self-cancels a live prepaid term. Cancellation policy: the host
  // may cancel at any time and keeps access through a NOTICE PERIOD (1 month
  // monthly / 2 months yearly) from the cancel date; any prepaid balance beyond
  // the notice is refunded pro-rata (owner-approved, see refund_request). It also
  // turns off any opt-in auto-renewal so no further charge is attempted. This
  // records intent and silences renewal reminders; cleared on resume or a new term.
  canceledAt: timestamp("canceledAt"),
  // The Paystack transaction reference of the most recently activated payment. Makes
  // plan activation idempotent: the webhook and the client-side confirm both try
  // to activate the same payment, and whichever lands first records the id here
  // so the second is a no-op (it can't re-extend the access window).
  lastPaymentRef: text("lastPaymentRef"),
  // How far the expiry-reminder emails have progressed for the CURRENT paid term:
  // 0 = none sent, 1 = early notice sent (<=14 days left), 2 = urgent notice sent
  // (<=3 days left). Reset to 0 whenever a new/renewed term is activated so the
  // next term re-arms both notices. Prevents emailing the host every single day.
  expiryNoticeStage: integer("expiryNoticeStage").notNull().default(0),
  // Same idea as expiryNoticeStage, but for the FREE TRIAL ending (not a paid
  // term): 0 = none sent, 1 = early notice sent (<=TRIAL_REMINDER_DAYS left),
  // 2 = urgent notice sent (<=1 day left). Fresh trials start at 0 (the default);
  // it only advances while plan = 'trial' so a host is nudged once per stage to
  // subscribe before their trial lapses.
  trialNoticeStage: integer("trialNoticeStage").notNull().default(0),
  // Optional, opt-in auto-renewal. When true, the renewals cron charges the
  // saved card (paystackAuthCode) for the same plan+period shortly before the
  // current term ends, extending access with no manual repurchase. Default false
  // so nothing recurs unless the host explicitly turns it on — this preserves
  // the prepaid, "no surprise charges" default. Turning it off (or self-
  // cancelling) stops all future charges immediately.
  autoRenew: boolean("autoRenew").notNull().default(false),
  // Paystack reusable authorization ("card on file") captured from the host's
  // most recent successful charge, used by the renewals cron to charge again
  // without re-entering card details. Only ever set from a verified transaction;
  // Paystack holds the actual card data, we store only this opaque token.
  paystackAuthCode: text("paystackAuthCode"),
  paystackCustomerCode: text("paystackCustomerCode"),
  // Lowercased currency of the most recent charge (e.g. "zar"). Stored so the
  // renewals cron — which has no request geolocation — recharges in the exact
  // currency the host originally paid in, matching their saved authorization.
  chargeCurrency: text("chargeCurrency"),
  // When the renewals cron last attempted an auto-renewal charge for the current
  // term. Guards against charging more than once per day while the term is
  // inside the renewal window (a successful charge pushes cancelAt out of the
  // window; this covers the gap before that commits and paces retries).
  renewalAttemptedAt: timestamp("renewalAttemptedAt"),
  // Consecutive auto-renewal failures for the current term, and when the last
  // one occurred. Drives the escalating dunning copy and lets support spot
  // stuck renewals; reset to 0 / null the moment a renewal succeeds.
  renewalFailureCount: integer("renewalFailureCount").notNull().default(0),
  renewalFailedAt: timestamp("renewalFailedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// A pro-rata refund owed to a host who cancelled a prepaid term before the end
// of the paid balance (beyond the notice period). Created by setPlanCancellation
// and left PENDING so the platform owner reviews and approves the money movement
// in the admin Payments area before Paystack is ever called — protecting both
// the company (a human checks every refund) and the consumer (the balance is
// actually returned). One open (pending) request per host at a time.
export const refundRequest = pgTable("refund_request", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  // The Paystack transaction we will refund — the host's last successful charge.
  paymentRef: text("paymentRef").notNull(),
  currency: text("currency").notNull(), // e.g. "ZAR"
  // Pro-rata amount to refund, in the currency's minor unit (cents). Computed at
  // cancel time from the real charge amount, so it is discount-aware.
  amountCents: integer("amountCents").notNull(),
  // pending | approved | rejected | canceled | failed
  //  - approved: owner approved AND Paystack accepted the refund
  //  - rejected: owner declined the refund (cancellation still stands)
  //  - canceled: host resumed the plan before approval, so it's withdrawn
  //  - failed: owner approved but the Paystack refund call errored
  status: text("status").notNull().default("pending"),
  // Human context shown to the owner (plan/period, notice period, access-until).
  note: text("note"),
  requestedAt: timestamp("requestedAt").notNull().defaultNow(),
  resolvedAt: timestamp("resolvedAt"),
  resolvedBy: text("resolvedBy"), // owner email that actioned it
  paystackRefundStatus: text("paystackRefundStatus"), // status returned by Paystack
})

// A redeemable promotion / access code. Two roles, so the same system covers
// "get access" now and marketing promotions later:
//   - kind "access": redeeming grants the user a paid `plan` tier for `months`
//     of access (stacked on any time they already have), no card required.
//   - kind "promo": a percentage-off code (`percentOff`) reserved for future
//     use at checkout. Stored now so codes made today keep working later.
// `maxRedemptions` of 0 means unlimited; `timesRedeemed` is bumped atomically on
// each successful redemption so a capped code can never be over-redeemed.
export const promoCode = pgTable("promo_code", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(), // always stored/compared UPPERCASE
  kind: text("kind").notNull().default("access"), // access | promo
  plan: text("plan").notNull().default("host"), // tier granted by access codes
  months: integer("months").notNull().default(1), // months of access granted
  percentOff: integer("percentOff").notNull().default(0), // future discount codes
  maxRedemptions: integer("maxRedemptions").notNull().default(0), // 0 = unlimited
  timesRedeemed: integer("timesRedeemed").notNull().default(0),
  expiresAt: timestamp("expiresAt"), // null = never expires
  active: boolean("active").notNull().default(true),
  note: text("note").notNull().default(""), // internal label, e.g. "Launch pilot"
  createdBy: text("createdBy").notNull().default(""), // admin email that made it
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// One redemption of a promo code by a user. Also enforces "one code per user":
// a unique index on (codeId, userId) stops the same person redeeming twice.
export const promoRedemption = pgTable(
  "promo_redemption",
  {
    id: serial("id").primaryKey(),
    codeId: integer("codeId").notNull(),
    code: text("code").notNull().default(""),
    userId: text("userId").notNull(),
    redeemedAt: timestamp("redeemedAt").notNull().defaultNow(),
    // Set once a DISCOUNT ("promo") redemption has reduced one successful
    // payment. A discount is single-use per user: after it is consumed,
    // getCheckoutDiscountPct stops counting it, so the next checkout is full
    // price. NULL means still available. "access" codes ignore this field.
    consumedAt: timestamp("consumedAt"),
  },
  (t) => ({
    uniqPerUser: uniqueIndex("promo_redemption_code_user_idx").on(t.codeId, t.userId),
  }),
)

// A marketing/ad campaign tracked in the owner's Marketing hub. StayKnit does
// NOT buy ads through any platform API (each requires its own gated approval);
// this is a planning + tracking record. The actual ad is created in each
// platform's own Ads Manager, and this row centralises budget, status, dates,
// the destination URL, and the UTM-tagged link used to attribute signups.
// `platforms` is a comma-separated list of slugs (facebook,instagram,linkedin,
// reddit,youtube). `budgetMinor` is the total planned spend in minor units
// (e.g. cents) of `currency`; 0 means unset.
export const adCampaign = pgTable("ad_campaign", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  platforms: text("platforms").notNull().default(""),
  objective: text("objective").notNull().default(""), // free text, e.g. "Signups"
  status: text("status").notNull().default("draft"), // draft | active | paused | ended
  budgetMinor: integer("budgetMinor").notNull().default(0),
  currency: text("currency").notNull().default("ZAR"),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  destinationUrl: text("destinationUrl").notNull().default(""),
  utmUrl: text("utmUrl").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdBy: text("createdBy").notNull().default(""), // admin email that made it
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// A recurring operating cost the owner tracks in the Accounts dashboard (e.g.
// hosting, database, domain, email, ads retainer). Used to show current monthly
// running cost and net margin against MRR. `amountMinor` is in minor units of
// `currency` (e.g. USD cents), as entered. For foreign-currency costs the FX
// rate to ZAR is locked to the date the cost was incurred (`fxDate`) so the
// converted figure never drifts with the live rate: `fxRateMicro` is
// (1 unit of `currency` in ZAR) x 1_000_000, and ZAR minor units =
// round(amountMinor x fxRateMicro / 1_000_000). ZAR costs use rate 1_000_000.
// `cadence` normalises to a monthly figure (yearly divided by 12).
export const runningCost = pgTable("running_cost", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  amountMinor: integer("amountMinor").notNull().default(0),
  currency: text("currency").notNull().default("ZAR"),
  fxRateMicro: integer("fxRateMicro").notNull().default(1_000_000),
  fxDate: text("fxDate"), // YYYY-MM-DD the rate is from; null for ZAR
  cadence: text("cadence").notNull().default("monthly"), // monthly | yearly
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// An invoice/receipt email pulled from the info@stayknit.org mailbox by the
// scheduled scanner. The AI extracts vendor/amount/currency/date; the row sits
// in a review queue (status = pending) until an admin approves it, at which
// point a running_cost row is created (linkedCostId) or it is dismissed.
// Amount fields mirror running_cost: `amountMinor` in `currency` minor units,
// with the FX-to-ZAR rate locked to `fxDate` (see running_cost for the maths).
export const invoiceEmail = pgTable("invoice_email", {
  id: serial("id").primaryKey(),
  // IMAP Message-ID (or a synthesized fallback) — unique so re-scans dedupe.
  messageId: text("messageId").notNull().unique(),
  fromAddress: text("fromAddress").notNull().default(""),
  fromName: text("fromName").notNull().default(""),
  subject: text("subject").notNull().default(""),
  receivedAt: timestamp("receivedAt").notNull().defaultNow(),
  status: text("status").notNull().default("pending"), // pending | approved | dismissed
  // AI-extracted fields
  vendor: text("vendor").notNull().default(""),
  amountMinor: integer("amountMinor").notNull().default(0),
  currency: text("currency").notNull().default("ZAR"),
  invoiceDate: text("invoiceDate"), // YYYY-MM-DD as stated on the invoice
  cadence: text("cadence").notNull().default("monthly"), // monthly | yearly (best guess)
  confidence: integer("confidence").notNull().default(0), // 0-100
  summary: text("summary").notNull().default(""),
  // FX resolution, locked to invoiceDate (same convention as running_cost)
  fxRateMicro: integer("fxRateMicro").notNull().default(1_000_000),
  fxDate: text("fxDate"),
  amountZarCents: integer("amountZarCents").notNull().default(0),
  // Set when approved into a running cost
  linkedCostId: integer("linkedCostId"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// Per-host notification, sync, and account preferences. One row per host user.
export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull().unique(),
  pushNew: boolean("pushNew").notNull().default(true),
  pushClash: boolean("pushClash").notNull().default(true),
  pushCheckin: boolean("pushCheckin").notNull().default(true),
  mailDaily: boolean("mailDaily").notNull().default(false),
  mailStatement: boolean("mailStatement").notNull().default(true),
  autoAccept: boolean("autoAccept").notNull().default(false),
  syncMinutes: integer("syncMinutes").notNull().default(15),
  currency: text("currency").notNull().default("ZAR (R)"),
  timezone: text("timezone").notNull().default("Africa/Johannesburg"),
  commission: integer("commission").notNull().default(15),
  // VAT charged on host-fee (vatable) cost lines. Enabled with a 15% default
  // (South Africa); host can change the rate or switch it off in Costing.
  vatEnabled: boolean("vatEnabled").notNull().default(true),
  vatRate: integer("vatRate").notNull().default(15),
  // DEPRECATED / DO NOT USE. This legacy flag never enforced anything. Real
  // TOTP two-factor is now implemented via the Better Auth twoFactor plugin and
  // lives in `user.twoFactorEnabled` (+ the `twoFactor` table) — NOT here. This
  // column is kept only to avoid a destructive migration; ignore it entirely.
  twoFactor: boolean("twoFactor").notNull().default(false),
  // Host/agency identity printed on owner statements.
  businessName: text("businessName").notNull().default(""),
  businessEmail: text("businessEmail").notNull().default(""),
  businessPhone: text("businessPhone").notNull().default(""),
  // Manual overrides for the pre-launch checklist, keyed by item id → checked.
  // Only items the owner has toggled away from their built-in default are
  // stored, so newly added checklist items still show their shipped state.
  launchChecklist: jsonb("launchChecklist").$type<Record<string, boolean>>(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// A secure, read-only owner-portal invite. The token is what the owner uses;
// units pins exactly which properties that link may ever surface.
export const ownerInvite = pgTable("owner_invite", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(), // host who issued the invite
  ownerId: integer("ownerId").notNull(),
  token: text("token").notNull().unique(),
  email: text("email").notNull().default(""),
  units: text("units").array().notNull().default([]),
  acceptedAt: timestamp("acceptedAt"),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// A host-to-host referral invite. Tracks who invited whom and the invite status.
export const referral = pgTable("referral", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  email: text("email").notNull(),
  code: text("code").notNull(),
  status: text("status").notNull().default("sent"), // sent | joined | rewarded
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// A "send to a human" support/escalation ticket. AI is the first line: the
// in-app assistant answers before a ticket is ever created, and when one is
// created an AI draft reply is generated into `aiDraft` for the human agent to
// review, edit, and send from the support dashboard.
export const supportTicket = pgTable("support_ticket", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  category: text("category").notNull().default("general"), // general | clash | ical | payout
  subject: text("subject").notNull().default(""),
  message: text("message").notNull(),
  status: text("status").notNull().default("open"), // open | resolved
  // AI-suggested reply awaiting human review. Empty once sent or dismissed; the
  // sent copy is preserved as a supportMessage row (author "ai").
  aiDraft: text("aiDraft").notNull().default(""),
  // Bumped on every new message so the dashboard can sort by most-recent
  // activity rather than original creation time.
  lastActivityAt: timestamp("lastActivityAt").notNull().defaultNow(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// One message in a support ticket's conversation thread. The ticket's opening
// message stays on supportTicket.message; every reply after that (AI answer,
// human agent reply, or the user's follow-up) is a row here.
export const supportMessage = pgTable("support_message", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticketId").notNull(),
  // "user" = the host/owner who opened it, "ai" = the assistant's answer,
  // "agent" = a human support agent replying from the dashboard.
  author: text("author").notNull(), // user | ai | agent
  body: text("body").notNull(),
  // Whether this message was also emailed to the user (agent/ai replies are).
  emailed: boolean("emailed").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Append-only audit trail of every change a support agent makes to a user's
// account from the dashboard (plan changes, contact edits, login resets, ticket
// actions). Never deleted with a user's data so the record survives.
export const adminAuditLog = pgTable("admin_audit_log", {
  id: serial("id").primaryKey(),
  agentEmail: text("agentEmail").notNull(),
  targetUserId: text("targetUserId").notNull().default(""),
  action: text("action").notNull(),
  detail: text("detail").notNull().default(""),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Host-wide default cost lines applied to owner statements. A line is either a
// percentage of gross (management fee, third-party fees) or a fixed rand amount
// (cleaning, laundry, custom extras). Fixed lines can bill per booking or once
// per statement. One set per host; edited in Settings → Costing.
export const costLine = pgTable("cost_line", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  position: integer("position").notNull().default(0),
  label: text("label").notNull(),
  kind: text("kind").notNull().default("fixed"), // percent | fixed
  value: integer("value").notNull().default(0), // whole percent (0-100) or whole rand
  perBooking: boolean("perBooking").notNull().default(false), // fixed lines only
  enabled: boolean("enabled").notNull().default(true),
  // When set to a property name, the line only applies to that unit's slice of a
  // statement (e.g. a per-unit levy or insurance). Empty = host-wide default.
  propertyName: text("propertyName").notNull().default(""),
  // Marks this as a host fee that VAT is charged on (management/agency fee).
  // VAT itself is toggled and rated per host in user_settings.
  vatable: boolean("vatable").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// Operator-set overrides for a paid tier's MONTHLY price, per currency. A row
// here overrides the hardcoded default in lib/plans.ts for that (plan,
// currency); currencies with no row fall back to the default. Amounts are in
// minor units (cents), matching PLANS.monthly. Edited from the support
// dashboard's Pricing tab. BOTH the authoritative checkout charge and the
// activation amount-check resolve prices through these rows, so what a host is
// shown always equals what Paystack collects.
export const planPrice = pgTable(
  "plan_price",
  {
    id: serial("id").primaryKey(),
    plan: text("plan").notNull(), // starter | host | professional | business
    currency: text("currency").notNull(), // zar | usd | eur | gbp | nad
    monthlyCents: integer("monthlyCents").notNull(),
    updatedBy: text("updatedBy").notNull().default(""), // admin email that set it
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    uniqPlanCurrency: uniqueIndex("plan_price_plan_currency_idx").on(t.plan, t.currency),
  }),
)

// App-wide operator configuration as a tiny key/value store (one row per key).
// For global settings that are neither per-host (see user_settings) nor a plan
// price (see plan_price) — currently StayKnit's OWN VAT registration status
// (key "stayknit_vat"). `value` is JSON so a key can hold a structured object.
// Written only from the admin dashboard.
export const appSetting = pgTable("app_setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: text("updatedBy").notNull().default(""),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// An owner (client) the host manages, with monthly cost breakdown.
export const ownerClient = pgTable("owner_client", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(), // host who owns this client record
  name: text("name").notNull(),
  email: text("email").notNull().default(""),
  units: text("units").array().notNull().default([]),
  nights: integer("nights").notNull().default(0),
  gross: integer("gross").notNull().default(0),
  commission: integer("commission").notNull().default(0),
  cleaning: integer("cleaning").notNull().default(0),
  net: integer("net").notNull().default(0),
  hasAccess: boolean("hasAccess").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})
