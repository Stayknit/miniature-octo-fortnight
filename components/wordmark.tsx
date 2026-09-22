import Image from 'next/image'

// Official brand assets, both 980x906 with the identical emblem geometry.
// White (reversed) text for dark surfaces; standard dark text for light ones.
const LOGO = {
  white: '/images/stayknit-logo-white.png',
  standard: '/images/stayknit-logo-standard.png',
} as const

type LogoVariant = keyof typeof LOGO

/**
 * The house/ribbon emblem, cropped out of the full vertical logo lockup with a
 * fixed square window. Percentages are relative to the square box so it scales
 * to any `size` without a separate asset. Source art is 980x906; the emblem
 * occupies roughly x:[185,800], y:[20,555]. The emblem art is identical across
 * variants, so the crop uses the white asset for crisp rendering on dark chrome.
 */
export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`relative inline-block shrink-0 overflow-hidden ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={LOGO.white || '/placeholder.svg'}
        alt=""
        style={{
          position: 'absolute',
          maxWidth: 'none',
          width: '159.3%',
          left: '-30.08%',
          top: '3.25%',
        }}
      />
    </span>
  )
}

/**
 * Horizontal lockup: emblem + "StayKnit" text. Used in the app chrome
 * (sidebar, headers). `compact` drops the text and shows the mark alone.
 */
export function Wordmark({ compact = false, size = 32 }: { compact?: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      {!compact && (
        <span className="font-sans text-lg font-extrabold tracking-tight text-foreground">
          Stay<span className="text-primary">Knit</span>
        </span>
      )}
    </span>
  )
}

/**
 * The full vertical brand lockup (emblem + wordmark + tagline) for prominent
 * placements like the auth screens. Defaults to the reversed-white variant for
 * dark backgrounds; pass `variant="standard"` on light backgrounds.
 */
export function BrandLockup({
  width = 200,
  className = '',
  variant = 'white',
}: {
  width?: number
  className?: string
  variant?: LogoVariant
}) {
  return (
    <Image
      src={LOGO[variant] || '/placeholder.svg'}
      alt="StayKnit — stays that fit your world"
      width={width}
      height={Math.round((width * 906) / 980)}
      priority
      className={className}
    />
  )
}
