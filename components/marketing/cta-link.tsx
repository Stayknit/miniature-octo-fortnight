import Link from 'next/link'
import { cn } from '@/lib/utils'

type Props = {
  href: string
  children: React.ReactNode
  variant?: 'primary' | 'outline'
  size?: 'md' | 'lg'
  className?: string
}

// Marketing-scale call to action. The app's own Button is intentionally small
// for dense chrome, so landing-page CTAs use their own generous sizing while
// still drawing from the shared design tokens.
export function CtaLink({ href, children, variant = 'primary', size = 'md', className }: Props) {
  const external = href.startsWith('mailto:') || href.startsWith('http')
  const classes = cn(
    'inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap transition-all active:translate-y-px focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
    size === 'lg' ? 'h-12 px-6 text-base' : 'h-10 px-4 text-sm',
    variant === 'primary'
      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
      : 'border border-border-strong bg-surface text-foreground hover:bg-surface-2',
    className,
  )
  if (external) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  )
}
