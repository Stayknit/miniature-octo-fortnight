'use client'

// Finances-tab surface for the per-site fee rules that drive manual channel
// pricing. Each booking site withholds a different commission, so a rule is
// saved per (unit, channel) and then auto-applies whenever the host prices an
// imported reservation on the Channel sync screen. This card manages its OWN
// data via SWR (the Finances tab is fed the legacy StayKnitData, which has no
// channel info), so it stays self-contained and never blocks the tab.

import useSWR from 'swr'
import { useState } from 'react'
import Link from 'next/link'
import { Radio, ExternalLink } from 'lucide-react'
import {
  getChannelPricingData,
  savePricingRule,
  type ChannelPricingData,
} from '@/app/actions/channels-sync'
import type { ChannelId } from '@/lib/channels/types'

const keyOf = (propertyId: number, channel: string) => `${propertyId}:${channel}`
const pctFromBps = (bps: number) => (bps ? String(bps / 100) : '')
const bpsFromPct = (v: string) => Math.min(10000, Math.max(0, Math.round((Number(v) || 0) * 100)))

export function ChannelPricingRulesCard() {
  const { data, isLoading, mutate } = useSWR<ChannelPricingData>('channel-pricing', getChannelPricingData)

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radio size={15} className="text-primary" />
          <h2 className="font-sans text-base font-bold">Channel pricing</h2>
        </div>
        <Link
          href="/channels-sync"
          className="mono-label flex items-center gap-1 text-[9px] text-primary transition-colors hover:underline"
        >
          Channel sync <ExternalLink size={10} />
        </Link>
      </div>
      <p className="mono-label mt-1 text-[10px] leading-relaxed text-muted-foreground">
        Set each booking site&apos;s fee once. When you enter a reservation&apos;s amount on Channel sync, the payout is
        worked out automatically — and stays put across future syncs.
      </p>

      {isLoading ? (
        <p className="mono-label mt-4 text-[10px] text-muted-foreground">Loading connections…</p>
      ) : !data || data.connections.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border bg-surface/60 px-4 py-6 text-center">
          <p className="text-[13px] text-muted-foreground">No booking sites connected yet.</p>
          <p className="mono-label mt-1 text-[9px] text-muted-foreground">
            Connect a unit&apos;s calendar on Channel sync, then set its fee here.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2.5">
          {data.connections.map((c) => {
            const rule = data.rules.find((r) => r.propertyId === c.propertyId && r.channel === c.channel) ?? null
            return (
              <RuleRow
                key={keyOf(c.propertyId, c.channel)}
                propertyId={c.propertyId}
                propertyName={c.propertyName}
                channel={c.channel}
                channelLabel={c.channelLabel}
                commissionBps={rule?.commissionBps ?? 0}
                vatBps={rule?.vatBps ?? 0}
                onSaved={() => mutate()}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function RuleRow({
  propertyId,
  propertyName,
  channel,
  channelLabel,
  commissionBps,
  vatBps,
  onSaved,
}: {
  propertyId: number
  propertyName: string
  channel: ChannelId
  channelLabel: string
  commissionBps: number
  vatBps: number
  onSaved: () => void
}) {
  const [commission, setCommission] = useState(pctFromBps(commissionBps))
  const [vat, setVat] = useState(pctFromBps(vatBps))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const dirty = bpsFromPct(commission) !== commissionBps || bpsFromPct(vat) !== vatBps

  async function save() {
    setSaving(true)
    setSaved(false)
    const res = await savePricingRule({
      propertyId,
      channel,
      commissionBps: bpsFromPct(commission),
      vatBps: bpsFromPct(vat),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      onSaved()
      setTimeout(() => setSaved(false), 1800)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold">{channelLabel}</span>
        <span className="mono-label shrink-0 text-[8px] text-muted-foreground">{propertyName}</span>
      </div>
      <div className="mt-2.5 flex items-end gap-2">
        <PctField label="Commission" value={commission} onChange={setCommission} />
        <PctField label="VAT" value={vat} onChange={setVat} />
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="mono-label h-[38px] shrink-0 rounded-lg bg-primary px-3.5 text-[11px] text-primary-foreground transition-opacity disabled:opacity-40"
        >
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function PctField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex-1">
      <label className="mono-label mb-1 block text-[8px] text-muted-foreground">{label}</label>
      <div className="flex items-center rounded-lg border border-border bg-surface-2 px-2.5">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
          inputMode="decimal"
          placeholder="0"
          aria-label={`${label} percent`}
          className="w-full bg-transparent py-2 text-[13px] tabular-nums outline-none"
        />
        <span className="mono-label text-[11px] text-muted-foreground">%</span>
      </div>
    </div>
  )
}
