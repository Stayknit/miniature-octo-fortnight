import { Building2, CalendarCheck, Compass, Eye, HandHeart, Link2, RefreshCw, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'

// Popular examples of booking platforms StayKnit synchronises across. These are
// not exhaustive — StayKnit works with ANY platform that exposes an iCal feed.
const CHANNELS = ['Airbnb', 'Booking.com', 'LekkerSlaap', 'NightsBridge']

// Concrete capabilities, straight from the company profile.
const CAPABILITIES = [
  'Synchronize availability across connected booking channels',
  'Manage multiple listings from one centralized platform',
  'Reduce the risk of double bookings',
  'Minimize repetitive administrative tasks',
  'Monitor listing availability more efficiently',
  'Connect and manage multiple booking channels',
  'Streamline day-to-day rental operations',
]

// Company story blocks that follow the intro.
const SECTIONS: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <Compass size={16} className="text-primary" />,
    title: 'Our purpose',
    body: 'Managing listings across multiple booking platforms can be time-consuming and complicated. Availability changes constantly, and manually updating calendars creates unnecessary work and increases the risk of errors. StayKnit was created to make this simpler — so hosts and property managers spend less time managing calendars and more time focusing on their guests and growing their businesses.',
  },
  {
    icon: <Eye size={16} className="text-primary" />,
    title: 'Our vision',
    body: 'To become a trusted technology platform for accommodation providers worldwide, making multi-channel property management simpler, smarter and more efficient. We believe technology should remove complexity rather than create it.',
  },
  {
    icon: <HandHeart size={16} className="text-primary" />,
    title: 'Our commitment',
    body: 'We are committed to building reliable, intuitive and accessible technology for the evolving hospitality industry — continuously improving automation, connectivity and efficiency while developing solutions that grow alongside our customers.',
  },
]

// Company profile / "Who We Are". Reused on the Plan screen and in the Help
// panel so the business story is available wherever a host looks for it.
export function WhoWeAre() {
  return (
    <section aria-labelledby="who-we-are-heading" className="flex flex-col gap-5">
      {/* Intro */}
      <div className="rounded-xl border border-border-strong bg-surface-2 p-5">
        <div className="flex items-center gap-2">
          <Building2 size={16} className="text-primary" />
          <span className="mono-label text-[9px] text-primary">Who we are</span>
        </div>
        <h2 id="who-we-are-heading" className="mt-2 font-sans text-xl font-extrabold">
          StayKnit (Pty) Ltd
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          A South African hospitality technology company providing smart, reliable software for the short-term and
          vacation rental industry. We help property owners, hosts and professional property managers simplify how they
          manage availability across multiple booking channels — reducing administrative workload, minimizing the risk
          of double bookings, and giving hosts greater control from one centralized platform.
        </p>

        <p className="mono-label mt-4 text-[8px] text-muted-foreground">Connected channels</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {CHANNELS.map((c) => (
            <span
              key={c}
              className="mono-label inline-flex items-center gap-1.5 rounded-md border border-border bg-panel px-2.5 py-1.5 text-[10px] text-foreground"
            >
              <Link2 size={11} className="text-primary" />
              {c}
            </span>
          ))}
          <span className="mono-label inline-flex items-center gap-1.5 rounded-md border border-dashed border-primary/50 bg-primary-dim/30 px-2.5 py-1.5 text-[10px] text-primary">
            <CalendarCheck size={11} />
            Any iCal calendar
          </span>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          These are just popular examples — StayKnit connects to <span className="font-semibold text-foreground">any
          booking platform that provides an iCal (.ics) calendar feed</span>, so you&apos;re never limited to a fixed
          list of channels.
        </p>
      </div>

      {/* What we do */}
      <div className="rounded-xl border border-border bg-panel p-5">
        <div className="flex items-center gap-2">
          <RefreshCw size={16} className="text-primary" />
          <h3 className="font-sans text-[15px] font-bold">What we do</h3>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          StayKnit provides technology that helps accommodation providers:
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {CAPABILITIES.map((c) => (
            <li key={c} className="flex items-start gap-2 text-[13px] leading-relaxed text-foreground">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary" />
              <span>{c}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          Our platform is built with scalability in mind — supporting individual property owners as well as
          professional managers operating larger portfolios.
        </p>
      </div>

      {/* Story blocks */}
      <div className="grid gap-3 sm:grid-cols-3">
        {SECTIONS.map((s) => (
          <div key={s.title} className="flex flex-col gap-2 rounded-xl border border-border bg-panel p-4">
            <div className="flex items-center gap-2">
              {s.icon}
              <h3 className="font-sans text-[14px] font-bold">{s.title}</h3>
            </div>
            <p className="text-[12px] leading-relaxed text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </div>

      {/* Tagline */}
      <p className="rounded-xl border border-primary/40 bg-primary-dim/40 px-5 py-4 text-center font-sans text-[14px] font-bold leading-relaxed text-foreground">
        StayKnit — Simplify your channels. Synchronize your availability. Grow your business.
      </p>
    </section>
  )
}
