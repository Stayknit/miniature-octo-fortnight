import type { MetadataRoute } from 'next'

const SITE_URL = 'https://www.stayknit.org'

// Let search engines crawl the public marketing + legal pages, but keep private
// surfaces (admin, auth flows, receipts, API) out of the index. Keeping thin,
// non-content routes uncrawled focuses ranking signals on the pages that matter.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/api',
          '/2fa',
          '/sign-in',
          '/sign-up',
          '/forgot-password',
          '/reset-password',
          '/promo',
          '/receipt',
          '/launch-checklist',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
