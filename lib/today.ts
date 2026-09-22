// Single source of truth for "today". The app is South African (ZAR, en-ZA),
// so every "current date" surface — calendar headers, statement periods, trial
// countdowns, and form defaults — resolves in Africa/Johannesburg (UTC+2, no
// DST). This keeps server-rendered values and client-rendered values in step
// and, crucially, avoids the hardcoded-year drift that made the whole app read
// a year behind once the calendar rolled past the original demo date.

const TZ = 'Africa/Johannesburg'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export type DateParts = { year: number; month: number; day: number }

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// {year, month (1-12), day} for "now" in the app timezone.
export function todayParts(now: Date = new Date()): DateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return { year: get('year'), month: get('month'), day: get('day') }
}

// "YYYY-MM-DD" for today in the app timezone — the same format booking dates use.
export function todayIso(now: Date = new Date()): string {
  const { year, month, day } = todayParts(now)
  return `${year}-${pad(month)}-${pad(day)}`
}

// Shift an ISO date by a whole number of days, staying in "YYYY-MM-DD" form.
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

// Days in a given month (month is 1-12).
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? ''
}

// "September 2026" for the current (or given) month.
export function monthYearLabel(parts: DateParts = todayParts()): string {
  return `${monthName(parts.month)} ${parts.year}`
}

// The label N whole months before the current month, e.g. one month back from
// "September 2026" is "August 2026". Used for illustrative payout history.
export function monthsAgoLabel(n: number, parts: DateParts = todayParts()): string {
  const dt = new Date(Date.UTC(parts.year, parts.month - 1 - n, 1))
  return `${monthName(dt.getUTCMonth() + 1)} ${dt.getUTCFullYear()}`
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// Validate a booking/block date range against the server's real "today".
// Returns a human-readable error string when invalid, or null when acceptable.
// Because dates are "YYYY-MM-DD" strings, lexical comparison is date comparison.
export function validateStayRange(checkIn: string, checkOut: string): string | null {
  if (!ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut)) {
    return 'Enter valid check-in and check-out dates.'
  }
  if (checkIn < todayIso()) return 'Check-in can\u2019t be in the past.'
  if (checkOut <= checkIn) return 'Check-out must be after check-in.'
  return null
}
