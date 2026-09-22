import "server-only"
import { AsyncLocalStorage } from "node:async_hooks"
import nodemailer, { type Transporter } from "nodemailer"
import { LEGAL } from "@/lib/legal"
import { siteOrigin } from "@/lib/site-url"

// Branded email header: the real StayKnit emblem (a raster crop of the official
// logo, served absolutely so it renders in every mail client) beside the
// wordmark. Laid out with a nested table because Outlook ignores fl/ inline-flex.
function brandHeader(padding: string): string {
  const emblem = `${siteOrigin()}/images/stayknit-emblem-dark.png`
  return `<tr><td style="padding:${padding};">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="padding-right:10px;vertical-align:middle;"><img src="${emblem}" width="34" height="30" alt="StayKnit" style="display:block;border:0;outline:none;text-decoration:none;" /></td>
              <td style="vertical-align:middle;"><span style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:#0f172a;">Stay<span style="color:#0d9488;">Knit</span></span></td>
            </tr></table>
          </td></tr>`
}

// Namecheap Private Email SMTP. Host/port/user are not secrets, so they default
// to the known StayKnit mailbox values and can be overridden via env if needed.
// Only SMTP_PASSWORD must come from the environment.
const SMTP_HOST = process.env.SMTP_HOST || "mail.privateemail.com"
const SMTP_PORT = Number(process.env.SMTP_PORT || 465)
const SMTP_USER = process.env.SMTP_USER || "resetpasswords@stayknit.org"
const SMTP_PASSWORD = process.env.SMTP_PASSWORD
const FROM = `StayKnit <${SMTP_USER}>`

// Support correspondence is sent from its own mailbox so replies land in the
// support inbox. Namecheap Private Email only lets a mailbox send as itself, so
// this authenticates with dedicated support@ credentials. The mailbox address
// defaults to the SUPPORT_SMTP_USER login.
function looksLikeEmail(v: string | undefined): v is string {
  return typeof v === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim())
}

const RAW_SUPPORT_USER = process.env.SUPPORT_SMTP_USER?.trim() || undefined
const SUPPORT_PASSWORD = process.env.SUPPORT_SMTP_PASSWORD
// A SUPPORT_SMTP_USER that is present but not a valid email (e.g. a key or other
// value pasted into the wrong Var) must NOT be used as an SMTP login: it is
// guaranteed to fail auth and would transmit that value — possibly a secret — to
// the mail server. Treat it as misconfigured and fall back to the primary mailbox.
const SUPPORT_USER_MISCONFIGURED = RAW_SUPPORT_USER !== undefined && !looksLikeEmail(RAW_SUPPORT_USER)
const SUPPORT_USER = SUPPORT_USER_MISCONFIGURED ? "support@stayknit.org" : (RAW_SUPPORT_USER ?? "support@stayknit.org")
const SUPPORT_ADDRESS = process.env.SUPPORT_EMAIL || SUPPORT_USER
const SUPPORT_FROM = `StayKnit Support <${SUPPORT_ADDRESS}>`

if (SUPPORT_USER_MISCONFIGURED) {
  console.warn(
    "[v0] SUPPORT_SMTP_USER is set but is not a valid email address; ignoring it and sending support mail from the primary mailbox with Reply-To support@. Fix or remove SUPPORT_SMTP_USER in project env.",
  )
}

// Better Auth's sendVerificationEmail callback has a fixed signature, so the
// "email didn't arrive" fallback can't pass an argument to pick a mailbox.
// Instead the resend action wraps the Better Auth call in
// `verificationChannel.run("support", …)`, and sendVerificationEmail() reads
// this request-scoped value to decide which mailbox to authenticate with.
export type MailChannel = "primary" | "support"
export const verificationChannel = new AsyncLocalStorage<MailChannel>()

// Whether a genuinely independent support mailbox is configured. Requires BOTH a
// password AND a valid email username — a misconfigured username disqualifies it.
// When false, the support transporter transparently falls back to the primary
// mailbox, so a "backup" send is still a real retry but goes from the same address.
export const hasIndependentSupportMailbox = Boolean(SUPPORT_PASSWORD) && !SUPPORT_USER_MISCONFIGURED

let transporter: Transporter | null = null
let supportTransporter: Transporter | null = null

function getTransporter() {
  if (!SMTP_PASSWORD) {
    // Surface a clear server-side error instead of silently "sending" nothing.
    throw new Error("SMTP_PASSWORD is not set; cannot send email.")
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465, // SSL on 465, STARTTLS otherwise
      auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    })
  }
  return transporter
}

// Transporter for support@ mail. Falls back to the primary mailbox if dedicated
// support credentials are not configured, so support email still goes out (just
// from the reset mailbox with Reply-To support@) rather than failing.
function getSupportTransporter() {
  if (!hasIndependentSupportMailbox) return getTransporter()
  if (!supportTransporter) {
    supportTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SUPPORT_USER, pass: SUPPORT_PASSWORD },
    })
  }
  return supportTransporter
}

type MailAttachment = { filename: string; content: Buffer; contentType?: string }

async function sendMail({
  to,
  subject,
  html,
  text,
  from,
  replyTo,
  attachments,
}: {
  to: string
  subject: string
  html: string
  text: string
  from?: string
  replyTo?: string
  attachments?: MailAttachment[]
}) {
  // Staging kill-switch: the staging branch runs against a COPY of real user
  // data, so it must never deliver mail to real addresses. When
  // STAGING_DISABLE_EMAIL is set (only on the staging preview env), log the
  // send and return a synthetic success so every flow behaves normally without
  // any SMTP connection. Defaults off — production and normal previews are
  // unaffected.
  if (process.env.STAGING_DISABLE_EMAIL === "1" || process.env.STAGING_DISABLE_EMAIL === "true") {
    console.log(`[v0] [staging] email SUPPRESSED (not sent) to=${to} subject="${subject}"`)
    return { messageId: "staging-suppressed", response: "suppressed on staging", accepted: [to], rejected: [] }
  }
  // Route anything sent from the support address through the support mailbox so
  // authentication matches the visible From (required by the mail server).
  const isSupport = from === SUPPORT_FROM
  // Whether this send is going through a genuinely separate support mailbox
  // (distinct credentials from the primary). If so and it fails, we can retry
  // via the primary mailbox rather than dropping the message.
  const viaIndependentSupport = isSupport && Boolean(SUPPORT_PASSWORD)
  const tx = isSupport ? getSupportTransporter() : getTransporter()
  // If we're falling back to the primary mailbox, we cannot send AS support@;
  // send from the authenticated mailbox but keep Reply-To pointing at support.
  const effectiveFrom = isSupport && !SUPPORT_PASSWORD ? FROM : (from ?? FROM)
  try {
    const info = await tx.sendMail({ from: effectiveFrom, to, subject, html, text, replyTo, attachments })
    // Loud, greppable success marker so deliverability issues can be told apart
    // from send failures in the server logs.
    console.log(`[v0] email sent to=${to} subject="${subject}" id=${info.messageId} response="${info.response ?? ""}"`)
    return info
  } catch (err) {
    // A misconfigured support mailbox (wrong user/password) must not silently
    // swallow support email. Retry once through the primary mailbox — which is
    // the same graceful degradation used when no support creds are set — sending
    // from the primary address but keeping Reply-To on support@ so replies still
    // thread back correctly.
    if (viaIndependentSupport) {
      console.error(
        `[v0] support mailbox send FAILED to=${to} subject="${subject}" — falling back to primary mailbox`,
        err,
      )
      try {
        const info = await getTransporter().sendMail({
          from: FROM,
          to,
          subject,
          html,
          text,
          replyTo: replyTo ?? SUPPORT_ADDRESS,
          attachments,
        })
        console.log(
          `[v0] email sent (support→primary fallback) to=${to} subject="${subject}" id=${info.messageId} response="${info.response ?? ""}"`,
        )
        return info
      } catch (fallbackErr) {
        console.error(`[v0] email FAILED (both support and primary) to=${to} subject="${subject}"`, fallbackErr)
        throw fallbackErr
      }
    }
    console.error(`[v0] email FAILED to=${to} subject="${subject}"`, err)
    throw err
  }
}

