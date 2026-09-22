'use server'

import { db } from '@/lib/db'
import { userSettings } from '@/lib/db/schema'
import { assertAdmin } from '@/lib/admin-auth'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { eq } from 'drizzle-orm'

// Manual ticks the owner has made on the pre-launch checklist, stored as a
// sparse map of item id → checked. Only items toggled away from their shipped
// default live here, so new checklist items keep their built-in state until
// the owner touches them.
export type ChecklistOverrides = Record<string, boolean>

async function currentUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  const id = session?.user?.id
  if (!id) throw new Error('Not authorised.')
  return id
}

export async function getLaunchOverrides(): Promise<ChecklistOverrides> {
  await assertAdmin()
  const userId = await currentUserId()
  const row = await db
    .select({ overrides: userSettings.launchChecklist })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1)
  return row[0]?.overrides ?? {}
}

// Upsert a single item's checked state into the owner's override map.
export async function setLaunchOverride(id: string, checked: boolean): Promise<ChecklistOverrides> {
  await assertAdmin()
  const userId = await currentUserId()

  const row = await db
    .select({ overrides: userSettings.launchChecklist })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1)

  const next: ChecklistOverrides = { ...(row[0]?.overrides ?? {}) }
  next[id] = checked

  if (row.length === 0) {
    await db.insert(userSettings).values({ userId, launchChecklist: next })
  } else {
    await db
      .update(userSettings)
      .set({ launchChecklist: next, updatedAt: new Date() })
      .where(eq(userSettings.userId, userId))
  }

  return next
}
