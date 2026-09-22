// Cancellation policy: notice served + pro-rata balance.
//
// A host may cancel a prepaid term at any time. They keep access through a
// NOTICE PERIOD measured from the cancel date — 1 month for monthly terms,
// 2 months for yearly (and 6-month) terms — after which access ends and the
// account reverts to the free trial. Any prepaid time still remaining beyond
// the notice period is refunded pro-rata. This protects the company (it retains
// the notice-period portion) and the consumer (the unused balance is returned).
//
// Pure/deterministic on purpose so the math is unit-testable and identical on
// the server action and any preview. No I/O here — callers supply the real paid
// amount (from Paystack) and term length.

export function noticeMonthsForPeriod(period: string): number {
  // Yearly (and the 6-month term) carry a 2-month notice; monthly is 1 month.
  return period === "monthly" ? 1 : 2
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

export type CancellationOutcome = {
  // When access is cut off: end of the notice period, never past the paid term.
  accessEndsAt: Date
  // Pro-rata balance to refund from the last payment, in minor units (cents).
  // 0 when the notice period consumes the rest of the term (typical for monthly).
  refundCents: number
  noticeMonths: number
}

// Compute the access cut-off and the refundable balance for a cancellation.
//
// The refund is computed strictly against the LAST payment's window, because a
// Paystack refund can only ever reverse that one transaction. Older stacked
// time (from earlier renewals) sits before the last term's start and is not
// refundable through this transaction, so the refundable window is clamped to
// the last term's start.
export function computeCancellationOutcome(input: {
  now: Date
  termEndsAt: Date // current access end (may include stacked renewals)
  lastPaymentCents: number // real amount of the last charge (discount-aware)
  lastTermMonths: number // months the last payment granted (incl. bonus months)
  period: string
}): CancellationOutcome {
  const noticeMonths = noticeMonthsForPeriod(input.period)
  const nowMs = input.now.getTime()
  const termEndMs = input.termEndsAt.getTime()

  // Notice ends this far out, but never past the paid term end.
  const noticeEndMs = Math.min(addMonths(input.now, noticeMonths).getTime(), termEndMs)
  const accessEndsAt = new Date(Math.max(noticeEndMs, nowMs))

  const lastTermStartMs = addMonths(input.termEndsAt, -input.lastTermMonths).getTime()
  const lastTermMs = termEndMs - lastTermStartMs

  let refundCents = 0
  if (lastTermMs > 0 && input.lastPaymentCents > 0) {
    const refundStartMs = Math.max(noticeEndMs, lastTermStartMs)
    const refundMs = Math.max(0, termEndMs - refundStartMs)
    refundCents = Math.round((input.lastPaymentCents * refundMs) / lastTermMs)
    // Never refund more than was actually charged on that transaction.
    refundCents = Math.max(0, Math.min(input.lastPaymentCents, refundCents))
  }

  return { accessEndsAt, refundCents, noticeMonths }
}