// Footer paragraph shown under every branded email. `auto` = automated/no-reply
// wording for transactional mail (verification, password reset, reminders);
// `support` = reply-friendly wording for support/admin/outreach mail that
// invites a reply. Neither exposes the raw sending mailbox.
type EmailFooter = "auto" | "support"
function footerParagraph(footer: EmailFooter): string {
  const link = `<a href="mailto:${LEGAL.contactEmail}" style="color:#94a3b8;">${esc(LEGAL.contactEmail)}</a>`
  const text =
    footer === "support"
      ? `StayKnit Support · reply any time, or email ${link}.`
      : `This is an automated message from StayKnit — please don&apos;t reply. Need help? Email ${link}.`
  return `<p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#94a3b8;">${text}</p>`
}

// Shared branded shell so every transactional email looks identical.
function shell({
  heading,
  body,
  cta,
  footer = "auto",
}: {
  heading: string
  body: string
  cta?: { label: string; url: string }
  footer?: EmailFooter
}) {
  const button = cta
    ? `<tr><td style="padding:4px 32px 8px;"><a href="${cta.url}" style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 26px;border-radius:9px;">${cta.label}</a></td></tr>
       <tr><td style="padding:16px 32px 4px;"><p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#64748b;">Or paste this link into your browser:</p><p style="margin:0;font-size:13px;line-height:1.6;word-break:break-all;"><a href="${cta.url}" style="color:#0d9488;">${cta.url}</a></p></td></tr>`
    : ""
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f6f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f6;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e8e8;">
          ${brandHeader("28px 32px 8px")}
          <tr><td style="padding:8px 32px 0;"><h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0f172a;font-weight:700;">${heading}</h1><p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#475569;">${body}</p></td></tr>
          ${button}
        </table>
        ${footerParagraph(footer)}
      </td></tr>
    </table>
  </body>
</html>`
}

export async function sendVerificationEmail(to: string, verifyUrl: string) {
  // If the resend fallback asked for the support mailbox, send AS support@ so
  // the message authenticates with (and comes from) a different mailbox ��� the
  // whole point of the "email not arriving?" retry. sendMail routes any message
  // whose `from` is SUPPORT_FROM through the support transporter, and gracefully
  // falls back to the primary mailbox if support credentials aren't configured.
  const viaSupport = verificationChannel.getStore() === "support"
  await sendMail({
    to,
    from: viaSupport ? SUPPORT_FROM : undefined,
    replyTo: viaSupport ? SUPPORT_ADDRESS : undefined,
    subject: "Confirm your StayKnit email",
    text: `Welcome to StayKnit! Confirm your email to activate your account:\n\n${verifyUrl}\n\nIf you didn't create a StayKnit account, you can safely ignore this email.`,
    html: shell({
      heading: "Confirm your email",
      body: "Welcome to StayKnit! Tap the button below to confirm your email address and activate your account. If you didn't create an account, you can safely ignore this email.",
      cta: { label: "Confirm email", url: verifyUrl },
    }),
  })
}

// Escape user-supplied text before dropping it into an HTML email body.
function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

// Sent to a user when a support agent (or AI, on the agent's behalf) replies to
// their ticket. Plain, readable, and includes the original subject for context.
// Sent from support@stayknit.org so replies thread back to the support inbox.
export async function sendSupportReply(input: {
  to: string
  userName?: string
  subject: string
  body: string
}) {
  const { to, userName, subject, body } = input
  const greeting = userName ? `Hi ${userName},` : 'Hi,'
  const heading = subject ? `Re: ${subject}` : 'About your StayKnit support request'
  const htmlBody = `${greeting}<br/><br/>${esc(body).replace(/\n/g, '<br/>')}<br/><br/>— StayKnit Support`
  await sendMail({
    to,
    from: SUPPORT_FROM,
    replyTo: SUPPORT_ADDRESS,
    subject: subject ? `Re: ${subject} — StayKnit Support` : 'StayKnit Support',
    text: `${greeting}\n\n${body}\n\n— StayKnit Support`,
    html: shell({ heading, body: htmlBody, footer: "support" }),
  })
}

// Auto-acknowledgement sent to the user the moment they raise a ticket, so they
// know it was received and what happens next. From support@stayknit.org.
export async function sendTicketReceivedEmail(input: {
  to: string
  userName?: string
  subject: string
  category: string
  message: string
}) {
  const { to, userName, subject, category, message } = input
  const greeting = userName ? `Hi ${userName},` : 'Hi,'
  const line = subject ? `<strong>${esc(subject)}</strong>` : `your ${esc(category)} request`
  const htmlBody =
    `${greeting}<br/><br/>Thanks for contacting StayKnit Support — we've received your message about ${line} ` +
    `and a member of our team will get back to you by email as soon as possible.<br/><br/>` +
    `<strong>Your message</strong><br/>` +
    `<span style="color:#64748b;">${esc(message).replace(/\n/g, '<br/>')}</span><br/><br/>` +
    `There's nothing more you need to do — just reply to this email if you'd like to add anything.<br/><br/>— StayKnit Support`
  await sendMail({
    to,
    from: SUPPORT_FROM,
    replyTo: SUPPORT_ADDRESS,
    subject: subject ? `We've received your request: ${subject}` : "We've received your support request",
    text:
      `${greeting}\n\nThanks for contacting StayKnit Support — we've received your message${subject ? ` about "${subject}"` : ""} and will get back to you by email as soon as possible.\n\n` +
      `Your message:\n${message}\n\nJust reply to this email if you'd like to add anything.\n\n— StayKnit Support`,
    html: shell({ heading: "We've got your request", body: htmlBody, footer: "support" }),
  })
}

