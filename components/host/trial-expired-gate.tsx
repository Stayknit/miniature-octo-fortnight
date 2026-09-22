'use client'

import { authClient } from '@/lib/auth-client'
import { purgeAppCaches } from '@/lib/pwa-cache'
import { PERIODS, isPaid, periodFor, planFor } from '@/lib/plans'
import { applyPriceOverrides, formatMoney, periodPricing } from '@/lib/pricing'
import type { BillingPeriod, PlanDef, PlanKey, StayKnitData } from '@/lib/types'
import { LockKeyhole, LogOut, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Wordmark } from '@/components/wordmark'
import { PlanCheckout } from './plan-checkout'
import { PromoCodeBar } from './promo-code-bar'

const ENTERPRISE_EMAIL = 'info@stayknit.org'

// Purchasable tiers, in display order (paid tiers + Enterprise). Trial is never
// offered here — the whole point of this gate is that the trial has ended.
const TIER_KEYS: PlanKey[] = ['starter', 'host', 'professional', 'business', 'enterprise']

// A non-dismissible overlay shown when a host's free trial has lapsed. It sits
// above the entire app (which stays visible but frozen behind it) and forces a
// subscription. Choosing a plan opens the same embedded PlanCheckout used on the
// Plan tab; a successful payment refreshes the page, clearing the gate.
export function TrialExpiredGate({ data }: { data: StayKnitData }) {
  const router = useRouter()
  const currency = data.billingCurrency
  const [period, setPeriod] = useState<BillingPeriod>('yearly')
  const [checkout, setCheckout] = useState<{ plan: PlanDef; period: BillingPeriod } | null>(null)

  const tiers = TIER_KEYS.map((k) => applyPriceOverrides(planFor(k), data.priceOverrides))

  function choose(plan: PlanDef) {
    if (plan.custom) {
      window.location.href = `mailto:${ENTERPRISE_EMAIL}?subject=${encodeURIComponent('StayKnit Enterprise enquiry')}`
      return
    }
    if (isPaid(plan.key)) setCheckout({ plan, period })
  }

  async function signOut() {
    await authClient.signOut()
    await purgeAppCaches()
    router.push('/sign-in')
    router.refresh()
  }

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-background/92 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trial-expired-title"
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-8 lg:py-12">
        {/* Header */}
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border-strong bg-surface-2">
            <LockKeyhole className="text-warning" size={26} />
          </span>
          <div className="flex items-center gap-2.5">
            <Wordmark size={26} />
          </div>
          <div>
            <p className="mono-label text-[10px] text-warning">Free trial ended</p>
            <h1 id="trial-expired-title" className="mt-1.5 font-sans text-2xl font-extrabold sm:text-3xl">
              Subscribe to keep using StayKnit
            </h1>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">
              Your free trial is over, so calendar sync, bookings, owner statements, and every other tool are paused.
              Choose a plan below to unlock your workspace again — all your listings and data are safe and waiting.
            </p>
          </div>
        </div>

        {/* Billing period toggle */}
        <div className="flex flex-col items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-surface-2 p-1">
            {PERIODS.map((p) => {
              const active = p.key === period
              return (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`mono-label flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[10px] transition-colors ${
                    active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {p.name}
                </button>
              )
            })}
          </div>
          <p className="mono-label text-[9px] text-muted-foreground">
            Prices shown in {currency.toUpperCase()} for your region
          </p>
        </div>

        {/* Access-code redemption: a user we've invited can unlock instantly
            with a code instead of paying, and the same bar accepts promo codes. */}
        <div className="mx-auto w-full max-w-md">
          <PromoCodeBar />
        </div>

        {/* Tier cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiers.map((p) => {
            const popular = p.key === 'host'
            const pricing = p.custom ? null : periodPricing(p, currency, period)
            return (
              <div
                key={p.key}
                className={`relative flex flex-col rounded-xl border p-4 ${
                  popular ? 'border-primary bg-primary-dim' : 'border-border bg-surface-2'
                }`}
              >
                {popular && (
                  <span className="mono-label absolute -top-2 left-4 rounded bg-primary px-2 py-0.5 text-[8px] text-primary-foreground">
                    Most popular
                  </span>
                )}
                <div className="flex items-center justify-between">
                  <p className="font-sans text-[15px] font-bold">{p.name}</p>
                  <span className="mono-label text-[9px] text-muted-foreground">
                    {p.custom ? '50+' : p.unitCap >= 999 ? 'unlimited' : `${p.unitCap} listing${p.unitCap > 1 ? 's' : ''}`}
                  </span>
                </div>

                <div className="mt-2 min-h-[3.25rem]">
                  {p.custom ? (
                    <span className="font-sans text-2xl font-extrabold">Custom</span>
                  ) : (
                    <>
                      <div className="flex items-end gap-1.5">
                        <span className="font-sans text-2xl font-extrabold">{pricing!.totalLabel}</span>
                        <span className="mono-label pb-1 text-[9px] text-muted-foreground">
                          {formatMoney(pricing!.perMonthCents, pricing!.currency)} / mo
                        </span>
                      </div>
                      <p className="mono-label mt-0.5 text-[8px] text-muted-foreground">
                        {period === 'monthly' ? 'billed monthly' : `one-time · ${pricing!.accessMonths} months access`}
                      </p>
                      {pricing!.discountPct > 0 ? (
                        <p className="mono-label mt-1.5 inline-flex items-center gap-1 rounded bg-primary-dim px-1.5 py-0.5 text-[9px] text-primary">
                          <Sparkles size={10} /> {pricing!.discountPct}% off · save{' '}
                          {formatMoney(pricing!.savedCents, pricing!.currency)}
                        </p>
                      ) : pricing!.freeMonths > 0 ? (
                        <p className="mono-label mt-1.5 inline-flex items-center gap-1 rounded bg-primary-dim px-1.5 py-0.5 text-[9px] text-primary">
                          <Sparkles size={10} /> {pricing!.freeMonths} month{pricing!.freeMonths > 1 ? 's' : ''} free
                        </p>
                      ) : (
                        <p className="mono-label mt-1.5 text-[9px] text-muted-foreground">Cancel anytime</p>
                      )}
                    </>
                  )}
                </div>

                <p className="mt-2 flex-1 text-[12px] leading-relaxed text-muted-foreground">{p.blurb}</p>

                <button
                  onClick={() => choose(p)}
                  className={`mono-label mt-3 flex items-center justify-center gap-1.5 rounded-lg py-3 text-[10px] transition-colors ${
                    popular
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border-strong text-primary hover:border-primary'
                  }`}
                >
                  <Sparkles size={13} /> {p.custom ? 'Contact sales' : `Choose ${p.name}`}
                </button>
              </div>
            )
          })}
        </div>

        <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
          Flat subscription only — StayKnit never takes a cut of your bookings. Prepaid terms are billed once with no
          auto-renewal. The 6-month term is 10% off and the 12-month term includes bonus free months.
        </p>

        {/* Escape hatch: the host isn't trapped — they can still sign out. */}
        <div className="flex justify-center">
          <button
            onClick={signOut}
            className="mono-label flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </div>

      {checkout && (
        <PlanCheckout
          plan={checkout.plan}
          period={checkout.period}
          priceLabel={periodPricing(checkout.plan, currency, checkout.period).totalLabel}
          discountPct={periodPricing(checkout.plan, currency, checkout.period).discountPct}
          onClose={(activated) => {
            setCheckout(null)
            // A successful subscription clears the trial-expired state; reload so
            // the server re-evaluates the gate and the frozen app comes back.
            if (activated) router.refresh()
          }}
        />
      )}
    </div>
  )
}
