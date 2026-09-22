import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { getReceiptForHost } from '@/lib/billing/receipt'
import { ReceiptDocument } from '@/components/receipt/receipt-document'
import { BrandLockup } from '@/components/wordmark'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Receipt — StayKnit',
  description: 'Your StayKnit subscription payment receipt.',
  robots: { index: false, follow: false },
}

// A small centered shell for the not-signed-in / not-found states so those
// pages still look like StayKnit rather than a bare error.
function Notice({ title, body, cta }: { title: string; body: string; cta?: { href: string; label: string } }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-sm text-center">
        <Link href="/" aria-label="Go to StayKnit home" className="inline-block">
          <BrandLockup width={168} />
        </Link>
        <h1 className="mt-6 text-balance font-sans text-2xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">{body}</p>
        {cta && (
          <Link
            href={cta.href}
            className="mono-label mt-6 inline-block rounded-md bg-primary px-4 py-3 text-[11px] text-primary-foreground transition-opacity hover:opacity-90"
          >
            {cta.label}
          </Link>
        )}
      </div>
    </main>
  )
}

export default async function ReceiptPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params
  const reference = decodeURIComponent(ref)

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return (
      <Notice
        title="Sign in to view this receipt"
        body="Your StayKnit receipts are private to your account. Sign in with the email this payment was billed to, then open this link again."
        cta={{ href: '/sign-in', label: 'Sign in' }}
      />
    )
  }

  const result = await getReceiptForHost(reference, session.user.id)

  if (!result.ok) {
    if (result.reason === 'unavailable') {
      return (
        <Notice
          title="Receipt temporarily unavailable"
          body="We couldn't reach our payment provider to load this receipt just now. Please try again in a few minutes."
          cta={{ href: '/', label: 'Back to StayKnit' }}
        />
      )
    }
    // Both 'forbidden' and 'not-found' return the same message so a signed-in
    // host can't probe which references belong to other accounts.
    return (
      <Notice
        title="Receipt not found"
        body="We couldn't find a StayKnit payment receipt for this link on your account. Check that you're signed in with the email the payment was billed to."
        cta={{ href: '/', label: 'Back to StayKnit' }}
      />
    )
  }

  return <ReceiptDocument receipt={result.receipt} />
}
