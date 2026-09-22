"use client"

import { authClient } from "@/lib/auth-client"
import { Check, Clock, Copy, ShieldCheck, ShieldOff, Smartphone } from "lucide-react"
import { useEffect, useState } from "react"
import QRCode from "qrcode"

type Phase = "idle" | "password" | "enroll" | "disable"

export function TwoFactorCard() {
  const { data: session, isPending, refetch } = authClient.useSession()
  const enabled = Boolean((session?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled)

  const [phase, setPhase] = useState<Phase>("idle")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [totpURI, setTotpURI] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justChanged, setJustChanged] = useState<"on" | "off" | null>(null)
  // Repeated rejections while confirming enrollment usually mean the phone's
  // clock has drifted, not that the wrong code was typed.
  const [confirmFails, setConfirmFails] = useState(0)

  // Render the otpauth:// URI as a scannable QR once enrollment starts.
  useEffect(() => {
    if (!totpURI) {
      setQrDataUrl(null)
      return
    }
    let active = true
    QRCode.toDataURL(totpURI, { margin: 1, width: 200 })
      .then((url) => active && setQrDataUrl(url))
      .catch(() => active && setError("Could not render the QR code. Use the manual key below."))
    return () => {
      active = false
    }
  }, [totpURI])

  function reset() {
    setPhase("idle")
    setPassword("")
    setCode("")
    setTotpURI(null)
    setBackupCodes([])
    setError(null)
    setBusy(false)
    setConfirmFails(0)
  }

  // Step 1 → generate a secret + backup codes. 2FA is NOT active yet; the
  // twoFactor row is created unverified until a valid code is entered, so
  // abandoning here can't lock the host out.
  async function beginEnroll() {
    setError(null)
    setBusy(true)
    const { data, error } = await authClient.twoFactor.enable({ password })
    setBusy(false)
    if (error || !data || data.method !== "totp") {
      setError(error?.message ?? "That password wasn't right.")
      return
    }
    setTotpURI(data.totpURI)
    setBackupCodes(data.backupCodes ?? [])
    setPassword("")
    setPhase("enroll")
  }

  // Step 2 → confirm a live code, which flips twoFactorEnabled to true.
  async function confirmEnroll() {
    setError(null)
    setBusy(true)
    const { error } = await authClient.twoFactor.verifyTotp({ code: code.trim() })
    setBusy(false)
    if (error) {
      setConfirmFails((n) => n + 1)
      setError("That code didn't match. Check your authenticator and try again.")
      return
    }
    await refetch()
    setJustChanged("on")
    setTimeout(() => setJustChanged(null), 4000)
    reset()
  }

  async function turnOff() {
    setError(null)
    setBusy(true)
    const { error } = await authClient.twoFactor.disable({ password })
    setBusy(false)
    if (error) {
      setError(error.message ?? "That password wasn't right.")
      return
    }
    await refetch()
    setJustChanged("off")
    setTimeout(() => setJustChanged(null), 4000)
    reset()
  }

  function copyCodes() {
    navigator.clipboard?.writeText(backupCodes.join("\n")).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const statusText = isPending
    ? "Checking…"
    : enabled
      ? "On — a code from your authenticator app is required at sign-in"
      : "Off — StayKnit recommends adding an authenticator app for a second layer of security"

  return (
    <div className="mt-2 rounded-lg border border-border bg-surface-2 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-start gap-2.5">
          {enabled ? (
            <ShieldCheck size={16} className="mt-0.5 text-primary" />
          ) : (
            <ShieldOff size={16} className="mt-0.5 text-muted-foreground" />
          )}
          <span>
            <span className="flex items-center gap-1.5">
              <span className="text-sm font-medium">Two-factor authentication</span>
              {!enabled && !isPending && (
                <span className="mono-label rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[8px] leading-none text-primary">
                  Recommended
                </span>
              )}
            </span>
            <span className="mt-0.5 block text-[12px] text-muted-foreground">{statusText}</span>
          </span>
        </span>

        {phase === "idle" && !isPending && (
          <button
            onClick={() => {
              setPhase(enabled ? "disable" : "password")
              setJustChanged(null)
            }}
            className="mono-label flex shrink-0 items-center gap-1.5 rounded-md border border-border-strong px-2.5 py-1.5 text-[10px] text-primary transition-colors hover:border-primary"
          >
            {enabled ? (
              <>
                <ShieldOff size={12} /> Turn off
              </>
            ) : (
              <>
                <Smartphone size={12} /> Set up
              </>
            )}
          </button>
        )}
      </div>

      {justChanged && (
        <p className="mono-label mt-2 flex items-center gap-1.5 text-[10px] text-primary">
          <Check size={12} /> {justChanged === "on" ? "Two-factor authentication is on" : "Two-factor authentication turned off"}
        </p>
      )}

      {/* Step 1: confirm password to begin enrollment */}
      {phase === "password" && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Confirm your password to start setting up an authenticator app (Google Authenticator, Authy, 1Password, etc.).
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Current password"
            autoComplete="current-password"
            className="tf-input"
          />
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="flex gap-2">
            <button
              onClick={beginEnroll}
              disabled={busy || password.length === 0}
              className="mono-label flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary py-2.5 text-[10px] text-primary-foreground disabled:opacity-60"
            >
              {busy ? "One moment…" : "Continue"}
            </button>
            <CancelButton onClick={reset} />
          </div>
        </div>
      )}

      {/* Step 2: scan QR, save backup codes, verify a code */}
      {phase === "enroll" && (
        <div className="mt-3 flex flex-col gap-4">
          <div>
            <p className="mono-label mb-2 text-[9px] text-muted-foreground">1 · Scan with your authenticator app</p>
            <div className="flex items-center gap-3">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrDataUrl || "/placeholder.svg"}
                  alt="QR code for authenticator app enrollment"
                  className="h-[120px] w-[120px] rounded-md border border-border bg-white p-1"
                />
              ) : (
                <div className="flex h-[120px] w-[120px] items-center justify-center rounded-md border border-border text-[10px] text-muted-foreground">
                  Rendering…
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted-foreground">Can&apos;t scan? Enter this key manually:</p>
                <code className="mt-1 block break-all rounded bg-surface px-2 py-1 text-[11px] text-foreground">
                  {extractSecret(totpURI)}
                </code>
              </div>
            </div>
          </div>

          {backupCodes.length > 0 && (
            <div>
              <p className="mono-label mb-2 text-[9px] text-muted-foreground">2 · Save your backup codes</p>
              <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
                Each code works once if you lose your device. Store them somewhere safe — you won&apos;t see them again.
                (You can also recover using your security questions.)
              </p>
              <div className="grid grid-cols-2 gap-1.5 rounded-md border border-border bg-surface px-3 py-2.5">
                {backupCodes.map((c) => (
                  <code key={c} className="text-[12px] tracking-wide text-foreground">
                    {c}
                  </code>
                ))}
              </div>
              <button
                onClick={copyCodes}
                className="mono-label mt-2 flex items-center gap-1.5 rounded-md border border-border-strong px-2.5 py-1.5 text-[10px] text-primary transition-colors hover:border-primary"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy codes"}
              </button>
            </div>
          )}

          <div>
            <p className="mono-label mb-2 text-[9px] text-muted-foreground">3 · Enter the 6-digit code to confirm</p>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              className="tf-input tracking-[0.4em]"
            />
          </div>

          {error && <ErrorNote>{error}</ErrorNote>}

          {confirmFails >= 2 && (
            <div className="flex items-start gap-2 rounded-md border border-border bg-surface px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
              <Clock size={14} className="mt-0.5 shrink-0 text-primary" />
              <span>
                Still not matching? Authenticator codes depend on your phone&apos;s clock. Turn on automatic date &amp;
                time on your phone — or in Google Authenticator open{" "}
                <span className="text-foreground">Settings → Time correction for codes → Sync now</span> — then enter a
                fresh code.
              </span>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={confirmEnroll}
              disabled={busy || code.length !== 6}
              className="mono-label flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary py-2.5 text-[10px] text-primary-foreground disabled:opacity-60"
            >
              <ShieldCheck size={13} /> {busy ? "Verifying…" : "Turn on 2FA"}
            </button>
            <CancelButton onClick={reset} />
          </div>
        </div>
      )}

      {/* Turn off: confirm password */}
      {phase === "disable" && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Confirm your password to turn off two-factor authentication. Your account will be protected by password only.
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Current password"
            autoComplete="current-password"
            className="tf-input"
          />
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="flex gap-2">
            <button
              onClick={turnOff}
              disabled={busy || password.length === 0}
              className="mono-label flex flex-1 items-center justify-center gap-1.5 rounded-md bg-danger py-2.5 text-[10px] text-white disabled:opacity-60"
            >
              <ShieldOff size={13} /> {busy ? "One moment…" : "Turn off 2FA"}
            </button>
            <CancelButton onClick={reset} />
          </div>
        </div>
      )}

      <style>{`
        .tf-input {
          width: 100%;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--surface);
          padding: 0.6rem 0.7rem;
          font-size: 0.85rem;
          color: var(--foreground);
          outline: none;
        }
        .tf-input::placeholder { color: #4d5c61; }
        .tf-input:focus { border-color: var(--primary); }
      `}</style>
    </div>
  )
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-danger">
      {children}
    </p>
  )
}

function CancelButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mono-label rounded-md border border-border-strong px-3.5 py-2.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
    >
      Cancel
    </button>
  )
}

// Pull the base32 secret out of the otpauth:// URI for manual entry.
function extractSecret(uri: string | null): string {
  if (!uri) return ""
  try {
    return new URL(uri).searchParams.get("secret") ?? ""
  } catch {
    return ""
  }
}
