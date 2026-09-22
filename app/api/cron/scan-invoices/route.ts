import { NextResponse } from "next/server"
import { scanInvoiceInbox } from "@/lib/invoice-scanner"
import { reportServerError } from "@/lib/email"

// Runs a few times a day (see vercel.json). Reads the info@stayknit.org mailbox,
// classifies new mail with the model, and drops third-party invoices into the
// Accounts review queue (invoice_email, status = pending). Idempotent: messages
// are de-duplicated by Message-ID, so overlapping runs never double-record.
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured." }, { status: 503 })
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await scanInvoiceInbox()
    return NextResponse.json(result, { status: result.ok ? 200 : 502 })
  } catch (err) {
    await reportServerError("scan-invoices cron", err)
    return NextResponse.json({ ok: false, error: "Invoice scan failed." }, { status: 500 })
  }
}
