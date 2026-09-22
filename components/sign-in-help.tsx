'use client'

import { HelpCircle, KeyRound, Mail, ShieldQuestion, X } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

const SUPPORT_EMAIL = 'help@stayknit.org'

// Auth-free help for people who can't get in. The in-app SupportForm needs a
// session, so this stands alone: self-serve fixes plus a direct email fallback.
export function SignInHelp() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto mt-6 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <HelpCircle size={15} /> Need help signing in?
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Help signing in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-slidein w-full max-w-sm rounded-t-2xl border border-border bg-surface p-5 sm:rounded-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <HelpCircle size={18} className="text-primary" /> Trouble signing in?
              </h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-2.5">
              <HelpRow
                icon={<KeyRound size={16} className="text-primary" />}
                title="Forgot your password?"
                body="We'll email you a secure reset link — or you can verify with your security questions instead."
                action={
                  <Link
                    href="/forgot-password"
                    onClick={() => setOpen(false)}
                    className="mono-label rounded border border-border px-3 py-1.5 text-[10px] text-primary hover:border-primary"
                  >
                    Reset password
                  </Link>
                }
              />
              <HelpRow
                icon={<ShieldQuestion size={16} className="text-primary" />}
                title="Wrong email or details?"
                body="Check for typos and make sure you're using the email you signed up with. Passwords are case-sensitive."
              />
              <HelpRow
                icon={<Mail size={16} className="text-primary" />}
                title="Still stuck?"
                body="Email a human and we'll reply within one business day."
                action={
                  <a
                    href={`mailto:${SUPPORT_EMAIL}?subject=Help%20signing%20in%20to%20StayKnit`}
                    className="mono-label rounded border border-border px-3 py-1.5 text-[10px] text-primary hover:border-primary"
                  >
                    Email support
                  </a>
                }
              />
            </div>

            <p className="mt-4 text-center text-[12px] text-muted-foreground">
              New here?{' '}
              <Link href="/sign-up" onClick={() => setOpen(false)} className="font-medium text-primary hover:underline">
                Create an account
              </Link>
            </p>
          </div>
        </div>
      )}
    </>
  )
}

function HelpRow({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode
  title: string
  body: string
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3.5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        {icon} {title}
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{body}</p>
      {action && <div className="mt-2.5">{action}</div>}
    </div>
  )
}
