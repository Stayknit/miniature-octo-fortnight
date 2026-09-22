'use server'

import { db } from '@/lib/db'
import {
  adminAuditLog,
  appSetting,
  booking,
  planPrice,
  promoCode,
  promoRedemption,
  property,
  session,
  subscription,
  supportMessage,
  supportTicket,
  user,
  userSettings,
} from '@/lib/db/schema'
import { assertAdmin } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/admin-audit'
import { auth } from '@/lib/auth'
import {
  sendOutreachEmail,
  sendSupportReply,
  sendTicketResolvedEmail,
  sendTestEmail,
  verifyEmailTransport,
  type EmailTransportCheck,
} from '@/lib/email'
import { draftSupportReply } from '@/lib/support-ai'
import { getVatConfig, VAT_SETTING_KEY, type VatConfig } from '@/lib/vat'
import { generateCodeString, normalizeCode } from '@/lib/promo'
import { planFor, isPaid } from '@/lib/plans'
import { isCurrencyCode } from '@/lib/pricing'
import type { AdminAuditLog, CurrencyCode, PlanKey, PromoCode, SupportMessage, SupportTicket } from '@/lib/types'
import { and, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

// A subscription is complimentary / demo / pilot when its explicit `comp` flag
// is set. Backed by a real column (subscription.comp), not inferred from data
// shape — a genuine payer and a comp account can otherwise look identical.
function isComp(sub: { comp?: boolean | null } | undefined) {
  return Boolean(sub?.comp)
}

// Every export here is gated by assertAdmin() (OWNER_EMAIL). Nothing in this
// file is reachable by an ordinary signed-in user.

async function logAction(agentEmail: string, targetUserId: string, action: string, detail: string) {
  await logAdminAction(agentEmail, targetUserId, action, detail)
}

// ---- Email diagnostics -----------------------------------------------------

export type EmailHealth = { checks: EmailTransportCheck[] }

// Owner-only live SMTP handshake. Reveals whether outgoing mail can authenticate
// at all (the credential/connection layer) vs. whether it's a deliverability
// problem — the first thing to check when users report "no email received".
export async function checkEmailHealth(): Promise<EmailHealth> {
  await assertAdmin()
  return verifyEmailTransport()
}

export type TestEmailResult = { ok: true; messageId: string } | { ok: false; error: string }

// Owner-only end-to-end test send. Sends a real message so the owner can confirm
// delivery and check whether it lands in spam.
export async function sendDiagnosticEmail(rawTo: string): Promise<TestEmailResult> {
  const admin = await assertAdmin()
  const to = rawTo?.trim().toLowerCase() ?? ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { ok: false, error: 'Enter a valid email address.' }
  }
  try {
    const { messageId } = await sendTestEmail(to)
    await logAction(admin.email, '', 'email_test', `Sent test email to ${to} (id ${messageId})`)
    return { ok: true, messageId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Send failed.'
    return { ok: false, error: msg }
  }
}

// ---- User directory --------------------------------------------------------

export type AdminUserRow = {
  id: string
  name: string
  email: string
  businessName: string
  phone: string
  telephone: string
  role: string
  emailVerified: boolean
  createdAt: string
  planKey: string
  planLabel: string
  paid: boolean
  comp: boolean
  propertyCount: number
  openTickets: number
}

export async function listUsers(search?: string): Promise<AdminUserRow[]> {
  await assertAdmin()
  const q = (search ?? '').trim()

  const whereClause = q
    ? or(ilike(user.name, `%${q}%`), ilike(user.email, `%${q}%`), ilike(user.businessName, `%${q}%`))
    : undefined

  const users = await db
    .select()
    .from(user)
    .where(whereClause)
    .orderBy(desc(user.createdAt))
    .limit(200)

  if (users.length === 0) return []

  const ids = users.map((u) => u.id)

  // Aggregate counts in two grouped queries rather than N+1.
  const propCounts = await db
    .select({ userId: property.userId, n: sql<number>`count(*)::int` })
    .from(property)
    .where(inArray(property.userId, ids))
    .groupBy(property.userId)

  const openCounts = await db
    .select({ userId: supportTicket.userId, n: sql<number>`count(*)::int` })
    .from(supportTicket)
    .where(and(eq(supportTicket.status, 'open'), inArray(supportTicket.userId, ids)))
    .groupBy(supportTicket.userId)

  const subs = await db.select().from(subscription).where(inArray(subscription.userId, ids))

  const propMap = new Map(propCounts.map((r) => [r.userId, r.n]))
  const openMap = new Map(openCounts.map((r) => [r.userId, r.n]))
  const subMap = new Map(subs.map((s) => [s.userId, s]))

  return users.map((u) => {
    const sub = subMap.get(u.id)
    const plan = planFor(sub?.plan ?? 'trial')
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      businessName: u.businessName ?? '',
      phone: u.phone ?? '',
      telephone: u.telephone ?? '',
      role: u.role ?? 'host',
      emailVerified: u.emailVerified,
      createdAt: (u.createdAt instanceof Date ? u.createdAt : new Date(u.createdAt)).toISOString(),
      planKey: plan.key,
      planLabel: plan.name,
      paid: isPaid(sub?.plan ?? 'trial'),
      comp: isComp(sub),
      propertyCount: propMap.get(u.id) ?? 0,
      openTickets: openMap.get(u.id) ?? 0,
    }
  })
}

