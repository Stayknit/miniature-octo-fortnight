"use client"

import { resetPassword } from "@/lib/auth-client"
import { BrandLockup } from "@/components/wordmark"
import { ArrowLeft, Check, KeyRound, TriangleAlert } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

export function ResetPasswordForm({ token, linkError }: { token: string | null; linkError: string | null }) {
  const router = useRouter()
  const [newPassword, setNewPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const invalidLink = !token || linkError

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (newPassword !== confirm) {
      setError("Passwords don't match.")
      return
    }
    if (!token) return
    setLoading(true)
    const res = await resetPassword({ newPassword, token })
    setLoading(false)
    if (res.error) {
      // Invalid/expired tokens get the friendly "request a new link" copy;
      // any other server message (e.g. "must be different from your current
      // password") is shown as-is so the reason is clear.
      if (res.error.code === "INVALID_TOKEN" || !res.error.message) {
        setError("This reset link is invalid or has expired. Request a new one.")
      } else {
        setError(res.error.message)
      }
      return
    }
    setDone(true)
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <BrandLockup width={168} />
          <span className="mono-label mt-6 flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-[10px] text-muted-foreground">
            <KeyRound size={13} className="text-primary" /> Password reset
          </span>
          <h1 className="mt-4 text-balance font-sans text-3xl font-extrabold tracking-tight">
            {done ? "Password updated." : "Choose a new password."}
          </h1>
          <p className="mt-3 max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">
            {done
              ? "You can now sign in with your new password."
              : invalidLink
                ? "This reset link is missing or invalid."
                : "Enter a new password for your StayKnit account."}
          </p>
        </div>

        {done ? (
          <div className="mt-8 flex flex-col gap-4">
            <div className="flex items-center gap-2.5 rounded-lg border border-primary bg-primary-dim px-4 py-3.5">
              <Check size={16} className="text-primary" />
              <span className="text-sm text-foreground">Your password has been changed.</span>
            </div>
            <button
              onClick={() => {
                router.push("/sign-in")
                router.refresh()
              }}
              className="mono-label rounded-md bg-primary px-4 py-3.5 text-[11px] text-primary-foreground transition-opacity hover:opacity-90"
            >
              Go to sign in
            </button>
          </div>
        ) : invalidLink ? (
          <div className="mt-8 flex flex-col gap-4">
            <div className="flex items-start gap-2.5 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3.5">
              <TriangleAlert size={16} className="mt-0.5 shrink-0 text-danger" />
              <span className="text-sm text-foreground">
                Reset links expire after 1 hour and can only be used once. Please request a new one.
              </span>
            </div>
            <Link
              href="/forgot-password"
              className="mono-label rounded-md bg-primary px-4 py-3.5 text-center text-[11px] text-primary-foreground transition-opacity hover:opacity-90"
            >
              Request a new link
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
            <Field label="New password">
              <input
                required
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                minLength={8}
                autoComplete="new-password"
                className="input-base"
              />
            </Field>
            <Field label="Confirm new password">
              <input
                required
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter password"
                minLength={8}
                autoComplete="new-password"
                className="input-base"
              />
            </Field>
            {error && (
              <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="mono-label mt-1 rounded-md bg-primary px-4 py-3.5 text-[11px] text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "One moment…" : "Update password"}
            </button>
          </form>
        )}

        {!done && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link href="/sign-in" className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
              <ArrowLeft size={13} /> Back to sign in
            </Link>
          </p>
        )}
      </div>

      <style>{`
        .input-base {
          width: 100%;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--surface);
          padding: 0.75rem 0.85rem;
          font-size: 0.9rem;
          color: var(--foreground);
          outline: none;
        }
        .input-base::placeholder { color: #4d5c61; }
        .input-base:focus { border-color: var(--primary); }
      `}</style>
    </main>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mono-label mb-2 block text-[10px] text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
