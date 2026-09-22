import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { feed, property, subscription, user } from "@/lib/db/schema"

// TEMPORARY provisioning endpoint — creates complimentary (non-billed) test
// accounts for the pre-launch pilot, then is deleted. Reuses the exact account
// creation path as createOwnerLogin (auth.$context internal adapter), so temp
// passwords hash identically and the built-in reset email works.
//
// Guards: dev-only, and requires the caller to present BETTER_AUTH_SECRET.
// Delete this file once the pilot accounts are provisioned.

type FeedInput = { channel?: string; url: string }
type PropertyInput = { name: string; kind?: string; specs?: string; feeds?: FeedInput[] }
type FriendInput = { name: string; email: string; properties?: PropertyInput[] }

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Disabled in production" }, { status: 403 })
  }
  const secret = req.headers.get("x-admin-secret")
  if (!secret || secret !== process.env.BETTER_AUTH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await req.json()) as { friends: FriendInput[] }
  if (!Array.isArray(body.friends) || body.friends.length === 0) {
    return NextResponse.json({ error: "No friends provided" }, { status: 400 })
  }

  const ctx = await auth.$context
  const internal = ctx.internalAdapter as unknown as {
    createUser: (u: Record<string, unknown>) => Promise<{ id: string }>
    linkAccount: (a: Record<string, unknown>) => Promise<unknown>
  }

  const results: Array<Record<string, unknown>> = []

  for (const friend of body.friends) {
    const email = (friend.email || "").trim().toLowerCase()
    const name = (friend.name || "").trim() || email
    if (!email.includes("@")) {
      results.push({ email: friend.email, ok: false, error: "Invalid email" })
      continue
    }

    // Skip if an account already exists — never clobber a real user.
    const [existing] = await db.select().from(user).where(eq(user.email, email)).limit(1)
    if (existing) {
      results.push({ email, ok: false, error: "Account already exists — skipped" })
      continue
    }

    // 1) Create the host user (email pre-verified so the reset link is enough).
    const created = await internal.createUser({ email, name, emailVerified: true })
    const userId = created?.id
    if (!userId) {
      results.push({ email, ok: false, error: "Could not create user" })
      continue
    }

    // 2) Link a credential account with a temporary password (immediately
    //    replaced by the friend via the reset link).
    const tempPassword = crypto.randomUUID().replace(/-/g, "") + "A1"
    const hashed = await ctx.password.hash(tempPassword)
    await internal.linkAccount({ userId, providerId: "credential", accountId: userId, password: hashed })

    // 3) Complimentary subscription: a paid tier with NO end date, so the
    //    billing gate treats them as fully active — no trial countdown, no
    //    freeze, no expiry emails. termsAcceptedAt stays null so they accept
    //    the relay terms themselves on first login.
    await db.insert(subscription).values({
      userId,
      plan: "business",
      billingPeriod: "yearly",
      status: "active",
      trialEndsAt: null,
      cancelAt: null,
      termsAcceptedAt: null,
      foundingRate: true,
      expiryNoticeStage: 0,
    })

    // 4) Optional: seed their properties and iCal feeds so the sync test is
    //    ready the moment they log in.
    let propCount = 0
    let feedCount = 0
    for (const p of friend.properties ?? []) {
      const pname = (p.name || "").trim()
      if (!pname) continue
      await db.insert(property).values({
        userId,
        name: pname,
        kind: p.kind || "cottage",
        specs: p.specs || "",
        ownerName: name,
      })
      propCount++
      for (const f of p.feeds ?? []) {
        const url = (f.url || "").trim()
        if (!url) continue
        await db.insert(feed).values({
          userId,
          propertyName: pname,
          channel: (f.channel || "").trim(),
          icalUrl: url,
        })
        feedCount++
      }
    }

    // 5) Send the secure "set your password" email (built-in reset flow).
    let emailSent = true
    let emailError: string | null = null
    try {
      await auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" } })
    } catch (e) {
      emailSent = false
      emailError = e instanceof Error ? e.message : String(e)
    }

    results.push({
      email,
      name,
      ok: true,
      userId,
      plan: "business (complimentary, no expiry)",
      properties: propCount,
      feeds: feedCount,
      resetEmailSent: emailSent,
      emailError,
      // Returned only so you have a fallback if the email is delayed.
      tempPasswordFallback: tempPassword,
    })
  }

  return NextResponse.json({ results })
}
