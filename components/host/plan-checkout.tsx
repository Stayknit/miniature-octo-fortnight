'use client'

import { confirmPlanCheckout, startPlanCheckout } from '@/app/actions/stayknit'

// True when the app is built with a Paystack TEST public key. Inlined at build
// time, so it reflects whatever key was present when the deployment was built —
// exactly what matters, since payments won't be real until live keys ship. Used
// to badge the checkout so test keys can never be mistaken for real charges.
const IS_PAYSTACK_TEST_MODE = (process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? '').startsWith('pk_test_')
import { periodFor } from '@/lib/plans'
import type { BillingPeriod, PlanDef } from '@/lib/types'
import { Check, CreditCard, FileText, Loader2, X } from 'lucide-react'
import { useCallback, useState } from 'react'

// Prepaid 6- and 12-month terms are charged upfront, so the host must accept
// the terms before any payment is started. Monthly is cancel-anytime and skips
// straight to payment.
type Phase = 'terms' | 'pay' | 'confirming' | 'done' | 'error'

// Paystack inline checkout for a paid plan, shown in a modal. The transaction
// is initialized server-side (returning an opaque access code); the popup
// collects payment, then we re-verify the reference server-side before the plan
// is activated.
export function PlanCheckout({
  plan,
  period,
  priceLabel,
  discountPct = 0,
  promoPct = 0,
  onClose,
}: {
  plan: PlanDef
  period: BillingPeriod
  priceLabel?: string
  discountPct?: number
  promoPct?: number
  onClose: (activated: boolean) => void
}) {
  // Upfront terms (six_month / yearly) require agreement first; monthly does not.
  const upfront = period !== 'monthly'
  const term = periodFor(period)
  const accessMonths = term.months + term.bonusMonths
  const [phase, setPhase] = useState<Phase>(upfront ? 'terms' : 'pay')
  const [agreed, setAgreed] = useState(false)
  // Opt-in auto-renewal — OFF by default so nothing recurs unless the host
  // deliberately chooses it. When on, the saved card is charged for the same
  // term shortly before it ends; can be turned off anytime from the plan screen.
  const [autoRenew, setAutoRenew] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The payment provider's own reason for a failed start, shown as a secondary
  // line under the main message when present (e.g. "Currency not supported").
  const [errorDetail, setErrorDetail] = useState<string | null>(null)

  const confirm = useCallback(
    async (reference: string) => {
      setPhase('confirming')
      const res = await confirmPlanCheckout(reference)
      if (res.ok) {
        setPhase('done')
        // Give the success state a beat, then close and refresh the plan view.
        setTimeout(() => onClose(true), 1400)
      } else {
        setError('We could not confirm your payment. If you were charged, it will be applied automatically shortly.')
        setPhase('error')
      }
    },
    [onClose],
  )

  const startPayment = useCallback(async () => {
    setError(null)
    setErrorDetail(null)
    setPhase('confirming')
    try {
      const result = await startPlanCheckout(plan.key, period, autoRenew)
      if (!result.ok) {
        // Expected, server-classified failure (provider declined, not
        // configured, etc.). Show its clean message — never a raw error.
        setError(result.error)
        setErrorDetail(result.detail ?? null)
        setPhase('error')
        return
      }
      // Loaded lazily on click (browser only): @paystack/inline-js touches
      // `window` at module load, which would crash server-side rendering.
      const { default: PaystackPop } = await import('@paystack/inline-js')
      const popup = new PaystackPop()
      popup.resumeTransaction(result.accessCode, {
        onSuccess: (tx) => {
          void confirm(tx.reference)
        },
        onCancel: () => {
          // Host closed the popup without paying — return to the pay step.
          setPhase('pay')
        },
        onError: (err) => {
          setError(err?.message || 'Payment could not be started. Please try again.')
          setPhase('error')
        },
      })
    } catch {
      // Transport-level failure reaching the server action (rare). Deliberately
      // generic so a minified React digest (#441) can never reach the screen.
      setError('Payment could not be started. Please check your connection and try again.')
      setPhase('error')
    }
  }, [plan.key, period, autoRenew, confirm])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Subscribe to ${plan.name}`}
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border-strong bg-panel sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="mono-label text-[9px] text-muted-foreground">Subscribe · {periodFor(period).name}</p>
              {IS_PAYSTACK_TEST_MODE && (
                <span className="mono-label rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 text-[8px] text-warning">
                  Test mode
                </span>
              )}
            </div>
            <p className="font-sans text-lg font-extrabold">
              {plan.name}
              {priceLabel ? ` · ${priceLabel}` : ''}
            </p>
          </div>
          <button
            onClick={() => onClose(false)}
            aria-label="Close"
            className="rounded-md border border-border p-2 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <X size={16} />
          </button>
        </div>

        {phase === 'terms' && (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="flex items-center gap-2 text-foreground">
              <FileText size={16} className="text-primary" />
              <p className="font-sans text-[15px] font-bold">Subscription terms</p>
            </div>
            <ul className="mt-3 flex flex-col gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
              <li className="flex gap-2">
                <Check size={15} className="mt-0.5 shrink-0 text-primary" />
                <span>
                  This is a <span className="font-semibold text-foreground">one-time upfront payment</span> for the full{' '}
                  {term.name.toLowerCase()} term — paid in full today, not billed monthly.
                </span>
              </li>
              <li className="flex gap-2">
                <Check size={15} className="mt-0.5 shrink-0 text-primary" />
                <span>
                  You receive <span className="font-semibold text-foreground">{accessMonths} months of access</span> in
                  total{term.bonusMonths > 0 ? `, including ${term.bonusMonths} bonus month${term.bonusMonths > 1 ? 's' : ''} free` : ''}.
                </span>
              </li>
              {discountPct > 0 && (
                <li className="flex gap-2">
                  <Check size={15} className="mt-0.5 shrink-0 text-primary" />
                  <span>
                    This term includes a{' '}
                    <span className="font-semibold text-foreground">{discountPct}% discount</span> off the standard
                    monthly rate, already applied to the total above.
                  </span>
                </li>
              )}
              {promoPct > 0 && (
                <li className="flex gap-2">
                  <Check size={15} className="mt-0.5 shrink-0 text-primary" />
                  <span>
                    Your <span className="font-semibold text-foreground">{promoPct}% promo discount</span> is applied to
                    the total above.
                  </span>
                </li>
              )}
              <li className="flex gap-2">
                <Check size={15} className="mt-0.5 shrink-0 text-primary" />
                <span>
                  The prepaid term is non-refundable and{' '}
                  <span className="font-semibold text-foreground">does not auto-renew unless you choose to</span> on the
                  next step. If you don&apos;t, access reverts to the free trial when the term ends unless you buy again.
                </span>
              </li>
            </ul>

            <label className="mt-5 flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-surface-2 px-3.5 py-3">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
              />
              <span className="text-[13px] text-foreground">
                I understand and accept the upfront, non-refundable subscription terms above.
              </span>
            </label>

            <button
              disabled={!agreed}
              onClick={() => setPhase('pay')}
              className="mono-label mt-4 w-full rounded-lg bg-primary py-3 text-[10px] text-primary-foreground transition-opacity disabled:opacity-50"
            >
              Continue to payment
            </button>
          </div>
        )}

        {phase === 'pay' && (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-dim">
                <CreditCard className="text-primary" size={24} />
              </span>
              <div>
                <p className="font-sans text-base font-bold">
                  Pay {priceLabel ? priceLabel : `for ${plan.name}`}
                </p>
                {promoPct > 0 && (
                  <p className="mono-label mt-1 text-[9px] text-primary">{promoPct}% promo discount applied</p>
                )}
                <p className="mt-1 text-[13px] text-muted-foreground">
                  You&apos;ll complete payment securely with Paystack — card, or bank transfer. Your subscription
                  activates the moment payment succeeds.
                </p>
              </div>

              <label className="flex w-full cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-surface-2 px-3.5 py-3 text-left">
                <input
                  type="checkbox"
                  checked={autoRenew}
                  onChange={(e) => setAutoRenew(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
                />
                <span className="text-[13px] text-muted-foreground">
                  <span className="font-semibold text-foreground">Auto-renew when this term ends.</span> We&apos;ll charge
                  your card {priceLabel ? `${priceLabel} ` : ''}every {term.name.toLowerCase()} so your account never
                  lapses. Optional — off by default, and you can turn it off anytime from your plan. Requires paying by
                  card.
                </span>
              </label>

              <button
                onClick={startPayment}
                className="mono-label mt-1 w-full rounded-lg bg-primary py-3 text-[10px] text-primary-foreground"
              >
                Pay now
              </button>
            </div>
          </div>
        )}

        {phase === 'confirming' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <Loader2 className="animate-spin text-primary" size={28} />
            <p className="text-[13px]">Confirming your subscription…</p>
          </div>
        )}

        {phase === 'done' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-dim">
              <Check className="text-primary" size={26} />
            </span>
            <p className="font-sans text-base font-bold">You&apos;re subscribed</p>
            <p className="text-[13px] text-muted-foreground">Your {plan.name} plan is now active.</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <X className="text-destructive" size={26} />
            </span>
            <p className="text-[13px] text-muted-foreground">{error}</p>
            {errorDetail && (
              <p className="mono-label max-w-[18rem] text-[9px] leading-relaxed text-muted-foreground/70">
                {errorDetail}
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setPhase('pay')}
                className="mono-label rounded-lg bg-primary px-5 py-2.5 text-[10px] text-primary-foreground"
              >
                Try again
              </button>
              <button
                onClick={() => onClose(false)}
                className="mono-label rounded-lg border border-border px-5 py-2.5 text-[10px] text-muted-foreground"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
