'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ticket, Check } from 'lucide-react'
import { redeemCode } from '@/app/actions/stayknit'

// A compact "have a code?" bar. Any signed-in host can enter an access or
// promo code here. On a successful ACCESS grant it refreshes the route so the
// server re-evaluates access — instantly lifting the trial-expired freeze.
export function PromoCodeBar({
  variant = 'card',
  onRedeemed,
}: {
  variant?: 'card' | 'inline'
  onRedeemed?: () => void
}) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim() || busy) return
    setError('')
    setSuccess('')
    setBusy(true)
    try {
      const result = await redeemCode(code)
      if (!result.ok) {
        setError(result.error)
        return
      }
      if (result.kind === 'access') {
        const ends = new Date(result.accessEndsAt).toLocaleDateString(undefined, {
          dateStyle: 'medium',
        })
        setSuccess(`${result.planName} unlocked until ${ends}. Loading your workspace…`)
        setCode('')
        onRedeemed?.()
        // Let the success message show briefly, then refresh so the gate clears.
        setTimeout(() => router.refresh(), 900)
      } else {
        setSuccess(result.message)
        setCode('')
        onRedeemed?.()
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const wrapClass =
    variant === 'card'
      ? 'rounded-xl border border-border bg-surface-2 p-4'
      : 'rounded-lg border border-border bg-card p-3'

  return (
    <div className={wrapClass}>
      <div className="mb-2 flex items-center gap-2">
        <Ticket className="text-primary" size={15} />
        <p className="mono-label text-[10px] text-foreground">Have an access or promo code?</p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase())
            setError('')
          }}
          placeholder="Enter code"
          aria-label="Promo or access code"
          spellCheck={false}
          autoCapitalize="characters"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm uppercase tracking-wide text-foreground outline-none placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-muted-foreground focus:border-primary"
        />
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="mono-label flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-[10px] text-primary-foreground transition-opacity disabled:opacity-50"
        >
          {busy ? 'Checking…' : 'Apply code'}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-destructive">
          {error}
        </p>
      )}
      {success && (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-primary">
          <Check size={13} /> {success}
        </p>
      )}
    </div>
  )
}
