import { Plus } from 'lucide-react'

// Exported so the JSON-LD FAQPage rich result (structured-data.tsx) is generated
// from the exact same Q&A shown on the page — Google requires structured FAQ
// content to match the visible content.
export const FAQS = [
  {
    q: 'How is StayKnit different from Airbnb or a channel manager?',
    a: 'Airbnb and most managers take a percentage of every booking. StayKnit charges one flat monthly fee based on how many listings you manage — so as you earn more, you keep all of it.',
  },
  {
    q: 'Which channels can it sync?',
    a: 'Airbnb, Booking.com, Vrbo and 40+ other channels via calendar sync. Block a date on one and it updates everywhere, so you never double-book.',
  },
  {
    q: 'What is included in the free trial?',
    a: 'A 14-day trial with full access to every feature and one listing. No card is required to start, and nothing is charged until you choose to confirm a paid plan. Add a paid plan whenever you are ready to manage more.',
  },
  {
    q: 'How does billing work?',
    a: 'Plans are prepaid for the term you choose — monthly, 6 months (10% off), or 1 year (2 bonus months). Auto-renewal is optional and off by default, so you are never charged by surprise; switch it on at checkout (or later from your plan) if you would rather your term renew automatically, and turn it off any time. Payments are processed securely by Paystack.',
  },
  {
    q: 'Can property owners see their own data?',
    a: 'Yes. Each owner gets a read-only portal scoped to their own properties, with live occupancy and downloadable monthly statements.',
  },
  {
    q: 'Which currencies can I be billed in?',
    a: 'USD, EUR, GBP and ZAR. Your billing currency is locked to your region so the price you see is exactly what you pay.',
  },
  {
    q: 'Does StayKnit work for hosts in South Africa?',
    a: 'Yes. StayKnit is built for South African short-stay hosts and agencies — bill in ZAR through Paystack, sync LekkerSlaap alongside Airbnb, Booking.com and Vrbo, and send owners rand-denominated statements. It also works worldwide, with USD, EUR and GBP billing.',
  },
  {
    q: 'Is StayKnit a property management system for short-term rentals?',
    a: 'Yes. Beyond channel and calendar sync, StayKnit handles short-term rental management end to end: a unified multi-listing calendar, owner portals, automated owner statements and clean payout records — all for a flat monthly fee, with no commission on your bookings.',
  },
]

export function FaqSection() {
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-5 py-24">
      <div className="text-center">
        <span className="mono-label text-xs text-primary">Questions</span>
        <h2 className="mt-3 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
          Everything else you might ask
        </h2>
      </div>

      <div className="mt-10 divide-y divide-border border-y border-border">
        {FAQS.map((faq) => (
          <details key={faq.q} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
              {faq.q}
              <Plus className="size-5 shrink-0 text-primary transition-transform group-open:rotate-45" />
            </summary>
            <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">{faq.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