// ---- User count summary ----------------------------------------------------

export type AdminUserStats = {
  total: number
  verified: number
  paying: number // active paid (non-comp) subscription
  newLast30: number
}

// Real totals for the whole user base — computed with COUNT queries, not from
// the capped listUsers() array, so the numbers stay accurate past 200 users.
export async function getUserStats(): Promise<AdminUserStats> {
  await assertAdmin()

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [[{ n: total } = { n: 0 }], [{ n: verified } = { n: 0 }], [{ n: newLast30 } = { n: 0 }]] = await Promise.all([
    db.select({ n: count() }).from(user),
    db.select({ n: count() }).from(user).where(eq(user.emailVerified, true)),
    db.select({ n: count() }).from(user).where(sql`${user.createdAt} >= ${thirtyDaysAgo}`),
  ])

  // "Paying" = an active subscription on a paid tier that is not a comp/pilot
  // grant. Comp accounts share the paid shape, so filter them out in JS.
  const paidSubs = await db.select().from(subscription).where(eq(subscription.status, 'active'))
  const paying = paidSubs.filter((s) => isPaid(s.plan) && !isComp(s)).length

  return { total, verified, paying, newLast30 }
}

// ---- Single user detail ----------------------------------------------------

export type AdminUserDetail = AdminUserRow & {
  properties: { id: number; name: string; kind: string }[]
  bookingCount: number
  settings: { businessName: string; businessEmail: string; businessPhone: string } | null
}

export async function getUserDetail(userId: string): Promise<AdminUserDetail | null> {
  await assertAdmin()
  const [u] = await db.select().from(user).where(eq(user.id, userId)).limit(1)
  if (!u) return null
  const [sub] = await db.select().from(subscription).where(eq(subscription.userId, userId)).limit(1)
  const props = await db
    .select({ id: property.id, name: property.name, kind: property.kind })
    .from(property)
    .where(eq(property.userId, userId))
    .orderBy(desc(property.id))
  const [{ n: bookingCount } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(booking)
    .where(eq(booking.userId, userId))
  const [settingsRow] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1)
  const [{ n: openTickets } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(supportTicket)
    .where(and(eq(supportTicket.status, 'open'), eq(supportTicket.userId, userId)))

  const plan = planFor(sub?.plan ?? 'trial')
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    businessName: u.businessName ?? '',
    phone: u.phone ?? '',
    telephone: u.telephone ?? '',
    role: u.role ?? 'host',
    emailVerified: u.emailVerified,
    createdAt: (u.createdAt instanceof Date ? u.createdAt : new Date(u.createdAt)).toISOString(),
    planKey: plan.key,
    planLabel: plan.name,
    paid: isPaid(sub?.plan ?? 'trial'),
    comp: isComp(sub),
    propertyCount: props.length,
    openTickets,
    properties: props,
    bookingCount,
    settings: settingsRow
      ? {
          businessName: settingsRow.businessName ?? '',
          businessEmail: settingsRow.businessEmail ?? '',
          businessPhone: settingsRow.businessPhone ?? '',
        }
      : null,
  }
}

// ---- Tickets ---------------------------------------------------------------

