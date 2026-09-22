'use client'

import { TRIAL_URGENT_DAYS, trialDaysLeft } from '@/lib/plans'
import type { StayKnitData } from '@/lib/types'
import { Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'

// Whole days left at which the trial-ending reminder turns urgent. Mirrors the
// TRIAL_URGENT_DAYS used by the email cron so the in-app and email nudges agree.
const URGENT_AT = TRIAL_URGENT_DAYS

// A non-blocking reminder shown when a host's FREE TRIAL is ending within the
// reminder window (see isTrialEndingSoon). The host still has full access, so
// this is a dismissible nudge — not the trial-expired freeze. "Choose a plan"
// hands control back to the host app to open the Plan tab.
export function TrialEndingReminder({ data, onChoosePlan }: { data: StayKnitData; onChoosePlan: () => void }) {
  const sub = data.subscription
  const daysLeft = trialDaysLeft(sub) ?? 0
  const urgent = daysLeft <= URGENT_AT

  // Dismissed reminders are remembered for the browser session, keyed by the
  // exact trial-end date — so the reminder can't be permanently silenced across
  // different trials, but stays hidden after the host dismisses this one.
  const dismissKey = `sk-trial-ending-dismissed:${sub.trialEndsAt ? new Date(sub.trialEndsAt).toISOString() : 'none'}`
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (sessionStorage.getItem(dismissKey) !== '1') setOpen(true)
  }, [dismissKey])

  function dismiss() {
    if (typeof window !== 'undefined') sessionStorage.setItem(dismissKey, '1')
    setOpen(false)
  }

  if (!open) return null

  const endLabel = sub.trialEndsAt
    ? new Date(sub.trialEndsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trial-ending-title"
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
          <Sparkles className={urgent ? 'text-danger' : 'text-warning'} size={24} />
        </span>

        <div>
          <p className={`mono-label text-[10px] ${urgent ? 'text-danger' : 'text-warning'}`}>
            {daysLeft <= 0 ? 'Ending today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
          </p>
          <h2 id="trial-ending-title" className="mt-1.5 font-sans text-xl font-extrabold">
            Your free trial is ending
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            Your free trial ends on <span className="font-semibold text-foreground">{endLabel}</span>, after which
            calendar sync, bookings, and owner statements will pause. Choose a plan now to keep everything running — no
            money is charged until you confirm a paid plan, and all your listings and data stay safe.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => {
              dismiss()
              onChoosePlan()
            }}
            className="mono-label flex items-center justify-center gap-2 rounded-lg bg-primary py-3 text-[10px] text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Sparkles size={14} /> Choose a plan
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
  )
}
