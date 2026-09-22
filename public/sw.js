// StayKnit service worker — enables installable PWA + light offline support.
// Deliberately conservative: it never caches API, auth, or payment traffic, and
// it never caches page navigations, so live data and sign-in always hit the
// network and no authenticated HTML is ever written to disk.
//
// POPIA note: the authenticated "/" route server-renders the host/owner
// workspace, so its navigation HTML embeds personal data in serialized props.
// Caching navigations would leave that PII in Cache Storage after logout (a
// shared-device leak), so navigations are network-only with a static,
// PII-free "/offline" fallback. Bumping CACHE below also evicts any PII that a
// previous ("v1") worker cached, on the next activation.
const CACHE = 'stayknit-v2'

// App-shell assets that are safe to precache (static, public, unauthenticated).
// "/offline" is a static page with no session data — the offline fallback.
const PRECACHE = ['/offline', '/icon-192.png', '/icon-512.png', '/apple-icon.png', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Logout hook: the page posts { type: 'SK_PURGE' } on sign-out so every cache
// (including any static assets) is dropped immediately, not just on the next
// version bump.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SK_PURGE') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))))
  }
})

function isBypassed(url) {
  // Never intercept dynamic or credentialed traffic.
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('/auth') ||
    url.hostname.includes('paystack')
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (isBypassed(url)) return

  // Navigations: network-only, never cached (the HTML can contain PII). When
  // offline, fall back to the static, data-free "/offline" page.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline')))
    return
  }

  // Same-origin static assets: stale-while-revalidate for snappy repeat loads.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(request, copy))
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})
