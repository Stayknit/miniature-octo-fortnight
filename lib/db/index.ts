import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

// pg v9 changes how a bare `sslmode=require` is interpreted (it will start
// verifying certificates). Neon terminates TLS with a managed cert but the
// current app relies on the pre-v9 "encrypt, don't verify" behavior, so we
// opt into libpq-compatible parsing to lock that behavior in and silence the
// deprecation warning. Applied only when the URL actually carries
// `sslmode=require` and hasn't already set the compat flag.
function normalizeConnectionString(url: string | undefined): string | undefined {
  if (!url) return url
  if (!/[?&]sslmode=require\b/i.test(url)) return url
  if (/[?&]uselibpqcompat=/i.test(url)) return url
  return `${url}${url.includes("?") ? "&" : "?"}uselibpqcompat=true`
}

export const pool = new Pool({
  connectionString: normalizeConnectionString(process.env.DATABASE_URL),
})

export const db = drizzle(pool, { schema })
