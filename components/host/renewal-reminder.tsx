'use client'

import { PlanCheckout } from './plan-checkout'
import { daysUntilAccessEnd, planFor } from '@/lib/plans'
import { applyPriceOverrides, formatMoney, periodPricing } from '@/lib/pricing'
import type { BillingPeriod, StayKnitData } from '@/lib/types'
import { CalendarClock, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

// A non-blocking reminder shown when a host's PAID term is ending within the
// reminder window (see isExpiringSoon). The host still has full access, so this
// is a dismissible nudge — not the trial-expired freeze. "Renew now" reuses the
// same embedded PlanCheckout and, because activation stacks onto the remaining
// term, renewing early never loses the days still left.
export function RenewalReminder({ data }: { data: StayKnitData }) {
  const router = useRouter()
  const sub = data.subscription
  const currency = data.billingCurrency
  const plan = applyPriceOverrides(planFor(sub.plan), data.priceOverrides)
  const period = sub.billingPeriod as BillingPeriod
  const daysLeft = daysUntilAccessEnd(sub) ?? 0

  // Dismissed reminders are remembered for the browser session, keyed by the
  // exact access-end date — so if the host renews (new cancelAt) or a new term
  // approaches, the reminder returns rather than staying hidden forever.
  const dismissKey = `sk-renewal-dismissed:${sub.cancelAt ? new Date(sub.cancelAt).toISOString() : 'none'}`
  const [open, setOpen] = useState(false)
  const [checkout, setCheckout] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (sessionStorage.getItem(dismissKey) !== '1') setOpen(true)
  }, [dismissKey])

  function dismiss() {
    if (typeof window !== 'undefined') sessionStorage.setItem(dismissKey, '1')
    setOpen(false)
  }

  if (!open) return null

  const pricing = periodPricing(plan, currency, period)
  const endLabel = sub.cancelAt
    ? new Date(sub.cancelAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
    : ''
  const urgent = daysLeft <= 3

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="renewal-title"
      >
        <div className="relative flex w-full max-w-md flex-col gap-5 rounded-2xl border border-border-strong bg-surface-1 p-6 shadow-2xl">
          <button
            onClick={dismiss}
            aria-label="Dismiss reminder"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <X size={16} />
          </button>

          <span
            className={`flex h-12 w-12 items-center justify-center rounded-xl border ${
              urgent ? 'border-danger/40 bg-danger/10' : 'border-warning/40 bg-warning/10'
            }`}
          >
            <CalendarClock className={urgent ? 'text-danger' : 'text-warning'} size={24} />
          </span>

          <div>
            <p className={`mono-label text-[10px] ${urgent ? 'text-danger' : 'text-warning'}`}>
              {daysLeft <= 0 ? 'Ending today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
            </p>
            <h2 id="renewal-title" className="mt-1.5 font-sans text-xl font-extrabold">
              Your {plan.name} plan is expiring
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Access ends on <span className="font-semibold text-foreground">{endLabel}</span>, after which calendar
              sync, bookings, and owner statements will pause. Renew now to keep everything running — the new term is
              added on top of the days you still have left, so you lose nothing by renewing early.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-4 py-3">
            <div>
              <p className="font-sans text-sm font-bold">{plan.name}</p>
              <p className="mono-label text-[9px] text-muted-foreground">
                {period === 'monthly' ? 'billed monthly' : `${pricing.accessMonths} months access`}
              </p>
            </div>
            <div className="text-right">
              <p className="font-sans text-lg font-extrabold">{pricing.totalLabel}</p>
              <p className="mono-label text-[9px] text-muted-foreground">
                {formatMoney(pricing.perMonthCents, pricing.currency)} / mo
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => setCheckout(true)}
              className="mono-label flex items-center justify-center gap-2 rounded-lg bg-primary py-3 text-[10px] text-primary-foreground transition-opacity hover:opacity-90"
            >
              <CalendarClock size={14} /> Renew {plan.name} now
            </button>
            <button
              onClick={dismiss}
              className="mono-label rounded-lg py-2.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Remind me later
            </button>
          </div>
        </div>
      </div>

      {checkout && (
        <PlanCheckout
          plan={plan}
          period={period}
          priceLabel={pricing.totalLabel}
          discountPct={pricing.discountPct}
          onClose={(activated) => {
            setCheckout(false)
            if (activated) {
              // Renewal extended the term; refresh so the server re-reads the new
              // cancelAt and this reminder stops showing.
              if (typeof window !== 'undefined') sessionStorage.removeItem(dismissKey)
              router.refresh()
            }
          }}
        />
      )}
    </>
  )
}
