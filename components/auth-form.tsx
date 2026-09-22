'use client'

import { authClient } from '@/lib/auth-client'
import { startSignUp, resendVerificationEmail } from '@/app/actions/auth'
import { Eye, EyeOff, Home } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { BrandLockup } from '@/components/wordmark'
import { SignInHelp } from '@/components/sign-in-help'
import { TrustpilotTrustBox } from '@/components/trustpilot'
import { SiteFooter } from '@/components/site-footer'

type Mode = 'sign-in' | 'sign-up'

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter()
  const isSignUp = mode === 'sign-up'

  const [name, setName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [phone, setPhone] = useState('')
  const [telephone, setTelephone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [acceptedLegal, setAcceptedLegal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  // The address that just hit the "confirm your email first" wall, plus the
  // state of any manual resend, so the banner can offer an explicit resend and
  // a from-backup-mailbox fallback instead of leaving the user stuck.
  const [pendingVerifyEmail, setPendingVerifyEmail] = useState<string | null>(null)
  const [resend, setResend] = useState<{
    channel: 'primary' | 'support' | null
    status: 'idle' | 'sending' | 'sent' | 'failed'
  }>({ channel: null, status: 'idle' })

  async function handleResend(channel: 'primary' | 'support') {
    if (!pendingVerifyEmail) return
    setResend({ channel, status: 'sending' })
    const res = await resendVerificationEmail(pendingVerifyEmail, channel)
    setResend({ channel, status: res.ok ? 'sent' : 'failed' })
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setLoading(true)
    try {
      if (isSignUp) {
        if (!acceptedLegal) throw new Error('Please agree to the Terms and Privacy Policy to continue.')
        // Public sign-up always creates a host account; the server ignores any
        // client-supplied role. Owners are set up by their host, not here.
        // The action returns an identical result whether or not the email is
        // already registered, so this screen can't be used to probe accounts.
        const result = await startSignUp({ email, password, name, businessName, phone, telephone })
        if (!result.ok) throw new Error(result.message)
        // No session yet — the account activates after the emailed link is
        // clicked. Show a confirmation screen instead of entering the app.
        setSentTo(email)
        setLoading(false)
        return
      }

      const { data, error } = await authClient.signIn.email({ email, password, rememberMe })
      if (error) {
        // Better Auth blocks sign-in until the email is verified. Match on the
        // specific EMAIL_NOT_VERIFIED code — NOT a bare 403 — because other
        // failures (e.g. INVALID_ORIGIN when the app is reached on an untrusted
        // host) also return 403. Mapping every 403 to "confirm your email" told
        // verified users their email was unconfirmed and promised a "fresh
        // link" that resendVerificationEmail never actually sends (it no-ops for
        // already-verified accounts), stranding them on an empty inbox.
        const code = (error as { code?: string }).code
        const isUnverified = code === 'EMAIL_NOT_VERIFIED' || /email.*not.*verif|verif.*email/i.test(error.message || '')
        if (isUnverified) {
          // Remember the address so the buttons below can resend to it, and
          // reset any prior resend state from an earlier attempt.
          setPendingVerifyEmail(email)
          setResend({ channel: null, status: 'idle' })
          const sent = await resendVerificationEmail(email)
          if (sent.ok) {
            setNotice(
              `Please confirm your email first. We've sent a fresh confirmation link to ${email} — check your inbox, and your spam folder.`,
            )
          } else {
            setNotice(
              "Your email isn't confirmed yet, but the confirmation link didn't send just now. Use the options below to try again.",
            )
          }
          setLoading(false)
          return
        }
        // A trusted-origin rejection means the app was opened on a host Better
        // Auth doesn't recognise (e.g. a preview/alias URL). Tell the truth and
        // point at the real site instead of blaming the user's credentials.
        if (code === 'INVALID_ORIGIN') {
          console.error('[v0] sign-in blocked by INVALID_ORIGIN — current origin is not in trustedOrigins')
          throw new Error('For your security, please sign in from stayknit.org.')
        }
        // Rate limiter (429) and everything else: surface the real message.
        throw new Error(error.message || 'Those details did not match.')
      }
      // Password was correct but the account has 2FA on: no session is issued
      // yet. Send the host to the second-factor challenge instead of the app.
      // (The client plugin's onTwoFactorRedirect also navigates here; this
      // guard stops a flash of the app in the meantime.)
      if ((data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
        router.push('/2fa')
        return
      }
      router.push('/')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setLoading(false)
    }
  }

  if (sentTo) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-5 py-10">
        <div className="w-full max-w-sm text-center">
          <Link href="/" aria-label="Go to StayKnit home" className="inline-block">
            <BrandLockup width={168} />
          </Link>
          <h1 className="mt-6 text-balance font-sans text-3xl font-extrabold tracking-tight">Check your inbox.</h1>
          <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
            If you don&apos;t already have an account, we&apos;ve sent a confirmation link to{' '}
            <span className="font-semibold text-foreground">{sentTo}</span>. Click it to activate your account and start
            syncing. The link expires in 24 hours.
          </p>
          <p className="mt-6 text-sm text-muted-foreground">
            Already confirmed?{' '}
            <Link href="/sign-in" className="font-medium text-primary hover:underline">
              Sign in
            </Link>{' '}
            ·{' '}
            <Link href="/" className="font-medium text-primary hover:underline">
              Back to home
            </Link>
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-sm">
        <PageSwitcher mode={mode} />
        <div className="flex flex-col items-center text-center">
          <Link href="/" aria-label="Go to StayKnit home">
            <BrandLockup width={168} />
          </Link>
          <h1 className="mt-6 text-balance font-sans text-3xl font-extrabold tracking-tight">
            {isSignUp ? 'One calendar for every channel.' : 'Welcome back.'}
          </h1>
          <p className="mt-3 max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">
            {isSignUp
              ? 'Sync availability across Airbnb, Booking.com, LekkerSlaap and more — so nothing double-books.'
              : 'Sign in to see today’s arrivals and every linked channel.'}
          </p>
        </div>

        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
          {isSignUp && (
            <p className="rounded-md border border-border bg-surface-2 px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
              Creating a <span className="font-semibold text-foreground">host</span> account. If you&apos;re a unit
              owner, your host sets up your login and units for you — you don&apos;t sign up here, just{' '}
              <Link href="/sign-in" className="font-medium text-primary hover:underline">
                sign in
              </Link>
              .
            </p>
          )}

          {isSignUp && (
            <Field label="Full name">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Thandi Mbeki"
                autoComplete="name"
                className="input-base"
              />
            </Field>
          )}

          {isSignUp && (
            <Field label="Business name">
              <input
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Thandi's Getaways"
                autoComplete="organization"
                className="input-base"
              />
            </Field>
          )}

          {isSignUp && (
            <Field label="Mobile number">
              <input
                required
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+27 82 123 4567"
                autoComplete="tel"
                className="input-base"
              />
            </Field>
          )}

          {isSignUp && (
            <Field label="Landline (optional)">
              <input
                type="tel"
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                placeholder="+27 21 123 4567"
                autoComplete="tel-national"
                className="input-base"
              />
            </Field>
          )}

          <Field label="Email">
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@stayknit.org"
              autoComplete="email"
              className="input-base"
            />
          </Field>

          <Field label="Password">
            <div className="relative">
              <input
                required
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                minLength={8}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                className="input-base pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                title={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:text-foreground"
              >
                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
          </Field>

          {!isSignUp && (
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setRememberMe((v) => !v)}
                className="flex items-center gap-2.5 text-left"
              >
                <span
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${rememberMe ? 'bg-primary' : 'bg-border'}`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition-all ${rememberMe ? 'left-[18px]' : 'left-0.5'}`}
                  />
                </span>
                <span className="text-sm text-muted-foreground">
                  Remember me <span className="text-[12px]">({rememberMe ? 'on' : 'off'})</span>
                </span>
              </button>
              <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
                Forgot password?
              </Link>
            </div>
          )}

          {notice && (
            <p role="status" className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-foreground">
              {notice}
            </p>
          )}

          {!isSignUp && pendingVerifyEmail && (
            <VerifyEmailHelp email={pendingVerifyEmail} resend={resend} onResend={handleResend} />
          )}

          {error && (
            <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          {isSignUp && (
            <label className="flex cursor-pointer items-start gap-2.5">
              <button
                type="button"
                role="checkbox"
                aria-checked={acceptedLegal}
                onClick={() => setAcceptedLegal((v) => !v)}
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                  acceptedLegal ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong'
                }`}
              >
                {acceptedLegal && <span className="text-[11px] font-bold">✓</span>}
              </button>
              <span className="text-[12px] leading-relaxed text-muted-foreground">
                I agree to StayKnit&apos;s{' '}
                <Link href="/terms" className="font-medium text-primary hover:underline">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="font-medium text-primary hover:underline">
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
          )}

          <button
            type="submit"
            disabled={loading || (isSignUp && !acceptedLegal)}
            className="mono-label mt-1 rounded-md bg-primary px-4 py-3.5 text-[11px] text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {loading ? 'One moment…' : isSignUp ? 'Create account' : 'Sign in'}
          </button>

          {isSignUp && (
            <p className="text-center text-[12px] leading-relaxed text-muted-foreground">
              Your personal details are used internally for account support only — never sold or shared for marketing.
            </p>
          )}
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isSignUp ? 'Already syncing?' : 'New to StayKnit?'}{' '}
          <Link href={isSignUp ? '/sign-in' : '/sign-up'} className="font-medium text-primary hover:underline">
            {isSignUp ? 'Sign in' : 'Create an account'}
          </Link>
        </p>

        {!isSignUp && <SignInHelp />}

        <TrustpilotTrustBox />

        <SiteFooter />
      </div>

      <style>{`
        .input-base {
          width: 100%;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--surface);
          padding: 0.75rem 0.85rem;
          font-size: 0.9rem;
          color: var(--foreground);
          outline: none;
        }
        .input-base::placeholder { color: #4d5c61; }
        .input-base:focus { border-color: var(--primary); }
      `}</style>
    </main>
  )
}

// Lets a visitor jump between the public home page and the two auth screens
// without hunting for a link. The current auth screen is highlighted; Home is
// always a plain navigation target since it lives outside this form.
function PageSwitcher({ mode }: { mode: Mode }) {
  const items: { href: string; label: string; active: boolean; icon?: typeof Home }[] = [
    { href: '/', label: 'Home', active: false, icon: Home },
    { href: '/sign-in', label: 'Log in', active: mode === 'sign-in' },
    { href: '/sign-up', label: 'Sign up', active: mode === 'sign-up' },
  ]
  return (
    <nav aria-label="Page navigation" className="mb-8 flex justify-center">
      <div className="flex items-center gap-1 rounded-full border border-border bg-surface-2 p-1">
        {items.map(({ href, label, active, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`mono-label flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[10px] transition-colors ${
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {Icon && <Icon size={13} aria-hidden="true" />}
            {label}
          </Link>
        ))}
      </div>
    </nav>
  )
}

// Shown after a sign-in is blocked because the email isn't confirmed yet. Gives
// the host an explicit "resend" button (a fresh link was already auto-sent, but
// people expect a button they can press), plus a second, self-service path when
// email simply isn't arriving: re-send the SAME link from the support mailbox,
// which can slip past a filter that's eating mail from the primary address.
function VerifyEmailHelp({
  email,
  resend,
  onResend,
}: {
  email: string
  resend: { channel: 'primary' | 'support' | null; status: 'idle' | 'sending' | 'sent' | 'failed' }
  onResend: (channel: 'primary' | 'support') => void
}) {
  const busy = resend.status === 'sending'
  const line = (channel: 'primary' | 'support') => {
    if (resend.channel !== channel) return null
    if (resend.status === 'sent')
      return (
        <span role="status" className="text-primary">
          Sent — check your inbox and spam.
        </span>
      )
    if (resend.status === 'failed')
      return (
        <span role="alert" className="text-danger">
          Couldn&apos;t send just now. Try the other option or email support@stayknit.org.
        </span>
      )
    return null
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface-2 px-3.5 py-3">
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        Confirmation link going to{' '}
        <span className="font-semibold text-foreground">{email}</span>. Didn&apos;t get it? Check spam first, then:
      </p>

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => onResend('primary')}
          disabled={busy}
          className="mono-label rounded-md border border-border-strong bg-surface px-4 py-3 text-[11px] text-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy && resend.channel === 'primary' ? 'Sending…' : 'Resend confirmation link'}
        </button>
        <span className="min-h-[16px] text-[12px] leading-relaxed">{line('primary')}</span>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-border pt-3">
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Still nothing after a minute? Send it from our backup address instead — it can get through when the first one
          is being filtered.
        </p>
        <button
          type="button"
          onClick={() => onResend('support')}
          disabled={busy}
          className="mono-label rounded-md border border-border-strong bg-surface px-4 py-3 text-[11px] text-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy && resend.channel === 'support' ? 'Sending…' : 'Send from backup address'}
        </button>
        <span className="min-h-[16px] text-[12px] leading-relaxed">{line('support')}</span>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mono-label mb-2 block text-[10px] text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

