import { ArrowRight, Check } from 'lucide-react'
import { CtaLink } from '@/components/marketing/cta-link'

const CHANNELS = [
  { name: 'Airbnb', tone: 'text-[#e86a5a]' },
  { name: 'Booking.com', tone: 'text-primary-muted' },
  { name: 'Vrbo', tone: 'text-warning' },
  { name: 'Direct', tone: 'text-primary' },
]

// A booking bar on the unified calendar. `col`/`span` are 1-based positions
// across a 7-day week; `row` stacks lanes.
const BARS = [
  { channel: 'Airbnb', col: 1, span: 3, row: 1, color: 'bg-[#e86a5a]' },
  { channel: 'Booking.com', col: 4, span: 2, row: 2, color: 'bg-primary-muted' },
  { channel: 'Direct', col: 6, span: 2, row: 1, color: 'bg-primary' },
  { channel: 'Vrbo', col: 2, span: 2, row: 3, color: 'bg-warning' },
]

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_80%_at_50%_-10%,var(--color-primary-dim)_0%,transparent_70%)]"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 py-20 lg:grid-cols-[1.05fr_1fr] lg:py-28">
        <div className="flex flex-col items-start">
          <span className="mono-label inline-flex items-center gap-2 rounded-full border border-border-strong bg-accent px-3 py-1 text-xs text-accent-foreground">
            Zero commission, ever
          </span>
          <h1 className="mt-5 text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            The channel manager for <span className="text-primary">short-stay rentals</span>.
          </h1>
          <p className="mono-label mt-4 text-xs tracking-[0.2em] text-primary">
            One calendar for every booking channel
          </p>
          <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
            StayKnit is a zero-commission channel manager for short-stay and vacation rentals. Sync
            Airbnb, Booking.com, Vrbo and LekkerSlaap calendars so your rentals never double-book, and
            manage bookings, owners and payouts from one workspace — for a flat monthly fee in ZAR,
            not a cut of every stay.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <CtaLink href="/sign-up" size="lg">
              Start 14-day free trial
              <ArrowRight className="size-4" />
            </CtaLink>
            <CtaLink href="#pricing" variant="outline" size="lg">
              See pricing
            </CtaLink>
          </div>

          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
            {['No charge until you subscribe', 'Full access on every plan', 'Cancel anytime'].map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="size-4 shrink-0 text-primary" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* In-DOM product preview: many channels collapsing into one calendar. */}
        <div className="relative">
          <div className="rounded-xl border border-border bg-surface p-5 shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-primary animate-pulse-dot" />
                <span className="mono-label text-xs text-muted-foreground">Live sync</span>
              </div>
              <span className="text-xs text-muted-foreground">This week</span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {CHANNELS.map((c) => (
                <span
                  key={c.name}
                  className={`rounded-md border border-border bg-surface-2 px-2.5 py-1 text-xs font-semibold ${c.tone}`}
                >
                  {c.name}
                </span>
              ))}
            </div>

            <div className="mt-4 rounded-lg border border-border bg-panel p-3">
              <div className="grid grid-cols-7 gap-1 text-center">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                  <span key={i} className="mono-label text-[10px] text-muted-foreground">
                    {d}
                  </span>
                ))}
              </div>
              <div className="relative mt-2 grid grid-cols-7 grid-rows-3 gap-1">
                {Array.from({ length: 21 }).map((_, i) => (
                  <span key={i} className="h-7 rounded bg-surface-2/60" />
                ))}
                {BARS.map((bar) => (
                  <span
                    key={bar.channel}
                    className={`${bar.color} pointer-events-none absolute flex h-7 items-center overflow-hidden rounded px-2 text-[10px] font-semibold text-primary-foreground`}
                    style={{
                      left: `calc(${((bar.col - 1) / 7) * 100}% + 2px)`,
                      width: `calc(${(bar.span / 7) * 100}% - 4px)`,
                      top: `${(bar.row - 1) * (28 + 4)}px`,
                    }}
                  >
                    {bar.channel}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-lg border border-border-strong bg-accent px-3 py-2">
              <span className="text-sm font-medium text-accent-foreground">No double-bookings</span>
              <Check className="size-4 text-primary" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
