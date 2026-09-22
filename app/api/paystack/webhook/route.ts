import { activatePlanFromReference, revertPlanForRefund } from '@/lib/billing/activate'
import { revalidatePath } from 'next/cache'
import { createHmac, timingSafeEqual } from 'crypto'

// Paystack webhook — the AUTHORITATIVE plan-activation path. The client-side
// confirmPlanCheckout is the fast, in-tab path; this endpoint is the safety net
// that still activates the plan when the payer's tab closes, loses connection,
// or the confirm call fails between paying and confirmation. Both routes share
// activatePlanFromReference, whose lastPaymentRef guard makes them idempotent,
// so running both for one payment can never double-grant access.

// Signature verification needs the exact raw request bytes, so this route must
// not run on a cached/optimized response.
export const dynamic = 'force-dynamic'

// Browser-friendly health check. Paystack only ever sends POSTs here, so GET is
// free to use for confirming the route is deployed and the signing secret is
// present. It never reveals the secret itself — only whether one is configured.
export async function GET() {
  return Response.json({
    ok: true,
    endpoint: 'paystack-webhook',
    method: 'POST',
    secretConfigured: Boolean(process.env.PAYSTACK_SECRET_KEY),
    note: 'Send real events via POST with a valid x-paystack-signature header.',
  })
}

export async function POST(req: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY
  if (!secret) {
    console.error('[v0] PAYSTACK_SECRET_KEY is not set — cannot verify webhook')
    return new Response('Webhook not configured', { status: 500 })
  }

  const signature = req.headers.get('x-paystack-signature')
  if (!signature) return new Response('Missing signature', { status: 400 })

  const payload = await req.text()

  // Paystack signs the raw body with HMAC-SHA512 keyed by the secret key.
  const expected = createHmac('sha512', secret).update(payload).digest('hex')
  const sigBuf = Buffer.from(signature)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    console.error('[v0] Paystack webhook signature verification failed')
    return new Response('Invalid signature', { status: 400 })
  }

  try {
    const event = JSON.parse(payload) as {
      event?: string
      data?: {
        reference?: string
        // refund.processed carries the ORIGINAL transaction under
        // transaction_reference (plus the refunded amount in minor units).
        transaction_reference?: string
        amount?: number
      }
    }
    if (event.event === 'charge.success' && event.data?.reference) {
      const result = await activatePlanFromReference(event.data.reference)
      if (result.ok && !result.alreadyProcessed) revalidatePath('/')
    } else if (event.event === 'refund.processed' && event.data?.transaction_reference) {
      // A refund of the activating payment revokes the paid term (full refunds
      // only; partial refunds keep access). Idempotent, so retries are safe.
      const result = await revertPlanForRefund(event.data.transaction_reference, event.data.amount)
      if (result.ok && result.reverted) revalidatePath('/')
    }
  } catch (err) {
    // Return 500 so Paystack retries later rather than dropping the event.
    console.error('[v0] Error handling Paystack webhook:', (err as Error).message)
    return new Response('Handler error', { status: 500 })
  }

  // Always 200 for verified events we don't act on, so Paystack stops retrying.
  return new Response('ok', { status: 200 })
}
