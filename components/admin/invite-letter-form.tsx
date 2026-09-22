"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import type { InviteLetterResult } from "@/app/actions/invite-letter"
import { generateBlankDetailsForm, generateInviteLetter, sendPilotInvite } from "@/app/actions/invite-letter"

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"

// Turn a base64 document payload from a server action into a real browser
// download. The MIME type follows the file extension so this serves both the
// PDF invitation letter and the .docx blank details form.
function downloadFile(result: Extract<InviteLetterResult, { ok: true }>) {
  const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0))
  const type = result.fileName.toLowerCase().endsWith(".pdf")
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  const blob = new Blob([bytes], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = result.fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function InviteLetterForm() {
  const [friendName, setFriendName] = useState("")
  const [businessName, setBusinessName] = useState("")
  const [friendEmail, setFriendEmail] = useState("")
  const [propertiesText, setPropertiesText] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState("")
  const [blankBusy, setBlankBusy] = useState(false)
  const [blankError, setBlankError] = useState("")
  const [sendBusy, setSendBusy] = useState(false)

  function currentProperties() {
    return propertiesText
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean)
  }

  async function onSendEmail() {
    setError("")
    setDone("")
    // Basic client-side guardrails; the server action re-validates fully.
    if (!friendName.trim() || !businessName.trim() || !friendEmail.trim()) {
      setError("Please fill in the recipient's name, business name, and email before sending.")
      return
    }
    setSendBusy(true)
    try {
      const result = await sendPilotInvite({
        friendName,
        businessName,
        friendEmail,
        properties: currentProperties(),
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setDone(`Invitation emailed to ${result.to}. The pilot letter is attached and they can create their account from the link.`)
    } catch {
      setError("Could not send the invitation. Please try again.")
    } finally {
      setSendBusy(false)
    }
  }

  async function onDownloadBlank() {
    setBlankError("")
    setBlankBusy(true)
    try {
      const result = await generateBlankDetailsForm()
      if (!result.ok) {
        setBlankError(result.message)
        return
      }
      downloadFile(result)
    } catch {
      setBlankError("Could not download the form. Please try again.")
    } finally {
      setBlankBusy(false)
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setDone("")
    setBusy(true)
    try {
      const properties = currentProperties()
      const result = await generateInviteLetter({ friendName, businessName, friendEmail, properties })
      if (!result.ok) {
        setError(result.message)
        return
      }
      downloadFile(result)
      setDone(`PDF letter generated: ${result.fileName}. Check your downloads, then send it from Outlook.`)
    } catch {
      setError("Could not generate the letter. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6">
        <div>
          <h2 className="text-base font-semibold text-foreground">Blank details form</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Download a blank Word form and email it to your friend yourself. They fill in their details and email it
            back &mdash; no login needed. This is the quickest option.
          </p>
        </div>
        {blankError && (
          <p role="alert" className="text-sm text-destructive">
            {blankError}
          </p>
        )}
        <Button type="button" variant="secondary" onClick={onDownloadBlank} disabled={blankBusy} className="self-start">
          {blankBusy ? "Preparing…" : "Download blank Word form"}
        </Button>
      </section>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">or send a personalised letter</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-foreground">Recipient&apos;s full name</span>
        <input
          required
          value={friendName}
          onChange={(e) => setFriendName(e.target.value)}
          placeholder="Thandi Mbeki"
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-foreground">Business name</span>
        <input
          required
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder="Thandi's Getaways"
          className={inputClass}
        />
        <span className="mt-1 block text-xs text-muted-foreground">
          This is the name that will appear on their owner statements.
        </span>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-foreground">Email</span>
        <input
          required
          type="email"
          value={friendEmail}
          onChange={(e) => setFriendEmail(e.target.value)}
          placeholder="thandi@example.com"
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-foreground">Properties (one per line, optional)</span>
        <textarea
          value={propertiesText}
          onChange={(e) => setPropertiesText(e.target.value)}
          placeholder={"Seaside Cottage\nGarden Flat"}
          rows={4}
          className={`${inputClass} resize-y`}
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {done && <p className="text-sm text-primary">{done}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={onSendEmail} disabled={sendBusy || busy} className="self-start">
          {sendBusy ? "Sending…" : "Send invitation email"}
        </Button>
        <Button type="submit" variant="secondary" disabled={busy || sendBusy} className="self-start">
          {busy ? "Generating…" : "Download PDF letter"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        &ldquo;Send invitation email&rdquo; emails the recipient directly from StayKnit with the pilot letter (PDF)
        attached &mdash; no Outlook step needed. &ldquo;Download PDF letter&rdquo; gives you the file to send yourself.
      </p>
      </form>
    </div>
  )
}
