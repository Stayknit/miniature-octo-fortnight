import Link from 'next/link'
import { LEGAL } from '@/lib/legal'

// Global footer with the required legal links (report #11). Rendered on public
// pages (sign-in/up, legal) and linked from the authenticated app via Settings.
export function SiteFooter() {
  return (
    <footer className="mt-10 w-full border-t border-border pt-5 text-center">
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[12px] text-muted-foreground">
        <Link href="/terms" className="hover:text-foreground hover:underline">
          Terms of Service
        </Link>
        <span aria-hidden className="text-border-strong">·</span>
        <Link href="/privacy" className="hover:text-foreground hover:underline">
          Privacy Policy
        </Link>
        <span aria-hidden className="text-border-strong">·</span>
        <Link href="/cookie-policy" className="hover:text-foreground hover:underline">
          Cookies
        </Link>
      </nav>
      <p className="mt-3 text-[11px] text-muted-foreground">
        © {new Date().getFullYear()} {LEGAL.entity}. All rights reserved.
      </p>
    </footer>
  )
}
