import type { Booking } from '@/lib/types'

// ISO yyyy-mm-dd strings compare lexicographically, so plain string comparison
// is a correct date comparison here.

// Two stays overlap when each starts before the other ends. Checkout day is
// exclusive (the guest leaves that morning), so a same-day turnover — one
// checkout equal to the next check-in — is NOT a clash.
export function rangesOverlap(aIn: string, aOut: string, bIn: string, bOut: string): boolean {
  return aIn < bOut && bIn < aOut
}

// Bookings on the same unit whose dates collide with `target` (excluding itself).
export function findClashes(target: Booking, all: Booking[]): Booking[] {
  return all.filter(
    (b) =>
      b.id !== target.id &&
      b.propertyName === target.propertyName &&
      rangesOverlap(target.checkIn, target.checkOut, b.checkIn, b.checkOut),
  )
}

// Would a proposed date range collide with any existing booking on a unit?
export function findClashesFor(
  propertyName: string,
  checkIn: string,
  checkOut: string,
  all: Booking[],
): Booking[] {
  return all.filter(
    (b) => b.propertyName === propertyName && rangesOverlap(checkIn, checkOut, b.checkIn, b.checkOut),
  )
}

// Every booking id that participates in at least one clash — used to flag bars.
export function clashingIds(all: Booking[]): Set<number> {
  const ids = new Set<number>()
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i]
      const b = all[j]
      if (a.propertyName === b.propertyName && rangesOverlap(a.checkIn, a.checkOut, b.checkIn, b.checkOut)) {
        ids.add(a.id)
        ids.add(b.id)
      }
    }
  }
  return ids
}

// Distinct clashing pairs, for a human-readable "double booking" list.
export function clashPairs(all: Booking[]): [Booking, Booking][] {
  const pairs: [Booking, Booking][] = []
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i]
      const b = all[j]
      if (a.propertyName === b.propertyName && rangesOverlap(a.checkIn, a.checkOut, b.checkIn, b.checkOut)) {
        pairs.push([a, b])
      }
    }
  }
  return pairs
}
