import "server-only"
import { ImapFlow } from "imapflow"
import { simpleParser } from "mailparser"
import { generateObject } from "ai"
import { z } from "zod"
import { inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { invoiceEmail } from "@/lib/db/schema"
import { getRateToZar, toZarMinor, type CostCurrency } from "@/lib/fx"

// Reads the info@stayknit.org mailbox over IMAP and turns third-party invoice /
// receipt emails into a review queue (invoice_email, status = pending). The
// heavy lifting — deciding whether a message is an invoice and pulling out
// vendor / amount / currency / date — is done by the model via generateObject.
// Nothing here ever creates a running cost directly; approval happens in the
// Accounts UI so a mis-parsed amount can't silently enter the books.

// Namecheap Private Email IMAP. Host/user aren't secrets; only the password is.
const IMAP_HOST = process.env.INFO_IMAP_HOST || "mail.privateemail.com"
const IMAP_PORT = Number(process.env.INFO_IMAP_PORT || 993)
const IMAP_USER = process.env.INFO_IMAP_USER || "info@stayknit.org"
const IMAP_PASSWORD = process.env.INFO_IMAP_PASSWORD

// How far back to look each run, and how many *new* messages to run through the
// model per run (bounds cost + runtime). Already-seen messages are skipped via
// the messageId unique constraint, so a backlog drains over a few runs.
const LOOKBACK_DAYS = 21
const MAX_NEW_PER_RUN = 25
// Truncate very long emails before sending to the model.
const MAX_BODY_CHARS = 8000
const EXTRACTION_MODEL = "openai/gpt-4o-mini"

export type ScanResult = {
  ok: boolean
  scanned: number
  processed: number
  invoices: number
  ignored: number
  error?: string
}

const extraction = z.object({
  isInvoice: z
    .boolean()
    .describe("True only if this email is a bill, invoice, receipt, or payment confirmation for money owed or paid."),
  vendor: z.string().describe("The company/service being paid, e.g. 'Vercel', 'Neon', 'Namecheap'. Empty if unknown."),
  amountMinor: z
    .number()
    .int()
    .describe("Total amount charged, in MINOR units (cents) of the currency. e.g. $20.00 => 2000. 0 if unknown."),
  currency: z.enum(["ZAR", "EUR", "USD"]).describe("ISO currency of the amount. Use USD if it shows $ with no other hint."),
  invoiceDate: z
    .string()
    .describe("The invoice/charge date as YYYY-MM-DD. Empty string if not stated."),
  cadence: z.enum(["monthly", "yearly"]).describe("Billing period this charge covers. Best guess; default monthly."),
  confidence: z.number().int().min(0).max(100).describe("0-100 confidence this is a real invoice with a correct amount."),
  summary: z.string().describe("One short sentence describing what was billed."),
})

async function extractInvoice(input: { subject: string; from: string; body: string }) {
  const { object } = await generateObject({
    model: EXTRACTION_MODEL,
    schema: extraction,
    prompt: [
      "You are an accounts assistant for a small SaaS. Decide whether the following email is a third-party invoice, receipt, or payment confirmation, and if so extract the billing details.",
      "Only treat genuine bills/receipts as invoices — ignore marketing, newsletters, product updates, security alerts, and password resets.",
      "",
      `From: ${input.from}`,
      `Subject: ${input.subject}`,
      "",
      "Body:",
      input.body.slice(0, MAX_BODY_CHARS),
    ].join("\n"),
  })
  return object
}

export async function scanInvoiceInbox(): Promise<ScanResult> {
  if (!IMAP_PASSWORD) {
    return { ok: false, scanned: 0, processed: 0, invoices: 0, ignored: 0, error: "INFO_IMAP_PASSWORD is not set." }
  }

  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: IMAP_PORT === 993,
    auth: { user: IMAP_USER, pass: IMAP_PASSWORD },
    logger: false,
  })

  let scanned = 0
  let processed = 0
  let invoices = 0
  let ignored = 0

  try {
    await client.connect()
  } catch (err) {
    return {
      ok: false,
      scanned: 0,
      processed: 0,
      invoices: 0,
      ignored: 0,
      error: `IMAP connect failed: ${(err as Error).message}`,
    }
  }

  const lock = await client.getMailboxLock("INBOX")
  try {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000)
    const uids = (await client.search({ since }, { uid: true })) || []
    scanned = Array.isArray(uids) ? uids.length : 0
    if (!scanned) {
      return { ok: true, scanned: 0, processed: 0, invoices: 0, ignored: 0 }
    }

    // Newest first, then cheaply read envelopes to get Message-IDs so we can
    // skip anything already in the queue before doing any model work.
    const ordered = (uids as number[]).slice().sort((a, b) => b - a)
    const candidates: { uid: number; messageId: string; subject: string; from: string; fromName: string; receivedAt: Date }[] =
      []

    for await (const msg of client.fetch(ordered, { uid: true, envelope: true }, { uid: true })) {
      const env = msg.envelope
      const fromAddr = env?.from?.[0]
      const messageId = env?.messageId || `uid-${msg.uid}@${IMAP_USER}`
      candidates.push({
        uid: msg.uid,
        messageId,
        subject: env?.subject || "",
        from: fromAddr?.address || "",
        fromName: fromAddr?.name || "",
        receivedAt: env?.date ? new Date(env.date) : new Date(),
      })
    }

    // Which of these have we already recorded? (any status counts as seen)
    const ids = candidates.map((c) => c.messageId)
    const existing = ids.length
      ? await db
          .select({ messageId: invoiceEmail.messageId })
          .from(invoiceEmail)
          .where(inArray(invoiceEmail.messageId, ids))
      : []
    const seen = new Set(existing.map((r) => r.messageId))
    const fresh = candidates.filter((c) => !seen.has(c.messageId)).slice(0, MAX_NEW_PER_RUN)

    for (const c of fresh) {
      processed++
      // Download the full source and parse to plain text for the model.
      let body = ""
      try {
        const { content } = await client.download(String(c.uid), undefined, { uid: true })
        const parsed = await simpleParser(content)
        body = parsed.text || parsed.html?.toString().replace(/<[^>]+>/g, " ") || ""
      } catch (err) {
        console.error("[v0] invoice download/parse failed for uid", c.uid, (err as Error).message)
      }

      let ai: z.infer<typeof extraction> | null = null
      try {
        ai = await extractInvoice({ subject: c.subject, from: `${c.fromName} <${c.from}>`, body })
      } catch (err) {
        console.error("[v0] invoice extraction failed for uid", c.uid, (err as Error).message)
      }

      const isInvoice = !!ai?.isInvoice && (ai?.amountMinor ?? 0) > 0
      // The extraction schema constrains currency to ZAR/EUR/USD, so lowercasing
      // always yields a valid CostCurrency; default to USD when extraction failed.
      const currency: CostCurrency = (ai?.currency?.toLowerCase() as CostCurrency) || "usd"

      // Resolve the ZAR conversion, locking the rate to the invoice date.
      let fxRateMicro = 1_000_000
      let fxDate: string | null = null
      let amountZarCents = ai?.amountMinor ?? 0
      if (isInvoice && currency !== "zar") {
        try {
          const fx = await getRateToZar(currency, ai?.invoiceDate || c.receivedAt.toISOString().slice(0, 10))
          fxRateMicro = fx.rateMicro
          fxDate = fx.asOf
          amountZarCents = toZarMinor(ai?.amountMinor ?? 0, fx.rateMicro)
        } catch (err) {
          console.error("[v0] invoice FX lookup failed for uid", c.uid, (err as Error).message)
        }
      }

      await db
        .insert(invoiceEmail)
        .values({
          messageId: c.messageId,
          fromAddress: c.from,
          fromName: c.fromName,
          subject: c.subject,
          receivedAt: c.receivedAt,
          // Non-invoices are stored as 'ignored' so they aren't re-processed and
          // never appear in the pending review queue.
          status: isInvoice ? "pending" : "ignored",
          vendor: ai?.vendor || c.fromName || c.from,
          amountMinor: ai?.amountMinor ?? 0,
          currency: currency.toUpperCase(),
          invoiceDate: ai?.invoiceDate || null,
          cadence: ai?.cadence === "yearly" ? "yearly" : "monthly",
          confidence: ai?.confidence ?? 0,
          summary: ai?.summary || "",
          fxRateMicro,
          fxDate,
          amountZarCents,
        })
        .onConflictDoNothing({ target: invoiceEmail.messageId })

      if (isInvoice) invoices++
      else ignored++
    }

    return { ok: true, scanned, processed, invoices, ignored }
  } catch (err) {
    return {
      ok: false,
      scanned,
      processed,
      invoices,
      ignored,
      error: `Scan failed: ${(err as Error).message}`,
    }
  } finally {
    lock.release()
    try {
      await client.logout()
    } catch {
      // ignore logout errors
    }
  }
}
