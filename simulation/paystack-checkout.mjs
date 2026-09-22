#!/usr/bin/env node
/**
 * StayKnit — Paystack Checkout Smoke Test
 * =======================================
 *
 * Exercises the REAL end-to-end paid-subscription path against Paystack's TEST
 * API and the running app, then asserts the database actually activated the
 * plan. It proves the same rails the in-app popup uses, without automating a
 * cross-origin iframe:
 *
 *   1. transaction/initialize        (what startPlanCheckout does)
 *   2. charge a Paystack test card   (stands in for the hosted popup)
 *   3. transaction/verify            (authoritative success + amount)
 *   4. signed charge.success webhook (the REAL activatePlanFromReference path)
 *   5. DB assertion                  (plan active, correct access window)
 *   6. idempotency                   (replayed webhook never double-grants)
 *   7. amount-tamper defense         (underpayment must NOT unlock a plan)
 *   8. bad-signature rejection       (401/400, never activates)
 *
 * SAFE: refuses to run unless PAYSTACK_SECRET_KEY is a TEST key, and every row
 * and Paystack customer it creates is for a throwaway user it deletes on exit.
 *
 * Usage: node simulation/paystack-checkout.mjs [--base http://localhost:3000]
 */

import { readFileSync } from 'node:fs'
import { createHmac, randomUUID, randomBytes } from 'node:crypto'
import { Pool } from 'pg'

