"use server"

import { sendPublicContactMessage } from "@/lib/email"

export type ContactResult = { ok: true } | { ok: false; error: string }

// Public, unauthenticated contact form used by the landing-page widget. Unlike
// submitSupportTicket (which requires a signed-in user and opens a ticket),
// this just relays a website enquiry to the support inbox. Kept deliberately
// simple: validate, cap sizes, drop obvious bots via honeypot, then email.
export async function submitContactRequest(input: {
  name: string
  email: string
  message: string
  // Honeypot: a hidden field real users never fill. Bots often do.
  company?: string
}): Promise<ContactResult> {
  // Silently succeed for honeypot hits so bots get no signal.
  if (input.company && input.company.trim() !== "") return { ok: true }

  const name = input.name.trim().slice(0, 100)
  const email = input.email.trim().slice(0, 200)
  const message = input.message.trim().slice(0, 4000)

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." }
  }
  if (message.length < 5) {
    return { ok: false, error: "Please add a short message so we can help." }
  }

  try {
    await sendPublicContactMessage({ name, email, message })
    return { ok: true }
  } catch (err) {
    console.error("[v0] public contact submit failed", err)
    return { ok: false, error: "Something went wrong sending your message. Please try again." }
  }
}
