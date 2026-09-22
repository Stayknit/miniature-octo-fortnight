import type { MetadataRoute } from 'next'

const SITE_URL = 'https://www.stayknit.org'

// Public, indexable pages only — private/auth/admin routes are excluded here and
// in robots.ts. Anchor sections (#pricing, #faq) live on `/`, so the homepage
// carries the highest priority.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  return [
    {
      url: SITE_URL,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/cookie-policy`,
      lastModified,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]
}