// Internal heads-up to the support inbox when a new ticket is raised, so the
// team is notified without watching the dashboard. Reply-To is the user so an
// agent can respond to them directly from the inbox if they prefer.
export async function sendNewTicketAdminNotice(input: {
  ticketId: number
  userName?: string
  userEmail: string
  category: string
  subject: string
  message: string
}) {
  const { ticketId, userName, userEmail, category, subject, message } = input
  const who = userName ? `${esc(userName)} (${esc(userEmail)})` : esc(userEmail)
  const htmlBody =
    `New support ticket <strong>#${ticketId}</strong> raised by ${who}.<br/><br/>` +
    `<strong>Category:</strong> ${esc(category)}<br/>` +
    `<strong>Subject:</strong> ${esc(subject) || "(none)"}<br/><br/>` +
    `<strong>Message</strong><br/><span style="color:#64748b;">${esc(message).replace(/\n/g, '<br/>')}</span>`
  await sendMail({
    to: SUPPORT_ADDRESS,
    from: SUPPORT_FROM,
    replyTo: userEmail,
    subject: `New ticket #${ticketId}: ${subject || category}`,
    text: `New support ticket #${ticketId} from ${userName ? `${userName} (${userEmail})` : userEmail}.\n\nCategory: ${category}\nSubject: ${subject || "(none)"}\n\nMessage:\n${message}`,
    html: shell({ heading: `New ticket #${ticketId}`, body: htmlBody, footer: "support" }),
  })
}

// Public contact form (landing page). The visitor is not logged in, so there's
// no ticket/account — we notify the support inbox with the visitor's email as
// Reply-To so an agent can reply directly, and send the visitor a short
// acknowledgement. Both are best-effort and independent.
export async function sendPublicContactMessage(input: {
  name: string
  email: string
  message: string
}) {
  const { name, email, message } = input
  const htmlBody =
    `New enquiry from the website contact form.<br/><br/>` +
    `<strong>Name:</strong> ${esc(name) || "(not given)"}<br/>` +
    `<strong>Email:</strong> ${esc(email)}<br/><br/>` +
    `<strong>Message</strong><br/><span style="color:#64748b;">${esc(message).replace(/\n/g, "<br/>")}</span>`

  // Notify support.
  await sendMail({
    to: SUPPORT_ADDRESS,
    from: SUPPORT_FROM,
    replyTo: email,
    subject: `Website enquiry from ${name || email}`,
    text: `New website contact enquiry.\n\nName: ${name || "(not given)"}\nEmail: ${email}\n\nMessage:\n${message}`,
    html: shell({ heading: "New website enquiry", body: htmlBody, footer: "support" }),
  })

  // Acknowledge the visitor (best-effort — a bad address must not fail the send
  // to support above, which is the one that matters).
  try {
    await sendMail({
      to: email,
      from: SUPPORT_FROM,
      replyTo: SUPPORT_ADDRESS,
      subject: "We've received your message",
      text: `${name ? `Hi ${name},` : "Hi,"}\n\nThanks for reaching out to StayKnit. We've received your message and will reply to this email address as soon as possible.\n\n— StayKnit Support`,
      html: shell({
        heading: "Thanks for getting in touch",
        body: `${name ? `Hi ${esc(name)}, ` : ""}we've received your message and will reply to this email address as soon as possible.`,
        footer: "support",
      }),
    })
  } catch {
    // best-effort acknowledgement
  }
}

// Sent to the user when their ticket is marked resolved without a written reply
// (the standalone "resolve" action). A reply-and-resolve already emails the
// reply itself, so this only covers the no-message case. From support@.
export async function sendTicketResolvedEmail(input: {
  to: string
  userName?: string
  subject: string
}) {
  const { to, userName, subject } = input
  const greeting = userName ? `Hi ${userName},` : 'Hi,'
  const line = subject ? `<strong>${esc(subject)}</strong>` : "your recent request"
  const htmlBody =
    `${greeting}<br/><br/>Good news — we've marked ${line} as resolved. ` +
    `If everything's sorted, there's nothing more you need to do.<br/><br/>` +
    `If you still need help, just reply to this email and we'll reopen it for you.<br/><br/>— StayKnit Support`
  await sendMail({
    to,
    from: SUPPORT_FROM,
    replyTo: SUPPORT_ADDRESS,
    subject: subject ? `Resolved: ${subject}` : "Your StayKnit request is resolved",
    text: `${greeting}\n\nWe've marked ${subject ? `"${subject}"` : "your recent request"} as resolved. If you still need help, just reply to this email and we'll reopen it.\n\n— StayKnit Support`,
    html: shell({ heading: "Your request is resolved", body: htmlBody, footer: "support" }),
  })
}

// A re-engagement / check-in email the support team sends from the dashboard to
// a dormant host. Subject and body are composed by the agent; from support@ with
// Reply-To support@ so any reply comes straight back to the inbox.
export async function sendOutreachEmail(input: {
  to: string
  userName?: string
  subject: string
  body: string
}) {
  const { to, userName, subject, body } = input
  const greeting = userName ? `Hi ${userName},` : 'Hi,'
  const htmlBody = `${greeting}<br/><br/>${esc(body).replace(/\n/g, '<br/>')}<br/><br/>— StayKnit Support`
  await sendMail({
    to,
    from: SUPPORT_FROM,
    replyTo: SUPPORT_ADDRESS,
    subject: subject || 'A quick hello from StayKnit',
    text: `${greeting}\n\n${body}\n\n— StayKnit Support`,
    html: shell({ heading: subject || 'A quick hello from StayKnit', body: htmlBody, footer: "support" }),
  })
}

