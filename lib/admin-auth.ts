import { headers } from 'next/headers'
import { auth } from '@/lib/auth'

// The single source of truth for "who is a support agent / owner". Access is
// granted only to the account whose email matches OWNER_EMAIL. Everything
// admin — the invite-letter generator and the support dashboard — funnels
// through here, so there is exactly one place to widen access later (e.g. to a
// comma-separated allowlist or a role flag).
export function adminEmails(): string[] {
  return (process.env.OWNER_EMAIL ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export async function getAdmin(): Promise<{ email: string } | null> {
  const allow = adminEmails()
  if (allow.length === 0) return null
  const session = await auth.api.getSession({ headers: await headers() })
  const email = (session?.user?.email ?? '').trim().toLowerCase()
  if (!email || !allow.includes(email)) return null
  return { email }
}

export async function assertAdmin(): Promise<{ email: string }> {
  const admin = await getAdmin()
  if (!admin) throw new Error('Not authorised.')
  return admin
}
