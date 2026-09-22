import { CalendarDays, RefreshCw, Users, Wallet, ShieldCheck, Globe } from 'lucide-react'

const FEATURES = [
  {
    icon: RefreshCw,
    title: 'Channel sync',
    body: 'Airbnb, Booking.com, Vrbo and 40+ more update in real time. Close a date once and it closes everywhere.',
  },
  {
    icon: CalendarDays,
    title: 'One unified calendar',
    body: 'Every listing and every channel on a single timeline. See arrivals, gaps and overlaps at a glance.',
  },
  {
    icon: Users,
    title: 'Owner portals',
    body: 'Give each property owner their own live view of occupancy, bookings and statements — no spreadsheets.',
    free: true,
  },
  {
    icon: Wallet,
    title: 'Payouts & statements',
    body: 'Auto-generated owner statements and clean payout records, so month-end reconciles itself.',
    free: true,
  },
  {
    icon: Globe,
    title: 'Billed in your currency',
    body: 'Prices settle in USD, EUR, GBP or ZAR, locked to your region so what you see is what you pay.',
  },
  {
    icon: ShieldCheck,
    title: 'Flat fee, no commission',
    body: 'Pay by number of listings, never a slice of each stay. Your nightly rate stays yours.',
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24">
      <div className="max-w-2xl">
        <span className="mono-label text-xs text-primary">Everything in one place</span>
        <h2 className="mt-3 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
          Run every listing without the busywork
        </h2>
        <p className="mt-4 text-pretty text-lg text-muted-foreground">
          StayKnit replaces the tangle of spreadsheets, channel logins and manual owner emails with
          one workspace built for hosts and managers.
        </p>
      </div>

      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <li
            key={feature.title}
            className="group rounded-xl border border-border bg-surface p-6 transition-colors hover:border-border-strong"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="inline-flex size-11 items-center justify-center rounded-lg border border-border-strong bg-accent text-accent-foreground">
                <feature.icon className="size-5" />
              </span>
              {feature.free && (
                <span className="inline-flex items-center rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  Free
                </span>
              )}
            </div>
            <h3 className="mt-4 text-lg font-bold">{feature.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