// Sent from the owner-only invite tool to a prospective pilot host. It's a warm
// personalised invitation (from support@ so a reply lands in the inbox) with the
// formal pilot letter — full T&Cs + confidentiality — attached as a Word doc.
// The CTA points at the public sign-up page; the pilot creates their own account
// and the normal email-verification flow takes over from there.
export async function sendPilotInviteEmail(input: {
  to: string
  friendName: string
  businessName: string
  signUpUrl: string
  properties?: string[]
  letter?: MailAttachment
}) {
  const { to, friendName, businessName, signUpUrl, properties = [], letter } = input
  const greeting = `Hi ${esc(friendName)},`
  const propsHtml = properties.length
    ? `<br/><br/>Properties we've noted for your pilot:<br/><span style="color:#64748b;">${properties
        .map((p) => `• ${esc(p)}`)
        .join("<br/>")}</span>`
    : ""
  const htmlBody =
    `${greeting}<br/><br/>` +
    `We'd love to have <strong>${esc(businessName)}</strong> join the StayKnit pre-launch pilot. StayKnit brings all your booking calendars into one place, keeps your channels in sync over iCal, and produces clean owner statements automatically.<br/><br/>` +
    `Your pilot access is completely complimentary — no charge and no subscription while we test together, right up to launch. We'd simply value your feedback as a real host.` +
    propsHtml +
    `<br/><br/>To get started, create your pilot account using the button below, then add your properties and calendar (iCal) links.<br/><br/>` +
    `${letter ? "The attached letter has the full pilot terms and confidentiality arrangements. " : ""}Reply to this email any time if you have questions — that's what the pilot is for.<br/><br/>— The StayKnit Team`
  const propsText = properties.length ? `\n\nProperties we've noted for your pilot:\n${properties.map((p) => `• ${p}`).join("\n")}` : ""
  await sendMail({
    to,
    from: SUPPORT_FROM,
    replyTo: SUPPORT_ADDRESS,
    subject: "You're invited to the StayKnit pilot",
    text:
      `${friendName},\n\nWe'd love to have ${businessName} join the StayKnit pre-launch pilot — bringing all your booking calendars into one place, keeping channels in sync over iCal, and producing owner statements automatically.\n\n` +
      `Your pilot access is completely complimentary — no charge and no subscription until launch.` +
      propsText +
      `\n\nCreate your pilot account here:\n${signUpUrl}\n\n${letter ? "The attached letter has the full pilot terms and confidentiality arrangements.\n\n" : ""}Reply any time with questions.\n\n— The StayKnit Team`,
    html: shell({
      heading: "You're invited to the StayKnit pilot",
      body: htmlBody,
      cta: { label: "Create your pilot account", url: signUpUrl },
      footer: "support",
    }),
    attachments: letter ? [letter] : undefined,
  })
}

// Sent to the CURRENT email address when a signed-in host requests an email
// change. The change only takes effect after this link is clicked, so losing
// control of the new address (or a typo) can't silently hijack the account.
export async function sendChangeEmailVerification(to: string, newEmail: string, url: string) {
  await sendMail({
    to,
    subject: "Confirm your StayKnit email change",
    text: `We received a request to change your StayKnit email to ${newEmail}.\n\nConfirm this change:\n${url}\n\nIf you didn't request this, do NOT click the link — your email stays as it is and you should change your password.`,
    html: shell({
      heading: "Confirm your email change",
      body: `We received a request to change the email on your StayKnit account to <strong>${newEmail}</strong>. Tap below to confirm. If you didn't request this, don't click the link \u2014 your email will stay unchanged, and we recommend changing your password.`,
      cta: { label: "Confirm email change", url },
    }),
  })
}

// Sent when someone tries to sign up with an email that already has an account.
// This lets signup return an identical "check your inbox" response whether or
// not the email exists, so the endpoint can't be used to enumerate accounts —
// while still doing something useful for the real owner of the inbox.
export async function sendExistingAccountNotice(to: string, signInUrl: string) {
  await sendMail({
    to,
    subject: "About your StayKnit account",
    text: `Someone just tried to create a StayKnit account with this email, but you already have one.\n\nIf that was you, just sign in instead:\n${signInUrl}\n\nForgot your password? Use the "Forgot password?" link on the sign-in page. If this wasn't you, no action is needed — no account was created or changed.`,
    html: shell({
      heading: "You already have an account",
      body: "Someone just tried to create a StayKnit account with this email address, but one already exists. If that was you, sign in instead — and use \u201cForgot password?\u201d if you can't remember it. If it wasn't you, no action is needed: nothing was created or changed.",
      cta: { label: "Sign in", url: signInUrl },
    }),
  })
}

// Sent when a known property owner tries to self-register through the public
// host sign-up. Owners don't create their own account (and never pay) — their
// host sets up their login. We create nothing and, staying enumeration-safe,
// return the same generic success to the browser; the real inbox owner gets
// this explanation instead of a misleading "you already have an account".
export async function sendOwnerSignupNotice(to: string) {
  await sendMail({
    to,
    subject: "About your StayKnit access",
    text: `Someone just tried to create a StayKnit host account with this email.\n\nYour email is set up as a property owner, so you don't need to create an account or pay a subscription — your host provides your sign-in details and gives you a free, read-only view of your statements.\n\nIf you're expecting owner access, contact your host for your login. If this wasn't you, no action is needed — no account was created or changed.`,
    html: shell({
      heading: "Your access is managed by your host",
      body: "Someone just tried to create a StayKnit host account with this email address. Your email is set up as a property owner, so you don't need to create an account or pay a subscription — your host provides your sign-in details and gives you a free, read-only view of your statements. If you're expecting owner access, contact your host for your login. If this wasn't you, no action is needed: nothing was created or changed.",
    }),
  })
}

