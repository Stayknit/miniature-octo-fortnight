import { pool } from '@/lib/db'

// Shared, DB-backed fixed-window rate limiter.
//
// Better Auth's default limiter (and any in-memory counter) is per-lambda on
// Vercel's serverless runtime, so it does not actually cap a distributed
// attacker. This limiter keeps its counters in Postgres (`rate_limit` table),
// so the window is enforced across every instance.
//
// Fixed-window is intentionally simple: one row per (bucket, window_start).
// The atomic INSERT ... ON CONFLICT DO UPDATE returns the running count, so a
// single round-trip both increments and reads. Old rows are cheap to leave
// behind; a periodic sweep can prune them, but they never affect correctness
// because window_start is part of the key.

export type RateLimitResult = {
  ok: boolean
  remaining: number
  limit: number
  resetAt: number // epoch ms when the current window ends
  retryAfterSeconds: number
}

/**
 * Consume one unit against `key`. Returns ok=false once `limit` is exceeded
 * within `windowMs`.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now()
  const windowStart = Math.floor(now / windowMs) * windowMs
  const resetAt = windowStart + windowMs

  try {
    const res = await pool.query<{ count: number }>(
      `INSERT INTO rate_limit (bucket, window_start, count)
       VALUES ($1, $2, 1)
       ON CONFLICT (bucket, window_start)
       DO UPDATE SET count = rate_limit.count + 1
       RETURNING count`,
      [key, windowStart],
    )
    const count = res.rows[0]?.count ?? 1
    const remaining = Math.max(0, limit - count)
    return {
      ok: count <= limit,
      remaining,
      limit,
      resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    }
  } catch (err) {
    // Fail OPEN: a limiter outage must not take down the endpoint it guards.
    // The endpoint still has its auth check as the primary control.
    console.error('[v0] rateLimit error:', (err as Error).message)
    return {
      ok: true,
      remaining: limit,
      limit,
      resetAt,
      retryAfterSeconds: 0,
    }
  }
}