export type AdminTicketRow = SupportTicket & {
  userName: string
  userEmail: string
}

export async function listTickets(status?: 'open' | 'resolved' | 'all'): Promise<AdminTicketRow[]> {
  await assertAdmin()
  const s = status ?? 'open'
  const whereClause = s === 'all' ? undefined : eq(supportTicket.status, s)
  const rows = await db
    .select({
      ticket: supportTicket,
      userName: user.name,
      userEmail: user.email,
    })
    .from(supportTicket)
    .leftJoin(user, eq(user.id, supportTicket.userId))
    .where(whereClause)
    .orderBy(desc(supportTicket.lastActivityAt))
    .limit(200)
  return rows.map((r) => ({
    ...r.ticket,
    userName: r.userName ?? '(unknown)',
    userEmail: r.userEmail ?? '',
  }))
}

export async function getTicketThread(ticketId: number): Promise<{
  ticket: AdminTicketRow
  messages: SupportMessage[]
} | null> {
  await assertAdmin()
  const [row] = await db
    .select({ ticket: supportTicket, userName: user.name, userEmail: user.email })
    .from(supportTicket)
    .leftJoin(user, eq(user.id, supportTicket.userId))
    .where(eq(supportTicket.id, ticketId))
    .limit(1)
  if (!row) return null
  const messages = await db
    .select()
    .from(supportMessage)
    .where(eq(supportMessage.ticketId, ticketId))
    .orderBy(supportMessage.createdAt)
  return {
    ticket: { ...row.ticket, userName: row.userName ?? '(unknown)', userEmail: row.userEmail ?? '' },
    messages,
  }
}

// Regenerate the AI draft on demand (e.g. after the user adds a follow-up).
export async function regenerateAiDraft(ticketId: number): Promise<{ draft: string }> {
  await assertAdmin()
  const [row] = await db
    .select({ ticket: supportTicket, name: user.name, role: user.role })
    .from(supportTicket)
    .leftJoin(user, eq(user.id, supportTicket.userId))
    .where(eq(supportTicket.id, ticketId))
    .limit(1)
  if (!row) throw new Error('Ticket not found')
  const draft = await draftSupportReply({
    role: row.role === 'owner' ? 'owner' : 'host',
    category: row.ticket.category,
    subject: row.ticket.subject,
    message: row.ticket.message,
    userName: row.name ?? undefined,
  })
  await db.update(supportTicket).set({ aiDraft: draft }).where(eq(supportTicket.id, ticketId))
  return { draft }
}

// Send a reply to the user: saves it to the thread and emails it. `fromAi`
// marks whether the sent text originated as the AI draft (for the record).
export async function replyToTicket(input: {
  ticketId: number
  body: string
  fromAi?: boolean
  resolve?: boolean
}): Promise<{ ok: boolean; error?: string }> {
  const admin = await assertAdmin()
  const body = input.body.trim()
  if (!body) return { ok: false, error: 'Reply cannot be empty.' }

  const [row] = await db
    .select({ ticket: supportTicket, name: user.name, email: user.email })
    .from(supportTicket)
    .leftJoin(user, eq(user.id, supportTicket.userId))
    .where(eq(supportTicket.id, input.ticketId))
    .limit(1)
  if (!row) return { ok: false, error: 'Ticket not found.' }

  let emailed = false
  if (row.email) {
    try {
      await sendSupportReply({
        to: row.email,
        userName: row.name ?? undefined,
        subject: row.ticket.subject,
        body,
      })
      emailed = true
    } catch {
      emailed = false
    }
  }

  await db.insert(supportMessage).values({
    ticketId: input.ticketId,
    author: input.fromAi ? 'ai' : 'agent',
    body,
    emailed,
  })

  await db
    .update(supportTicket)
    .set({
      aiDraft: '',
      lastActivityAt: new Date(),
      status: input.resolve ? 'resolved' : row.ticket.status,
    })
    .where(eq(supportTicket.id, input.ticketId))

  await logAction(
    admin.email,
    row.ticket.userId,
    input.resolve ? 'ticket.reply_resolve' : 'ticket.reply',
    `#${input.ticketId} ${input.fromAi ? '(AI draft) ' : ''}${emailed ? 'emailed' : 'NOT emailed'}`,
  )

  return { ok: true }
}

