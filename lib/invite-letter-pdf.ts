import "server-only"
import path from "node:path"
import PDFDocument from "pdfkit"
import { LEGAL } from "@/lib/legal"

// The official StayKnit emblem, a raster crop of the brand logo, embedded in the
// PDF letterhead. Resolved from the app's public assets at request time.
const EMBLEM_PATH = path.join(process.cwd(), "public", "images", "stayknit-emblem-dark.png")
const EMBLEM_ASPECT = 535 / 615 // source crop is 615x535

// Renders the StayKnit pilot invitation as a print-ready A4 PDF. pdfkit is used
// (not docx) because the invitation is a finished letter meant to be read/printed
// as-is, and its built-in Helvetica family means no font files to bundle. Text
// flows and paginates automatically, and the closing signature block is kept
// together on a single page.

// Brand palette (from app/globals.css). Darkened teal for headings so the copy
// stays legible on white paper; the lighter primary is used only as an accent.
const TEAL_DEEP = "#0d5b4f"
const TEAL = "#5fb3a1"
const INK = "#0a0f11"
const MUTED = "#5b6b66"

const PAGE_MARGIN = 64
const BODY_SIZE = 11
const BODY_LEADING = 4

type Doc = InstanceType<typeof PDFDocument>

export type InviteLetterPdfInput = {
  friendName: string
  businessName: string
  friendEmail: string
  properties: string[]
  dateLabel: string
}

function contentWidth(doc: Doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right
}

function paragraph(doc: Doc, text: string, opts?: { size?: number; color?: string; gap?: number }) {
  doc
    .font("Helvetica")
    .fontSize(opts?.size ?? BODY_SIZE)
    .fillColor(opts?.color ?? INK)
    .text(text, { align: "left", lineGap: BODY_LEADING })
  doc.moveDown(opts?.gap ?? 0.8)
}

function heading(doc: Doc, text: string) {
  doc.moveDown(0.4)
  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .fillColor(TEAL_DEEP)
    .text(text, { align: "left" })
  doc.moveDown(0.5)
}

// A wrapping bullet with a hanging indent: the marker sits in the left gutter and
// the text block is inset so wrapped lines align under the first line, not the
// bullet.
function bulletItem(doc: Doc, text: string, marker: string) {
  const left = doc.page.margins.left
  const textX = left + 16
  const width = doc.page.width - doc.page.margins.right - textX
  const y = doc.y
  doc.font("Helvetica-Bold").fontSize(BODY_SIZE).fillColor(TEAL_DEEP).text(marker, left, y, { lineBreak: false })
  doc.font("Helvetica").fontSize(BODY_SIZE).fillColor(INK).text(text, textX, y, { width, lineGap: BODY_LEADING })
  doc.moveDown(0.5)
  doc.x = left
}

