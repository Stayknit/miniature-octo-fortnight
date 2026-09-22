'use client'

import type { PaymentModeWarning } from '@/lib/payment-mode'
import { AlertTriangle, X } from 'lucide-react'
import { useState } from 'react'

// Surfaces the server-computed Paystack key warning inside the host workspace.
// A "critical" warning (test/missing keys on the production deployment) cannot
// be dismissed — it is a live launch blocker. A "notice" (previews/dev) can be
// dismissed for the session so it does not nag while building.
export function PaymentModeBanner({ warning }: { warning: PaymentModeWarning | null }) {
  const [dismissed, setDismissed] = useState(false)

  if (!warning) return null
  const critical = warning.severity === 'critical'
  if (dismissed && !critical) return null

  return (
    <div
      role="alert"
      className={
        'flex items-start gap-3 border-b px-5 py-3 text-sm lg:px-8 ' +
        (critical
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400')
      }
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{warning.title}</p>
        <p className="mt-0.5 text-[13px] leading-snug opacity-90">{warning.detail}</p>
      </div>
      {!critical && (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss notice"
          className="-mr-1 shrink-0 rounded-md p-1 transition-colors hover:bg-foreground/10"
        >
          <X size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
