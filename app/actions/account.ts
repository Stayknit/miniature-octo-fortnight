"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { account, user, userSettings } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"

async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")
  return session.user
}

// Verify the signed-in user's current password. Every profile change is gated
// on this so a hijacked-but-unlocked session can't silently rewrite contact
// details. Returns true only on an exact match against the stored credential.
async function verifyPassword(userId: string, password: string): Promise<boolean> {
  if (!password) return false
  const ctx = await auth.$context
  const [cred] = await db
    .select({ password: account.password })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1)
  if (!cred?.password) return false
  return ctx.password.verify({ hash: cred.password, password })
}

export async function getMyContactDetails(): Promise<{
  name: string
  email: string
  businessName: string
  phone: string
  telephone: string
}> {
  const sessionUser = await getSessionUser()
  const [row] = await db
    .select({
      name: user.name,
      email: user.email,
      businessName: user.businessName,
      phone: user.phone,
      telephone: user.telephone,
    })
    .from(user)
    .where(eq(user.id, sessionUser.id))
    .limit(1)
  return {
    name: row?.name ?? "",
    email: row?.email ?? "",
    businessName: row?.businessName ?? "",
    phone: row?.phone ?? "",
    telephone: row?.telephone ?? "",
  }
}

export type ContactDetailsResult = { ok: boolean; error?: string }

// Update name / business name / phone / landline. Email is intentionally NOT
// handled here — it goes through requestEmailChange so it can be confirmed by
// an authentication email.
export async function updateMyContactDetails(input: {
  name: string
  businessName: string
  phone: string
  telephone?: string
  currentPassword: string
}): Promise<ContactDetailsResult> {
  const sessionUser = await getSessionUser()

  const name = input.name?.trim() ?? ""
  const businessName = input.businessName?.trim() ?? ""
  const phone = input.phone?.trim() ?? ""
  const telephone = input.telephone?.trim() ?? ""

  if (!name) return { ok: false, error: "Please enter your name." }
  if (!businessName) return { ok: false, error: "Please enter your business name." }
  const digits = phone.replace(/\D/g, "")
  if (!phone) return { ok: false, error: "Please enter your mobile number." }
  if (digits.length < 7) return { ok: false, error: "Please enter a valid mobile number." }

  // Authentication gate: confirm identity before writing.
  const ok = await verifyPassword(sessionUser.id, input.currentPassword)
  if (!ok) return { ok: false, error: "That password is incorrect. Your details were not changed." }

  await db
    .update(user)
    .set({ name, businessName, phone, telephone, updatedAt: new Date() })
    .where(eq(user.id, sessionUser.id))

  // Keep the statement business name in step with the account business name so
  // owner statements always show the current trading name.
  await db
    .update(userSettings)
    .set({ businessName })
    .where(eq(userSettings.userId, sessionUser.id))

  return { ok: true }
}

export type EmailChangeResult = { ok: boolean; error?: string; message?: string }

// Start an email change. Requires the current password up front, then Better
// Auth sends a confirmation link to the CURRENT address; the new email only
// takes effect once that link is clicked.
export async function requestEmailChange(input: {
  newEmail: string
  currentPassword: string
}): Promise<EmailChangeResult> {
  const sessionUser = await getSessionUser()
  const newEmail = input.newEmail?.trim().toLowerCase() ?? ""

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return { ok: false, error: "Please enter a valid email address." }
  }
  if (newEmail === sessionUser.email.toLowerCase()) {
    return { ok: false, error: "That's already your email address." }
  }

  const ok = await verifyPassword(sessionUser.id, input.currentPassword)
  if (!ok) return { ok: false, error: "That password is incorrect. No change was made." }

  try {
    await auth.api.changeEmail({
      headers: await headers(),
      body: { newEmail, callbackURL: "/" },
    })
  } catch {
    // Generic message so we never reveal whether newEmail already belongs to
    // another account.
    return {
      ok: true,
      message: "If that address is available, we've sent a confirmation link to your current email.",
    }
  }

  return {
    ok: true,
    message: "Check your current email inbox for a link to confirm the change.",
  }
}
