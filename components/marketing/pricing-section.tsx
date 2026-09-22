'use client'

import { useState } from 'react'
import { ArrowRight, Check, ChevronDown } from 'lucide-react'
import type { BillingPeriod, CurrencyCode, PriceOverrides } from '@/lib/types'
import { PLANS, PERIODS } from '@/lib/plans'
import { CURRENCIES, applyPriceOverrides, formatMoney, periodPricing } from '@/lib/pricing'
import { CtaLink } from '@/components/marketing/cta-link'
import { cn } from '@/lib/utils'

const ENTERPRISE_EMAIL = 'info@stayknit.org'

// Currencies offered on the public page. ZAR leads as the home-region default.
// NAD is billed as ZAR in-app, so it is not shown as a separate marketing option.
const CURRENCY_CHOICES: CurrencyCode[] = ['zar', 'usd', 'eur', 'gbp']

function unitLabel(cap: number): string {
  if (cap === 1) return '1 listing'
  if (cap >= 999) return '30+ listings'
  return `Up to ${cap} listings`
}

export function PricingSection({ overrides }: { overrides?: PriceOverrides } = {}) {
  const [period, setPeriod] = useState<BillingPeriod>('yearly')
  const [currency, setCurrency] = useState<CurrencyCode>('zar')
  // Prices are hidden by default: the section leads with a single flat-rate
  // statement + CTA, and the full tier grid is revealed on demand.
  const [showAll, setShowAll] = useState(false)

  // Tiers with any operator price overrides merged in, so the public page shows
  // the same fee checkout charges.
  const plans = PLANS.map((plan) => applyPriceOverrides(plan, overrides))

  // Lowest paid entry point, reactive to the selected currency/period, so the
  // "from" figure always matches what the expanded grid would show.
  const paidPlans = plans.filter((plan) => !plan.custom && plan.key !== 'trial')
  const fromCents = Math.min(
    ...paidPlans.map((plan) => periodPricing(plan, currency, period).effectivePerMonthCents),
  )

  return (
    <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <span className="mono-label text-xs text-primary">Flat monthly pricing</span>
        <h2 className="mt-3 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
          Pay for listings, not for bookings
        </h2>
        <p className="mt-4 text-pretty text-lg text-muted-foreground">
          Every plan includes every feature. You are only ever charged by how many listings you
          manage — never a commission on what you earn.
        </p>
      </div>

      {/* Headline rate + primary CTA (always visible) */}
      <div className="mx-auto mt-10 flex max-w-md flex-col items-center rounded-2xl border border-primary/40 bg-surface p-8 text-center ring-1 ring-primary/20">
        <p className="mono-label text-xs text-muted-foreground">Plans from</p>
        <p className="mt-2 text-5xl font-extrabold tracking-tight">
          {formatMoney(fromCents, currency)}
          <span className="text-lg font-medium text-muted-foreground"> / mo</span>
        </p>
        <div
          className="mt-4 inline-flex rounded-lg border border-border bg-background p-1"
          role="group"
          aria-label="Preview pricing currency"
        >
          {CURRENCY_CHOICES.map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={currency === code}
              onClick={() => setCurrency(code)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-semibold uppercase transition-colors',
                currency === code
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {CURRENCIES[code].symbol} {code}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {currency === 'zar'
            ? 'Billed in ZAR (South African Rand).'
            : `Approximate — all plans are billed in ZAR (South African Rand); ${currency.toUpperCase()} shown for reference only.`}
        </p>
        <p className="mt-3 text-pretty text-sm text-muted-foreground">
          Start free for 14 days — no card required. You only pay when you choose to confirm a paid plan.
        </p>
        <CtaLink href="/sign-up" variant="primary" className="mt-6 w-full">
          Start free trial
          <ArrowRight className="size-4" />
        </CtaLink>
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          aria-controls="pricing-grid"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
        >
          {showAll ? 'Hide full pricing' : 'See full pricing'}
          <ChevronDown className={cn('size-4 transition-transform', showAll && 'rotate-180')} />
        </button>
      </div>

      {showAll && (
        <div id="pricing-grid">
          {/* Controls */}
          <div className="mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <div
              role="tablist"
              aria-label="Billing period"
              className="inline-flex rounded-lg border border-border bg-surface p-1"
            >
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  role="tab"
                  aria-selected={period === p.key}
                  onClick={() => setPeriod(p.key)}
                  className={cn(
                    'rounded-md px-3.5 py-1.5 text-sm font-semibold transition-colors',
                    period === p.key
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {p.name}
                  {p.discountPct > 0 && ` · −${p.discountPct}%`}
                  {p.bonusMonths > 0 && ` · +${p.bonusMonths} mo`}
                </button>
              ))}
            </div>

            <div className="inline-flex rounded-lg border border-border bg-surface p-1">
              {CURRENCY_CHOICES.map((code) => (
                <button
                  key={code}
                  aria-pressed={currency === code}
                  onClick={() => setCurrency(code)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-semibold uppercase transition-colors',
                    currency === code
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {CURRENCIES[code].symbol} {code}
                </button>
              ))}
            </div>
          </div>

          {/* Cards */}
          <ul className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => {
              const isTrial = plan.key === 'trial'
              const isEnterprise = plan.custom
              const featured = plan.key === 'host'
              const pricing = periodPricing(plan, currency, period)

              return (
                <li
                  key={plan.key}
                  className={cn(
                    'flex flex-col rounded-xl border bg-surface p-6',
                    featured ? 'border-primary ring-1 ring-primary/40' : 'border-border',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">{plan.name}</h3>
                    {featured && (
                      <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
                        Popular
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{unitLabel(plan.unitCap)}</p>

                  <div className="mt-5 min-h-[68px]">
                    {isTrial && (
                      <>
                        <p className="text-3xl font-extrabold tracking-tight">Free</p>
                        <p className="mt-1 text-sm text-muted-foreground">14 days, no charge until you subscribe</p>
                      </>
                    )}
                    {isEnterprise && (
                      <>
                        <p className="text-3xl font-extrabold tracking-tight">Custom</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Tailored to your portfolio
                        </p>
                      </>
                    )}
                    {!isTrial && !isEnterprise && (
                      <>
                        <p className="text-3xl font-extrabold tracking-tight">
                          {formatMoney(pricing.effectivePerMonthCents, pricing.currency)}
                          <span className="text-base font-medium text-muted-foreground"> / mo</span>
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {period === 'monthly'
                            ? 'billed monthly'
                            : `${pricing.totalLabel} billed upfront · ${pricing.accessMonths} mo access`}
                        </p>
                      </>
                    )}
                  </div>

                  <div className="mt-5">
                    {isEnterprise ? (
                      <CtaLink
                        href={`mailto:${ENTERPRISE_EMAIL}?subject=${encodeURIComponent('StayKnit Enterprise enquiry')}`}
                        variant="outline"
                        className="w-full"
                      >
                        Contact sales
                      </CtaLink>
                    ) : (
                      <CtaLink
                        href="/sign-up"
                        variant={featured ? 'primary' : 'outline'}
                        className="w-full"
                      >
                        {isTrial ? 'Start free' : 'Start trial'}
                        <ArrowRight className="size-4" />
                      </CtaLink>
                    )}
                  </div>

                  <p className="mt-4 border-t border-border pt-4 text-sm leading-relaxed text-muted-foreground">
                    {plan.blurb}
                  </p>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <p className="mt-8 flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
        <Check className="size-4 text-primary" />
        Prepaid terms — auto-renewal is optional and off by default, so no surprise charges. Payments secured by
        Paystack.
      </p>
    </section>
  )
}
