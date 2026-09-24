// A dependency-free iCalendar (.ics) reader for availability feeds.
// Booking channels (Airbnb, Booking.com, etc.) publish one .ics export per
// listing; each reservation is a VEVENT with a start/end date and a summary.

export type IcalEvent = {
  uid: string
  summary: string
  start: string // yyyy-mm-dd
  end: string // yyyy-mm-dd (checkout / exclusive end)
  // The VEVENT STATUS, upper-cased (e.g. 'CANCELLED'), when the feed sets one.
  // Most OTAs drop a cancelled booking's event entirely, but some keep it with
  // STATUS:CANCELLED — the importer uses this to free the date either way.
  status?: string
}

// yyyymmdd or yyyymmddThhmmss[Z] -> yyyy-mm-dd.
// We deliberately use the encoded calendar date (the local wall-clock day),
// which is what availability feeds intend — a stay's check-in *day* — including
// for TZID/floating date-time values like DTSTART;TZID=Africa/Johannesburg:
// 20260301T140000. (A pure-UTC 'Z' time near midnight could differ by a day
// from the venue's local date, but channels publish availability as local
// day-granularity events, so we don't guess a venue timezone.)
function toIsoDate(v: string): string {
  const m = v.match(/(\d{4})(\d{2})(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : ''
}

// --- date arithmetic on yyyy-mm-dd (UTC-based, no timezone drift) ------------
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}
function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCMonth(dt.getUTCMonth() + months)
  return dt.toISOString().slice(0, 10)
}
function daysBetweenIso(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

type Rrule = { freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'; interval: number; count?: number; until?: string }

// Parse the subset of RRULE that availability feeds actually use: FREQ +
// INTERVAL + COUNT/UNTIL. BYDAY and other refinements are ignored (we fall back
// to stepping from DTSTART), which is safe — it can only ever over-block, never
// leave a recurring hold open.
function parseRrule(v: string): Rrule | null {
  const parts: Record<string, string> = {}
  for (const p of v.split(';')) {
    const [k, val] = p.split('=')
    if (k && val) parts[k.toUpperCase()] = val
  }
  const freq = (parts.FREQ || '').toUpperCase()
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') return null
  const interval = Math.max(1, parseInt(parts.INTERVAL || '1', 10) || 1)
  const count = parts.COUNT ? Math.max(1, parseInt(parts.COUNT, 10) || 1) : undefined
  const until = parts.UNTIL ? toIsoDate(parts.UNTIL) : undefined
  return { freq, interval, count, until }
}

// Hard caps so a malformed or unbounded RRULE can never blow up memory/DB.
const RRULE_MAX_OCCURRENCES = 400
const RRULE_HORIZON_DAYS = 730 // don't project blocks more than ~2 years out

function stepIso(iso: string, rule: Rrule): string {
  switch (rule.freq) {
    case 'DAILY':
      return addDaysIso(iso, rule.interval)
    case 'WEEKLY':
      return addDaysIso(iso, rule.interval * 7)
    case 'MONTHLY':
      return addMonthsIso(iso, rule.interval)
    case 'YEARLY':
      return addMonthsIso(iso, rule.interval * 12)
  }
}

// Expand a recurring event into individual occurrences, each carrying the base
// duration. Fully-past occurrences are dropped (they don't affect availability
// and only add DB churn). Each gets a stable per-date UID so reconciliation
// treats occurrences as distinct stays.
function expandRecurrence(base: IcalEvent, rule: Rrule): IcalEvent[] {
  const durationDays = Math.max(1, daysBetweenIso(base.start, base.end))
  const today = new Date().toISOString().slice(0, 10)
  const horizon = addDaysIso(today, RRULE_HORIZON_DAYS)
  const out: IcalEvent[] = []
  let start = base.start
  for (let i = 0; i < RRULE_MAX_OCCURRENCES; i++) {
    if (rule.count !== undefined && i >= rule.count) break
    if (rule.until && start > rule.until) break
    if (start > horizon) break
    const end = addDaysIso(start, durationDays)
    // Keep occurrences that haven't fully ended yet.
    if (end >= today) {
      out.push({
        uid: base.uid ? `${base.uid}#${start}` : '',
        summary: base.summary,
        start,
        end,
        status: base.status,
      })
    }
    start = stepIso(start, rule)
  }
  return out
}

export function parseIcal(text: string): IcalEvent[] {
  // Unfold RFC 5545 line continuations (a leading space/tab continues the
  // previous line), then walk VEVENT blocks.
  const unfolded = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '')
  const lines = unfolded.split('\n')
  const events: IcalEvent[] = []
  let cur: (Partial<IcalEvent> & { rrule?: string }) | null = null

  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) {
      cur = {}
    } else if (line.startsWith('END:VEVENT')) {
      if (cur?.start) {
        // A missing DTEND means a same-day (single night) event: end = start+1.
        const end = cur.end ?? addDaysIso(cur.start, 1)
        const base: IcalEvent = {
          uid: cur.uid ?? '',
          summary: cur.summary ?? '',
          start: cur.start,
          end,
          status: cur.status,
        }
        const rule = cur.rrule ? parseRrule(cur.rrule) : null
        if (rule) events.push(...expandRecurrence(base, rule))
        else events.push(base)
      }
      cur = null
    } else if (cur) {
      const idx = line.indexOf(':')
      if (idx === -1) continue
      const key = line.slice(0, idx).split(';')[0].toUpperCase()
      const val = line.slice(idx + 1).trim()
      if (key === 'UID') cur.uid = val
      else if (key === 'SUMMARY') cur.summary = val
      else if (key === 'DTSTART') cur.start = toIsoDate(val)
      else if (key === 'DTEND') cur.end = toIsoDate(val)
      else if (key === 'RRULE') cur.rrule = val
      else if (key === 'STATUS') cur.status = val.toUpperCase()
    }
  }
  return events
}

// webcal:// and bare hostnames are coerced to a fetchable https URL.
export function normalizeIcalUrl(raw: string): string | null {
  let u = raw.trim()
  if (!u) return null
  if (u.startsWith('webcal://')) u = 'https://' + u.slice('webcal://'.length)
  else if (!/^https?:\/\//i.test(u)) u = 'https://' + u
  try {
    new URL(u)
    return u
  } catch {
    return null
  }
}

// Best-effort channel label from the feed host.
export function channelFromUrl(url: string): string {
  const u = url.toLowerCase()
  if (u.includes('airbnb')) return 'AIRBNB'
  if (u.includes('booking')) return 'BOOKING.COM'
  if (u.includes('lekker')) return 'LEKKERSLAAP'
  if (u.includes('nights')) return 'NIGHTSBRIDGE'
  if (u.includes('agoda')) return 'AGODA'
  if (u.includes('expedia')) return 'EXPEDIA'
  if (u.includes('vrbo') || u.includes('homeaway')) return 'VRBO'
  return 'ICAL'
}

// Airbnb/Booking use summaries like "CLOSED - Not available" for owner holds.
export function isBlockSummary(summary: string): boolean {
  return /not available|unavailable|blocked|closed/i.test(summary)
}
