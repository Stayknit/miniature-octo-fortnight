'use server'

import { db } from '@/lib/db'
import { adCampaign } from '@/lib/db/schema'
import { assertAdmin } from '@/lib/admin-auth'
import { desc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import {
  VALID_SLUGS,
  VALID_STATUS,
  type AdCampaignRow,
  type AdPlatformSlug,
  type CampaignInput,
  type CampaignResult,
  type CampaignStatus,
} from '@/lib/marketing'

// Every export here is gated by assertAdmin() (OWNER_EMAIL). The Marketing hub
// is a planning + tracking tool only — StayKnit never buys ads through a
// platform API, so nothing here talks to Facebook/LinkedIn/etc. It only reads
// and writes the ad_campaign table.

function toDateInput(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null
}

function serialize(r: typeof adCampaign.$inferSelect): AdCampaignRow {
  const platforms = r.platforms
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is AdPlatformSlug => VALID_SLUGS.has(s))
  const status = (VALID_STATUS.has(r.status as CampaignStatus) ? r.status : 'draft') as CampaignStatus
  return {
    id: r.id,
    name: r.name,
    platforms,
    objective: r.objective,
    status,
    budgetMinor: r.budgetMinor,
    currency: r.currency,
    startDate: toDateInput(r.startDate),
    endDate: toDateInput(r.endDate),
    destinationUrl: r.destinationUrl,
    utmUrl: r.utmUrl,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  }
}

// Validate + normalise a raw form payload into DB columns, or return an error.
function normalise(input: CampaignInput):
  | { ok: true; values: typeof adCampaign.$inferInsert }
  | { ok: false; error: string } {
  const name = (input.name ?? '').trim()
  if (!name) return { ok: false, error: 'Campaign name is required.' }
  if (name.length > 120) return { ok: false, error: 'Campaign name is too long (max 120 characters).' }

  const platforms = Array.from(new Set((input.platforms ?? []).filter((p) => VALID_SLUGS.has(p))))

  const status = VALID_STATUS.has((input.status ?? '') as CampaignStatus)
    ? (input.status as CampaignStatus)
    : 'draft'

  const budgetMinor = Number.isFinite(input.budgetMinor) ? Math.max(0, Math.round(input.budgetMinor as number)) : 0

  const currency = (input.currency ?? 'ZAR').trim().toUpperCase().slice(0, 3) || 'ZAR'

  const parseDate = (v: string | null | undefined): Date | null => {
    if (!v) return null
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const startDate = parseDate(input.startDate)
  const endDate = parseDate(input.endDate)
  if (startDate && endDate && endDate < startDate) {
    return { ok: false, error: 'End date cannot be before the start date.' }
  }

  const clampUrl = (v: string | undefined) => {
    const s = (v ?? '').trim()
    if (!s) return ''
    if (!/^https?:\/\//i.test(s)) return `https://${s}`
    return s
  }

  return {
    ok: true,
    values: {
      name,
      platforms: platforms.join(','),
      objective: (input.objective ?? '').trim().slice(0, 200),
      status,
      budgetMinor,
      currency,
      startDate,
      endDate,
      destinationUrl: clampUrl(input.destinationUrl),
      utmUrl: clampUrl(input.utmUrl),
      notes: (input.notes ?? '').trim().slice(0, 2000),
    },
  }
}

export async function listCampaigns(): Promise<AdCampaignRow[]> {
  await assertAdmin()
  const rows = await db.select().from(adCampaign).orderBy(desc(adCampaign.createdAt))
  return rows.map(serialize)
}

export async function createCampaign(input: CampaignInput): Promise<CampaignResult> {
  const admin = await assertAdmin()
  const norm = normalise(input)
  if (!norm.ok) return norm
  const [row] = await db
    .insert(adCampaign)
    .values({ ...norm.values, createdBy: admin.email })
    .returning({ id: adCampaign.id })
  revalidatePath('/admin/marketing')
  return { ok: true, id: row.id }
}

export async function updateCampaign(id: number, input: CampaignInput): Promise<CampaignResult> {
  await assertAdmin()
  if (!Number.isInteger(id)) return { ok: false, error: 'Invalid campaign.' }
  const norm = normalise(input)
  if (!norm.ok) return norm
  await db
    .update(adCampaign)
    .set({ ...norm.values, updatedAt: new Date() })
    .where(eq(adCampaign.id, id))
  revalidatePath('/admin/marketing')
  return { ok: true, id }
}

export async function setCampaignStatus(id: number, status: string): Promise<CampaignResult> {
  await assertAdmin()
  if (!Number.isInteger(id)) return { ok: false, error: 'Invalid campaign.' }
  if (!VALID_STATUS.has(status as CampaignStatus)) return { ok: false, error: 'Invalid status.' }
  await db
    .update(adCampaign)
    .set({ status, updatedAt: new Date() })
    .where(eq(adCampaign.id, id))
  revalidatePath('/admin/marketing')
  return { ok: true, id }
}

export async function deleteCampaign(id: number): Promise<CampaignResult> {
  await assertAdmin()
  if (!Number.isInteger(id)) return { ok: false, error: 'Invalid campaign.' }
  await db.delete(adCampaign).where(eq(adCampaign.id, id))
  revalidatePath('/admin/marketing')
  return { ok: true, id }
}