export async function setTicketStatus(ticketId: number, status: 'open' | 'resolved') {
  const admin = await assertAdmin()
  const [row] = await db
    .select({ ticket: supportTicket, name: user.name, email: user.email })
    .from(supportTicket)
    .leftJoin(user, eq(user.id, supportTicket.userId))
    .where(eq(supportTicket.id, ticketId))
    .limit(1)
  if (!row) throw new Error('Ticket not found')

  const wasResolved = row.ticket.status === 'resolved'
  await db.update(supportTicket).set({ status, lastActivityAt: new Date() }).where(eq(supportTicket.id, ticketId))
  await logAction(admin.email, row.ticket.userId, 'ticket.status', `#${ticketId} -> ${status}`)

  // Email the user only on a genuine open -> resolved transition, and only when
  // resolved from here (a reply-and-resolve already sends the reply itself).
  if (status === 'resolved' && !wasResolved && row.email) {
    try {
      await sendTicketResolvedEmail({ to: row.email, userName: row.name ?? undefined, subject: row.ticket.subject })
    } catch {
      // best-effort
    }
  }
}

// ---- Safe account changes --------------------------------------------------

export async function updateUserContact(input: {
  userId: string
  name?: string
  businessName?: string
  phone?: string
  telephone?: string
}): Promise<{ ok: boolean; error?: string }> {
  const admin = await assertAdmin()
  const patch: Record<string, string> = {}
  if (typeof input.name === 'string') patch.name = input.name.trim()
  if (typeof input.businessName === 'string') patch.businessName = input.businessName.trim()
  if (typeof input.phone === 'string') patch.phone = input.phone.trim()
  if (typeof input.telephone === 'string') patch.telephone = input.telephone.trim()
  if (patch.name === '') return { ok: false, error: 'Name cannot be empty.' }
  if (Object.keys(patch).length === 0) return { ok: false, error: 'Nothing to update.' }

  await db.update(user).set(patch).where(eq(user.id, input.userId))
  await logAction(admin.email, input.userId, 'user.contact', JSON.stringify(patch))
  return { ok: true }
}

// Change a user's plan and/or complimentary status. Recomputes nothing about
// billing beyond what the app already does; comp accounts simply bypass paid
// gating (matching the pilot comp-account behaviour).
export async function updateUserPlan(input: {
  userId: string
  planKey: string
  comp: boolean
}): Promise<{ ok: boolean; error?: string }> {
  const admin = await assertAdmin()
  const plan = planFor(input.planKey)

  // Complimentary = a paid tier that never expires: active, no trial countdown,
  // no cancellation date. This is the exact shape comp/pilot accounts use, so
  // the billing gate treats them as fully active with no freeze or dunning.
  // A non-comp change simply sets the plan and marks it active (paid tiers) or
  // leaves it on trial semantics for the free tier.
  const comp = input.comp && isPaid(plan.key)
  const patch = {
    plan: plan.key,
    status: comp || isPaid(plan.key) ? 'active' : 'trialing',
    ...(comp ? { trialEndsAt: null, cancelAt: null } : {}),
  }

  const [existing] = await db.select().from(subscription).where(eq(subscription.userId, input.userId)).limit(1)
  if (existing) {
    await db.update(subscription).set(patch).where(eq(subscription.userId, input.userId))
  } else {
    await db.insert(subscription).values({ userId: input.userId, ...patch })
  }
  await logAction(admin.email, input.userId, 'user.plan', `${plan.key} comp=${comp}`)
  return { ok: true }
}

// Trigger a password-reset / set-password email to the user (reuses the same
// Better Auth flow the app already uses everywhere else).
export async function sendUserResetEmail(userId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await assertAdmin()
  const [u] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId)).limit(1)
  if (!u?.email) return { ok: false, error: 'User has no email.' }
  try {
    await auth.api.requestPasswordReset({ body: { email: u.email, redirectTo: '/reset-password' } })
  } catch {
    return { ok: false, error: 'Could not send email right now.' }
  }
  await logAction(admin.email, userId, 'user.reset_email', u.email)
  return { ok: true }
}

// ---- Dormant users ---------------------------------------------------------

export type DormantUserRow = {
  id: string
  name: string
  email: string
  businessName: string
  planLabel: string
  createdAt: string
  lastActiveAt: string | null // most recent session; null = never signed in
  daysInactive: number // days since last activity, or since signup if never
  neverSignedIn: boolean
  propertyCount: number
}

