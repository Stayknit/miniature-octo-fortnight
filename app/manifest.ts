import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'StayKnit — stays that fit your world',
    short_name: 'StayKnit',
    description:
      'One calendar for every channel. StayKnit syncs availability across Airbnb, Booking.com, LekkerSlaap and more so your rentals never double-book.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0f11',
    theme_color: '#0a0f11',
    categories: ['business', 'productivity', 'travel'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
