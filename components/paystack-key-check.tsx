'use client'

import { useState, useTransition } from 'react'
import { KeyRound, Loader2, CheckCircle2, XCircle, AlertTriangle, X } from 'lucide-react'
import {
  validatePaystackKey,
  validateConfiguredPaystackKey,
  type KeyCheck,
} from '@/app/actions/validate-paystack-key'

// Owner-only tool: paste a candidate Paystack secret key and check whether
// Paystack actually accepts it, without storing the key anywhere. Purely a
// verification aid for finding a working sk_live_ key to put into Vars.
export function PaystackKeyCheck() {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [result, setResult] = useState<KeyCheck | null>(null)
  const [pending, startTransition] = useTransition()

  function reset() {
    setValue('')
    setResult(null)
  }

  function close() {
    setOpen(false)
    reset()
  }

  function check() {
    if (!value.trim() || pending) return
    setResult(null)
    startTransition(async () => {
      const res = await validatePaystackKey(value)
      setResult(res)
      // On success there's no reason to keep the secret in the field.
      if (res.ok) setValue('')
    })
  }

  // Checks the key this deployment already has in Vars — no paste needed.
  function checkConfigured() {
    if (pending) return
    setResult(null)
    startTransition(async () => {
      setResult(await validateConfiguredPaystackKey())
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mono-label inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[10px] text-primary transition-colors hover:border-primary print:hidden"
      >
        <KeyRound className="size-3.5" aria-hidden="true" />
        Test Paystack key
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="key-check-title"
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h2 id="key-check-title" className="font-sans text-base font-bold text-foreground">
                  Test a Paystack secret key
                </h2>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Paste a secret key to check whether Paystack accepts it. The key is used for one verification call
                  only — it is <span className="font-semibold text-foreground">never stored</span>. Once a key is
                  accepted, save it in Project Settings → Vars.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <label htmlFor="key-check-input" className="mono-label mt-4 block text-[10px] text-muted-foreground">
              Secret key
            </label>
            <input
              id="key-check-input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) check()
              }}
              placeholder="sk_live_…"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none transition-colors focus:border-primary"
            />

            {result && (
              <div
                className={`mt-3 flex items-start gap-2 rounded-lg border p-3 text-[13px] leading-relaxed ${
                  result.ok
                    ? 'border-primary/30 bg-primary/5 text-foreground'
                    : result.status === 'unreachable'
                      ? 'border-amber-500/30 bg-amber-500/5 text-foreground'
                      : 'border-destructive/30 bg-destructive/5 text-foreground'
                }`}
                role="status"
              >
                {result.ok ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                ) : result.status === 'unreachable' ? (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                ) : (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                )}
                <span>{result.message}</span>
              </div>
            )}

            <button
              type="button"
              onClick={checkConfigured}
              disabled={pending}
              className="mono-label mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[10px] text-foreground transition-colors hover:border-primary disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" aria-hidden="true" />}
              Test the key already in Vars
            </button>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              Checks the <span className="font-mono">PAYSTACK_SECRET_KEY</span> this live deployment is actually using —
              no paste needed. Use this to tell apart a wrong value in Vars from a deployment that hasn&apos;t picked up
              the new key.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded-lg border border-border px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Close
              </button>
              <button
                type="button"
                onClick={check}
                disabled={!value.trim() || pending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {pending && <Loader2 className="size-3.5 animate-spin" />}
                {pending ? 'Checking…' : 'Check pasted key'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