// Sent by the daily expiry-reminder cron when a host's paid term is ending.
// `urgent` (<=3 days left) swaps in a firmer subject/heading; otherwise it's a
// gentle heads-up. The host keeps full access until the end date — this is a
// nudge to renew, not a lockout notice.
export async function sendSubscriptionExpiringEmail(
  to: string,
  opts: { name?: string; planName: string; daysLeft: number; endsAt: Date; renewUrl: string; urgent: boolean },
) {
  const { name, planName, daysLeft, endsAt, renewUrl, urgent } = opts
  const greeting = name ? `Hi ${name},` : "Hi,"
  const dayLabel = daysLeft <= 0 ? "today" : daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`
  const endDate = endsAt.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
  const subject = urgent
    ? `Your StayKnit subscription ends ${dayLabel}`
    : `Your StayKnit subscription renews soon`
  const heading = urgent ? `Your plan ends ${dayLabel}` : "Your plan is expiring soon"
  const body = `${greeting} your StayKnit <strong>${planName}</strong> plan ends on <strong>${endDate}</strong> (${dayLabel}). Renew now to keep your calendar sync, bookings, and owner statements running without interruption. If your plan lapses, your workspace pauses until you subscribe again — your data is kept safe in the meantime.`
  const text = `${greeting}

Your StayKnit ${planName} plan ends on ${endDate} (${dayLabel}).

Renew now to keep your calendar sync, bookings, and owner statements running without interruption:
${renewUrl}

If your plan lapses, your workspace pauses until you subscribe again — your data is kept safe in the meantime.

StayKnit`

  await sendMail({
    to,
    subject,
    text,
    html: shell({ heading, body, cta: { label: "Renew my plan", url: renewUrl } }),
  })
}

// Sent by the daily expiry-reminder cron when a host's FREE TRIAL is ending.
// `urgent` (<=1 day left) swaps in a firmer subject/heading. The host keeps full
// access until the trial ends — this nudges them to choose a plan before their
// workspace pauses (the trial-expired freeze) so nothing is interrupted.
export async function sendTrialEndingEmail(
  to: string,
  opts: { name?: string; daysLeft: number; endsAt: Date; plansUrl: string; urgent: boolean },
) {
  const { name, daysLeft, endsAt, plansUrl, urgent } = opts
  const greeting = name ? `Hi ${name},` : "Hi,"
  const dayLabel = daysLeft <= 0 ? "today" : daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`
  const endDate = endsAt.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
  const subject = urgent
    ? `Your StayKnit free trial ends ${dayLabel}`
    : `Your StayKnit free trial is ending soon`
  const heading = urgent ? `Your free trial ends ${dayLabel}` : "Your free trial is ending soon"
  const body = `${greeting} your StayKnit free trial ends on <strong>${endDate}</strong> (${dayLabel}). Choose a plan now to keep your calendar sync, bookings, and owner statements running without interruption. When the trial ends, your workspace pauses until you subscribe — your listings and data are kept safe in the meantime.`
  const text = `${greeting}

Your StayKnit free trial ends on ${endDate} (${dayLabel}).

Choose a plan now to keep your calendar sync, bookings, and owner statements running without interruption:
${plansUrl}

When the trial ends, your workspace pauses until you subscribe — your listings and data are kept safe in the meantime.

StayKnit`

  await sendMail({
    to,
    subject,
    text,
    html: shell({ heading, body, cta: { label: "Choose a plan", url: plansUrl } }),
  })
}

// Sent from the owner's dashboard to a host who opened the Paystack card page
// but never completed the charge (an "abandoned" checkout). A warm,
// reply-friendly nudge — from support@ so a reply lands in the inbox — pointing
// them back to the plan tab to finish subscribing. Owner-triggered only, so it
// never fires automatically at a customer.
export async function sendAbandonedCheckoutEmail(
  to: string,
  opts: { name?: string; amountLabel?: string; checkoutUrl: string },
) {
  const { name, amountLabel, checkoutUrl } = opts
  const greeting = name ? `Hi ${esc(name)},` : "Hi,"
  const priceHtml = amountLabel
    ? ` Your plan comes to <strong>${esc(amountLabel)}</strong>, and everything you set up during your trial is exactly where you left it.`
    : " Everything you set up during your trial is exactly where you left it."
  const priceText = amountLabel
    ? ` Your plan comes to ${amountLabel}, and everything you set up during your trial is exactly where you left it.`
    : " Everything you set up during your trial is exactly where you left it."
  const body =
    `${greeting} you were one step away from activating StayKnit — it looks like the payment didn't go through.` +
    priceHtml +
    ` Pick up right where you stopped and your calendar sync, bookings, and owner statements keep running without a break. If something got in the way — a card issue or a question about the plan — just reply to this email and we'll help.`
  const text = `${name ? `Hi ${name},` : "Hi,"}

You were one step away from activating StayKnit — it looks like the payment didn't go through.${priceText}

Finish setting up here:
${checkoutUrl}

If something got in the way — a card issue or a question about the plan — just reply to this email and we'll help.

— StayKnit Support`
  await sendMail({
    to,
    from: SUPPORT_FROM,
    replyTo: SUPPORT_ADDRESS,
    subject: "Finish setting up your StayKnit account",
    text,
    html: shell({
      heading: "You're one step from going live",
      body,
      cta: { label: "Finish setting up", url: checkoutUrl },
      footer: "support",
    }),
  })
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const subject = "Reset your StayKnit password"
  const text = `We received a request to reset your StayKnit password.\n\nReset it here (link expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email — your password won't change.`

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f6f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f6;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e8e8;">
            <tr>
              <td style="padding:28px 32px 8px;">
                <div style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:#0f172a;">Stay<span style="color:#0d9488;">Knit</span></div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0;">
                <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0f172a;font-weight:700;">Reset your password</h1>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#475569;">We received a request to reset the password for your StayKnit account. Tap the button below to choose a new one. This link expires in 1 hour.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:4px 32px 8px;">
                <a href="${resetUrl}" style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 26px;border-radius:9px;">Reset password</a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 4px;">
                <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#64748b;">Or paste this link into your browser:</p>
                <p style="margin:0;font-size:13px;line-height:1.6;word-break:break-all;"><a href="${resetUrl}" style="color:#0d9488;">${resetUrl}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px;">
                <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8;border-top:1px solid #eef2f2;padding-top:16px;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
              </td>
            </tr>
          </table>
          ${footerParagraph("auto")}
        </td>
      </tr>
    </table>
  </body>
</html>`

  await sendMail({ to, subject, html, text })
}

// ---- Diagnostics (owner-only, called from the support dashboard) ------------

export type EmailTransportCheck = {
  label: string
  mailbox: string
  host: string
  port: number
  secure: boolean
  // Whether a password is configured for this mailbox at all.
  configured: boolean
  // Whether the SMTP server accepted the credentials on a live handshake.
  ok: boolean
  note?: string
  error?: string
}

// Runs a live SMTP handshake (`verify()`) against each configured mailbox. This
// authenticates without sending anything, so it cleanly separates "credentials
// / connection are broken" from "mail sends but doesn't arrive" (deliverability
// / spam). No secrets are returned — only host/port/user and pass/fail.
export async function verifyEmailTransport(): Promise<{ checks: EmailTransportCheck[] }> {
  const checks: EmailTransportCheck[] = []

  // Primary mailbox (verification, password reset, subscription mail).
  const primary: EmailTransportCheck = {
    label: "Primary (verification & password reset)",
    mailbox: SMTP_USER,
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    configured: Boolean(SMTP_PASSWORD),
    ok: false,
  }
  if (!SMTP_PASSWORD) {
    primary.error = "SMTP_PASSWORD is not set — no transactional email can be sent."
  } else {
    try {
      await nodemailer
        .createTransport({
          host: SMTP_HOST,
          port: SMTP_PORT,
          secure: SMTP_PORT === 465,
          auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
          connectionTimeout: 15000,
          greetingTimeout: 15000,
        })
        .verify()
      primary.ok = true
    } catch (err) {
      primary.error = describeSmtpError(err)
    }
  }
  checks.push(primary)

  // Support mailbox (tickets, outreach). Optional — falls back to primary.
  const support: EmailTransportCheck = {
    label: "Support (tickets & outreach)",
    mailbox: SUPPORT_USER,
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    configured: hasIndependentSupportMailbox,
    ok: false,
  }
  if (SUPPORT_USER_MISCONFIGURED) {
    // A value is set but isn't an email — never used for auth; we fall back.
    support.note = `SUPPORT_SMTP_USER is set but is not a valid email address, so it is ignored. Support email is sent from ${SMTP_USER} with Reply-To ${SUPPORT_ADDRESS}. Fix or remove SUPPORT_SMTP_USER to silence this.`
    support.ok = Boolean(SMTP_PASSWORD)
    support.mailbox = SMTP_USER
  } else if (!SUPPORT_PASSWORD) {
    support.note = `No dedicated password set; support email is sent from ${SMTP_USER} with Reply-To ${SUPPORT_ADDRESS}.`
    // It "works" as long as the primary mailbox works.
    support.ok = Boolean(SMTP_PASSWORD)
    support.mailbox = SMTP_USER
  } else {
    try {
      await nodemailer
        .createTransport({
          host: SMTP_HOST,
          port: SMTP_PORT,
          secure: SMTP_PORT === 465,
          auth: { user: SUPPORT_USER, pass: SUPPORT_PASSWORD },
          connectionTimeout: 15000,
          greetingTimeout: 15000,
        })
        .verify()
      support.ok = true
    } catch (err) {
      support.error = describeSmtpError(err)
    }
  }
  checks.push(support)

  return { checks }
}

// Sends a real test message from the primary mailbox to `to`, so the owner can
// confirm end-to-end delivery (including whether it lands in spam). Returns the
// SMTP message id on success.
export async function sendTestEmail(to: string): Promise<{ messageId: string }> {
  const now = new Date().toISOString()
  const info = await sendMail({
    to,
    subject: "StayKnit email test",
    text: `This is a StayKnit email deliverability test sent at ${now}.\n\nIf you received this, outgoing email is working. If it landed in spam, add ${SMTP_USER} to your contacts and consider adding a DKIM record.`,
    html: shell({
      heading: "Email test successful",
      body: `This is a StayKnit deliverability test sent at <strong>${now}</strong>. If you're reading this, outgoing email is working. If it landed in your spam folder, that points to a deliverability (DNS/DKIM) issue rather than a sending failure.`,
    }),
  })
  return { messageId: info.messageId }
}

