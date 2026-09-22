'use client'

import { confirmTrialCardCapture, startTrialCardCapture } from '@/app/actions/stayknit'
import { Check, CreditCard, Loader2, ShieldCheck, X } from 'lucide-react'
import { useCallback, useState } from 'react'

type Phase = 'intro' | 'saving' | 'done' | 'error'

// Optional trial card capture. Paystack SA can't tokenise a card for free, so
// we run a R1 validation charge through the inline popup, save the reusable
// card authorization, and immediately refund the R1 — net cost to the host is
// zero. Saving a card does NOT start any recurring billing; it just keeps a
// card on file so upgrading later is one tap.
export function TrialCardCapture({ onClose }: { onClose: (saved: boolean) => void }) {
  const [phase, setPhase] = useState<Phase>('intro')
  const [error, setError] = useState<string | null>(null)

  const confirm = useCallback(
    async (reference: string) => {
      setPhase('saving')
      const res = await confirmTrialCardCapture(reference)
      if (res.ok) {
        setPhase('done')
        setTimeout(() => onClose(true), 1400)
        return
      }
      // The R1 is always refunded server-side; only the save failed.
      setError(
        res.reason === 'not_a_card'
          ? 'That payment method can\u2019t be saved as a card. Your R1 has been refunded — please try again with a card.'
          : 'We couldn\u2019t save your card. Your R1 has been refunded — please try again.',
      )
      setPhase('error')
    },
    [onClose],
  )

  const start = useCallback(async () => {
    setError(null)
    setPhase('saving')
    try {
      const { accessCode } = await startTrialCardCapture()
      // Loaded lazily on click (browser only): @paystack/inline-js touches
      // `window` at module load, which would crash server-side rendering.
      const { default: PaystackPop } = await import('@paystack/inline-js')
      const popup = new PaystackPop()
      popup.resumeTransaction(accessCode, {
        onSuccess: (tx) => {
          void confirm(tx.reference)
        },
        onCancel: () => setPhase('intro'),
        onError: (err) => {
          setError(err?.message || 'Card setup could not be started. Please try again.')
          setPhase('error')
        },
      })
    } catch (err) {
      setError((err as Error).message || 'Card setup could not be started. Please try again.')
      setPhase('error')
    }
  }, [confirm])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Save a card for your trial"
    >
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-border-strong bg-panel sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="mono-label text-[9px] text-muted-foreground">Optional</p>
            <p className="font-sans text-lg font-extrabold">Save a card</p>
          </div>
          <button
            onClick={() => onClose(false)}
            aria-label="Close"
            className="rounded-md border border-border p-2 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <X size={16} />
          </button>
        </div>

        {phase === 'intro' && (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-dim">
                <CreditCard className="text-primary" size={24} />
              </span>
              <div>
                <p className="font-sans text-base font-bold">Keep a card on file</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  This is optional and free. To verify your card, Paystack charges{' '}
                  <span className="font-semibold text-foreground">R1</span> and we refund it immediately — so it costs
                  you nothing. Saving a card just makes upgrading later one tap.
                </p>
              </div>

              <ul className="flex w-full flex-col gap-2.5 text-left text-[13px] leading-relaxed text-muted-foreground">
                <li className="flex gap-2">
                  <ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary" />
                  <span>
                    <span className="font-semibold text-foreground">No subscription starts.</span> Your free trial
                    continues exactly as it is — no plan is activated and nothing recurs.
                  </span>
                </li>
                <li className="flex gap-2">
                  <ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary" />
                  <span>
                    <span className="font-semibold text-foreground">The R1 is refunded automatically</span> the moment
                    your card is verified.
                  </span>
                </li>
                <li className="flex gap-2">
                  <ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary" />
                  <span>StayKnit never stores your card details — only Paystack does.</span>
                </li>
              </ul>

              <button
                onClick={start}
                className="mono-label mt-1 w-full rounded-lg bg-primary py-3 text-[10px] text-primary-foreground"
              >
                Verify card with Paystack
              </button>
              <button
                onClick={() => onClose(false)}
                className="mono-label w-full rounded-lg border border-border py-3 text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                Not now
              </button>
            </div>
          </div>
        )}

        {phase === 'saving' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <Loader2 className="animate-spin text-primary" size={28} />
            <p className="text-[13px]">Verifying and refunding your R1…</p>
          </div>
        )}

        {phase === 'done' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-dim">
              <Check className="text-primary" size={26} />
            </span>
            <p className="font-sans text-base font-bold">Card saved</p>
            <p className="text-[13px] text-muted-foreground">Your R1 has been refunded. Upgrading is now one tap.</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <X className="text-destructive" size={26} />
            </span>
            <p className="text-[13px] text-muted-foreground">{error}</p>
            <div className="flex gap-2">
              <button
                onClick={start}
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
