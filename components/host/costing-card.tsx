'use client'

import { addCostLine, deleteCostLine, updateCostLine } from '@/app/actions/stayknit'
import { useCurrencySymbol } from '@/components/currency-context'
import { COST_KINDS, type CostKind } from '@/lib/costing'
import type { CostLine } from '@/lib/types'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

type Row = {
  id: number
  label: string
  kind: CostKind
  value: number
  perBooking: boolean
  enabled: boolean
  propertyName: string
  vatable: boolean
}

function toRow(c: CostLine): Row {
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

type ConfigChange = { commission?: number; vatEnabled?: boolean; vatRate?: number }

// Host-wide default cost lines applied to owner statements. A line can be
// scoped to a single property and/or flagged as a host fee that VAT is charged
// on. Edits persist immediately; local state stays authoritative so the UI
// never flickers.
export function CostingCard({
  costLines,
  properties,
  commission,
  vatEnabled,
  vatRate,
  onConfigChange,
}: {
  costLines: CostLine[]
  properties: string[]
  commission: number
  vatEnabled: boolean
  vatRate: number
  onConfigChange: (patch: ConfigChange) => void
}) {
  const symbol = useCurrencySymbol()
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>(() => costLines.map(toRow))
  const [rateText, setRateText] = useState(String(vatRate))
  const [commissionText, setCommissionText] = useState(String(commission))
  const [, startTransition] = useTransition()

  // Each cost line collapses to a compact summary so a host with many fees
  // isn't faced with one long form. Existing lines start collapsed; a freshly
  // added line opens automatically so it can be edited straight away.
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())

  function toggleExpanded(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Persist, then refresh the route so the server re-reads the cost lines and
  // the statement (which renders from the refreshed `data`, not this card's
  // local state) reflects the edit. Without the refresh the DB updates but the
  // statement keeps rendering the stale props until a full reload.
  function save(row: Row) {
    startTransition(async () => {
      await updateCostLine(row)
      router.refresh()
    })
  }

  function patch(id: number, p: Partial<Row>) {
    setRows((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, ...p } : r))
      const changed = next.find((r) => r.id === id)
      if (changed) save(changed)
      return next
    })
  }

  // Local-only text edits (committed to the server on blur) avoid persisting on
  // every keystroke.
  function patchLocal(id: number, p: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)))
  }

  function commit(id: number) {
    const row = rows.find((r) => r.id === id)
    if (row) save(row)
  }

  function add() {
    startTransition(async () => {
      const created = await addCostLine()
      if (created) {
        setRows((prev) => [...prev, toRow(created)])
        setExpanded((prev) => new Set(prev).add(created.id))
      }
      router.refresh()
    })
  }

  // One-line summary of a line's charge for the collapsed header, e.g. "15%",
  // "R500 / booking", or "R500".
  function summary(r: Row): string {
    if (r.kind === 'percent') return `${r.value}%`
    return `${symbol}${r.value}${r.perBooking ? ' / booking' : ''}`
  }

  function remove(id: number) {
    setRows((prev) => prev.filter((r) => r.id !== id))
    startTransition(async () => {
      await deleteCostLine(id)
      router.refresh()
    })
  }

  const field =
    'rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-sm text-foreground outline-none focus:border-primary'

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="mono-label text-[9px] text-muted-foreground">Statement costing</p>
        <button
          onClick={add}
          className="mono-label flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-primary transition-colors hover:border-primary"
        >
          <Plus size={12} /> Add line
        </button>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
        Applied to owner statements. Percentages come off gross revenue; fixed amounts bill once or per booking. Scope a
        line to one property for per-unit charges, and flag host fees so VAT is added on top.
      </p>

      {/* Default commission — the base management fee seeded onto new owners */}
      <div className="mb-3 rounded-lg border border-border-strong bg-surface-2 p-3">
        <label className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium">Default commission</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Base management fee applied to owner statements.</p>
          </div>
          <div className="relative w-24">
            <input
              inputMode="numeric"
              value={commissionText}
              onChange={(e) => setCommissionText(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={() => {
                const v = Math.min(100, Math.max(0, Math.round(Number(commissionText) || 0)))
                setCommissionText(String(v))
                onConfigChange({ commission: v })
              }}
              aria-label="Default commission percent"
              className={`${field} w-full pr-6`}
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              %
            </span>
          </div>
        </label>
      </div>

      {/* VAT — charged on the lines flagged as host fees */}
      <div className="mb-3 rounded-lg border border-border-strong bg-surface-2 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium">Charge VAT on host fees</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Added to lines marked “Host fee (VAT)” below.</p>
          </div>
          <button
            onClick={() => onConfigChange({ vatEnabled: !vatEnabled })}
            aria-pressed={vatEnabled}
            aria-label="Toggle VAT"
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${vatEnabled ? 'bg-primary' : 'bg-border'}`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition-all ${vatEnabled ? 'left-[18px]' : 'left-0.5'}`}
            />
          </button>
        </div>
        {vatEnabled && (
          <label className="mt-3 flex items-center gap-2">
            <span className="mono-label text-[9px] text-muted-foreground">VAT rate</span>
            <div className="relative w-24">
              <input
                inputMode="numeric"
                value={rateText}
                onChange={(e) => setRateText(e.target.value.replace(/[^0-9]/g, ''))}
                onBlur={() => {
                  const v = Math.min(100, Math.max(0, Math.round(Number(rateText) || 0)))
                  setRateText(String(v))
                  onConfigChange({ vatRate: v })
                }}
                aria-label="VAT rate"
                className={`${field} w-full pr-6`}
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
          </label>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[12px] text-muted-foreground">
          No cost lines yet. Add one to start deducting fees.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => {
            const isOpen = expanded.has(r.id)
            return (
            <div key={r.id} className="rounded-lg border border-border bg-surface-2">
              {/* Collapsed summary header — tap to expand the editable fields */}
              <button
                type="button"
                onClick={() => toggleExpanded(r.id)}
                aria-expanded={isOpen}
                aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${r.label || 'cost line'}`}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-surface-3/50"
              >
                <ChevronDown
                  size={15}
                  className={`shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
                <span className={`min-w-0 flex-1 truncate text-[13px] font-medium ${r.enabled ? '' : 'text-muted-foreground line-through'}`}>
                  {r.label || 'Untitled line'}
                </span>
                {r.propertyName && (
                  <span className="mono-label hidden shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-[8px] text-muted-foreground sm:inline">
                    {r.propertyName}
                  </span>
                )}
                {r.vatable && vatEnabled && (
                  <span className="mono-label shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-[8px] text-muted-foreground">
                    VAT
                  </span>
                )}
                <span className="shrink-0 text-[13px] font-semibold tabular-nums text-foreground">{summary(r)}</span>
                {!r.enabled && <span className="mono-label shrink-0 text-[8px] text-muted-foreground">off</span>}
              </button>

              {isOpen && (
              <div className="border-t border-border px-2.5 pb-2.5 pt-2.5">
              <div className="flex items-center gap-2">
                <input
                  value={r.label}
                  onChange={(e) => patchLocal(r.id, { label: e.target.value })}
                  onBlur={() => commit(r.id)}
                  aria-label="Cost name"
                  className={`${field} min-w-0 flex-1 font-medium`}
                />
                <button
                  onClick={() => remove(r.id)}
                  aria-label={`Remove ${r.label}`}
                  className="shrink-0 rounded-md border border-border p-2 text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <select
                  value={r.kind}
                  onChange={(e) => patch(r.id, { kind: e.target.value as CostKind })}
                  aria-label="Cost type"
                  className={`${field} shrink-0`}
                >
                  {COST_KINDS.map((k) => (
                    <option key={k.key} value={k.key}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <div className="relative min-w-0 flex-1">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    {r.kind === 'percent' ? '%' : symbol}
                  </span>
                  <input
                    inputMode="numeric"
                    value={String(r.value)}
                    onChange={(e) =>
                      patchLocal(r.id, { value: Math.max(0, Math.round(Number(e.target.value.replace(/[^0-9]/g, '')) || 0)) })
                    }
                    onBlur={() => commit(r.id)}
                    aria-label="Cost amount"
                    className={`${field} w-full pl-7`}
                  />
                </div>
              </div>

              {/* Property scope — host-wide by default, or pinned to one unit */}
              <label className="mt-2 block">
                <span className="mono-label mb-1 block text-[9px] text-muted-foreground">Applies to</span>
                <select
                  value={r.propertyName}
                  onChange={(e) => patch(r.id, { propertyName: e.target.value })}
                  aria-label="Applies to property"
                  className={`${field} w-full`}
                >
                  <option value="">All properties</option>
                  {properties.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>

              {r.kind === 'fixed' && (
                <label className="mt-2 flex items-center gap-2 text-[12px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={r.perBooking}
                    onChange={(e) => patch(r.id, { perBooking: e.target.checked })}
                    className="h-3.5 w-3.5 accent-[var(--color-primary)]"
                  />
                  Charge per booking
                </label>
              )}

              <label className="mt-2 flex items-center gap-2 text-[12px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={r.vatable}
                  onChange={(e) => patch(r.id, { vatable: e.target.checked })}
                  className="h-3.5 w-3.5 accent-[var(--color-primary)]"
                />
                Host fee (VAT){!vatEnabled && ' — VAT off'}
              </label>

              {!r.enabled && (
                <p className="mono-label mt-2 text-[9px] text-muted-foreground">Hidden from statements</p>
              )}
              <button
                onClick={() => patch(r.id, { enabled: !r.enabled })}
                className="mono-label mt-1 text-[9px] text-primary hover:underline"
              >
                {r.enabled ? 'Disable line' : 'Enable line'}
              </button>
              </div>
              )}
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
