"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { securityQuestion, twoFactor, user } from "@/lib/db/schema"
import { SECURITY_QUESTION_COUNT, normalizeAnswer } from "@/lib/security-questions"
import { asc, eq } from "drizzle-orm"
import { headers } from "next/headers"

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")
  return session.user.id
}

// The Better Auth password hasher, reused to hash security answers so we never
// store them in plain text.
async function hasher() {
  const ctx = await auth.$context
  return ctx.password
}

export type PublicQuestion = { position: number; question: string }

// --- Signed-in: manage your own questions ----------------------------------

export async function getMySecurityQuestions(): Promise<{ hasQuestions: boolean; questions: PublicQuestion[] }> {
  const userId = await getUserId()
  const rows = await db
    .select({ position: securityQuestion.position, question: securityQuestion.question })
    .from(securityQuestion)
    .where(eq(securityQuestion.userId, userId))
    .orderBy(asc(securityQuestion.position))
  return { hasQuestions: rows.length >= SECURITY_QUESTION_COUNT, questions: rows }
}

export async function saveSecurityQuestions(
  input: { question: string; answer: string }[],
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getUserId()

  if (input.length !== SECURITY_QUESTION_COUNT) {
    return { ok: false, error: `Please set ${SECURITY_QUESTION_COUNT} security questions.` }
  }
  const questions = input.map((i) => i.question.trim())
  const answers = input.map((i) => i.answer.trim())
  if (questions.some((q) => !q) || answers.some((a) => a.length < 2)) {
    return { ok: false, error: "Every question needs an answer of at least 2 characters." }
  }
  if (new Set(questions.map((q) => q.toLowerCase())).size !== questions.length) {
    return { ok: false, error: "Please choose two different questions." }
  }

  const password = await hasher()
  const rows = await Promise.all(
    input.map(async (item, index) => ({
      userId,
      position: index,
      question: item.question.trim(),
      answerHash: await password.hash(normalizeAnswer(item.answer)),
      updatedAt: new Date(),
    })),
  )

  // Replace any existing set atomically per user.
  await db.transaction(async (tx) => {
    await tx.delete(securityQuestion).where(eq(securityQuestion.userId, userId))
    await tx.insert(securityQuestion).values(rows)
  })

  return { ok: true }
}

// --- Public: password reset via security questions -------------------------

// Returns the questions for the account so the user can answer them. This
// intentionally reveals nothing beyond "a reset can proceed": both a missing
// account and one without questions return the same generic failure.
export async function getResetQuestions(
  email: string,
): Promise<{ ok: true; questions: PublicQuestion[] } | { ok: false; error: string }> {
  const generic = {
    ok: false as const,
    error: "We can't start a reset for that email. Security questions may not be set — contact your host.",
  }
  const clean = email.trim().toLowerCase()
  if (!clean) return generic

  const ctx = await auth.$context
  const found = await ctx.internalAdapter.findUserByEmail(clean)
  if (!found?.user) return generic

  const rows = await db
    .select({ position: securityQuestion.position, question: securityQuestion.question })
    .from(securityQuestion)
    .where(eq(securityQuestion.userId, found.user.id))
    .orderBy(asc(securityQuestion.position))

  if (rows.length < SECURITY_QUESTION_COUNT) return generic
  return { ok: true, questions: rows }
}

export async function resetPasswordWithSecurity(input: {
  email: string
  answers: string[]
  newPassword: string
}): Promise<{ ok: boolean; error?: string }> {
  const clean = input.email.trim().toLowerCase()
  if (input.newPassword.length < 8) {
    return { ok: false, error: "Your new password must be at least 8 characters." }
  }

  const ctx = await auth.$context
  const found = await ctx.internalAdapter.findUserByEmail(clean)
  if (!found?.user) {
    return { ok: false, error: "We couldn't verify those answers. Please try again." }
  }

  const rows = await db
    .select()
    .from(securityQuestion)
    .where(eq(securityQuestion.userId, found.user.id))
    .orderBy(asc(securityQuestion.position))

  if (rows.length < SECURITY_QUESTION_COUNT || input.answers.length !== rows.length) {
    return { ok: false, error: "We couldn't verify those answers. Please try again." }
  }

  for (let i = 0; i < rows.length; i++) {
    const ok = await ctx.password.verify({
      hash: rows[i].answerHash,
      password: normalizeAnswer(input.answers[i] ?? ""),
    })
    if (!ok) return { ok: false, error: "Those answers didn't match. Please try again." }
  }

  const hashed = await ctx.password.hash(input.newPassword)
  await ctx.internalAdapter.updatePassword(found.user.id, hashed)

  // Security-question recovery doubles as the 2FA recovery path (the user chose
  // both): a host who lost their authenticator device AND their backup codes
  // can prove identity here, which also clears 2FA so they aren't stuck at the
  // challenge screen. They can re-enrol after signing in with the new password.
  await db.delete(twoFactor).where(eq(twoFactor.userId, found.user.id))
  await db.update(user).set({ twoFactorEnabled: false }).where(eq(user.id, found.user.id))

  // Sign out any lingering sessions so only the new password grants access.
  await ctx.internalAdapter.deleteUserSessions(found.user.id)

  return { ok: true }
}
