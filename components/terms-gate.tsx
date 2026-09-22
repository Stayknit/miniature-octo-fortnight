'use client'

import { acceptTerms } from '@/app/actions/stayknit'
import { Wordmark } from '@/components/wordmark'
import { ShieldCheck } from 'lucide-react'
import { useState, useTransition } from 'react'

const CLAUSES: { t: string; s: string }[] = [
  { t: '1 · Relay service only', s: 'StayKnit mirrors availability between your listing sites over iCal. It is a sync relay, not a booking channel.' },
  { t: '2 · No booking-site credentials', s: 'StayKnit never asks for or stores your Airbnb, Booking.com, or other channel passwords. It reads public iCal export links only.' },
  { t: '3 · Availability, not messages', s: 'Only dates sync. Guest messages, payments, and cancellations remain on the original channel.' },
  { t: '4 · Sync is best-effort', s: 'Channels refresh iCal on their own schedule. StayKnit is not liable for double-bookings caused by a channel’s delay or outage.' },
  { t: '5 · You own your listings', s: 'You remain the host of record on every channel. StayKnit acts on your instruction and holds no authority over your listings.' },
  { t: '6 · Owner access is read-only', s: 'Owners you invite see only their own units’ calendar and statements. They can never edit, book, or view other owners’ data.' },
  { t: '7 · Statements are estimates', s: 'Payout figures are calculated from synced data and your commission settings. Reconcile against channel payouts before paying owners.' },
  { t: '8 · Billing', s: 'StayKnit is a flat prepaid fee with no booking commission. Plans are billed once upfront for a fixed term. Auto-renewal is optional and off by default: unless you turn it on, access reverts to the free trial when the term ends unless you buy another. If you opt into auto-renewal, we securely store a card token with Paystack and charge the same term before it ends until you turn it off. The free trial needs no card, and nothing is charged until you confirm a paid plan.' },
  { t: '9 · Data', s: 'Your data is scoped to your account and never sold. You may export or delete it at any time.' },
  { t: '10 · Profile deletion', s: 'You can permanently delete your profile from Settings at any time — this erases your account and all associated data and cannot be undone. Profiles left inactive for 12 months are deleted automatically.' },
]

export function TermsGate({ user }: { user: { name: string; email: string } }) {
  const [agreed, setAgreed] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <div className="flex w-full max-w-lg flex-col px-5 py-8">
        <div className="flex items-center gap-2.5">
          <Wordmark />
          <span className="mono-label rounded bg-primary px-2 py-1 text-[9px] text-primary-foreground">Agreement</span>
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-xl border border-border-strong bg-surface-2 p-4">
          <ShieldCheck size={20} className="mt-0.5 shrink-0 text-primary" />
          <div>
            <h1 className="font-sans text-lg font-extrabold text-balance">Before you sync</h1>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              StayKnit keeps one live calendar across your channels. A few things to agree to first.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {CLAUSES.map((c) => (
            <div key={c.t} className="rounded-lg border border-border bg-surface px-4 py-3">
              <p className="text-[13px] font-semibold">{c.t}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{c.s}</p>
            </div>
          ))}
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface-2 px-4 py-3.5">
          <button
            type="button"
            role="checkbox"
            aria-checked={agreed}
            onClick={() => setAgreed((v) => !v)}
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
              agreed ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong'
            }`}
          >
            {agreed && <span className="text-[11px] font-bold">✓</span>}
          </button>
          <span className="text-[13px] leading-relaxed">
            I’ve read and agree to the StayKnit relay terms and understand StayKnit is not liable for channel-side sync
            delays.
          </span>
        </label>

        <button
          disabled={!agreed || pending}
          onClick={() => startTransition(() => acceptTerms())}
          className="mono-label mt-4 rounded-lg bg-primary py-4 text-[11px] text-primary-foreground transition-opacity disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Agree & continue'}
        </button>
        <p className="mono-label mt-3 text-center text-[9px] text-muted-foreground">
          Signed in as {user.email}
        </p>
      </div>
    </div>
  )
}