export function buildInviteLetterPdf(input: InviteLetterPdfInput): Promise<Buffer> {
  const { friendName, businessName, friendEmail, properties, dateLabel } = input

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
    info: {
      Title: `StayKnit pilot invitation — ${friendName}`,
      Author: "StayKnit",
      Creator: "StayKnit",
    },
  })

  const chunks: Buffer[] = []
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
  })

  // Letterhead: emblem + wordmark on the left, date on the right of the row.
  const headerY = doc.y
  const EMBLEM_W = 40
  const EMBLEM_H = Math.round(EMBLEM_W * EMBLEM_ASPECT)
  const left = doc.page.margins.left
  try {
    doc.image(EMBLEM_PATH, left, headerY, { width: EMBLEM_W })
  } catch {
    // If the asset can't be read for any reason, fall back to text-only branding
    // rather than failing the whole invitation.
  }
  doc
    .font("Helvetica-Bold")
    .fontSize(24)
    .fillColor(TEAL_DEEP)
    .text("StayKnit", left + EMBLEM_W + 12, headerY + Math.max(0, (EMBLEM_H - 20) / 2))
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(MUTED)
    .text(dateLabel, left, headerY + 8, { align: "right" })
  // Keep the cursor below the emblem so the accent rule never clips it.
  doc.y = Math.max(doc.y, headerY + EMBLEM_H)
  // Accent rule under the letterhead.
  doc.moveDown(0.6)
  const ruleY = doc.y
  doc
    .save()
    .lineWidth(2)
    .strokeColor(TEAL)
    .moveTo(doc.page.margins.left, ruleY)
    .lineTo(doc.page.width - doc.page.margins.right, ruleY)
    .stroke()
    .restore()
  doc.moveDown(1)
  doc.x = doc.page.margins.left

  paragraph(doc, `Dear ${friendName},`, { gap: 0.6 })

  heading(doc, "An invitation to our pre-launch pilot")
  paragraph(
    doc,
    `We would like to invite ${businessName} to join the StayKnit pre-launch pilot. StayKnit brings all of your booking calendars into one place, keeps your channels in sync over iCal, and produces clean owner statements automatically.`,
  )
  paragraph(
    doc,
    "Your access during the pilot is entirely complimentary — there is no charge and no subscription while we test together, right up until the official launch. We would simply value your feedback as a real host using the product day to day.",
  )

  if (properties.length) {
    paragraph(doc, "The properties we have noted for your pilot:", { gap: 0.3 })
    for (const p of properties) bulletItem(doc, p, "•")
    doc.moveDown(0.4)
  }

  paragraph(doc, "Getting started is quick:", { gap: 0.3 })
  const steps = [
    `Watch for a secure sign-in email from StayKnit sent to ${friendEmail}.`,
    "Follow the link to set your own private password.",
    "Add your properties and paste in your calendar (iCal) links so we can check that sync runs cleanly.",
  ]
  steps.forEach((s, i) => bulletItem(doc, s, `${i + 1}.`))
  doc.moveDown(0.4)
  paragraph(
    doc,
    "If anything looks off — especially with calendar sync — tell us directly and we will get it sorted. That is exactly what this pilot is for.",
  )

  heading(doc, "Pilot terms & conditions")
  for (const t of [
    "This is a pre-launch pilot. Access is provided free of charge and may be changed, paused, or withdrawn while we continue testing. No subscription applies until the official launch, and you will never be charged during the pilot without your clear, prior agreement.",
    "The service is provided “as is” during the pilot and may contain bugs or be interrupted for maintenance. StayKnit is a tool to help you manage bookings; you remain responsible for your own bookings, guest communications, pricing, and any dealings with booking channels such as Airbnb or Booking.com.",
    "You are responsible for the accuracy of the property, calendar (iCal), and financial information you enter, and for keeping your login details secure. Please only connect calendars and properties that you are authorised to manage.",
    "We will handle your personal information in line with applicable data-protection law (including South Africa’s POPIA), and use it only to operate the pilot and improve StayKnit. You may ask us to export or delete your data at any time.",
    "Either of us may end your participation in the pilot at any time. On request or at launch, we will help you export your data.",
  ])
    bulletItem(doc, t, "•")

  heading(doc, "Confidentiality")
  for (const t of [
    "Because StayKnit is not yet publicly launched, we ask that you keep the product, its features, screens, pricing, and any information you learn during the pilot confidential, and that you do not share screenshots, recordings, or access with anyone outside your own business without our written permission.",
    "In turn, we will treat your business information, guest data, and financial figures as strictly confidential, and will not disclose them to any third party except as needed to run the service or as required by law.",
    "These confidentiality commitments continue even after the pilot ends.",
  ])
    bulletItem(doc, t, "•")

  doc.moveDown(0.2)
  paragraph(
    doc,
    "By setting your password and using StayKnit during the pilot, you agree to these pilot terms and confidentiality arrangements.",
  )
  paragraph(doc, "Thank you for helping us get StayKnit right before launch.")

  // Signature block. Keep it whole: if it wouldn't fit in the remaining space,
  // start it on a fresh page so the closing never splits across a page break.
  const SIGN_BLOCK_HEIGHT = 150
  const remaining = doc.page.height - doc.page.margins.bottom - doc.y
  if (remaining < SIGN_BLOCK_HEIGHT) doc.addPage()

  doc.moveDown(0.8)
  doc.x = doc.page.margins.left
  doc.font("Helvetica").fontSize(BODY_SIZE).fillColor(INK).text("Warm regards,")
  doc.moveDown(0.4)
  // Signature-style flourish: an oblique wordmark evoking a hand-signed name.
  doc.font("Helvetica-BoldOblique").fontSize(22).fillColor(TEAL_DEEP).text("The StayKnit Team")
  // Thin signature rule beneath the flourish.
  const sigRuleY = doc.y + 2
  doc
    .save()
    .lineWidth(1)
    .strokeColor(TEAL)
    .moveTo(doc.page.margins.left, sigRuleY)
    .lineTo(doc.page.margins.left + 220, sigRuleY)
    .stroke()
    .restore()
  doc.moveDown(0.8)
  doc.font("Helvetica-Bold").fontSize(BODY_SIZE).fillColor(INK).text("The StayKnit Team")
  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor(MUTED)
    .text(LEGAL.entity, { lineGap: 2 })
    .text(`${LEGAL.contactEmail}  ·  stayknit.org`, { lineGap: 2 })

  doc.end()
  return done
}
