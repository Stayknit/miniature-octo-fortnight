import "server-only"
import { db } from "@/lib/db"
import { promoCode, promoRedemption, subscription } from "@/lib/db/schema"
import { and, eq, isNull, or, sql } from "drizzle-orm"
import { isPaid, planFor } from "@/lib/plans"

// Human-friendly code alphabet: no 0/O/1/I/L so codes are easy to read aloud
// and retype from an email without ambiguity.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

export function generateCodeString(prefix = "", groups = 2, groupLen = 4): string {
  const rand = () =>
    Array.from({ length: groupLen }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("")
  const body = Array.from({ length: groups }, rand).join("-")
  const clean = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
  return clean ? `${clean}-${body}` : body
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase()
}

// The best percentage-off a user currently holds for checkout: the highest
// `percentOff` among discount ("promo") codes they have redeemed that are still
// active and unexpired. Returns 0 when none apply. This is the single
// authoritative source for both the checkout charge (see startPlanCheckout) and
// the price the plan screen shows, so the two can never disagree. Recomputed
// from the user's own redemptions — never trusted from the client.
export async function getCheckoutDiscountPct(userId: string): Promise<number> {
  const rows = await db
    .select({ percentOff: promoCode.percentOff, expiresAt: promoCode.expiresAt })
    .from(promoRedemption)
    .innerJoin(promoCode, eq(promoRedemption.codeId, promoCode.id))
    .where(
      and(
        eq(promoRedemption.userId, userId),
        eq(promoCode.kind, "promo"),
        eq(promoCode.active, true),
        // Single-use per user: a discount already applied to a payment no longer counts.
        isNull(promoRedemption.consumedAt),
      ),
    )
  const now = Date.now()
  let best = 0
  for (const r of rows) {
    if (r.expiresAt && new Date(r.expiresAt).getTime() <= now) continue
    const pct = Math.min(100, Math.max(0, r.percentOff))
    if (pct > best) best = pct
  }
  return best
}

// Marks the discount a host just used as consumed so it can't reduce another
// payment — the "once per user" rule for discount codes. Stamps the single
// highest-percentOff active, unexpired, still-unconsumed discount redemption,
// which is exactly the one getCheckoutDiscountPct applied at checkout. No-op
// when the host holds no such discount (e.g. a full-price payment). Called once,
// on the FIRST successful activation of a paid reference.
export async function consumeCheckoutDiscount(userId: string): Promise<void> {
  const rows = await db
    .select({ id: promoRedemption.id, percentOff: promoCode.percentOff, expiresAt: promoCode.expiresAt })
    .from(promoRedemption)
    .innerJoin(promoCode, eq(promoRedemption.codeId, promoCode.id))
    .where(
      and(
        eq(promoRedemption.userId, userId),
        eq(promoCode.kind, "promo"),
        eq(promoCode.active, true),
        isNull(promoRedemption.consumedAt),
      ),
    )
  const now = Date.now()
  let best: { id: number; pct: number } | null = null
  for (const r of rows) {
    if (r.expiresAt && new Date(r.expiresAt).getTime() <= now) continue
    const pct = Math.min(100, Math.max(0, r.percentOff))
    if (!best || pct > best.pct) best = { id: r.id, pct }
  }
  if (!best) return
  await db.update(promoRedemption).set({ consumedAt: new Date() }).where(eq(promoRedemption.id, best.id))
}

export type RedeemResult =
  | { ok: true; kind: "access"; planName: string; months: number; accessEndsAt: string }
  | { ok: true; kind: "promo"; percentOff: number; message: string }
  | { ok: false; error: string }

// Redeem a code for a user. Runs in a transaction so the redemption record, the
// usage-cap counter, and the granted access can never drift apart: any failure
// (cap reached, already redeemed via the unique index, bad plan) rolls the whole
// thing back. "access" codes extend the user's paid term exactly like a prepaid
// purchase — stacking on any time they already have — while "promo" (discount)
// codes are recorded for future checkout use without touching the subscription.
export async function redeemPromoCodeForUser(userId: string, raw: string): Promise<RedeemResult> {
  const code = normalizeCode(raw)
  if (!code) return { ok: false, error: "Enter a code." }

  const [row] = await db.select().from(promoCode).where(eq(promoCode.code, code)).limit(1)
  if (!row || !row.active) return { ok: false, error: "That code isn't valid." }
  if (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now()) {
    return { ok: false, error: "That code has expired." }
  }

  try {
    return await db.transaction(async (tx) => {
      // One redemption per user. The unique (codeId, userId) index is the real
      // guard; this pre-check just yields a friendlier message in the common case.
      const [already] = await tx
        .select({ id: promoRedemption.id })
        .from(promoRedemption)
        .where(and(eq(promoRedemption.codeId, row.id), eq(promoRedemption.userId, userId)))
        .limit(1)
      if (already) return { ok: false as const, error: "You've already used this code." }

      // Atomically claim a redemption slot. For capped codes the WHERE clause
      // fails once the cap is hit, so two racing redemptions can't both win.
      const claimed = await tx
        .update(promoCode)
        .set({ timesRedeemed: sql`${promoCode.timesRedeemed} + 1` })
        .where(
          and(
            eq(promoCode.id, row.id),
            or(eq(promoCode.maxRedemptions, 0), sql`${promoCode.timesRedeemed} < ${promoCode.maxRedemptions}`),
          ),
        )
        .returning({ id: promoCode.id })
      if (claimed.length === 0) return { ok: false as const, error: "This code has reached its redemption limit." }

      // Record the redemption. A true race past the pre-check trips the unique
      // index here and throws, rolling back the counter bump above.
      await tx.insert(promoRedemption).values({ codeId: row.id, code: row.code, userId })

      if (row.kind === "access") {
        const plan = planFor(row.plan)
        if (!isPaid(plan.key)) {
          throw new Error("bad-plan") // rolls back; misconfigured code
        }
        // Ensure a subscription row exists to extend.
        const [existing] = await tx.select().from(subscription).where(eq(subscription.userId, userId)).limit(1)
        if (!existing) {
          await tx.insert(subscription).values({ userId, plan: "trial", status: "trialing" }).onConflictDoNothing()
        }
        const [current] = await tx
          .select({ cancelAt: subscription.cancelAt })
          .from(subscription)
          .where(eq(subscription.userId, userId))
          .limit(1)
        const now = Date.now()
        // Stack on remaining paid time if a term is still running.
        const base =
          current?.cancelAt && new Date(current.cancelAt).getTime() > now
            ? new Date(current.cancelAt)
            : new Date(now)
        const accessEndsAt = new Date(base)
        accessEndsAt.setMonth(accessEndsAt.getMonth() + row.months)

        await tx
          .update(subscription)
          .set({
            plan: plan.key,
            status: "active",
            cancelAt: accessEndsAt,
            // A code grant isn't a card payment; clear any stale payment ref
            // and re-arm expiry reminders for this fresh term.
            expiryNoticeStage: 0,
            updatedAt: new Date(),
          })
          .where(eq(subscription.userId, userId))

        return {
          ok: true as const,
          kind: "access" as const,
          planName: plan.name,
          months: row.months,
          accessEndsAt: accessEndsAt.toISOString(),
        }
      }

      // Discount codes: recorded for future checkout use, no access change now.
      return {
        ok: true as const,
        kind: "promo" as const,
        percentOff: row.percentOff,
        message: `${row.percentOff}% off saved to your account for checkout.`,
      }
    })
  } catch {
    return { ok: false, error: "That code couldn't be redeemed. Please try again." }
  }
}
