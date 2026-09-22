'use client'

import { PERIODS, isPaid, periodFor, planFor, trialDaysLeft } from '@/lib/plans'
import { applyPriceOverrides, applyPromoPct, formatMoney, periodPricing } from '@/lib/pricing'
import type { BillingPeriod, PlanDef, PlanKey, StayKnitData } from '@/lib/types'
import { Ban, Building2, CalendarClock, Check, CreditCard, Infinity as InfinityIcon, Lock, RefreshCw, RotateCcw, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { WhoWeAre } from '@/components/who-we-are'
import { setAutoRenew, setPlanCancellation } from '@/app/actions/stayknit'
import { noticeMonthsForPeriod } from '@/lib/billing/cancellation'
import { PlanCheckout } from './plan-checkout'
import { PromoCodeBar } from './promo-code-bar'
import { TrialCardCapture } from './trial-card-capture'

const ENTERPRISE_EMAIL = 'info@stayknit.org'

// Caption under each price. Monthly recurs; prepaid terms are a one-time charge
// that unlocks a fixed window of access (paid months + bonus free months).
function accessCaption(period: BillingPeriod, accessMonths: number): string {
  if (period === 'monthly') return 'billed monthly'
  return `one-time · ${accessMonths} months access`
}

function formatDate(d: Date | string | null): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Exact money incl. cents for the pro-rata refund note (a balance is rarely a
// whole Rand). Mirrors the admin panels' formatter.
function money(amountCents: number, currency: string): string {
  const symbol = currency === 'ZAR' ? 'R' : currency === 'EUR' ? '€' : currency === 'USD' ? '$' : `${currency} `
  return `${symbol}${(amountCents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function PlanScreen({ data }: { data: StayKnitData }) {
  const router = useRouter()
  const [checkout, setCheckout] = useState<{ plan: PlanDef; period: BillingPeriod } | null>(null)
  const [cardCapture, setCardCapture] = useState(false)

  const sub = data.subscription
  // Whether a reusable card is already on file (from a prior charge or a saved
  // trial card). Derived from the opaque authorization token — never shown.
  const hasSavedCard = Boolean(sub.paystackAuthCode)
  // The billing period the host is browsing. Defaults to their current one, or
  // yearly (best value) for trial users.
  const [period, setPeriod] = useState<BillingPeriod>(
    (sub.billingPeriod as BillingPeriod) && isPaid(sub.plan) ? (sub.billingPeriod as BillingPeriod) : 'yearly',
  )

  // StayKnit settles in ZAR only, so what the host sees equals what Paystack
  // charges (data.billingCurrency is always 'zar'). Any foreign currency is
  // only an approximate conversion elsewhere, never the billing source.
  const currency = data.billingCurrency

  // Best discount the host holds from redeemed promo codes, computed
  // server-side and passed down so the prices shown match what checkout charges.
  const checkoutDiscountPct = data.checkoutDiscountPct ?? 0

  const current = planFor(sub.plan)
  const daysLeft = trialDaysLeft(sub)
  const unitsUsed = data.properties.length
  const cap = current.unitCap
  const overCap = cap < 999 && unitsUsed > cap

  // The fixed end of the prepaid term; access reverts to trial afterwards.
  const accessEndsAt = sub.cancelAt ? new Date(sub.cancelAt) : null
  const paidActive = isPaid(sub.plan) && sub.status === 'active'
  // Whether the host has cancelled the current term (keeps paid access to the
  // end date, then reverts). Drives the cancel/resume controls below.
  const canceled = Boolean(sub.canceledAt)
  // Opt-in auto-renewal state for the current term. Effectively inactive while
  // the term is cancelled (the cron skips cancelled subs), so the toggle only
  // shows when the plan is live and not cancelled.
  const autoRenewOn = Boolean(sub.autoRenew)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [renewNote, setRenewNote] = useState<string | null>(null)
  const [cancelNote, setCancelNote] = useState<string | null>(null)
  const [busy, startBilling] = useTransition()

  // Notice period for the current term, used in the pre-cancel copy: 1 month for
  // monthly, 2 months for yearly (and 6-month) terms.
  const noticeMonths = noticeMonthsForPeriod(sub.billingPeriod)

  function cancelPlan() {
    startBilling(async () => {
      const res = await setPlanCancellation(true)
      setConfirmCancel(false)
      if (res.ok && res.refundPending && res.refundAmountCents) {
        setCancelNote(
          `Plan cancelled. We've requested a ${money(res.refundAmountCents, res.refundCurrency ?? currency)} pro-rata refund of your unused balance — it's reviewed and released by StayKnit, then reflects on your card within 5–10 business days, depending on your bank.`,
        )
      } else if (res.ok) {
        setCancelNote(null)
      }
      router.refresh()
    })
  }
  function resumePlan() {
    startBilling(async () => {
      await setPlanCancellation(false)
      setCancelNote(null)
      router.refresh()
    })
  }
  function toggleAutoRenew(enabled: boolean) {
    setRenewNote(null)
    startBilling(async () => {
      const res = await setAutoRenew(enabled)
      if (!res.ok && res.reason === 'no_card') {
        setRenewNote('Auto-renewal needs a saved card. Renew once by card to switch it on.')
        return
      }
      router.refresh()
    })
  }

  // Cards cover the paid tiers plus Enterprise; trial is never a purchasable card.
  // Operator price overrides are merged in so the cards (and the checkout they
  // open) show exactly what Paystack will charge.
  const tiers = tierCards().map((p) => applyPriceOverrides(p, data.priceOverrides))

  function choose(plan: PlanDef) {
    if (plan.custom) {
      window.location.href = `mailto:${ENTERPRISE_EMAIL}?subject=${encodeURIComponent('StayKnit Enterprise enquiry')}`
      return
    }
    if (isPaid(plan.key)) setCheckout({ plan, period })
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-5 pt-4 lg:px-8 lg:pt-6">
      <div>
        <h1 className="font-sans text-2xl font-extrabold">Plan</h1>
        <p className="mono-label mt-1 text-[10px] text-muted-foreground">No booking commission, ever</p>
      </div>

      {/* Current status */}
      <div className="rounded-xl border border-border-strong bg-surface-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="mono-label text-[9px] text-muted-foreground">Current plan</p>
            <p className="mt-1 font-sans text-xl font-extrabold">
              {current.name}
              {paidActive && <span className="text-muted-foreground"> · {periodFor(sub.billingPeriod).name}</span>}
            </p>
          </div>
          <span
            className="mono-label rounded px-2 py-1 text-[9px]"
            style={{
              color: sub.status === 'active' ? 'var(--primary)' : 'var(--warning)',
              background: sub.status === 'active' ? 'var(--primary-dim)' : 'transparent',
              border: sub.status === 'active' ? 'none' : '1px solid var(--warning)',
            }}
          >
            {sub.status === 'active' ? 'Active' : 'Trial'}
          </span>
        </div>

        {daysLeft !== null && (
          <p className="mt-2 text-[13px] text-muted-foreground">
            {daysLeft > 0 ? (
              <>
                <span className="font-semibold text-foreground">{daysLeft} days</span> left on your free trial.
              </>
            ) : (
              'Your free trial has ended — choose a plan to keep syncing.'
            )}
          </p>
        )}

        {/* Listings live vs total: how many of the host's units are actually
            syncing (capped by the plan) out of everything they've added. Ordered
            live-of-total so it never reads backwards, e.g. "1 of 5 live". */}
        <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-panel px-3.5 py-3">
          <span className="flex items-center gap-2 text-[13px]">
            {cap >= 999 ? <InfinityIcon size={15} className="text-primary" /> : <Lock size={14} className="text-warning" />}
            Listings syncing
          </span>
          <span className="mono-label text-[11px]">
            <span className={overCap ? 'text-warning' : 'text-foreground'}>{cap >= 999 ? unitsUsed : Math.min(unitsUsed, cap)}</span>
            <span className="text-muted-foreground"> of {unitsUsed} live</span>
          </span>
        </div>
        {overCap && (
          <p className="mono-label mt-2 text-[9px] text-warning">
            {unitsUsed - cap} listing{unitsUsed - cap > 1 ? 's' : ''} locked — upgrade to sync them live
          </p>
        )}

        {/* Optional trial card capture — only while on trial, behind the server
            flag. Saving a card runs a R1 charge that's refunded immediately; it
            starts no subscription. When a card is already saved we confirm it
            instead of re-offering. */}
        {!paidActive && data.trialCardCaptureEnabled && (
          hasSavedCard ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-panel px-3.5 py-3">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary" />
              <span className="text-[12px] text-foreground">
                A card is <span className="font-semibold text-primary">saved</span> for your account — upgrading to a
                plan is one tap. No subscription has started and nothing is charged until you choose a plan.
              </span>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2.5 rounded-lg border border-border bg-panel px-3.5 py-3">
              <div className="flex items-start gap-2">
                <CreditCard size={15} className="mt-0.5 shrink-0 text-primary" />
                <span className="text-[12px] text-foreground">
                  <span className="font-semibold">Save a card for later (optional).</span> We verify it with a{' '}
                  <span className="font-semibold">R1</span> charge that&apos;s refunded straight away — it costs nothing
                  and starts no subscription.
                </span>
              </div>
              <button
                onClick={() => setCardCapture(true)}
                className="mono-label flex items-center justify-center gap-1.5 rounded-lg border border-border-strong py-2.5 text-[10px] text-primary transition-colors hover:border-primary"
              >
                <CreditCard size={13} /> Save a card
              </button>
            </div>
          )
        )}

        {/* Prepaid access window — one-time term with optional opt-in auto-renewal */}
        {paidActive && accessEndsAt && (
          <div className="mt-3 flex flex-col gap-3 rounded-lg border border-border bg-panel px-3.5 py-3">
            <div className="flex items-start gap-2">
              <CalendarClock size={15} className="mt-0.5 shrink-0 text-primary" />
              <span className="text-[12px] text-foreground">
                {canceled ? (
                  <>
                    Your plan is <span className="font-semibold text-warning">cancelled</span> and won&apos;t renew.
                    Access stays active through your notice period until{' '}
                    <span className="font-semibold">{formatDate(accessEndsAt)}</span>, then your account returns to the
                    free trial. Any unused prepaid balance beyond the notice is refunded pro-rata. You can resume any
                    time before then.
                  </>
                ) : autoRenewOn ? (
                  <>
                    Prepaid access is active. Auto-renewal is <span className="font-semibold text-primary">on</span> —
                    we&apos;ll charge your saved card and extend your{' '}
                    <span className="font-semibold">{periodFor(sub.billingPeriod).name.toLowerCase()}</span> term on{' '}
                    <span className="font-semibold">{formatDate(accessEndsAt)}</span>. Turn it off any time to keep the
                    prepaid model.
                  </>
                ) : (
                  <>
                    Prepaid access is active until <span className="font-semibold">{formatDate(accessEndsAt)}</span>.
                    Your plan won&apos;t auto-renew — access reverts to the free trial afterwards unless you turn on
                    auto-renewal or purchase another term.
                  </>
                )}
              </span>
            </div>

            {/* Opt-in auto-renewal toggle — only for a live, non-cancelled term. */}
            {!canceled && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => toggleAutoRenew(!autoRenewOn)}
                  disabled={busy}
                  className={`mono-label flex items-center justify-center gap-1.5 rounded-lg border py-2.5 text-[10px] transition-colors disabled:opacity-60 ${
                    autoRenewOn
                      ? 'border-border text-muted-foreground hover:border-warning hover:text-warning'
                      : 'border-border-strong text-primary hover:border-primary'
                  }`}
                >
                  <RefreshCw size={13} /> {autoRenewOn ? 'Turn off auto-renewal' : 'Turn on auto-renewal'}
                </button>
                {renewNote && <p className="mono-label text-[9px] text-warning">{renewNote}</p>}
              </div>
            )}

            {canceled ? (
              <button
                onClick={resumePlan}
                disabled={busy}
                className="mono-label flex items-center justify-center gap-1.5 rounded-lg border border-border-strong py-2.5 text-[10px] text-primary transition-colors hover:border-primary disabled:opacity-60"
              >
                <RotateCcw size={13} /> Resume plan
              </button>
            ) : confirmCancel ? (
              <div className="flex flex-col gap-2 rounded-lg border border-warning bg-surface-2 p-2.5">
                <span className="text-[12px] text-muted-foreground">
                  Cancel your plan? You keep access through a{' '}
                  <span className="font-semibold text-foreground">
                    {noticeMonths}-month notice period
                  </span>
                  , after which your account returns to the free trial. Any prepaid balance beyond the notice is
                  refunded pro-rata (reviewed and released by StayKnit), and auto-renewal is switched off so there are
                  no further charges.
                </span>
                <span className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <TriangleAlert size={12} className="mt-0.5 shrink-0 text-warning" />
                  Please note: the payment processor&apos;s transaction fee is typically not returned, so a refund may be
                  slightly less than the amount you paid.
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={cancelPlan}
                    disabled={busy}
                    className="mono-label flex-1 rounded-lg border border-warning py-2.5 text-[10px] text-warning transition-colors hover:bg-warning/10 disabled:opacity-60"
                  >
                    Yes, cancel plan
                  </button>
                  <button
                    onClick={() => setConfirmCancel(false)}
                    disabled={busy}
                    className="mono-label flex-1 rounded-lg bg-primary py-2.5 text-[10px] text-primary-foreground disabled:opacity-60"
                  >
                    Keep my plan
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmCancel(true)}
                className="mono-label flex items-center justify-center gap-1.5 rounded-lg border border-border py-2.5 text-[10px] text-muted-foreground transition-colors hover:border-warning hover:text-warning"
              >
                <Ban size={13} /> Cancel plan
              </button>
            )}

            {cancelNote && (
              <p className="mono-label flex items-start gap-1.5 text-[9px] text-primary">
                <ShieldCheck size={12} className="mt-0.5 shrink-0" /> {cancelNote}
              </p>
            )}
          </div>
        )}
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
          Billed in ZAR · foreign cards are converted by your bank at its rate
        </p>
      </div>

      {/* Redeem an access or promo code */}
      <div className="mx-auto w-full max-w-md">
        <PromoCodeBar />
      </div>

      {checkoutDiscountPct > 0 && (
        <div className="mx-auto w-full max-w-md rounded-lg border border-primary/40 bg-primary-dim px-3.5 py-2.5">
          <p className="mono-label flex items-center gap-1.5 text-[10px] text-primary">
            <Sparkles size={12} /> {checkoutDiscountPct}% promo discount applied at checkout
          </p>
        </div>
      )}

      {/* Tier cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiers.map((p) => {
          const popular = p.key === 'host'
          const isCurrent =
            sub.plan === p.key && (p.custom || (isPaid(p.key) && sub.billingPeriod === period && paidActive))
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
                <span className="mono-label flex items-center gap-1 text-[9px] text-muted-foreground">
                  {p.custom ? (
                    <>
                      <Building2 size={12} /> 50+
                    </>
                  ) : p.unitCap >= 999 ? (
                    <>
                      <InfinityIcon size={12} /> unlimited
                    </>
                  ) : (
                    `${p.unitCap} listing${p.unitCap > 1 ? 's' : ''}`
                  )}
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
                      {accessCaption(period, pricing!.accessMonths)}
                    </p>
                    {pricing!.discountPct > 0 ? (
                      <p className="mono-label mt-1.5 inline-flex items-center gap-1 rounded bg-primary-dim px-1.5 py-0.5 text-[9px] text-primary">
                        <Sparkles size={10} /> {pricing!.discountPct}% off · save {formatMoney(pricing!.savedCents, pricing!.currency)}
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
                disabled={isCurrent}
                onClick={() => choose(p)}
                className={`mono-label mt-3 flex items-center justify-center gap-1.5 rounded-lg py-3 text-[10px] transition-colors disabled:opacity-60 ${
                  isCurrent
                    ? 'border border-border text-muted-foreground'
                    : popular
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border-strong text-primary hover:border-primary'
                }`}
              >
                {isCurrent ? (
                  <>
                    <Check size={13} /> Current plan
                  </>
                ) : p.custom ? (
                  <>
                    <Building2 size={13} /> Contact sales
                  </>
                ) : (
                  <>
                    <Sparkles size={13} /> Choose {p.name}
                  </>
                )}
              </button>
            </div>
          )
        })}
      </div>

      {sub.foundingRate && (
        <p className="mono-label text-center text-[9px] text-primary">
          Founding-host rate locked — your price never rises
        </p>
      )}

      <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
        Flat subscription only. StayKnit never takes a cut of your bookings and never holds booking-site credentials.
        Prepaid terms are billed once. Auto-renewal is optional and off by default — turn it on to keep your term
        extended automatically, or leave it off and re-purchase when you choose. The 6-month term is 10% off, and the
        12-month term includes bonus free months.
      </p>

      <div className="mt-4 border-t border-border pt-6">
        <WhoWeAre />
      </div>

      {checkout &&
        (() => {
          const pp = periodPricing(checkout.plan, currency, checkout.period)
          const finalCents = applyPromoPct(pp.totalCents, checkoutDiscountPct)
          return (
            <PlanCheckout
              plan={checkout.plan}
              period={checkout.period}
              priceLabel={formatMoney(finalCents, pp.currency)}
              discountPct={pp.discountPct}
              promoPct={checkoutDiscountPct}
              onClose={(activated) => {
                setCheckout(null)
                if (activated) router.refresh()
              }}
            />
          )
        })()}

      {cardCapture && (
        <TrialCardCapture
          onClose={(saved) => {
            setCardCapture(false)
            if (saved) router.refresh()
          }}
        />
      )}
    </div>
  )
}

// Purchasable tiers in display order (paid tiers + Enterprise; trial excluded).
function tierCards(): PlanDef[] {
  return (['starter', 'host', 'professional', 'business', 'enterprise'] as PlanKey[]).map(planFor)
}
