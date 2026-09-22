"use client"

import { getMySecurityQuestions, saveSecurityQuestions } from "@/app/actions/security"
import { SECURITY_QUESTION_COUNT, SECURITY_QUESTION_PRESETS } from "@/lib/security-questions"
import { Check, KeyRound, Pencil } from "lucide-react"
import { useEffect, useState } from "react"

type Row = { question: string; answer: string }

const EMPTY: Row[] = Array.from({ length: SECURITY_QUESTION_COUNT }, (_, i) => ({
  question: SECURITY_QUESTION_PRESETS[i],
  answer: "",
}))

export function SecurityQuestionsCard() {
  const [hasQuestions, setHasQuestions] = useState<boolean | null>(null)
  const [savedQuestions, setSavedQuestions] = useState<string[]>([])
  const [editing, setEditing] = useState(false)
  const [rows, setRows] = useState<Row[]>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    let active = true
    getMySecurityQuestions()
      .then((res) => {
        if (!active) return
        setHasQuestions(res.hasQuestions)
        setSavedQuestions(res.questions.map((q) => q.question))
        if (res.hasQuestions) {
          setRows(res.questions.map((q) => ({ question: q.question, answer: "" })))
        }
      })
      .catch(() => active && setHasQuestions(false))
    return () => {
      active = false
    }
  }, [])

  async function onSave() {
    setError(null)
    setSaving(true)
    const res = await saveSecurityQuestions(rows.map((r) => ({ question: r.question, answer: r.answer })))
    setSaving(false)
    if (!res.ok) {
      setError(res.error ?? "Could not save.")
      return
    }
    setHasQuestions(true)
    setSavedQuestions(rows.map((r) => r.question))
    setRows(rows.map((r) => ({ ...r, answer: "" })))
    setEditing(false)
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 2500)
  }

  return (
    <div className="mt-2 rounded-lg border border-border bg-surface-2 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-start gap-2.5">
          <KeyRound size={16} className="mt-0.5 text-primary" />
          <span>
            <span className="block text-sm font-medium">Security questions</span>
            <span className="block text-[12px] text-muted-foreground">
              {hasQuestions === null
                ? "Checking…"
                : hasQuestions
                  ? "Set — used to reset your password"
                  : "Not set — needed to reset your password"}
            </span>
          </span>
        </span>
        {!editing && hasQuestions !== null && (
          <button
            onClick={() => {
              setEditing(true)
              setJustSaved(false)
            }}
            className="mono-label flex shrink-0 items-center gap-1.5 rounded-md border border-border-strong px-2.5 py-1.5 text-[10px] text-primary transition-colors hover:border-primary"
          >
            <Pencil size={12} /> {hasQuestions ? "Change" : "Set up"}
          </button>
        )}
      </div>

      {justSaved && (
        <p className="mono-label mt-2 flex items-center gap-1.5 text-[10px] text-primary">
          <Check size={12} /> Security questions saved
        </p>
      )}

      {!editing && hasQuestions && savedQuestions.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {savedQuestions.map((q, i) => (
            <li key={i} className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <span className="mono-label text-[9px] text-primary-muted">{`Q${i + 1}`}</span> {q}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div className="mt-3 flex flex-col gap-3">
          {rows.map((row, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <select
                value={row.question}
                onChange={(e) => {
                  const next = [...rows]
                  next[i] = { ...next[i], question: e.target.value }
                  setRows(next)
                }}
                className="sq-input"
              >
                {SECURITY_QUESTION_PRESETS.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
              <input
                value={row.answer}
                onChange={(e) => {
                  const next = [...rows]
                  next[i] = { ...next[i], answer: e.target.value }
                  setRows(next)
                }}
                placeholder="Your answer"
                autoComplete="off"
                className="sq-input"
              />
            </div>
          ))}

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Answers are stored encrypted and matched ignoring capitalisation. Keep them memorable but hard to guess.
          </p>

          {error && (
            <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-danger">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={onSave}
              disabled={saving}
              className="mono-label flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary py-2.5 text-[10px] text-primary-foreground disabled:opacity-60"
            >
              <Check size={13} /> {saving ? "Saving…" : "Save questions"}
            </button>
            <button
              onClick={() => {
                setEditing(false)
                setError(null)
                setRows(
                  hasQuestions ? savedQuestions.map((q) => ({ question: q, answer: "" })) : EMPTY,
                )
              }}
              className="mono-label rounded-md border border-border-strong px-3.5 py-2.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <style>{`
        .sq-input {
          width: 100%;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--surface);
          padding: 0.6rem 0.7rem;
          font-size: 0.85rem;
          color: var(--foreground);
          outline: none;
        }
        .sq-input::placeholder { color: #4d5c61; }
        .sq-input:focus { border-color: var(--primary); }
      `}</style>
    </div>
  )
}