// A host is "dormant" when their most recent login session is older than
// `days`, OR they have never signed in and their account is older than `days`.
// Activity is measured from the session table (Better Auth writes a row per
// login and refreshes updatedAt), which is the truest signal of real usage.
export async function listDormantUsers(days = 30): Promise<DormantUserRow[]> {
  await assertAdmin()
  const threshold = Math.max(1, Math.round(days))
  const cutoff = new Date(Date.now() - threshold * 86400000)

  // Latest session activity per user in one grouped query (no N+1).
  const lastSessions = await db
    .select({ userId: session.userId, lastAt: sql<Date>`max(${session.updatedAt})` })
    .from(session)
    .groupBy(session.userId)
  const lastMap = new Map(lastSessions.map((r) => [r.userId, r.lastAt ? new Date(r.lastAt) : null]))

  const users = await db.select().from(user).orderBy(desc(user.createdAt)).limit(500)
  if (users.length === 0) return []

  const ids = users.map((u) => u.id)
  const propCounts = await db
    .select({ userId: property.userId, n: sql<number>`count(*)::int` })
    .from(property)
    .where(inArray(property.userId, ids))
    .groupBy(property.userId)
  const propMap = new Map(propCounts.map((r) => [r.userId, r.n]))
  const subs = await db.select().from(subscription).where(inArray(subscription.userId, ids))
  const subMap = new Map(subs.map((s) => [s.userId, s]))

  const now = Date.now()
  const rows: DormantUserRow[] = []
  for (const u of users) {
    const lastAt = lastMap.get(u.id) ?? null
    const created = u.createdAt instanceof Date ? u.createdAt : new Date(u.createdAt)
    // Reference point for dormancy: last login, else signup date.
    const reference = lastAt ?? created
    if (reference > cutoff) continue // active recently — not dormant

    const plan = planFor(subMap.get(u.id)?.plan ?? 'trial')
    rows.push({
      id: u.id,
      name: u.name,
      email: u.email,
      businessName: u.businessName ?? '',
      planLabel: plan.name,
      createdAt: created.toISOString(),
      lastActiveAt: lastAt ? lastAt.toISOString() : null,
      daysInactive: Math.floor((now - reference.getTime()) / 86400000),
      neverSignedIn: !lastAt,
      propertyCount: propMap.get(u.id) ?? 0,
    })
  }
  // Longest-dormant first so the most at-risk hosts surface at the top.
  rows.sort((a, b) => b.daysInactive - a.daysInactive)
  return rows
}

export async function sendDormantOutreach(input: {
  userId: string
  subject: string
  message: string
}): Promise<{ ok: boolean; error?: string }> {
  const admin = await assertAdmin()
  const message = input.message.trim()
  if (!message) return { ok: false, error: 'Write a message before sending.' }

  const [u] = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, input.userId))
    .limit(1)
  if (!u?.email) return { ok: false, error: 'User not found.' }

  try {
    await sendOutreachEmail({ to: u.email, userName: u.name ?? undefined, subject: input.subject.trim(), body: message })
  } catch {
    return { ok: false, error: 'Could not send the email. Please try again.' }
  }
  await logAction(admin.email, input.userId, 'user.outreach', `to ${u.email}: ${input.subject.trim() || '(no subject)'}`)
  return { ok: true }
}

// ---- Promo / access codes --------------------------------------------------

export type AdminPromoCode = PromoCode & { redeemedCount: number }

export async function listPromoCodes(): Promise<AdminPromoCode[]> {
  await assertAdmin()
  const codes = await db.select().from(promoCode).orderBy(desc(promoCode.createdAt))
  // timesRedeemed is the authoritative counter, but also surface the live
  // redemption-row count so a mismatch would be visible.
  const counts = await db
    .select({ codeId: promoRedemption.codeId, n: count() })
    .from(promoRedemption)
    .groupBy(promoRedemption.codeId)
  const map = new Map(counts.map((c) => [c.codeId, Number(c.n)]))
  return codes.map((c) => ({ ...c, redeemedCount: map.get(c.id) ?? c.timesRedeemed }))
}

