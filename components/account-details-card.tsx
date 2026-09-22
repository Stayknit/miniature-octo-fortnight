"use client"

import { getMyContactDetails, requestEmailChange, updateMyContactDetails } from "@/app/actions/account"
import { Check, Mail, Pencil, UserRound } from "lucide-react"
import { useEffect, useState } from "react"

const fieldClass =
  "w-full rounded-lg border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-primary"
const labelClass = "mono-label mb-1.5 block text-[9px] text-muted-foreground"

export function AccountDetailsCard() {
  const [loaded, setLoaded] = useState(false)
  const [name, setName] = useState("")
  const [businessName, setBusinessName] = useState("")
  const [phone, setPhone] = useState("")
  const [telephone, setTelephone] = useState("")
  const [email, setEmail] = useState("")

  // Contact-details editor
  const [editing, setEditing] = useState(false)
  const [password, setPassword] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  // Email-change flow
  const [editingEmail, setEditingEmail] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [emailPassword, setEmailPassword] = useState("")
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailNotice, setEmailNotice] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getMyContactDetails()
      .then((d) => {
        if (!active) return
        setName(d.name)
        setBusinessName(d.businessName)
        setPhone(d.phone)
        setTelephone(d.telephone)
        setEmail(d.email)
        setLoaded(true)
      })
      .catch(() => active && setLoaded(true))
    return () => {
      active = false
    }
  }, [])

  async function onSave() {
    setError(null)
    setSaving(true)
    const res = await updateMyContactDetails({ name, businessName, phone, telephone, currentPassword: password })
    setSaving(false)
    if (!res.ok) {
      setError(res.error ?? "Could not save your details.")
      return
    }
    setPassword("")
    setEditing(false)
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 2500)
  }

  async function onChangeEmail() {
    setEmailError(null)
    setEmailNotice(null)
    setEmailBusy(true)
    const res = await requestEmailChange({ newEmail, currentPassword: emailPassword })
    setEmailBusy(false)
    if (!res.ok) {
      setEmailError(res.error ?? "Could not start the email change.")
      return
    }
    setEmailPassword("")
    setNewEmail("")
    setEditingEmail(false)
    setEmailNotice(res.message ?? "Check your current email inbox to confirm the change.")
  }

  if (!loaded) {
    return (
      <div className="rounded-lg border border-border bg-surface-2 p-4">
        <p className="text-[12px] text-muted-foreground">Loading your details…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Contact details */}
      <div className="rounded-lg border border-border bg-surface-2 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-medium">
            <UserRound size={16} className="text-primary" />
            Your details
          </span>
          {!editing && (
            <button
              onClick={() => {
                setEditing(true)
                setError(null)
              }}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12px] font-medium text-foreground hover:border-primary"
            >
              {justSaved ? (
                <>
                  <Check size={13} className="text-primary" /> Saved
                </>
              ) : (
                <>
                  <Pencil size={13} /> Edit
                </>
              )}
            </button>
          )}
        </div>

        {!editing ? (
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="text-right font-medium">{name || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Business</dt>
              <dd className="text-right font-medium">{businessName || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Mobile</dt>
              <dd className="text-right font-medium">{phone || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Landline</dt>
              <dd className="text-right font-medium">{telephone || "—"}</dd>
            </div>
          </dl>
        ) : (
          <div className="flex flex-col gap-2.5">
            <label className="block">
              <span className={labelClass}>Full name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Business name</span>
              <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} className={fieldClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Mobile number</span>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={fieldClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Landline (optional)</span>
              <input
                type="tel"
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                className={fieldClass}
              />
            </label>

            <div className="mt-1 rounded-lg border border-dashed border-border p-3">
              <label className="block">
                <span className={labelClass}>Confirm with your password to save</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Current password"
                  autoComplete="current-password"
                  className={fieldClass}
                />
              </label>
            </div>

            {error && <p className="text-[12px] text-red-500">{error}</p>}

            <div className="mt-1 flex gap-2">
              <button
                onClick={onSave}
                disabled={saving || !password}
                className="flex-1 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button
                onClick={() => {
                  setEditing(false)
                  setError(null)
                  setPassword("")
                }}
                className="rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Email address — changed via confirmation email */}
      <div className="rounded-lg border border-border bg-surface-2 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Mail size={16} className="text-primary" />
            Email address
          </span>
          {!editingEmail && (
            <button
              onClick={() => {
                setEditingEmail(true)
                setEmailError(null)
                setEmailNotice(null)
              }}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12px] font-medium text-foreground hover:border-primary"
            >
              <Pencil size={13} /> Change
            </button>
          )}
        </div>

        {!editingEmail ? (
          <>
            <p className="text-sm font-medium">{email || "—"}</p>
            {emailNotice && <p className="mt-2 text-[12px] leading-relaxed text-primary">{emailNotice}</p>}
          </>
        ) : (
          <div className="flex flex-col gap-2.5">
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              For your security, we&apos;ll email a confirmation link to your <strong>current</strong> address (
              {email}). The change only takes effect once you click it.
            </p>
            <label className="block">
              <span className={labelClass}>New email address</span>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className={fieldClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Confirm with your password</span>
              <input
                type="password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                placeholder="Current password"
                autoComplete="current-password"
                className={fieldClass}
              />
            </label>

            {emailError && <p className="text-[12px] text-red-500">{emailError}</p>}

            <div className="mt-1 flex gap-2">
              <button
                onClick={onChangeEmail}
                disabled={emailBusy || !newEmail || !emailPassword}
                className="flex-1 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {emailBusy ? "Sending…" : "Send confirmation link"}
              </button>
              <button
                onClick={() => {
                  setEditingEmail(false)
                  setEmailError(null)
                  setEmailPassword("")
                  setNewEmail("")
                }}
                className="rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
