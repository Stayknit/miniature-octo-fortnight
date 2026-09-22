"use server"

import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx"
import { assertAdmin } from "@/lib/admin-auth"
import { sendPilotInviteEmail } from "@/lib/email"
import { buildInviteLetterPdf } from "@/lib/invite-letter-pdf"

// Only an admin account (OWNER_EMAIL) may generate pilot-invite letters.
async function assertOwner() {
  await assertAdmin()
}

// Public origin used for the "create your pilot account" link in the invite
// email. Mirrors the Better Auth base-URL resolution so the link is correct in
// production, preview, and the v0 runtime.
function publicOrigin(): string {
  return (
    process.env.BETTER_AUTH_URL ??
    (process.env.NODE_ENV === "production"
      ? "https://stayknit.org"
      : process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : process.env.V0_RUNTIME_URL) ??
    "https://stayknit.org"
  )
}

export type InviteLetterInput = {
  friendName: string
  businessName: string
  friendEmail: string
  properties: string[]
}

export type InviteLetterResult =
  | { ok: true; fileName: string; base64: string }
  | { ok: false; message: string }

// A blank, fill-in-yourself Word form the owner downloads once and emails to a
// prospective pilot host. The recipient types their details onto the lines and
// emails it back — no app access required, and it never contains any real data.
function fieldLine(label: string, opts?: { after?: number }) {
  return new Paragraph({
    spacing: { after: opts?.after ?? 200 },
    children: [
      new TextRun({ text: `${label}:  `, bold: true, size: 22 }),
      // A run of underscores gives a visible writing line in Word.
      new TextRun({ text: "_".repeat(48), size: 22, color: "999999" }),
    ],
  })
}

export async function generateBlankDetailsForm(): Promise<InviteLetterResult> {
  try {
    await assertOwner()
  } catch {
    return { ok: false, message: "You are not authorised to download this form." }
  }

  const doc = new Document({
    creator: "StayKnit",
    title: "StayKnit pilot host details form",
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            spacing: { after: 200 },
            children: [new TextRun({ text: "StayKnit", bold: true, size: 40 })],
          }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { after: 160 },
            children: [new TextRun({ text: "Pilot host details form", bold: true, size: 26 })],
          }),
          line(
            "Thank you for joining the StayKnit pre-launch pilot. Please complete the details below and email this form back so we can set up your complimentary pilot account.",
          ),

          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 120, after: 160 },
            children: [new TextRun({ text: "Your details", bold: true, size: 24 })],
          }),
          fieldLine("Full name"),
          fieldLine("Business / trading name"),
          fieldLine("Email address"),
          fieldLine("Mobile number"),
          fieldLine("Landline (optional)"),

          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 120, after: 80 },
            children: [new TextRun({ text: "Your properties", bold: true, size: 24 })],
          }),
          line("List each property you manage, with its calendar (iCal) link if you have one to hand.", {
            size: 20,
            after: 140,
          }),
          ...Array.from({ length: 5 }).flatMap((_, i) => [
            fieldLine(`Property ${i + 1} name`, { after: 80 }),
            fieldLine(`Property ${i + 1} iCal link`, { after: 200 }),
          ]),

          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 120, after: 160 },
            children: [new TextRun({ text: "Anything else we should know", bold: true, size: 24 })],
          }),
          fieldLine("Notes", { after: 80 }),
          new Paragraph({
            spacing: { after: 240 },
            children: [new TextRun({ text: "_".repeat(70), size: 22, color: "999999" })],
          }),

          line(
            "Once we receive this, we will email you a secure sign-in link so you can set your own password and get started.",
            { size: 20 },
          ),
        ],
      },
    ],
  })

  const buffer = await Packer.toBuffer(doc)
  const base64 = Buffer.from(buffer).toString("base64")
  return {
    ok: true,
    fileName: "StayKnit-Pilot-Host-Details-Form.docx",
    base64,
  }
}

function line(text: string, opts?: { bold?: boolean; size?: number; after?: number }) {
  return new Paragraph({
    spacing: { after: opts?.after ?? 160 },
    children: [new TextRun({ text, bold: opts?.bold, size: opts?.size ?? 22 })],
  })
}

export async function generateInviteLetter(input: InviteLetterInput): Promise<InviteLetterResult> {
  try {
    await assertOwner()
  } catch {
    return { ok: false, message: "You are not authorised to generate invitation letters." }
  }

  const friendName = input.friendName?.trim() ?? ""
  const businessName = input.businessName?.trim() ?? ""
  const friendEmail = input.friendEmail?.trim() ?? ""
  const properties = (input.properties ?? []).map((p) => p.trim()).filter(Boolean)

  if (!friendName) return { ok: false, message: "Please enter the recipient's name." }
  if (!businessName) return { ok: false, message: "Please enter their business name." }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(friendEmail))
    return { ok: false, message: "Please enter a valid email address." }

  const today = new Date().toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Johannesburg",
  })

  const buffer = await buildInviteLetterPdf({
    friendName,
    businessName,
    friendEmail,
    properties,
    dateLabel: today,
  })
  const base64 = Buffer.from(buffer).toString("base64")
  const safeName = friendName.replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "") || "host"
  return {
    ok: true,
    fileName: `StayKnit-Pilot-Invite-${safeName}.pdf`,
    base64,
  }
}

export type SendInviteResult = { ok: true; to: string } | { ok: false; message: string }

// Owner-only: generate the personalised pilot letter and email it straight to
// the recipient (from support@ so replies come back to the inbox), with the
// formal letter attached. This is the "auto send" path — no Outlook step. The
// recipient creates their own account via the sign-up link, and the normal
// email-verification flow takes over from there.
export async function sendPilotInvite(input: InviteLetterInput): Promise<SendInviteResult> {
  try {
    await assertOwner()
  } catch {
    return { ok: false, message: "You are not authorised to send invitations." }
  }

  // Reuse the exact same validation + document as the download path so the
  // emailed letter is identical to the one the owner would send manually.
  const letter = await generateInviteLetter(input)
  if (!letter.ok) return letter

  const friendName = input.friendName.trim()
  const businessName = input.businessName.trim()
  const friendEmail = input.friendEmail.trim()
  const properties = (input.properties ?? []).map((p) => p.trim()).filter(Boolean)

  try {
    await sendPilotInviteEmail({
      to: friendEmail,
      friendName,
      businessName,
      properties,
      signUpUrl: `${publicOrigin()}/sign-up`,
      letter: {
        filename: letter.fileName,
        content: Buffer.from(letter.base64, "base64"),
        contentType: "application/pdf",
      },
    })
  } catch (err) {
    console.error("[v0] pilot invite email failed", err)
    return { ok: false, message: "The invitation could not be emailed. Check email settings and try again." }
  }

  return { ok: true, to: friendEmail }
}