export type CreatePromoInput = {
  kind: 'access' | 'promo'
  code?: string // optional custom code; auto-generated when blank
  prefix?: string // optional prefix for the auto-generated code
  plan?: string // access codes: tier granted
  months?: number // access codes: months of access
  percentOff?: number // promo codes: discount percent
  maxRedemptions?: number // 0 = unlimited
  expiresInDays?: number // 0 / omitted = never expires
  note?: string
}

export async function createPromoCode(
  input: CreatePromoInput,
): Promise<{ ok: boolean; error?: string; code?: AdminPromoCode }> {
  const admin = await assertAdmin()

  const kind = input.kind === 'promo' ? 'promo' : 'access'
  const code = input.code?.trim()
    ? normalizeCode(input.code)
    : generateCodeString(input.prefix ?? '')

  if (!/^[A-Z0-9-]{4,40}$/.test(code)) {
    return { ok: false, error: 'Code must be 4–40 letters, numbers, or dashes.' }
  }

  const plan = planFor(input.plan ?? 'host')
  if (kind === 'access' && !isPaid(plan.key)) {
    return { ok: false, error: 'Access codes must grant a paid plan tier.' }
  }
  const months = Math.max(1, Math.min(60, Math.round(input.months ?? 1)))
  const percentOff = Math.max(0, Math.min(100, Math.round(input.percentOff ?? 0)))
  if (kind === 'promo' && percentOff <= 0) {
    return { ok: false, error: 'A discount code needs a percentage above 0.' }
  }
  const maxRedemptions = Math.max(0, Math.round(input.maxRedemptions ?? 0))
  const expiresAt =
    input.expiresInDays && input.expiresInDays > 0
      ? new Date(Date.now() + input.expiresInDays * 86400000)
      : null

  const [existing] = await db.select({ id: promoCode.id }).from(promoCode).where(eq(promoCode.code, code)).limit(1)
  if (existing) return { ok: false, error: 'That code already exists — pick another.' }

  const [created] = await db
    .insert(promoCode)
    .values({
      code,
      kind,
      plan: plan.key,
      months,
      percentOff,
      maxRedemptions,
      expiresAt,
      note: (input.note ?? '').trim(),
      createdBy: admin.email,
    })
    .returning()

  await logAction(
    admin.email,
    '',
    'promo.create',
    `${code} kind=${kind} ${kind === 'access' ? `${plan.key}/${months}mo` : `${percentOff}%`} max=${maxRedemptions}`,
  )
  return { ok: true, code: { ...created, redeemedCount: 0 } }
}

export async function setPromoCodeActive(id: number, active: boolean): Promise<{ ok: boolean }> {
  const admin = await assertAdmin()
  const [row] = await db
    .update(promoCode)
    .set({ active })
    .where(eq(promoCode.id, id))
    .returning({ code: promoCode.code })
  if (row) await logAction(admin.email, '', 'promo.toggle', `${row.code} active=${active}`)
  return { ok: true }
}

// ---- Plan pricing ----------------------------------------------------------

// The paid tiers whose monthly fee the operator can change, in display order.
// Trial and Enterprise are excluded (not self-serve billable). Local, not
// exported: a "use server" module may only export async functions.
const PRICED_TIERS: PlanKey[] = ['starter', 'host', 'professional', 'business']

export type PlanPriceRow = {
  plan: PlanKey
  name: string
  // Default and effective MONTHLY price in the requested currency, in WHOLE
  // currency units (e.g. rand), since plan prices are always round.
  defaultAmount: number
  currentAmount: number
  overridden: boolean
}

// Current monthly fees for every paid tier in one currency, ready for the
// dashboard. Combines the hardcoded PLANS defaults with any operator overrides.
export async function getPlanPrices(
  currency: string,
): Promise<{ currency: CurrencyCode; rows: PlanPriceRow[] }> {
  await assertAdmin()
  const cur = (currency || 'zar').toLowerCase()
  if (!isCurrencyCode(cur)) throw new Error('Unsupported currency')

  const overrideRows = await db.select().from(planPrice).where(eq(planPrice.currency, cur))
  const overrides = new Map(overrideRows.map((r) => [r.plan, r.monthlyCents]))

  const rows: PlanPriceRow[] = PRICED_TIERS.map((key) => {
    const def = planFor(key)
    const defaultCents = def.monthly?.[cur as CurrencyCode] ?? 0
    const overrideCents = overrides.get(key)
    const effectiveCents = overrideCents ?? defaultCents
    return {
      plan: key,
      name: def.name,
      defaultAmount: Math.round(defaultCents / 100),
      currentAmount: Math.round(effectiveCents / 100),
      overridden: overrideCents != null,
    }
  })
  return { currency: cur as CurrencyCode, rows }
}

