import Link from 'next/link'
import { Wordmark } from '@/components/wordmark'
import { ContactLink } from '@/components/marketing/contact-link'

const COLUMNS = [
  {
    heading: 'Product',
    links: [
      { href: '#features', label: 'Features' },
      { href: '#owners', label: 'Owner portals' },
      { href: '#pricing', label: 'Pricing' },
      { href: '#faq', label: 'FAQ' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { href: '/sign-up', label: 'Start free trial' },
      { href: '/sign-in', label: 'Login' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { href: '/terms', label: 'Terms' },
      { href: '/privacy', label: 'Privacy' },
      { href: '/cookie-policy', label: 'Cookies' },
    ],
  },
]

export function MarketingFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-border bg-surface/40">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="max-w-xs">
          <Wordmark size={30} />
          <p className="mono-label mt-4 text-xs tracking-[0.2em] text-primary">
            Stays that fit your world
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            One calendar for every channel. Flat-fee property management for hosts and managers
            worldwide.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.heading}>
            <h3 className="mono-label text-xs text-muted-foreground">{col.heading}</h3>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-5 py-6 text-sm text-muted-foreground sm:flex-row">
          <p>© {year} StayKnit. All rights reserved.</p>
          <p>
            Questions? <ContactLink />
          </p>
        </div>
      </div>
    </footer>
  )
}
