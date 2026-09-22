import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { ownerClient } from "@/lib/db/schema"

// True when this email was registered as a property owner by some host in the
// owner_client table. Property owners receive their login from their host (via
// createOwnerLogin) and get a free, read-only portal — they must NEVER be able
// to self-register through the public host sign-up, which would put them on a
// paying trial. Matched case-insensitively so casing can't slip past the check.
export async function isKnownOwnerEmail(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return false
  const [row] = await db
    .select({ id: ownerClient.id })
    .from(ownerClient)
    .where(sql`lower(${ownerClient.email}) = ${normalized}`)
    .limit(1)
  return Boolean(row)
}
