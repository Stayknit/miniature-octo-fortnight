'use server'

import { assertAdmin } from '@/lib/admin-auth'

export type KeyCheck = {
  ok: boolean
  status: 'accepted' | 'rejected' | 'wrong-format' | 'unreachable' | 'not-set'
  mode: 'live' | 'test' | 'unknown'
  message: string
}

// Runs GET /balance with the given key and maps the response to a KeyCheck.
// Shared by the "paste a candidate key" and "test the key in Vars" tools.
async function checkKeyAgainstPaystack(key: string): Promise<KeyCheck> {
  const mode: KeyCheck['mode'] = key.startsWith('sk_live_') ? 'live' : key.startsWith('sk_test_') ? 'test' : 'unknown'
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    const res = await fetch('https://api.paystack.co/balance', {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
      cache: 'no-store',
    }).finally(() => clearTimeout(timeout))

    if (res.ok) {
      return {
        ok: true,
        status: 'accepted',
        mode,
        message:
          mode === 'live'
            ? 'Accepted. Paystack recognises this live secret key. Paste it into Project Settings → Vars as PAYSTACK_SECRET_KEY (and the matching pk_live_ as NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY), then redeploy.'
            : 'Accepted, but this is a TEST key — real customers cannot be charged. Use it only for previews; find your sk_live_ key for launch.',
      }
    }
    if (res.status === 401) {
      return {
        ok: false,
        status: 'rejected',
        mode,
        message:
          'Rejected (401 Invalid key). Paystack refuses this key. Confirm the account is fully activated for live, then regenerate the keys in Paystack → Settings → API Keys & Webhooks and try the fresh one here.',
      }
    }
    return {
      ok: false,
      status: 'unreachable',
      mode,
      message: `Could not verify — Paystack returned HTTP ${res.status}. This is usually temporary; try again in a moment.`,
    }
  } catch {
    return {
      ok: false,
      status: 'unreachable',
      mode,
      message: 'Could not reach Paystack to verify the key (network error or timeout). Try again in a moment.',
    }
  }
}

// Tests the PAYSTACK_SECRET_KEY that THIS running deployment actually has, so
// the owner can tell apart "wrong value saved in Vars" from "deployment didn't
// pick up the new value" — and catches a stray space or a public key pasted
// into the secret slot. The key value is never returned to the client.
export async function validateConfiguredPaystackKey(): Promise<KeyCheck> {
  await assertAdmin()

  const raw = process.env.PAYSTACK_SECRET_KEY
  if (!raw || !raw.trim()) {
    return {
      ok: false,
      status: 'not-set',
      mode: 'unknown',
      message:
        'PAYSTACK_SECRET_KEY is not set in this deployment. Add it in Project Settings → Vars, then redeploy so the running app picks it up.',
    }
  }

  const key = raw.trim()

  if (raw !== key) {
    return {
      ok: false,
      status: 'wrong-format',
      mode: 'unknown',
      message:
        'The saved PAYSTACK_SECRET_KEY has leading/trailing spaces or a line break, which makes Paystack reject it. Re-paste it in Project Settings → Vars with no surrounding whitespace, then redeploy.',
    }
  }

  if (key.startsWith('pk_')) {
    return {
      ok: false,
      status: 'wrong-format',
      mode: 'unknown',
      message:
        'The value saved as PAYSTACK_SECRET_KEY is a PUBLIC key (pk_…), not a secret key. Put the sk_live_ secret key in PAYSTACK_SECRET_KEY and the pk_live_ key in NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY, then redeploy.',
    }
  }

  if (!key.startsWith('sk_')) {
    return {
      ok: false,
      status: 'wrong-format',
      mode: 'unknown',
      message:
        'The value saved as PAYSTACK_SECRET_KEY does not look like a Paystack secret key (it should start with sk_live_). Fix it in Project Settings → Vars, then redeploy.',
    }
  }

  const result = await checkKeyAgainstPaystack(key)
  // Reframe the accepted message for the "already in Vars" context.
  if (result.ok && result.mode === 'live') {
    return {
      ...result,
      message:
        'Accepted. The live secret key currently deployed is valid — Paystack recognises it. If checkout still says "Invalid key", redeploy to be sure this value is the one in use. Live charges also require the Paystack account to be Approved.',
    }
  }
  if (result.ok && result.mode === 'test') {
    return {
      ...result,
      message:
        'The deployed key is a TEST key (sk_test_). It is valid but cannot charge real customers — swap in your sk_live_ key for production and redeploy.',
    }
  }
  return result
}

// Tests a candidate Paystack SECRET key against an authenticated, read-only
// endpoint (GET /balance) and reports whether Paystack accepts it. The key is
// used only for this single request — it is never stored, logged, or returned.
// This lets the owner find a working sk_live_ key before pasting it into
// Project Settings → Vars as PAYSTACK_SECRET_KEY.
export async function validatePaystackKey(candidate: string): Promise<KeyCheck> {
  await assertAdmin()

  const key = candidate.trim()

  if (!key.startsWith('sk_')) {
    return {
      ok: false,
      status: 'wrong-format',
      mode: 'unknown',
      message:
        'That does not look like a Paystack secret key. Secret keys start with "sk_live_" (or "sk_test_"). Make sure you copied the SECRET key, not the public key (pk_…).',
    }
  }

  return checkKeyAgainstPaystack(key)
}
