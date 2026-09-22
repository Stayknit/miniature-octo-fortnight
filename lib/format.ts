export function rand(n: number): string {
  return 'R ' + Math.round(n).toLocaleString('en-ZA').replace(/,/g, ' ')
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

// "2025-09-15" -> "15 SEP"
export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}

// "2025-09-15","2025-09-18" -> "15–18 SEP"
export function dateRange(inIso: string, outIso: string): string {
  const [, im, id] = inIso.split('-').map(Number)
  const [, om, od] = outIso.split('-').map(Number)
  if (im === om) return `${id}–${od} ${MONTHS[im - 1]}`
  return `${id} ${MONTHS[im - 1]} – ${od} ${MONTHS[om - 1]}`
}

export function agoLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  return `${h}h ago`
}

// Where a host logs in to accept/decline a reservation for a given channel.
// StayKnit holds the dates locally, but the real accept happens on the channel.
// `web` is the browser URL; `app` is the native host-app deep link (if one exists).
export type ChannelLogin = { web: string; app: string | null }

export function channelLogin(name: string): ChannelLogin | null {
  const key = name.toUpperCase()
  if (key.includes('AIRBNB')) return { web: 'https://www.airbnb.com/hosting/reservations', app: 'airbnb://' }
  if (key.includes('BOOKING')) return { web: 'https://admin.booking.com/', app: 'bookingpulse://' }
  if (key.includes('AGODA')) return { web: 'https://ycs.agoda.com/', app: 'agoda://' }
  if (key.includes('LEKKER')) return { web: 'https://www.lekkeslaap.co.za/tuis', app: null }
  if (key.includes('NIGHTS')) return { web: 'https://www.nightsbridge.com/bridgeit/', app: null }
  return null
}

function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

// On a phone, try to launch the channel's native app, then fall back to the
// website if the app doesn't take over. On desktop, just open the website.
export function openChannelLogin(login: ChannelLogin): void {
  if (typeof window === 'undefined') return
  if (isMobile() && login.app) {
    const openedAt = Date.now()
    const fallback = window.setTimeout(() => {
      // If the app opened, the tab is backgrounded and this rarely fires in time.
      if (Date.now() - openedAt < 2000) window.open(login.web, '_blank', 'noopener,noreferrer')
    }, 1200)
    // A blurred window means the OS handed off to the native app.
    window.addEventListener('blur', () => window.clearTimeout(fallback), { once: true })
    window.location.href = login.app
    return
  }
  window.open(login.web, '_blank', 'noopener,noreferrer')
}

// A consistent accent per channel name.
export function channelTint(name: string): string {
  const key = name.toUpperCase()
  if (key.includes('AIRBNB')) return '#e86a5a'
  if (key.includes('BOOKING')) return '#4c8dd6'
  if (key.includes('LEKKER')) return '#d9a441'
  if (key.includes('NIGHTS')) return '#8a7fd6'
  if (key.includes('AGODA')) return '#e0748f'
  if (key.includes('DIRECT')) return '#5fb3a1'
  if (key.includes('BLOCK')) return '#6a7c82'
  return '#5fb3a1'
}
