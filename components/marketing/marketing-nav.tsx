import Link from 'next/link'
import { Wordmark } from '@/components/wordmark'
import { CtaLink } from '@/components/marketing/cta-link'

const LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#owners', label: 'Owner portals' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
]

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-3 sm:gap-4 sm:px-5">
        <Link href="/" aria-label="StayKnit home" className="shrink-0">
          <Wordmark size={30} />
        </Link>

        <ul className="hidden items-center gap-7 md:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Link
            href="/sign-in"
            className="inline-flex h-10 items-center rounded-lg px-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground sm:px-4"
          >
            Login
          </Link>
          <CtaLink href="/sign-up" className="px-3 sm:px-4">
            Start free trial
          </CtaLink>
        </div>
      </nav>
    </header>
  )
}
