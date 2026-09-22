import type { BillingPeriod, PlanDef, PlanKey, Subscription } from '@/lib/types'

// StayKnit charges a flat subscription by tier — never per-booking commission.
// A tier is defined by how many properties it covers and carries a single
// MONTHLY price. The billing PERIOD (monthly / 6-month / 1-year) is chosen
// separately: there is no discount — the host prepays monthly x months — but
// longer terms add BONUS free months of access at the end (see PERIODS).
export const PLANS: PlanDef[] = [
  {
    key: 'trial',
    name: 'Free trial',
    unitCap: 1,
    blurb: 'One listing with full access to every tab and feature. No card required — you only pay when you confirm a paid plan.',
  },
  {
    key: 'starter',
    name: 'Starter',
    unitCap: 3,
    blurb: 'Up to 3 listings. Calendar sync, bookings, owner statements.',
    monthly: { zar: 19900, usd: 1200, eur: 1100, gbp: 900, nad: 19900 },
  },
  {
    key: 'host',
    name: 'Host',
    unitCap: 5,
    blurb: 'Up to 5 listings with owner portals and automatic channel sync.',
    monthly: { zar: 29900, usd: 1800, eur: 1700, gbp: 1400, nad: 29900 },
  },
  {
    key: 'professional',
    name: 'Professional',
    unitCap: 15,
    blurb: 'Up to 15 listings. Everything in Host, built for growing managers.',
    monthly: { zar: 49900, usd: 3500, eur: 3200, gbp: 2800, nad: 49900 },
  },
  {
    key: 'business',
    name: 'Business',
    unitCap: 30,
    blurb: 'Up to 30 listings with priority support and unlimited owner portals.',
    monthly: { zar: 89900, usd: 6500, eur: 6000, gbp: 5100, nad: 89900 },
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    unitCap: 999,
    blurb: 'More than 30 listings. Custom pricing, onboarding, and support.',
    custom: true,
  },
]

// Billing periods. `months` is how many months the host PAYS for. Longer terms
// reward commitment one of two ways: `discountPct` takes a percentage off the
// upfront total (6-month → 10% off), while `bonusMonths` adds extra free access
// at the end (1-year → 14 months total). A period uses one or the other.
export const PERIODS: {
  key: BillingPeriod
  name: string
  short: string
  months: number
  bonusMonths: number
  discountPct: number
}[] = [
  { key: 'monthly', name: 'Monthly', short: 'mo', months: 1, bonusMonths: 0, discountPct: 0 },
  { key: 'six_month', name: '6 months', short: '6 mo', months: 6, bonusMonths: 0, discountPct: 10 },
  { key: 'yearly', name: '1 year', short: 'yr', months: 12, bonusMonths: 2, discountPct: 0 },
]

export function periodFor(key: string): (typeof PERIODS)[number] {
  return PERIODS.find((p) => p.key === key) ?? PERIODS[2]
}

export function planFor(key: string): PlanDef {
  return PLANS.find((p) => p.key === key) ?? PLANS[0]
}

// Length of a new host's free trial, in days. Single source of truth for both
// the subscription insert and the day-counter display.
export const TRIAL_DAYS = 14

export function trialDaysLeft(sub: Pick<Subscription, 'plan' | 'trialEndsAt'>): number | null {
  if (sub.plan !== 'trial' || !sub.trialEndsAt) return null
  const ms = new Date(sub.trialEndsAt).getTime() - Date.now()
  // Clamp to [0, TRIAL_DAYS]: a trial can never legitimately have more days
  // left than its full length, so a bad/legacy row can't render an absurd count.
  return Math.min(TRIAL_DAYS, Math.max(0, Math.ceil(ms / 86400000)))
}

export function unitCap(sub: Pick<Subscription, 'plan'>): number {
  return planFor(sub.plan).unitCap
}

// How many days before a free trial ENDS the app starts nudging the host to
// pick a plan. Smaller than the 14-day trial so the reminder is a genuine
// heads-up near the end, not a banner shown from day one.
export const TRIAL_REMINDER_DAYS = 5

// At or below this many days left, the trial reminder (in-app + email) turns
// urgent. Shared so the banner and the cron agree on the threshold.
export const TRIAL_URGENT_DAYS = 1

// True when a host is still on a live free trial that is ending within the
// reminder window. Unlike isTrialExpired this never freezes the app — the host
// keeps full trial access; it only drives a dismissible "trial ending" prompt.
// Once trialEndsAt passes, the (stronger) trial-expired freeze takes over.
export function isTrialEndingSoon(
  sub: Pick<Subscription, 'plan' | 'trialEndsAt'>,
  withinDays = TRIAL_REMINDER_DAYS,
): boolean {
  if (sub.plan !== 'trial' || !sub.trialEndsAt) return false
  const ms = new Date(sub.trialEndsAt).getTime() - Date.now()
  return ms > 0 && ms <= withinDays * 86400000
}

// True once a host's free trial has fully lapsed and no paid term is covering
// them. The app freezes and forces a subscription when this is true. A host on
// a paid tier (starter…business) or Enterprise is never "expired" here; note a
// prepaid term that runs out reverts the row to `plan: 'trial'`, so its old
// trialEndsAt (in the past) correctly re-triggers this gate to re-subscribe.
export function isTrialExpired(sub: Pick<Subscription, 'plan' | 'trialEndsAt'>): boolean {
  if (sub.plan !== 'trial' || !sub.trialEndsAt) return false
  return new Date(sub.trialEndsAt).getTime() <= Date.now()
}

// How many days before a paid term's access-end date (cancelAt) the app starts
// nudging the host to renew.
export const EXPIRY_REMINDER_DAYS = 14

// Whole days remaining until a paid term ends (null if no end date is set).
// Rounds up, so "0.4 days left" reads as 1 — the last partial day still counts.
export function daysUntilAccessEnd(sub: Pick<Subscription, 'cancelAt'>): number | null {
  if (!sub.cancelAt) return null
  return Math.ceil((new Date(sub.cancelAt).getTime() - Date.now()) / 86400000)
}

// True when a host is on a PAID term that is still active but ending within the
// reminder window. Unlike isTrialExpired this never freezes the app — the host
// keeps full access; it only drives a dismissible "renew soon" prompt. Once
// cancelAt passes, applyPendingCancellation reverts the row to trial and the
// (stronger) trial-expired freeze takes over instead.
export function isExpiringSoon(
  sub: Pick<Subscription, 'plan' | 'cancelAt'>,
  withinDays = EXPIRY_REMINDER_DAYS,
): boolean {
  if (!isPaid(sub.plan) || !sub.cancelAt) return false
  const ms = new Date(sub.cancelAt).getTime() - Date.now()
  return ms > 0 && ms <= withinDays * 86400000
}

// Listings beyond the plan's unit cap are locked until the host upgrades.
// Properties are ordered oldest-first, so the earliest units stay active and
// any extras (index >= cap) are the ones blocked. Returns their names.
export function lockedUnitNames(sub: Pick<Subscription, 'plan'>, units: { name: string }[]): string[] {
  const cap = unitCap(sub)
  return units.slice(cap).map((u) => u.name)
}

// Paid tiers go through Paystack checkout. Trial is free; Enterprise is a custom
// "contact sales" quote — neither is a self-serve charge.
export function isPaid(key: PlanKey | string): boolean {
  return key === 'starter' || key === 'host' || key === 'professional' || key === 'business'
}
