// Per-site pricing math for channel-sync reservations. Availability feeds
// (iCal) never carry a price, so the host types the booking's gross amount by
// hand and this derives the payout using the SITE'S saved fee rule — different
// booking sites withhold different commissions, so the rule is stored per unit
// + channel and re-applied every time an amount is entered. Pure + synchronous
// so the save action and the live UI preview compute the identical figure.
//
// All money is in MINOR units (ZAR cents). Percentages are basis points
// (1500 = 15.00%), so a whole-percent fee like 15% is 1500 and there is no
// floating-point drift in stored values.

export interface PricingRuleInput {
  /** Channel/OTA commission withheld, basis points (0..10000). */
  commissionBps: number
  /** VAT/tax to break out of the gross, basis points (0..10000). */
  vatBps: number
}

export interface ComputedBreakdown {
  grossAmount: number
  channelCommission: number
  cleaningFee: number
  taxAmount: number
  netPayout: number
}

export const clampBps = (n: number): number => Math.min(10000, Math.max(0, Math.round(Number.isFinite(n) ? n : 0)))

// Given what the guest paid (gross) and the site's fee rule, split out the
// channel commission and VAT and return what the host actually receives. VAT is
// treated as money collected on the gross that must be remitted, so it is
// subtracted from the payout alongside commission. netPayout is floored at 0 so
// an over-large fee can never produce a negative payout.
export function computeBreakdown(grossAmount: number, rule: PricingRuleInput): ComputedBreakdown {
  const gross = Math.max(0, Math.round(Number.isFinite(grossAmount) ? grossAmount : 0))
  const commissionBps = clampBps(rule.commissionBps)
  const vatBps = clampBps(rule.vatBps)
  const channelCommission = Math.round((gross * commissionBps) / 10000)
  const taxAmount = Math.round((gross * vatBps) / 10000)
  const netPayout = Math.max(0, gross - channelCommission - taxAmount)
  return { grossAmount: gross, channelCommission, cleaningFee: 0, taxAmount, netPayout }
}

// Format basis points as a compact percent label, e.g. 1500 -> "15%",
// 1550 -> "15.5%". Used in both the dashboard and the Finances rule card.
export function bpsToPercentLabel(bps: number): string {
  const pct = clampBps(bps) / 100
  return `${Number.isInteger(pct) ? pct.toString() : pct.toFixed(2).replace(/0$/, '')}%`
}
