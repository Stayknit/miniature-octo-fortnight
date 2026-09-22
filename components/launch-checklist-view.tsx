'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { Printer, Check, Loader2 } from 'lucide-react'
import { BrandLockup } from '@/components/wordmark'
import { PaystackKeyCheck } from '@/components/paystack-key-check'
import { LEGAL } from '@/lib/legal'
import { setLaunchOverride, type ChecklistOverrides } from '@/app/actions/launch-checklist'

type Status = 'done' | 'action'

type Item = {
  id: string
  title: string
  detail: string
  status: Status
}

type Group = {
  heading: string
  blurb: string
  items: Item[]
}

const GROUPS: Group[] = [
  {
    heading: 'Legal & compliance',
    blurb: 'Business identity and policy gates that must be cleared before taking real customers.',
    items: [
      {
        id: 'entity',
        title: 'Registered entity details published',
        detail: `${LEGAL.entity} · registration ${LEGAL.registration} · ${LEGAL.address}. Shown in the Terms and Privacy contact sections.`,
        status: 'done',
      },
      {
        id: 'legal-review',
        title: 'Lawyer review of Terms & Privacy copy',
        detail:
          'Have counsel review liability, governing-law, and billing/cancellation clauses. The in-app pages are a solid draft, not vetted legal advice.',
        status: 'action',
      },
      {
        id: 'popia',
        title: 'POPIA data-rights contact live',
        detail: `Confirm ${LEGAL.privacyEmail} is monitored and that the ${LEGAL.inactivityRetentionMonths}-month inactivity purge matches your stated retention policy.`,
        status: 'action',
      },
    ],
  },
  {
    heading: 'Accounts & billing integrity',
    blurb: 'Guarantees that one person maps to one account and that only the right people ever pay.',
    items: [
      {
        id: 'email-uniqueness',
        title: 'One account per email, case-insensitive',
        detail:
          'A unique index on lower(email) plus email normalization at sign-up means John@x.com and john@x.com can never become two accounts — enforced at the database level across every sign-up path, verified live against the production database.',
        status: 'done',
      },
      {
        id: 'owner-no-pay',
        title: 'Owners can never be charged a subscription',
        detail:
          'Property owners get a free, read-only portal set up by their host. If a known owner email tries the public host sign-up, no paying host account is created — enforced both in the sign-up action and in the auth endpoint, verified live.',
        status: 'done',
      },
    ],
  },
  {
    heading: 'Production configuration',
    blurb: 'Day-of pre-flight checks to run against the live domain, not the preview.',
    items: [
      {
        id: 'headers',
        title: 'Security headers verified on live domain',
        detail:
          'Verified on www.stayknit.org: 26/26 protocol checks passed — enforcing CSP (Paystack allowlisted), nosniff, frame/referrer/permissions policies, and HSTS (max-age 2 years, includeSubDomains).',
        status: 'done',
      },
      {
        id: 'domain',
        title: 'Custom domain connected & HTTPS enforced',
        detail:
          'stayknit.org and www.stayknit.org both serve over HTTPS with HSTS. Optional cleanup: set apex → www 308 redirect in Vercel so www is the single canonical domain.',
        status: 'done',
      },
      {
        id: 'cron-secret',
        title: 'Daily crons armed (CRON_SECRET)',
        detail:
          'Verified live. CRON_SECRET is set, and both daily Vercel Cron jobs now authenticate and run (tested returning HTTP 200): the auto-renewal engine (/api/cron/renewals — charges opted-in hosts before their term ends) and the expiry-reminder + inactivity-purge job (/api/cron/expiry-reminders — 14-day and 3-day notices, plus the 12-month data purge). Requests without the secret are correctly rejected (401). SMTP_PASSWORD is set so reminder mail sends.',
        status: 'done',
      },
      {
        id: 'fnb',
        title: 'FNB business bank account opened',
        detail:
          'Done — the FNB business account is open in the company name. Its account number and branch code are stored as the FNB_* environment variables and feed the manual-EFT payout details in the legal pack. This is the local business account Paystack pays out to.',
        status: 'done',
      },
      {
        id: 'paystack-account',
        title: 'Paystack account created & verified',
        detail:
          'Done — the Paystack account is activated. Final step to take real money: confirm FNB payouts are enabled, then swap the test keys for live keys (below).',
        status: 'done',
      },
      {
        id: 'paystack-migration',
        title: 'Payment code migrated to Paystack',
        detail:
          'Done. Checkout now initializes a Paystack transaction server-side and completes it with the inline popup (@paystack/inline-js); the same prepaid one-time terms and anti-arbitrage currency locking are preserved. The webhook is repointed to /api/paystack/webhook with HMAC-SHA512 verification, and the shared idempotent activation re-verifies each transaction (status + amount) before granting access. The webhook also handles refund.processed: a full refund of the activating payment reverts the host to trial (access revoked, auto-renewal off), while partial refunds keep access — idempotent, verified against the DB. Add live keys in Vars (PAYSTACK_SECRET_KEY, NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY) to switch out of test mode.',
        status: 'done',
      },
      {
        id: 'paystack-live',
        title: 'Paystack in live mode with FNB payouts',
        detail:
          'Fully live. The live secret key (sk_live_) authenticates against Paystack — a real API call returned HTTP 200 with a live ZAR balance — so genuine customer charges will process. The live webhook is registered at https://www.stayknit.org/api/paystack/webhook (verified reachable in production, returns 200 with the signing secret present), and settlements pay out to the FNB business account. Real money is now flowing end to end.',
        status: 'done',
      },
    ],
  },
  {
    heading: 'Deliverability & final smoke test',
    blurb: 'Prove the end-to-end flows real users depend on.',
    items: [
      {
        id: 'dns',
        title: 'SPF, DKIM & DMARC set for stayknit.org',
        detail:
          'All three verified live. SPF (v=spf1 include:spf.privateemail.com ~all) and MX point to Namecheap Private Email; DKIM is published on selector privateemail._domainkey (valid 2048-bit v=DKIM1; k=rsa; p=... key); DMARC is v=DMARC1; p=none; rua=mailto:info@stayknit.org; fo=1. A real password-reset email was delivered to the inbox (not junk) on iCloud Mail and rendered correctly. New-domain reputation is still warming, so keep marking StayKnit mail "not junk" for a week or two, then tighten DMARC to p=quarantine (later p=reject) once passes are consistent. Reference: docs/dkim-dmarc-setup.md.',
        status: 'done',
      },
      {
        id: 'email-test',
        title: 'End-to-end email test sent & received',
        detail:
          'Verified live. The primary mailbox (resetpasswords@stayknit.org) authenticates over SMTP and a real test email was accepted by the server (250 queued) — so verification and password-reset emails send. The info@stayknit.org inbox connects over IMAP and reads mail. Note: the dedicated support@ mailbox credentials in Vars currently fail to authenticate, but support email now falls back automatically to the primary mailbox (with Reply-To support@), so no support message is dropped. Fix SUPPORT_SMTP_USER / SUPPORT_SMTP_PASSWORD when convenient to have support mail come from support@ directly.',
        status: 'done',
      },
      {
        id: 'core-flow',
        title: 'Host & owner core flows walked through',
        detail:
          'Walked through end-to-end in the browser against the live database: host sign-up → email verification → sync agreement → dashboard → add property + owner → connect an iCal feed and import (83 events, 1/1 feeds reachable). The owner Overview and Statement reconcile exactly with the host-side Owners figures (due, nights, gross, and per-line cost math all agree). This surfaced and fixed a first-load race condition that crashed the dashboard for brand-new hosts (duplicate settings insert) and would have doubled owner statement costs (duplicate cost-line seed) — see docs/changelog.md.',
        status: 'done',
      },
    ],
  },
]