// Raise or lower a tier's monthly fee for a currency. `amount` is in WHOLE
// currency units; pass null to reset the tier back to its built-in default.
// The change flows to BOTH the price hosts see and the amount Paystack charges,
// because checkout and activation resolve prices through the same overrides.
export async function setPlanPrice(input: {
  plan: string
  currency: string
  amount: number | null
}): Promise<{ ok: boolean; error?: string }> {
  const admin = await assertAdmin()
  const plan = input.plan as PlanKey
  const cur = (input.currency || '').toLowerCase()

  if (!PRICED_TIERS.includes(plan)) return { ok: false, error: 'That tier is not billable.' }
  if (!isCurrencyCode(cur)) return { ok: false, error: 'Unsupported currency.' }

  // Reset: drop the override so the tier reverts to its built-in default price.
  if (input.amount == null) {
    await db.delete(planPrice).where(and(eq(planPrice.plan, plan), eq(planPrice.currency, cur)))
    await logAction(admin.email, '', 'price.reset', `${plan}/${cur} -> default`)
    revalidatePath('/')
    return { ok: true }
  }

  // Guard against fat-finger and abusive values: whole positive amount within a
  // sane ceiling. Stored in minor units (cents) to match PLANS.
  const amount = Math.round(input.amount)
  if (!Number.isFinite(amount) || amount < 1 || amount > 1_000_000) {
    return { ok: false, error: 'Enter a whole amount between 1 and 1,000,000.' }
  }
  const monthlyCents = amount * 100

  await db
    .insert(planPrice)
    .values({ plan, currency: cur, monthlyCents, updatedBy: admin.email })
    .onConflictDoUpdate({
      target: [planPrice.plan, planPrice.currency],
      set: { monthlyCents, updatedBy: admin.email, updatedAt: new Date() },
    })
  await logAction(admin.email, '', 'price.set', `${plan}/${cur} -> ${amount}`)
  revalidatePath('/')
  return { ok: true }
}

// ---- VAT status (StayKnit's own VAT registration) -------------------------

// Current operator VAT config for the dashboard.
export async function getVatSetting(): Promise<VatConfig> {
  await assertAdmin()
  return getVatConfig()
}

// Set StayKnit's own VAT registration status. Guardrails enforce the law: you
// cannot switch registration ON without a SARS VAT number, because a non-vendor
// (or a vendor with no number on the invoice) may not present VAT. Toggling this
// changes ONLY how the total is presented on invoices — never the price charged.
export async function setVatSetting(input: {
  registered: boolean
  number: string
  ratePct: number
}): Promise<{ ok: boolean; error?: string }> {
  const admin = await assertAdmin()
  const number = (input.number || '').trim()
  const ratePct = Math.round(Number(input.ratePct))
  if (!Number.isFinite(ratePct) || ratePct < 1 || ratePct > 100) {
    return { ok: false, error: 'Enter a VAT rate between 1 and 100.' }
  }
  if (input.registered && !number) {
    return { ok: false, error: 'A SARS VAT number is required before you can show VAT as included.' }
  }
  const value: VatConfig = { registered: input.registered === true, number, ratePct }
  await db
    .insert(appSetting)
    .values({ key: VAT_SETTING_KEY, value, updatedBy: admin.email })
    .onConflictDoUpdate({
      target: appSetting.key,
      set: { value, updatedBy: admin.email, updatedAt: new Date() },
    })
  await logAction(
    admin.email,
    '',
    'vat.set',
    `registered=${value.registered} rate=${value.ratePct} number=${number ? 'set' : 'none'}`,
  )
  revalidatePath('/')
  return { ok: true }
}

// ---- Audit log -------------------------------------------------------------

export async function listAudit(limit = 100): Promise<AdminAuditLog[]> {
  await assertAdmin()
  return db.select().from(adminAuditLog).orderBy(desc(adminAuditLog.createdAt)).limit(limit)
}
