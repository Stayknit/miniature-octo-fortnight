import { ArrowRight } from 'lucide-react'
import { CtaLink } from '@/components/marketing/cta-link'
import { InstallPrompt } from '@/components/install-prompt'

export function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-24">
      <div className="relative overflow-hidden rounded-2xl border border-border-strong bg-surface px-6 py-16 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_120%_at_50%_0%,var(--color-primary-dim)_0%,transparent_70%)]"
        />
        <div className="relative mx-auto max-w-2xl">
          <h2 className="text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
            Start knitting your stays together today
          </h2>
          <p className="mt-4 text-pretty text-lg text-muted-foreground">
            Set up your workspace in minutes. Full access with no charge until you subscribe, and zero
            commission on every booking you take.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <CtaLink href="/sign-up" size="lg">
              Start 14-day free trial
              <ArrowRight className="size-4" />
            </CtaLink>
            <CtaLink href="/sign-in" variant="outline" size="lg">
              Sign in
            </CtaLink>
          </div>
          <div className="mx-auto mt-10 max-w-xs">
            <p className="mono-label mb-2 text-[9px] text-muted-foreground">Prefer an app?</p>
            <InstallPrompt />
          </div>
        </div>
      </div>
    </section>
  )
}