const ALL_ITEMS = GROUPS.flatMap((g) => g.items)
const DEFAULTS: Record<string, boolean> = Object.fromEntries(ALL_ITEMS.map((i) => [i.id, i.status === 'done']))

export function LaunchChecklistView({ initialOverrides }: { initialOverrides: ChecklistOverrides }) {
  // Effective state = shipped defaults merged with the owner's saved ticks.
  const [overrides, setOverrides] = useState<ChecklistOverrides>(initialOverrides)
  const [saving, setSaving] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const checked = useMemo<Record<string, boolean>>(() => ({ ...DEFAULTS, ...overrides }), [overrides])

  const doneCount = ALL_ITEMS.filter((i) => checked[i.id]).length
  const total = ALL_ITEMS.length
  const pct = Math.round((doneCount / total) * 100)

  const toggle = (id: string) => {
    const nextValue = !checked[id]
    // Optimistic: reflect immediately, then persist. Revert on failure.
    setOverrides((prev) => ({ ...prev, [id]: nextValue }))
    setSaving(id)
    startTransition(async () => {
      try {
        const saved = await setLaunchOverride(id, nextValue)
        setOverrides(saved)
      } catch {
        setOverrides((prev) => ({ ...prev, [id]: !nextValue }))
      } finally {
        setSaving(null)
      }
    })
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 py-10">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="inline-flex w-fit">
          <BrandLockup width={148} />
        </Link>
        <div className="flex items-center gap-2 print:hidden">
          <PaystackKeyCheck />
          <button
            onClick={() => window.print()}
            className="mono-label inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[10px] text-primary transition-colors hover:border-primary"
          >
            <Printer className="size-3.5" aria-hidden="true" />
            Print
          </button>
        </div>
      </div>

      <h1 className="mt-8 font-sans text-3xl font-extrabold tracking-tight text-balance">Pre-launch checklist</h1>
      <p className="mono-label mt-2 text-[10px] text-muted-foreground">
        {doneCount} of {total} complete · {pct}% · saved to your account
      </p>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-8 flex flex-col gap-8">
        {GROUPS.map((group) => (
          <section key={group.heading} className="flex flex-col gap-3">
            <div>
              <h2 className="font-sans text-lg font-bold text-foreground">{group.heading}</h2>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{group.blurb}</p>
            </div>

            <ul className="flex flex-col gap-2">
              {group.items.map((item) => {
                const isChecked = checked[item.id]
                const isSaving = saving === item.id && isPending
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => toggle(item.id)}
                      aria-pressed={isChecked}
                      className="flex w-full items-start gap-3 rounded-xl border border-border bg-card p-3.5 text-left transition-colors hover:border-primary/60"
                    >
                      <span
                        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                          isChecked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'
                        }`}
                        aria-hidden="true"
                      >
                        {isSaving ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          isChecked && <Check className="size-3.5" strokeWidth={3} />
                        )}
                      </span>
                      <span className="flex flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span
                            className={`font-sans text-sm font-semibold ${
                              isChecked ? 'text-muted-foreground line-through' : 'text-foreground'
                            }`}
                          >
                            {item.title}
                          </span>
                          {item.status === 'done' ? (
                            <span className="mono-label rounded-full bg-primary/10 px-2 py-0.5 text-[8px] text-primary">
                              Built
                            </span>
                          ) : (
                            <span className="mono-label rounded-full bg-amber-500/10 px-2 py-0.5 text-[8px] text-amber-600 dark:text-amber-400">
                              Your action
                            </span>
                          )}
                        </span>
                        <span className="text-[13px] leading-relaxed text-muted-foreground">{item.detail}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      <p className="mono-label mt-10 text-[10px] text-muted-foreground">
        Generated for {LEGAL.entity} · items marked “Built” are complete in the app; “Your action” items are business or
        production steps you own. Ticks are saved to your account.
      </p>
    </main>
  )
}
