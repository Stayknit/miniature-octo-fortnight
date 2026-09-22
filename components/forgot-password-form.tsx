"use client"

import { getResetQuestions, resetPasswordWithSecurity, type PublicQuestion } from "@/app/actions/security"
import { requestPasswordResetEmail } from "@/app/actions/auth"
import { BrandLockup } from "@/components/wordmark"
import { ArrowLeft, Check, Mail, ShieldQuestion } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

type Step = "email" | "sent" | "verify" | "done"

export function ForgotPasswordForm() {
  const router = useRouter()
  const [step, setStep] = useState<Step>("email")
  const [email, setEmail] = useState("")
  const [questions, setQuestions] = useState<PublicQuestion[]>([])
  const [answers, setAnswers] = useState<string[]>([])
  const [newPassword, setNewPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSendLink(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    // Enumeration-safe on the happy path (unknown addresses still return ok, so
    // we never reveal which emails have accounts), but if the mail server itself
    // fails we surface it instead of sending the user to an empty inbox.
    const res = await requestPasswordResetEmail(email)
    setLoading(false)
    if (res.ok) {
      setStep("sent")
    } else {
      setError(
        "We couldn't send the reset link just now — the mail service is temporarily unavailable. Please try again in a few minutes, or email support@stayknit.org.",
      )
    }
  }

  async function onLookup() {
    setError(null)
    setLoading(true)
    const res = await getResetQuestions(email)
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setQuestions(res.questions)
    setAnswers(new Array(res.questions.length).fill(""))
    setStep("verify")
  }

  async function onReset(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const res = await resetPasswordWithSecurity({ email, answers, newPassword })
    setLoading(false)
    if (!res.ok) {
      setError(res.error ?? "Something went wrong.")
      return
    }
    setStep("done")
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <BrandLockup width={168} />
          <span className="mono-label mt-6 flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-[10px] text-muted-foreground">
            <ShieldQuestion size={13} className="text-primary" /> Password reset
          </span>
          <h1 className="mt-4 text-balance font-sans text-3xl font-extrabold tracking-tight">
            {step === "done" ? "Password updated." : step === "sent" ? "Check your inbox." : "Reset your password."}
          </h1>
          <p className="mt-3 max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">
            {step === "email" &&
              "Enter your email and we'll send you a reset link — or verify with your security questions instead."}
            {step === "sent" && "If an account exists for that email, a password reset link is on its way."}
            {step === "verify" &&
              "Answer your security questions and choose a new password. If you had two-factor authentication on, this also turns it off so you can get back in — you can set it up again afterwards."}
            {step === "done" && "You can now sign in with your new password."}
          </p>
        </div>

        {step === "email" && (
          <form onSubmit={onSendLink} className="mt-8 flex flex-col gap-4">
            <Field label="Email">
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@stayknit.org"
                autoComplete="email"
                className="input-base"
              />
            </Field>
            {error && <ErrorNote>{error}</ErrorNote>}
            <SubmitButton loading={loading}>
              <span className="inline-flex items-center gap-1.5">
                <Mail size={14} /> Email me a reset link
              </span>
            </SubmitButton>
            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1 bg-border" />
              <span className="mono-label text-[9px] text-muted-foreground">or</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <button
              type="button"
              disabled={loading || !email}
              onClick={onLookup}
              className="mono-label flex items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-4 py-3.5 text-[11px] text-foreground transition-colors hover:border-primary disabled:opacity-50"
            >
              <ShieldQuestion size={14} className="text-primary" /> Use security questions instead
            </button>
          </form>
        )}

        {step === "sent" && (
          <div className="mt-8 flex flex-col gap-4">
            <div className="flex items-start gap-2.5 rounded-lg border border-primary bg-primary-dim px-4 py-3.5">
              <Mail size={16} className="mt-0.5 shrink-0 text-primary" />
              <span className="text-sm text-foreground">
                We sent a reset link to <span className="font-medium">{email}</span>. It expires in 1 hour. Check your
                spam folder if it doesn&apos;t arrive within a few minutes.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setStep("email")
                setError(null)
              }}
              className="mono-label flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft size={13} /> Use a different email
            </button>
          </div>
        )}

        {step === "verify" && (
          <form onSubmit={onReset} className="mt-8 flex flex-col gap-4">
            {questions.map((q, i) => (
              <Field key={q.position} label={q.question}>
                <input
                  required
                  value={answers[i] ?? ""}
                  onChange={(e) => {
                    const next = [...answers]
                    next[i] = e.target.value
                    setAnswers(next)
                  }}
                  autoComplete="off"
                  className="input-base"
                />
              </Field>
            ))}
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
            {error && <ErrorNote>{error}</ErrorNote>}
            <SubmitButton loading={loading}>Update password</SubmitButton>
            <button
              type="button"
              onClick={() => {
                setStep("email")
                setError(null)
              }}
              className="mono-label flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft size={13} /> Use a different email
            </button>
          </form>
        )}

        {step === "done" && (
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
        )}

        {step !== "done" && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Remembered it?{" "}
            <Link href="/sign-in" className="font-medium text-primary hover:underline">
              Back to sign in
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

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
      {children}
    </p>
  )
}

function SubmitButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="mono-label mt-1 rounded-md bg-primary px-4 py-3.5 text-[11px] text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {loading ? "One moment…" : children}
    </button>
  )
}
