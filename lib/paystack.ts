import 'server-only'

const PAYSTACK_BASE = 'https://api.paystack.co'

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) throw new Error('PAYSTACK_SECRET_KEY is not set')
  return key
}

export type PaystackInit = {
  email: string
  // Amount in the currency's minor unit (cents for ZAR), matching our pricing.
  amount: number
  currency: string
  reference: string
  metadata: Record<string, unknown>
}

// Initialize a transaction server-side. The browser only ever receives the
// opaque access code (resumed by the inline popup) — never the amount or
// currency, which stay authoritative here.
export async function initializeTransaction(
  input: PaystackInit,
): Promise<{ accessCode: string; reference: string }> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: input.email,
      amount: input.amount,
      currency: input.currency,
      reference: input.reference,
      metadata: input.metadata,
    }),
    cache: 'no-store',
  })
  const json = (await res.json()) as {
    status?: boolean
    message?: string
    data?: { access_code?: string; reference?: string }
  }
  if (!res.ok || !json.status || !json.data?.access_code) {
    throw new Error(`Paystack init failed: ${json.message ?? res.status}`)
  }
  return { accessCode: json.data.access_code, reference: json.data.reference ?? input.reference }
}

export type PaystackVerification = {
  status: string
  amount: number
  currency: string
  reference: string
  metadata: Record<string, unknown> | null
  // ISO timestamp of when the charge succeeded (falls back to created_at). The
  // authoritative charge date — used so a receipt's invoice number stays stable
  // no matter when it's viewed, and matches the number in the emailed copy.
  paidAt: string | null
  // Reusable "card on file" token + customer code, present on card charges.
  // Only stored/used for opt-in auto-renewal; null for non-reusable methods
  // (e.g. some bank transfers).
  authorizationCode: string | null
  reusable: boolean
  customerCode: string | null
}

// Verify a transaction by reference. Never trusts the client — this is the
// authoritative check that the payment actually succeeded and for how much.
export async function verifyTransaction(reference: string): Promise<PaystackVerification | null> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey()}` },
    cache: 'no-store',
  })
  const json = (await res.json()) as {
    status?: boolean
    data?: {
      status?: string
      amount?: number
      currency?: string
      reference?: string
      paid_at?: string
      created_at?: string
      // Paystack documents metadata as a "Stringified JSON object" and returns
      // "" when none was set, so on verify it can arrive as an object, a JSON
      // string, or an empty string — normalizeMetadata handles all three.
      metadata?: unknown
      authorization?: { authorization_code?: string; reusable?: boolean }
      customer?: { customer_code?: string }
    }
  }
  if (!res.ok || !json.status || !json.data) return null
  const d = json.data
  const auth = d.authorization
  return {
    status: d.status ?? 'unknown',
    amount: d.amount ?? 0,
    currency: (d.currency ?? '').toUpperCase(),
    reference: d.reference ?? reference,
    paidAt: d.paid_at ?? d.created_at ?? null,
    metadata: normalizeMetadata(d.metadata),
    authorizationCode: auth?.authorization_code ?? null,
    reusable: auth?.reusable === true,
    customerCode: d.customer?.customer_code ?? null,
  }
}

// Charge a previously saved authorization ("card on file") without any user
// interaction — the mechanism behind opt-in auto-renewal. Paystack charges
// synchronously and also fires a charge.success webhook; the returned reference
// feeds the same idempotent activation path as a fresh checkout, so a term is
// never double-granted. Amount/currency are authoritative server-side inputs,
// exactly like initializeTransaction.
export type PaystackChargeInput = {
  email: string
  amount: number
  currency: string
  reference: string
  authorizationCode: string
  metadata: Record<string, unknown>
}

export async function chargeAuthorization(
  input: PaystackChargeInput,
): Promise<{ status: string; reference: string }> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/charge_authorization`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: input.email,
      amount: input.amount,
      currency: input.currency,
      reference: input.reference,
      authorization_code: input.authorizationCode,
      metadata: input.metadata,
    }),
    cache: 'no-store',
  })
  const json = (await res.json()) as {
    status?: boolean
    message?: string
    data?: { status?: string; reference?: string }
  }
  if (!res.ok || !json.status || !json.data) {
    throw new Error(`Paystack charge failed: ${json.message ?? res.status}`)
  }
  return { status: json.data.status ?? 'unknown', reference: json.data.reference ?? input.reference }
}