const args = process.argv.slice(2)
const valOf = (f, d) => {
  const i = args.indexOf(f)
  return i >= 0 && args[i + 1] ? args[i + 1] : d
}
const BASE = valOf('--base', process.env.SIM_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')

// --- env loader ------------------------------------------------------------
function loadEnv() {
  for (const file of ['.env.development.local', '.env.local', '.env']) {
    try {
      const txt = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
      for (const line of txt.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
        if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    } catch {
      /* file absent — fine */
    }
  }
}
loadEnv()

const SECRET = process.env.PAYSTACK_SECRET_KEY || ''
const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || ''

// --- results ----------------------------------------------------------------
let pass = 0
let fail = 0
const ok = (name, extra = '') => {
  pass++
  console.log(`  PASS  ${name}${extra ? ` — ${extra}` : ''}`)
}
const bad = (name, extra = '') => {
  fail++
  console.log(`  FAIL  ${name}${extra ? ` — ${extra}` : ''}`)
}
const assert = (cond, name, extra = '') => (cond ? ok(name, extra) : bad(name, extra))

// --- Paystack helpers -------------------------------------------------------
async function ps(method, path, body) {
  const res = await fetch(`https://api.paystack.co${path}`, {
    method,
    headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  return res.json()
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Walk Paystack's test-charge auth state machine to a successful charge.
async function chargeTestCard({ email, amount, currency, reference, metadata }) {
  let r = await ps('POST', '/charge', {
    email,
    amount,
    currency,
    reference,
    metadata,
    card: { number: '4084084084084081', cvv: '408', expiry_month: '12', expiry_year: '2030' },
  })
  for (let i = 0; i < 8; i++) {
    const d = r.data || {}
    const status = d.status
    const ref = d.reference || reference
    if (status === 'success') return d
    if (status === 'send_otp') r = await ps('POST', '/charge/submit_otp', { otp: '123456', reference: ref })
    else if (status === 'send_pin') r = await ps('POST', '/charge/submit_pin', { pin: '0000', reference: ref })
    else if (status === 'send_phone') r = await ps('POST', '/charge/submit_phone', { phone: '08012345678', reference: ref })
    else if (status === 'send_birthday') r = await ps('POST', '/charge/submit_birthday', { birthday: '1990-01-01', reference: ref })
    else if (status === 'pending' || status === 'processing') {
      await sleep(2500)
      r = await ps('GET', `/transaction/verify/${encodeURIComponent(ref)}`)
    } else if (status === 'open_url') {
      throw new Error('test card triggered a 3DS redirect (open_url) — cannot complete headlessly')
    } else {
      throw new Error(`charge stuck: status=${status} message=${r.message || d.message || 'n/a'}`)
    }
  }
  throw new Error('charge did not reach success within the step budget')
}

function signedWebhook(reference) {
  const payload = JSON.stringify({ event: 'charge.success', data: { reference } })
  const signature = createHmac('sha512', SECRET).update(payload).digest('hex')
  return fetch(`${BASE}/api/paystack/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-paystack-signature': signature },
    body: payload,
  })
}

// --- pricing (mirrors lib/pricing.periodPricing for the tiers under test) ----
const MONTHLY_ZAR = { starter: 19900, host: 29900, professional: 49900, business: 89900 }
const PERIOD = { monthly: { months: 1, bonus: 0, disc: 0 }, six_month: { months: 6, bonus: 0, disc: 10 }, yearly: { months: 12, bonus: 2, disc: 0 } }
function priceZar(plan, period) {
  const base = MONTHLY_ZAR[plan]
  const p = PERIOD[period]
  const gross = base * p.months
  const total = gross - Math.round((gross * p.disc) / 100)
  return { total, accessMonths: p.months + p.bonus }
}

// --- DB ---------------------------------------------------------------------
const pool = DB_URL ? new Pool({ connectionString: DB_URL, max: 3 }) : null

async function makeHost() {
  const id = randomUUID()
  const email = `sim-pay-${randomBytes(4).toString('hex')}@example.com`
  await pool.query(
    `insert into "user" (id, name, email, "emailVerified", role, "createdAt", "updatedAt", "lastActiveAt")
     values ($1,$2,$3,true,'host',now(),now(),now())`,
    [id, 'Sim Payer', email],
  )
  await pool.query(
    `insert into subscription ("userId", plan, status, "trialEndsAt", "createdAt", "updatedAt")
     values ($1,'trial','trialing', now() + interval '14 days', now(), now())`,
    [id],
  )
  return { id, email }
}
async function readSub(userId) {
  const { rows } = await pool.query(
    `select plan, status, "billingPeriod", "lastPaymentRef", "cancelAt" from subscription where "userId"=$1 limit 1`,
    [userId],
  )
  return rows[0]
}
async function cleanup(userId) {
  if (!pool) return
  await pool.query(`delete from subscription where "userId"=$1`, [userId])
  await pool.query(`delete from "user" where id=$1`, [userId])
}

// --- run --------------------------------------------------------------------
async function main() {
  console.log(`\nStayKnit — Paystack checkout smoke test\nBase: ${BASE}\n`)

  if (!SECRET) {
    console.error('PAYSTACK_SECRET_KEY is not set — cannot run.')
    process.exit(2)
  }
  if (!/^sk_test_/.test(SECRET)) {
    console.error('Refusing to run: PAYSTACK_SECRET_KEY is not a TEST key (must start with sk_test_).')
    process.exit(2)
  }
  if (!pool) {
    console.error('DATABASE_URL is not set — cannot assert activation.')
    process.exit(2)
  }
  ok('safety guard', 'running against Paystack TEST key + throwaway users')

  const plan = 'host'
  const period = 'monthly'
  const { total, accessMonths } = priceZar(plan, period)

  const payer = await makeHost()
  const tamperer = await makeHost()
  try {
    // 1. initialize (what startPlanCheckout does)
    const initRef = `SK-init-${randomBytes(6).toString('hex')}`
    const init = await ps('POST', '/transaction/initialize', {
      email: payer.email,
      amount: total,
      currency: 'ZAR',
      reference: initRef,
      metadata: { userId: payer.id, plan, period, currency: 'zar', accessMonths },
    })
    assert(init.status === true && !!init.data?.access_code, 'transaction/initialize returns an access code', init.message || '')

    // 2. pay with a test card (stands in for the hosted popup)
    const payRef = `SK-${payer.id.slice(0, 8)}-${randomBytes(8).toString('hex')}`
    const charged = await chargeTestCard({
      email: payer.email,
      amount: total,
      currency: 'ZAR',
      reference: payRef,
      metadata: { userId: payer.id, plan, period, currency: 'zar', accessMonths },
    })
    assert(charged.status === 'success', 'test card charge succeeds', `R${(total / 100).toFixed(2)} ${plan}/${period}`)

    // 3. authoritative verify
    const verify = await ps('GET', `/transaction/verify/${encodeURIComponent(payRef)}`)
    assert(verify.data?.status === 'success', 'transaction/verify reports success')
    assert(verify.data?.amount === total, 'verified amount matches server price', `${verify.data?.amount} == ${total}`)

    // 4. signed webhook drives the REAL activatePlanFromReference
    const wh = await signedWebhook(payRef)
    assert(wh.status === 200, 'signed charge.success webhook accepted', `HTTP ${wh.status}`)

    // 5. DB now shows an active paid plan with a ~1-month access window
    await sleep(500)
    const sub = await readSub(payer.id)
    assert(sub?.plan === plan, 'subscription.plan activated', sub?.plan)
    assert(sub?.status === 'active', 'subscription.status is active', sub?.status)
    assert(sub?.lastPaymentRef === payRef, 'lastPaymentRef recorded', sub?.lastPaymentRef)
    const days = sub?.cancelAt ? Math.round((new Date(sub.cancelAt) - Date.now()) / 86400000) : 0
    assert(days >= 25 && days <= 35, 'access window ~1 month out', `${days} days`)

    // 6. idempotency — replay the same webhook, nothing double-grants
    const before = sub?.cancelAt
    const wh2 = await signedWebhook(payRef)
    assert(wh2.status === 200, 'replayed webhook still 200')
    await sleep(400)
    const sub2 = await readSub(payer.id)
    assert(String(sub2?.cancelAt) === String(before), 'replay did NOT extend the access window', `${days} days unchanged`)

    // 7. amount-tamper defense — underpay for the same plan, must NOT unlock
    const lowRef = `SK-${tamperer.id.slice(0, 8)}-${randomBytes(8).toString('hex')}`
    await chargeTestCard({
      email: tamperer.email,
      amount: 10000, // R100 — far below the R299 host/monthly price
      currency: 'ZAR',
      reference: lowRef,
      metadata: { userId: tamperer.id, plan, period, currency: 'zar', accessMonths },
    })
    const wh3 = await signedWebhook(lowRef)
    assert(wh3.status === 200, 'underpaid webhook is accepted (verified event)', `HTTP ${wh3.status}`)
    await sleep(400)
    const subLow = await readSub(tamperer.id)
    assert(subLow?.plan === 'trial' && subLow?.status === 'trialing', 'underpayment did NOT unlock a paid plan', `${subLow?.plan}/${subLow?.status}`)

    // 8. bad signature is rejected outright
    const badSig = await fetch(`${BASE}/api/paystack/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-paystack-signature': 'deadbeef' },
      body: JSON.stringify({ event: 'charge.success', data: { reference: payRef } }),
    })
    assert(badSig.status === 400, 'forged webhook signature rejected', `HTTP ${badSig.status}`)
  } finally {
    await cleanup(payer.id)
    await cleanup(tamperer.id)
    await pool.end()
  }

  console.log(`\n${pass} passed · ${fail} failed\n`)
  process.exit(fail ? 1 : 0)
}

main().catch(async (err) => {
  console.error('\nHarness error:', err.message)
  try {
    await pool?.end()
  } catch {}
  process.exit(1)
})
