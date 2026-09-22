// -----------------------------------------------------------------------------
// Single source of truth for the StayKnit company letterhead used on every
// exported document (Word, PDF, and the compiled spreadsheet). It is derived
// from lib/legal.ts so the registered entity, registration/tax numbers, and
// address can never drift between the app's legal pages and its documents.
//
// This module is deliberately dependency-free and client-safe (no `fs`, no
// server-only imports) so it can be imported by the print view as well as by
// the server-side Word/spreadsheet generators.
// -----------------------------------------------------------------------------

import { LEGAL } from "@/lib/legal"

export const COMPANY = {
  name: LEGAL.entity, // StayKnit (Pty) Ltd
  tradingName: "StayKnit",
  tagline: "Stays that fit your world",
  registration: LEGAL.registration.trim(), // CIPC registration number
  taxNumber: LEGAL.taxNumber.trim(), // SARS taxpayer number
  address: LEGAL.address.trim(),
  email: LEGAL.contactEmail, // support@stayknit.org
  privacyEmail: LEGAL.privacyEmail, // privacy@stayknit.org
  website: "www.stayknit.org",
  governingLaw: LEGAL.governingLaw,
} as const

// Public URL of the official logo (used by the browser print view).
export const LOGO_PUBLIC_PATH = "/images/stayknit-logo-standard.png"
// On-disk location of the same logo, for reference. NOTE: the Word and
// spreadsheet generators intentionally inline this as a static string literal
// at their fs.readFile call sites (not this constant) so Next's build tracer
// can scope tracing to the single asset. Keep the two in sync.
export const LOGO_FILE_PATH = "public/images/stayknit-logo-standard.png"
export const LOGO_ASPECT = 980 / 906 // width / height

// Ordered label/value pairs that make up the letterhead identity block. Blank
// values are dropped so a not-yet-confirmed field never renders an empty line.
//
// The SARS taxpayer number is deliberately NOT rendered here. It is kept in
// COMPANY/LEGAL for genuine internal use only; exported and printed
// owner-facing documents show the CIPC registration number and address alone,
// matching the emailed receipts/statements, the public legal pages, and the
// counsel legal pack.
export function companyIdentityLines(): { label: string; value: string }[] {
  const lines: { label: string; value: string }[] = []
  const reg = COMPANY.registration
  if (reg) lines.push({ label: "Reg. no.", value: reg })
  if (COMPANY.address) lines.push({ label: "Registered address", value: COMPANY.address })
  lines.push({ label: "Email", value: COMPANY.email })
  lines.push({ label: "Web", value: COMPANY.website })
  return lines
}

// A compact one-line company descriptor used in document footers.
export function companyFooterLine(): string {
  const parts: string[] = [COMPANY.name]
  if (COMPANY.registration) parts.push(`Reg. ${COMPANY.registration}`)
  if (COMPANY.address) parts.push(COMPANY.address)
  parts.push(COMPANY.email)
  return parts.join("  \u2022  ")
}
