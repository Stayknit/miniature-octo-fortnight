// Client-side purge of every Cache Storage entry the PWA holds.
//
// Why this matters for POPIA: the authenticated "/" route server-renders the
// host/owner workspace, so the navigation HTML embeds personal data (name,
// email, bookings, owners) in its serialized props. We must guarantee none of
// that survives a sign-out on a shared device. The service worker no longer
// caches navigations (see public/sw.js), but this is the belt-and-braces:
// on every logout we clear all caches directly from the page AND signal the
// active worker to do the same, so nothing lingers regardless of SW state.
export async function purgeAppCaches(): Promise<void> {
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    // Best-effort — a failure here must never block sign-out.
  }
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'SK_PURGE' })
  } catch {
    // No controller / unsupported — the direct delete above already ran.
  }
}