// -----------------------------------------------------------------------------
// Host-facing financial documents: subscription invoice/receipt, refund
// confirmation, and owner-statement copy. All go to the SUBSCRIBER (host) — the
// person who pays for StayKnit — never to property owners (owners view their
// statements in their in-app portal). Each uses a shared document layout with a
// key/value table and a legal footer so they read as real records a host (or
// their accountant/lawyer) can file.
// -----------------------------------------------------------------------------

// Registered-entity footer shown on every financial document. Empty legal
// fields collapse rather than rendering blank lines (mirrors lib/legal.ts).
function legalFooterLines(): string[] {
  // Company identity + contact only. The SARS taxpayer number is deliberately
  // NOT shown here: these are receipts/invoices from a business that is not yet
  // VAT-registered, so the taxpayer number adds no value and the owner asked to
  // keep it off customer-facing email. (It still appears on the legal pages via
  // lib/legal.ts#registrationLines when appropriate.)
  const reg = LEGAL.registration as string
  return [
    LEGAL.entity as string,
    reg ? `Reg no. ${reg}` : "",
    LEGAL.address as string,
    LEGAL.contactEmail as string,
  ].filter(Boolean)
}

function legalFooterHtml(): string {
  return legalFooterLines().map(esc).join("<br/>")
}

type DocRow = { label: string; value: string; muted?: boolean; strong?: boolean }

// Branded document shell with a heading, an intro (trusted HTML), a key/value
// table, an optional note, and the legal footer. Row VALUES are escaped; the
// intro and note are author-controlled HTML.
function financialDoc({
  heading,
  badge,
  intro,
  rows,
  note,
  cta,
}: {
  heading: string
  badge?: string
  intro: string
  rows: DocRow[]
  note?: string
  cta?: { label: string; url: string }
}): string {
  const rowsHtml = rows
    .map((r) => {
      const color = r.muted ? "#64748b" : "#0f172a"
      const weight = r.strong ? "font-weight:800;" : ""
      return `<tr>
        <td style="padding:11px 0;border-bottom:1px solid #eef2f2;font-size:14px;line-height:1.4;color:#475569;">${esc(r.label)}</td>
        <td style="padding:11px 0;border-bottom:1px solid #eef2f2;font-size:14px;line-height:1.4;text-align:right;font-variant-numeric:tabular-nums;color:${color};${weight}">${esc(r.value)}</td>
      </tr>`
    })
    .join("")
  const badgeHtml = badge
    ? `<span style="display:inline-block;margin:4px 0 2px;background:#ecfdf5;color:#0d9488;font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;padding:4px 11px;border-radius:999px;">${esc(badge)}</span>`
    : ""
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f6f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f6;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e8e8;">
          ${brandHeader("28px 32px 4px")}
          <tr><td style="padding:6px 32px 0;">
            <h1 style="margin:6px 0 4px;font-size:22px;line-height:1.3;color:#0f172a;font-weight:700;">${esc(heading)}</h1>
            ${badgeHtml}
            <p style="margin:10px 0 18px;font-size:15px;line-height:1.6;color:#475569;">${intro}</p>
          </td></tr>
          <tr><td style="padding:0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table></td></tr>
          ${
            cta
              ? `<tr><td style="padding:22px 32px 2px;"><a href="${cta.url}" style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:9px;">${esc(cta.label)}</a></td></tr>
          <tr><td style="padding:10px 32px 0;"><p style="margin:0;font-size:12px;line-height:1.6;word-break:break-all;color:#64748b;">Or paste this link into your browser:<br/><a href="${cta.url}" style="color:#0d9488;">${cta.url}</a></p></td></tr>`
              : ""
          }
          ${note ? `<tr><td style="padding:16px 32px 0;"><p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">${note}</p></td></tr>` : ""}
          <tr><td style="padding:18px 32px 26px;"><p style="margin:14px 0 0;padding-top:14px;border-top:1px solid #eef2f2;font-size:11px;line-height:1.7;color:#94a3b8;">${legalFooterHtml()}</p></td></tr>
        </table>
        <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#94a3b8;">This is an automated message from StayKnit — please don&apos;t reply. Need help? Email <a href="mailto:${LEGAL.contactEmail}" style="color:#94a3b8;">${esc(LEGAL.contactEmail)}</a>.</p>
      </td></tr>
    </table>
  </body>
</html>`
}

// Plain-text mirror of a financial document, for the multipart text/* part.
function financialDocText(heading: string, intro: string, rows: DocRow[], note?: string, ctaUrl?: string): string {
  return [
    heading.toUpperCase(),
    "",
    intro,
    "",
    ...rows.map((r) => `${r.label}: ${r.value}`),
    ...(ctaUrl ? ["", `View or download this document: ${ctaUrl}`] : []),
    ...(note ? ["", note] : []),
    "",
    "----------------------------------------",
    ...legalFooterLines(),
    "",
    `This is an automated message from StayKnit — please don't reply. Need help? Email ${LEGAL.contactEmail}.`,
  ].join("\n")
}

