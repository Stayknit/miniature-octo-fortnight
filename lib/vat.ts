import { cache } from 'react'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { appSetting } from '@/lib/db/schema'

// StayKnit's OWN VAT status as a South African vendor — operator/app-level
// configuration, NOT the per-host `vatEnabled`/`vatRate` in user_settings
// (those govern the VAT a HOST charges its OWNERS on management fees, a
// completely separate thing).
//
// LEGAL — read before flipping `registered` on:
//   A business that is NOT a registered VAT vendor may not represent that any
//   VAT is charged or included (VAT Act). So while `registered` is false (the
//   default), invoices carry NO VAT line and state plainly that they are not
//   SARS tax invoices. Only switch `registered` on once SARS has actually
//   issued a VAT number, and record that number here so it can be printed on
//   the (now compliant) tax invoice. Advertised subscription prices do NOT
//   change when this is toggled — see vatBreakdown: an R199 plan stays R199,
//   and once registered the 15% is shown as already included in that R199.
//   Have your South African accountant confirm the final tax-invoice wording
//   before enabling this in production.
export type VatConfig = {
  registered: boolean
  number: string // SARS VAT registration number, printed on tax invoices
  ratePct: number // standard rate — 15 in South Africa
}

export const VAT_SETTING_KEY = 'stayknit_vat'
export const VAT_DEFAULT: VatConfig = { registered: false, number: '', ratePct: 15 }

// Normalise an untrusted stored/​input value into a safe VatConfig.
export function coerceVatConfig(v: unknown): VatConfig {
  const o = (v ?? {}) as Record<string, unknown>
  const rate = Number(o.ratePct)
  return {
    registered: o.registered === true,
    number: typeof o.number === 'string' ? o.number.trim() : '',
    ratePct: Number.isFinite(rate) && rate > 0 && rate <= 100 ? Math.round(rate) : 15,
  }
}

// Current VAT config, cached per request. Falls back to the safe default (not
// registered) if the row — or the whole table, on a fresh deploy before the
// migration lands — is absent, so callers never crash.
export const getVatConfig = cache(async (): Promise<VatConfig> => {
  try {
    const [row] = await db.select().from(appSetting).where(eq(appSetting.key, VAT_SETTING_KEY)).limit(1)
    if (!row) return VAT_DEFAULT
    const cfg = coerceVatConfig(row.value)
    // A registered vendor MUST have a VAT number to charge VAT lawfully. If the
    // flag is on but no number is stored, refuse to claim VAT — a half-configured
    // row can then never emit a non-compliant "VAT included" invoice.
    if (cfg.registered && !cfg.number) return { ...cfg, registered: false }
    return cfg
  } catch {
    return VAT_DEFAULT
  }
})

export type VatBreakdown = {
  registered: boolean
  ratePct: number
  number: string
  grossCents: number
  netCents: number
  vatCents: number
}

// VAT-INCLUSIVE breakdown of a gross amount (minor units). The advertised price
// never changes when VAT is toggled: a gross of R199 stays R199, and when
// registered we back-compute the VAT already contained within it
// (net = gross ÷ 1.15, vat = gross − net). When not registered there is no VAT
// to show and net == gross.
export function vatBreakdown(grossCents: number, cfg: VatConfig): VatBreakdown {
  if (!cfg.registered || !Number.isFinite(grossCents) || grossCents <= 0) {
    return {
      registered: false,
      ratePct: cfg.ratePct,
      number: cfg.number,
      grossCents,
      netCents: grossCents,
      vatCents: 0,
    }
  }
  const netCents = Math.round((grossCents * 100) / (100 + cfg.ratePct))
  return {
    registered: true,
    ratePct: cfg.ratePct,
    number: cfg.number,
    grossCents,
    netCents,
    vatCents: grossCents - netCents,
  }
}
