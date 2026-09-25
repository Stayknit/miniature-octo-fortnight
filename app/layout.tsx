import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { Archivo, IBM_Plex_Mono } from 'next/font/google'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { PWARegister } from '@/components/pwa-register'
import { CookieConsent } from '@/components/cookie-consent'
import './globals.css'

// Applies the saved color mode (Dark / Light / Midnight / Sepia) to <html>
// before first paint so there's no flash of the default theme. Kept as a tiny
// inline string — it must run before hydration and can't import modules. The
// allow-list and keys mirror lib/theme.ts.
const THEME_INIT = `(function(){try{var k='stayknit-theme';var m=localStorage.getItem(k);var ok=['dark','light','midnight','sepia'];if(ok.indexOf(m)===-1)m='dark';var e=document.documentElement;e.dataset.theme=m;e.classList.toggle('dark',m!=='light'&&m!=='sepia');}catch(_){}})();`

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '800', '900'],
  variable: '--font-archivo',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
})

const SITE_URL = 'https://www.stayknit.org'
// Keyword-led title: leads with the terms hosts actually search ("channel
// manager", "short-stay rentals") while keeping the brand. Kept under ~60 chars
// so Google shows it in full. Sub-pages use the template.
const SITE_TITLE = 'StayKnit — Channel Manager for Short-Stay Rentals'
const SITE_DESCRIPTION =
  'StayKnit is a zero-commission channel manager for short-stay & vacation rentals. Sync Airbnb, Booking.com, Vrbo & LekkerSlaap calendars, prevent double-bookings, and manage owners and payouts — one flat monthly fee, billed in ZAR.'

// Primary organic-search terms for StayKnit, ordered by intent. Google no longer
// ranks on the keywords meta tag, but Bing and several AI/answer engines still
// read it, and it documents the SEO target for future copy.
const SITE_KEYWORDS = [
  'channel manager',
  'channel manager South Africa',
  'Airbnb calendar sync',
  'Booking.com channel manager',
  'Vrbo calendar sync',
  'LekkerSlaap channel manager',
  'short-stay rental management software',
  'short-term rental software',
  'vacation rental management software',
  'self-catering booking software',
  'guesthouse booking management',
  'iCal sync Airbnb Booking.com',
  'no commission channel manager',
  'zero commission property management',
  'prevent double bookings',
  'property management software South Africa',
  'owner statements short-term rental',
  'Paystack rental billing',
]

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: '%s · StayKnit',
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  generator: 'v0.app',
  applicationName: 'StayKnit',
  manifest: '/manifest.webmanifest',
  category: 'business',
  creator: 'StayKnit',
  publisher: 'StayKnit',
  authors: [{ name: 'StayKnit', url: SITE_URL }],
  alternates: {
    canonical: '/',
  },
  // Google (and Bing) site-ownership verification. The Google token is a public
  // (non-secret) Search Console verification value, so it's set directly here;
  // an env var can still override it if you rotate properties later. Bing's
  // token, if you add one, comes from NEXT_PUBLIC_BING_SITE_VERIFICATION.
  verification: {
    google:
      process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ||
      'ndCBh3FsXth9Rk16gaDZM16TJK1CvJK8uhIve018hp8',
    other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
      : {},
  },
  formatDetection: {
    telephone: false,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'StayKnit',
  },
  icons: {
    icon: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    type: 'website',
    siteName: 'StayKnit',
    locale: 'en_ZA',
    url: SITE_URL,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'StayKnit — one calendar for every booking channel',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ['/og-image.png'],
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0a0f11',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`dark ${archivo.variable} ${plexMono.variable} bg-background`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT}
        </Script>
        {children}
        <PWARegister />
        <CookieConsent analyticsEnabled={process.env.NODE_ENV === 'production'} />
        <SpeedInsights />
      </body>
    </html>
  )
}