function longDate(d: Date): string {
  return d.toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })
}

// A human, greppable invoice number derived from the payment date and the
// Paystack reference tail, so the same payment always maps to the same number.
export function invoiceNumber(reference: string, at: Date): string {
  const y = at.getFullYear()
  const m = String(at.getMonth() + 1).padStart(2, "0")
  const d = String(at.getDate()).padStart(2, "0")
  const tail = reference.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase() || "000000"
  return `INV-${y}${m}${d}-${tail}`
}

// Sent to the HOST after a successful subscription charge (initial purchase and
// each auto-renewal).
//
// VAT is driven by StayKnit's operator-level VAT config (lib/vat.ts), resolved
// by the caller and passed in as `vat`:
//   - vat omitted / null → StayKnit is NOT a registered VAT vendor. The document
//     is a plain payment receipt / invoice with NO VAT line and says so — the
//     only lawful presentation for a non-vendor.
//   - vat present → StayKnit IS registered. The same total is shown broken into
//     subtotal + VAT (already included), the VAT number is printed, and it is
//     titled a Tax invoice. The advertised price is unchanged either way.
export async function sendPlanInvoiceEmail(input: {
  to: string
  hostName?: string
  planName: string
  periodName: string
  amountLabel: string
  reference: string
  paidAt?: Date
  accessUntil?: Date
  vat?: { ratePct: number; subtotalLabel: string; vatLabel: string; number: string } | null
  // Absolute URL to the host's hosted receipt page (auth-gated). When present a
  // "View or download your receipt" button is added so the host can open, print,
  // or save a PDF of this document from their signed-in account at any time.
  receiptUrl?: string
}) {
  const { to, hostName, planName, periodName, amountLabel, reference, accessUntil, vat, receiptUrl } = input
  const paidAt = input.paidAt ?? new Date()
  const invNo = invoiceNumber(reference, paidAt)
  const registered = !!vat
  const docTitle = registered ? "Tax invoice" : "Payment received"
  const greeting = hostName ? `Hi ${esc(hostName)},` : "Hi,"
  const intro = `${greeting}<br/><br/>Thank you for your StayKnit subscription. This is your ${
    registered ? "tax invoice" : "receipt"
  } for the payment below — keep it for your records.`
  const rows: DocRow[] = [
    { label: registered ? "Tax invoice number" : "Invoice number", value: invNo },
    { label: "Date", value: longDate(paidAt) },
    { label: "Billed to", value: to },
    { label: "Plan", value: `StayKnit ${planName}` },
    { label: "Billing term", value: periodName },
    ...(accessUntil ? [{ label: "Access valid until", value: longDate(accessUntil) }] : []),
    { label: "Payment reference", value: reference },
    ...(vat
      ? [
          { label: "Subtotal (excl. VAT)", value: vat.subtotalLabel },
          { label: `VAT (${vat.ratePct}%)`, value: vat.vatLabel },
          { label: "Total paid (incl. VAT)", value: amountLabel, strong: true },
          { label: "VAT registration no.", value: vat.number },
        ]
      : [{ label: "Amount paid", value: amountLabel, strong: true }]),
  ]
  const note = vat
    ? `This is a tax invoice. The total shown includes VAT at ${vat.ratePct}%. VAT registration no. ${vat.number}.`
    : "StayKnit is not currently registered for VAT, so no VAT is charged on this amount. This document is a payment receipt / invoice, not a SARS tax invoice."
  await sendMail({
    to,
    replyTo: SUPPORT_ADDRESS,
    subject: `StayKnit ${registered ? "tax invoice" : "payment receipt"} — ${invNo}`,
    html: financialDoc({
      heading: docTitle,
      badge: registered ? "Tax invoice" : "Paid",
      intro,
      rows,
      note,
      cta: receiptUrl ? { label: "View or download your receipt", url: receiptUrl } : undefined,
    }),
    text: financialDocText(
      docTitle,
      `${hostName ? `Hi ${hostName},` : "Hi,"}\n\nThank you for your StayKnit subscription. This is your ${
        registered ? "tax invoice" : "payment receipt"
      }.`,
      rows,
      note,
      receiptUrl,
    ),
  })
}

// Sent to the HOST when a refund is processed for their subscription payment.
// The counterpart to the invoice: `fullRefund` true means paid access was
// revoked and the account returned to the free tier; false is a partial/goodwill
// refund that leaves access intact.
export async function sendRefundEmail(input: {
  to: string
  hostName?: string
  planName?: string
  amountLabel?: string
  reference: string
  refundedAt?: Date
  fullRefund?: boolean
  // Absolute URL to the hosted receipt for the ORIGINAL payment being refunded,
  // so the host can open the source transaction document from their account.
  receiptUrl?: string
}) {
  const { to, hostName, planName, amountLabel, reference, receiptUrl } = input
  const refundedAt = input.refundedAt ?? new Date()
  const full = input.fullRefund !== false
  const greeting = hostName ? `Hi ${esc(hostName)},` : "Hi,"
  const intro = full
    ? `${greeting}<br/><br/>We've processed a refund for your StayKnit payment below. Your paid access has ended and your account has returned to the free tier. Refunds typically reflect within 5–10 business days, depending on your bank.`
    : `${greeting}<br/><br/>We've processed a partial refund for your StayKnit payment below. Your paid access remains active. Refunds typically reflect within 5–10 business days, depending on your bank.`
  const rows: DocRow[] = [
    { label: "Date", value: longDate(refundedAt) },
    ...(planName ? [{ label: "Plan", value: `StayKnit ${planName}` }] : []),
    { label: "Original payment reference", value: reference },
    ...(amountLabel ? [{ label: "Amount refunded", value: amountLabel, strong: true }] : []),
  ]
  const note = "If you didn't expect this refund, contact support@stayknit.org."
  await sendMail({
    to,
    replyTo: SUPPORT_ADDRESS,
    subject: `StayKnit refund processed — ${reference}`,
    html: financialDoc({
      heading: "Refund processed",
      badge: "Refunded",
      intro,
      rows,
      note,
      cta: receiptUrl ? { label: "View the original payment receipt", url: receiptUrl } : undefined,
    }),
    text: financialDocText(
      "Refund processed",
      `${hostName ? `Hi ${hostName},` : "Hi,"}\n\n${full ? "We've processed a full refund; your paid access has ended." : "We've processed a partial refund; your paid access remains active."}`,
      rows,
      note,
      receiptUrl,
    ),
  })
}

