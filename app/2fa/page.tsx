"use client"

import { authClient } from "@/lib/auth-client"
import { Clock, KeyRound, ShieldCheck, Smartphone } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { BrandLockup } from "@/components/wordmark"

type Mode = "totp" | "backup"

export default function TwoFactorChallengePage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>("totp")
  const [code, setCode] = useState("")
  const [trustDevice, setTrustDevice] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Track consecutive TOTP rejections. Repeated failures on a code that looks
  // right almost always mean the phone's clock has drifted out of the 30s
  // window, so surface a targeted hint rather than just "wrong code" again.
  const [totpFails, setTotpFails] = useState(0)

  const isTotp = mode === "totp"

  function onCodeChange(value: string) {
    if (isTotp) {
      // TOTP is exactly 6 digits.
      setCode(value.replace(/\D/g, "").slice(0, 6))
    } else {
      // Backup codes are alphanumeric; keep it forgiving.
      setCode(value.trim().slice(0, 20))
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const res = isTotp
      ? await authClient.twoFactor.verifyTotp({ code: code.trim(), trustDevice })
      : await authClient.twoFactor.verifyBackupCode({ code: code.trim() })
    if (res.error) {
      setLoading(false)
      if (isTotp) setTotpFails((n) => n + 1)
      setError(
        isTotp
          ? "That code didn't match. It refreshes every 30 seconds — try the newest one."
          : "That backup code wasn't valid. Each code only works once.",
      )
      return
    }
    router.push("/")
    router.refresh()
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <Link href="/" aria-label="Go to StayKnit home">
            <BrandLockup width={168} />
          </Link>
          <span className="mt-6 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface-2">
            <ShieldCheck size={20} className="text-primary" />
          </span>
          <h1 className="mt-4 text-balance font-sans text-2xl font-extrabold tracking-tight">
            Two-factor authentication
          </h1>
          <p className="mt-2 max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">
            {isTotp
              ? "Enter the 6-digit code from your authenticator app to finish signing in."
              : "Enter one of the backup codes you saved when you set up 2FA."}
          </p>
        </div>

        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
          <input
            inputMode={isTotp ? "numeric" : "text"}
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            placeholder={isTotp ? "123456" : "Backup code"}
            aria-label={isTotp ? "Authenticator code" : "Backup code"}
            className={`w-full rounded-lg border border-border bg-surface px-3.5 py-3 text-center text-lg text-foreground outline-none placeholder:text-muted-foreground focus:border-primary ${
              isTotp ? "tracking-[0.5em]" : "tracking-normal"
            }`}
          />

          {isTotp && (
            <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-[var(--primary)]"
              />
              Trust this device for 30 days
            </label>
          )}

          {error && (
            <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger">
              {error}
            </p>
          )}

          {isTotp && totpFails >= 2 && (
            <div className="flex items-start gap-2 rounded-md border border-border bg-surface-2 px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
              <Clock size={15} className="mt-0.5 shrink-0 text-primary" />
              <span>
                Codes keep getting rejected? Authenticator codes depend on your phone&apos;s clock. If it&apos;s off by
                more than a few seconds they won&apos;t match. Turn on automatic date &amp; time on your phone — or in
                Google Authenticator open <span className="text-foreground">Settings → Time correction for codes → Sync now</span>{" "}
                — then try again. You can also{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("backup")
                    setCode("")
                    setError(null)
                  }}
                  className="font-medium text-primary hover:underline"
                >
                  use a backup code
                </button>
                .
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (isTotp ? code.length !== 6 : code.length < 4)}
            className="mono-label flex items-center justify-center gap-1.5 rounded-lg bg-primary py-3 text-[11px] text-primary-foreground disabled:opacity-60"
          >
            {loading ? "Verifying…" : "Verify and sign in"}
          </button>
        </form>

        <div className="mt-6 flex flex-col items-center gap-2 text-center">
          <button
            type="button"
            onClick={() => {
              setMode(isTotp ? "backup" : "totp")
              setCode("")
              setError(null)
              setTotpFails(0)
            }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            {isTotp ? (
              <>
                <KeyRound size={15} /> Use a backup code instead
              </>
            ) : (
              <>
                <Smartphone size={15} /> Use your authenticator app instead
              </>
            )}
          </button>

          <p className="text-[12px] text-muted-foreground">
            Lost your device and codes?{" "}
            <Link href="/forgot-password" className="font-medium text-primary hover:underline">
              Recover with security questions
            </Link>
          </p>
          <Link href="/sign-in" className="text-[12px] text-muted-foreground hover:text-foreground">
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  )
}
