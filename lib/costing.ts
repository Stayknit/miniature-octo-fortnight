// Shared costing model. Cost lines are host-wide (or property-scoped) defaults
// applied to a gross figure to produce the deduction lines on an owner
// statement. VAT is charged on the lines flagged as host fees. Kept free of
// server/db imports so both server actions and client components can use it.

import type { CostLine } from '@/lib/types'

export type CostKind = 'percent' | 'fixed'

// The shape the UI edits and the server persists (mirrors the cost_line table,
// minus row bookkeeping the compute step never needs).
export type CostLineInput = {
  id: number
  label: string
  kind: CostKind
  value: number // whole percent (0-100) or whole rand
  perBooking: boolean
  enabled: boolean
  propertyName: string // '' = host-wide; otherwise scoped to that unit
  vatable: boolean // host fee that VAT is charged on
}

// A computed deduction on a statement: a positive rand amount subtracted from
// gross, plus a human label describing how it was derived.
export type ComputedLine = {
  label: string
  amount: number
}

// VAT applied to the vatable (host-fee) lines on a statement.
export type VatConfig = {
  enabled: boolean
  rate: number // whole percent, e.g. 15
}

// One property's contribution to a statement, used to apply property-scoped
// lines against the right unit's revenue.
export type PropertySlice = {
  name: string
  gross: number
  bookings: number
}

export const COST_KINDS: { key: CostKind; label: string }[] = [
  { key: 'percent', label: '% of gross' },
  { key: 'fixed', label: 'Fixed amount' },
]

export const DEFAULT_VAT_RATE = 15

// The defaults a brand-new host starts with, mirroring a typical SA management
// statement. `management` seeds from the host's existing commission setting so
// nothing changes silently for hosts who already set one. The management fee is
// marked vatable — it is the host's own fee, the base VAT is charged on.
export function defaultCostLines(managementPct: number): Omit<CostLineInput, 'id'>[] {
  return [
    { label: 'Management fee', kind: 'percent', value: managementPct, perBooking: false, enabled: true, propertyName: '', vatable: true },
    { label: 'Third party fees', kind: 'percent', value: 15, perBooking: false, enabled: true, propertyName: '', vatable: false },
    { label: 'Cleaning', kind: 'fixed', value: 950, perBooking: true, enabled: true, propertyName: '', vatable: false },
    { label: 'Laundry', kind: 'fixed', value: 108, perBooking: true, enabled: true, propertyName: '', vatable: false },
  ]
}

// Clamp a raw input to a valid stored value for its kind.
export function normalizeCostValue(kind: CostKind, value: number): number {
  const v = Math.round(Number(value) || 0)
  if (kind === 'percent') return Math.min(100, Math.max(0, v))
  return Math.max(0, v)
}

// Clamp a VAT rate to a sane whole percent.
export function normalizeVatRate(value: number): number {
  return Math.min(100, Math.max(0, Math.round(Number(value) || 0)))
}

// Describe a line for the statement, e.g. "Management fee (10%)" or
// "Cleaning (R950 × 3)". Property-scoped lines are suffixed with the unit so a
// multi-property statement makes clear which charge belongs where. `symbol` is
// the active currency symbol.
function lineLabel(line: CostLineInput, bookings: number, symbol: string): string {
  const scope = line.propertyName ? ` · ${line.propertyName}` : ''
  if (line.kind === 'percent') return `${line.label} (${line.value}%)${scope}`
  if (line.perBooking && bookings > 1)
    return `${line.label} (${symbol}${line.value.toLocaleString('en-ZA')} × ${bookings})${scope}`
  return `${line.label}${scope}`
}

// The rand amount of a single line for a given gross / booking count.
// A per-booking fixed fee is gated on real occupancy: with zero bookings it is
// zero (not one), so an owner with no stays is never charged a phantom cleaning
// or laundry fee. Flat (non-per-booking) fixed fees still apply once as genuine
// recurring account charges.
function lineAmount(line: CostLineInput, gross: number, bookings: number): number {
  return line.kind === 'percent'
    ? Math.round((gross * line.value) / 100)
    : line.value * (line.perBooking ? Math.max(0, bookings) : 1)
}

// Turn the host's cost lines into concrete deductions for a single gross and
// booking count, ignoring property scope. Used for a one-unit view where every
// applicable line already belongs to that unit. Disabled and zero lines drop.
export function computeLines(
  lines: CostLineInput[],
  gross: number,
  bookings: number,
  symbol = 'R',
): ComputedLine[] {
  return lines
    .filter((l) => l.enabled)
    .map((l) => ({ label: lineLabel(l, bookings, symbol), amount: lineAmount(l, gross, bookings) }))
    .filter((l) => l.amount > 0)
}

// Build a full statement's deduction lines across one or more property slices.
// Host-wide lines apply to the combined gross/bookings; property-scoped lines
// apply only to their matching slice. VAT is appended as a final line, charged
// on the sum of the vatable (host-fee) lines. Returns the deduction lines
// (VAT included) plus the VAT amount for callers that want it separately.
export function computeStatement(
  lines: CostLineInput[],
  slices: PropertySlice[],
  vat: VatConfig,
  symbol = 'R',
): { lines: ComputedLine[]; vat: number } {
  const totalGross = slices.reduce((a, s) => a + s.gross, 0)
  const totalBookings = slices.reduce((a, s) => a + s.bookings, 0)
  const sliceNames = new Set(slices.map((s) => s.name))

  const out: ComputedLine[] = []
  let vatableBase = 0

  for (const line of lines) {
    if (!line.enabled) continue
    let gross = totalGross
    let bookings = totalBookings
    if (line.propertyName) {
      // Property-scoped: only applies if the owner actually holds that unit.
      const slice = slices.find((s) => s.name === line.propertyName)
      if (!slice || !sliceNames.has(line.propertyName)) continue
      gross = slice.gross
      bookings = slice.bookings
    }
    const amount = lineAmount(line, gross, bookings)
    if (amount <= 0) continue
    out.push({ label: lineLabel(line, bookings, symbol), amount })
    if (line.vatable) vatableBase += amount
  }

  let vatAmount = 0
  if (vat.enabled && vat.rate > 0 && vatableBase > 0) {
    vatAmount = Math.round((vatableBase * vat.rate) / 100)
    out.push({ label: `VAT (${vat.rate}%)`, amount: vatAmount })
  }

  return { lines: out, vat: vatAmount }
}

export function totalCost(lines: ComputedLine[]): number {
  return lines.reduce((a, l) => a + l.amount, 0)
}

// Map a stored cost_line row into the compute-friendly input shape.
export function costLineToInput(c: CostLine): CostLineInput {
  return {
    id: c.id,
    label: c.label,
    kind: c.kind === 'percent' ? 'percent' : 'fixed',
    value: c.value,
    perBooking: c.perBooking,
    enabled: c.enabled,
    propertyName: c.propertyName ?? '',
    vatable: c.vatable ?? false,
  }
}