// Emails a copy of an owner's payout statement to the HOST (for their records).
// Owners themselves read statements in their in-app portal — this is the host's
// filed copy. Rows are pre-formatted by the caller (currency-aware) so this stays
// display-agnostic.
export async function sendOwnerStatementEmail(input: {
  to: string
  hostName?: string
  ownerName: string
  ownerEmail?: string
  period: string
  property?: string
  rows: DocRow[]
}) {
  const { to, hostName, ownerName, ownerEmail, period, property, rows } = input
  const greeting = hostName ? `Hi ${esc(hostName)},` : "Hi,"
  const scope = property && property !== "All properties" ? ` · ${esc(property)}` : ""
  const intro = `${greeting}<br/><br/>Here is your filed copy of the payout statement for <strong>${esc(ownerName)}</strong> covering ${esc(period)}${scope}${
    ownerEmail ? `. The owner can also view this in their portal.` : "."
  }`
  const note = "Payment to the owner is arranged directly by you, not through StayKnit."
  await sendMail({
    to,
    replyTo: SUPPORT_ADDRESS,
    subject: `Owner statement — ${ownerName} · ${period}`,
    html: financialDoc({ heading: `Statement — ${ownerName}`, intro, rows, note }),
    text: financialDocText(
      `Statement — ${ownerName}`,
      `${hostName ? `Hi ${hostName},` : "Hi,"}\n\nYour filed copy of the payout statement for ${ownerName} covering ${period}${property && property !== "All properties" ? ` · ${property}` : ""}.`,
      rows,
      note,
    ),
  })
}

// Sent to the HOST when an auto-renewal card charge fails. This is the dunning
// notice: their access hasn't lapsed yet (the cron runs a couple of days before
// term end and retries daily), but they need to fix their card or renew manually
// before the term runs out. `attempt` lets the copy escalate on repeat failures.
export async function sendRenewalFailedEmail(
  to: string,
  opts: { name?: string; planName: string; endsAt: Date; renewUrl: string; attempt: number },
) {
  const { name, planName, endsAt, renewUrl, attempt } = opts
  const greeting = name ? `Hi ${esc(name)},` : "Hi,"
  const endDate = endsAt.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
  const urgent = attempt >= 2
  const subject = urgent
    ? `Action needed: StayKnit couldn't renew your ${planName} plan`
    : `We couldn't renew your StayKnit plan — please check your card`
  const heading = urgent ? "Your renewal is still failing" : "We couldn't process your renewal"
  const body = `${greeting} we tried to automatically renew your StayKnit <strong>${esc(
    planName,
  )}</strong> plan but the card charge didn't go through${
    urgent ? ` (attempt ${attempt})` : ""
  }. Your access continues until <strong>${endDate}</strong>. We'll keep retrying, but to avoid any interruption please renew manually or update your card now.`
  const text = `${greeting}

We tried to automatically renew your StayKnit ${planName} plan but the card charge didn't go through${
    urgent ? ` (attempt ${attempt})` : ""
  }.

Your access continues until ${endDate}. We'll keep retrying, but to avoid interruption please renew manually or update your card now:
${renewUrl}

StayKnit`
  await sendMail({
    to,
    subject,
    text,
    html: shell({ heading, body, cta: { label: "Renew my plan", url: renewUrl } }),
  })
}

// -------- Operational alerting (owner-facing) --------------------------------
// Lightweight error monitoring without an external service: when a background
// job fails or hits unexpected errors, email the operator (OWNER_EMAIL) so
// failures are never silent. Every function here is FAIL-SAFE — it swallows its
// own errors and never throws, so alerting can be called from a catch block
// without masking the original error or breaking the job.

const OWNER_ALERT_TO = process.env.OWNER_EMAIL || SUPPORT_ADDRESS

// Sends an operational alert to the operator. Never throws.
export async function sendOwnerAlertEmail(subject: string, lines: string[]): Promise<void> {
  try {
    if (!SMTP_PASSWORD) {
      console.error(`[v0] owner-alert NOT sent (no SMTP_PASSWORD): ${subject}`)
      return
    }
    const when = new Date().toISOString()
    const bodyLines = [...lines, `Time: ${when}`]
    const body = bodyLines.map((l) => esc(l)).join("<br/>")
    await sendMail({
      to: OWNER_ALERT_TO,
      subject: `[StayKnit alert] ${subject}`,
      text: `${subject}\n\n${bodyLines.join("\n")}`,
      html: shell({ heading: "Operational alert", body, footer: "support" }),
      replyTo: SUPPORT_ADDRESS,
    })
  } catch (err) {
    // Last resort: log loudly. Never propagate — alerting must not break a job.
    console.error(`[v0] owner-alert send FAILED for "${subject}"`, err)
  }
}

// Reports an unexpected server/background-job error to the operator. Never
// throws. Use in cron/job catch blocks: reportServerError('renewals cron', err).
export async function reportServerError(
  context: string,
  err: unknown,
  extra?: Record<string, string | number>,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error && err.stack ? err.stack.split("\n").slice(0, 4).join("\n") : ""
  console.error(`[v0] reportServerError [${context}]:`, message, extra ?? "")
  const lines = [
    `Context: ${context}`,
    `Error: ${message}`,
    ...(extra ? Object.entries(extra).map(([k, v]) => `${k}: ${v}`) : []),
    ...(stack ? [`Stack (top):`, stack] : []),
  ]
  await sendOwnerAlertEmail(`Error in ${context}`, lines)
}

// Turns a nodemailer/SMTP error into a short, actionable, secret-free message.
function describeSmtpError(err: unknown): string {
  const e = err as { code?: string; responseCode?: number; response?: string; message?: string }
  const code = e?.code
  if (code === "EAUTH" || e?.responseCode === 535) {
    return "Authentication failed (EAUTH): the mailbox username or SMTP_PASSWORD is wrong, or the mailbox is disabled. Reset the mailbox password in Namecheap Private Email and update SMTP_PASSWORD."
  }
  if (code === "ETIMEDOUT" || code === "ECONNECTION" || code === "ECONNREFUSED" || code === "ESOCKET") {
    return `Could not connect to the mail server (${code}): host/port may be blocked or wrong (expected mail.privateemail.com:465).`
  }
  if (e?.response) return `${code ?? "SMTP error"}: ${e.response}`
  return e?.message || "Unknown SMTP error."
}
