import type {
  booking,
  channel,
  costLine,
  feed,
  ownerClient,
  property,
  referral,
  subscription,
  supportTicket,
  supportMessage,
  adminAuditLog,
  promoCode,
  promoRedemption,
  userSettings,
} from '@/lib/db/schema'

export type Property = typeof property.$inferSelect
export type Channel = typeof channel.$inferSelect
export type Feed = typeof feed.$inferSelect
export type OwnerClient = typeof ownerClient.$inferSelect
export type Booking = typeof booking.$inferSelect
export type Subscription = typeof subscription.$inferSelect
export type UserSettings = typeof userSettings.$inferSelect
export type Referral = typeof referral.$inferSelect
export type SupportTicket = typeof supportTicket.$inferSelect
export type SupportMessage = typeof supportMessage.$inferSelect
export type AdminAuditLog = typeof adminAuditLog.$inferSelect
export type PromoCode = typeof promoCode.$inferSelect
export type PromoRedemption = typeof promoRedemption.$inferSelect
export type CostLine = typeof costLine.$inferSelect

export type StayKnitData = {
  properties: Property[]
  channels: Channel[]
  feeds: Feed[]
  owners: OwnerClient[]
  bookings: Booking[]
  subscription: Subscription
  settings: UserSettings
  referrals: Referral[]
  costLines: CostLine[]
  // Currency StayKnit bills this host in, locked to their location so plan
  // prices can't be arbitraged by changing the display-currency setting.
  billingCurrency: CurrencyCode
  // Operator price overrides in effect, so every in-app price the host sees
  // (plan screen, renewal/expiry prompts) matches what checkout will charge.
  priceOverrides: PriceOverrides
  // Whether optional trial card capture is enabled (server flag, off until the
  // card-on-file Terms clause is counsel-approved). Drives whether the plan
  // screen offers hosts the "secure your trial" card step.
  trialCardCaptureEnabled: boolean
  // Best percentage-off (0..100) the host currently holds from redeemed discount
  // codes, applied to the checkout charge. 0 when none. Surfaced so the plan
  // screen shows the same discounted total the server will actually charge.
  checkoutDiscountPct: number
}

// Supported billing currencies. Mirrors CurrencyCode in lib/pricing; declared
// here too so shared types don't create a circular import with pricing.
export type CurrencyCode = 'zar' | 'usd' | 'eur' | 'gbp' | 'nad'

// A pricing tier, defined by how many properties it covers. Billing period
// (see BillingPeriod) is a separate axis chosen at checkout.
export type PlanKey = 'trial' | 'starter' | 'host' | 'professional' | 'business' | 'enterprise'

// Operator overrides for tier MONTHLY prices (minor units / cents), keyed by
// plan then currency. A missing plan or currency falls back to the hardcoded
// PLANS default in lib/plans. Applied with applyPriceOverrides in lib/pricing.
export type PriceOverrides = Partial<Record<PlanKey, Partial<Record<CurrencyCode, number>>>>

// How long the host prepays for. There is no discount: a term is billed at the
// plain monthly rate times its months, and longer terms instead grant BONUS
// free months of access (see PERIODS in lib/plans). Stored on the subscription.
export type BillingPeriod = 'monthly' | 'six_month' | 'yearly'

export type PlanDef = {
  key: PlanKey
  name: string
  unitCap: number // max linked properties; unlimited tiers use 999
  blurb: string
  // The recurring MONTHLY price (in minor units) per currency. Term totals are
  // derived from it (monthly x months) — there is no separate discounted total.
  // The host's locked region currency selects which is billed; ZAR is the
  // default/fallback. Trial (free) and Enterprise (custom quote) omit this.
  monthly?: Partial<Record<CurrencyCode, number>>
  // Enterprise is a "contact sales" tier — no self-serve checkout.
  custom?: boolean
}

// A single owner's scoped slice — never carries other owners' records,
// emails, payouts, channels, or units.
export type OwnerData = {
  self: OwnerClient | null
  properties: Property[]
  bookings: Booking[]
  costLines: CostLine[]
  host: { name: string; managedBy?: string; email?: string; phone?: string }
  currency: string // the host's currency setting, e.g. "ZAR (R)"
  vat: { enabled: boolean; rate: number } // VAT charged on host-fee lines
}

export type IcalImportResult = {
  feeds: number
  reachable: number
  imported: number // new reservations added
  updated: number // existing reservations whose dates changed on the source
  removed: number // reservations cancelled on the source and cleared here
  skipped: number // unchanged reservations
  locked: number // feeds not synced because the trial unit cap was reached
  errors: string[]
}