// Refund a transaction by reference. Omit `amountSubunits` for a full refund
// (the default), or pass an amount in the currency's minor unit for a partial.
// Used by trial card capture: after the R1 validation charge tokenises the
// card, the R1 is immediately refunded so the net cost to the host is zero.
// Best-effort by design — the caller treats a failed refund as non-fatal (the
// card is still saved) and logs it for manual follow-up.
export async function refundTransaction(
  reference: string,
  amountSubunits?: number,
): Promise<{ ok: boolean; status?: string }> {
  const res = await fetch(`${PAYSTACK_BASE}/refund`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      transaction: reference,
      ...(typeof amountSubunits === 'number' && amountSubunits > 0 ? { amount: amountSubunits } : {}),
    }),
    cache: 'no-store',
  })
  const json = (await res.json()) as { status?: boolean; data?: { status?: string } }
  if (!res.ok || !json.status) return { ok: false }
  return { ok: true, status: json.data?.status }
}

export type PaystackTransaction = {
  id: number
  reference: string
  amount: number // subunits (cents for ZAR)
  currency: string
  status: string // 'success' | 'failed' | 'abandoned' | ...
  channel: string | null
  paidAt: string | null // ISO
  email: string | null
}

// List recent transactions, newest first. Used by the owner's payments panel to
// surface real charges for refunding. Read-only; the secret key never leaves the
// server. `perPage` is clamped so a bad caller can't request an unbounded page.
export async function listTransactions(perPage = 50): Promise<PaystackTransaction[]> {
  const size = Math.min(200, Math.max(1, Math.floor(perPage)))
  const res = await fetch(`${PAYSTACK_BASE}/transaction?perPage=${size}&page=1`, {
    headers: { Authorization: `Bearer ${secretKey()}` },
    cache: 'no-store',
  })
  const json = (await res.json()) as {
    status?: boolean
    data?: Array<{
      id?: number
      reference?: string
      amount?: number
      currency?: string
      status?: string
      channel?: string
      paid_at?: string
      paidAt?: string
      created_at?: string
      customer?: { email?: string }
    }>
  }
  if (!res.ok || !json.status || !Array.isArray(json.data)) return []
  return json.data.map((t) => ({
    id: t.id ?? 0,
    reference: t.reference ?? '',
    amount: t.amount ?? 0,
    currency: (t.currency ?? '').toUpperCase(),
    status: t.status ?? 'unknown',
    channel: t.channel ?? null,
    paidAt: t.paid_at ?? t.paidAt ?? t.created_at ?? null,
    email: t.customer?.email ?? null,
  }))
}

// Return the set of transaction ids that already have a refund (any status
// except an outright failure), so the payments panel can disable refunding a
// transaction that's already been refunded instead of relying on the /refund
// call to error out.
export async function listRefundedTransactionIds(perPage = 100): Promise<Set<number>> {
  const size = Math.min(200, Math.max(1, Math.floor(perPage)))
  const res = await fetch(`${PAYSTACK_BASE}/refund?perPage=${size}&page=1`, {
    headers: { Authorization: `Bearer ${secretKey()}` },
    cache: 'no-store',
  })
  const json = (await res.json()) as {
    status?: boolean
    // Paystack returns `transaction` as either a numeric id or a nested object.
    data?: Array<{ status?: string; transaction?: number | { id?: number } }>
  }
  const ids = new Set<number>()
  if (!res.ok || !json.status || !Array.isArray(json.data)) return ids
  for (const r of json.data) {
    if ((r.status ?? '').toLowerCase() === 'failed') continue
    const txId = typeof r.transaction === 'object' ? r.transaction?.id : r.transaction
    if (typeof txId === 'number' && txId > 0) ids.add(txId)
  }
  return ids
}

// Paystack's verify response returns metadata as whatever shape it was stored
// in: a JSON object, a JSON-encoded string, or "" when absent. Coerce it to a
// plain object (or null) so callers can read fields like userId safely.
function normalizeMetadata(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
    } catch {
      // Not JSON — nothing usable to activate against.
    }
  }
  return null
}
