'use client'

import { submitSupportTicket } from '@/app/actions/stayknit'
import { Modal, inputClass } from '@/components/modal'
import { Check, Frown, Lightbulb, Heart, Meh, MessageSquarePlus, Send, Smile, TriangleAlert } from 'lucide-react'
import { useState, useTransition } from 'react'

// A quick "how's it feeling" signal. Optional — it just prefixes the message so
// the support agent sees the sentiment at a glance in the admin Tickets tab.
const SENTIMENTS = [
  { key: 'good', label: 'Loving it', icon: Smile },
  { key: 'ok', label: "It's fine", icon: Meh },
  { key: 'bad', label: 'Frustrating', icon: Frown },
] as const

// What kind of feedback this is. Drives the ticket subject so it reads clearly
// for whoever triages it.
const TYPES = [
  { key: 'idea', label: 'Idea', icon: Lightbulb },
  { key: 'praise', label: 'Praise', icon: Heart },
  { key: 'problem', label: 'Problem', icon: TriangleAlert },
  { key: 'other', label: 'Other', icon: MessageSquarePlus },
] as const

type SentimentKey = (typeof SENTIMENTS)[number]['key']
type TypeKey = (typeof TYPES)[number]['label']

// Floating, click-triggered feedback entry point shown on every authed screen.
// Click-triggered (never time/exit-based) keeps it zero-annoyance: it only ever
// appears because the user asked for it. Feedback is filed through the existing
// support-ticket pipeline (category 'feedback') so it lands in the admin
// Tickets tab with an AI-drafted reply and an email acknowledgement — no new
// backend needed.
export function FeedbackButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="absolute bottom-24 right-4 z-20 flex items-center gap-2 rounded-full border border-border bg-primary px-4 py-3 text-primary-foreground shadow-lg transition-transform hover:scale-[1.03] active:scale-95 lg:bottom-6 lg:right-6"
      >
        <MessageSquarePlus size={17} aria-hidden="true" />
        <span className="mono-label text-[11px]">Feedback</span>
      </button>

      {open && <FeedbackModal onClose={() => setOpen(false)} />}
    </>
  )
}

function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [pending, startTransition] = useTransition()
  const [sentiment, setSentiment] = useState<SentimentKey | null>(null)
  const [type, setType] = useState<TypeKey>('Idea')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const body = message.trim()
    if (!body) return
    setError(null)
    // Prefix the sentiment onto the message so it survives into the plain-text
    // ticket, and let the type shape the subject line.
    const sentimentLabel = SENTIMENTS.find((s) => s.key === sentiment)?.label
    const composedMessage = sentimentLabel ? `[Mood: ${sentimentLabel}] ${body}` : body
    const composedSubject = subject.trim() || `${type} feedback`
    startTransition(async () => {
      try {
        await submitSupportTicket({ category: 'feedback', subject: composedSubject, message: composedMessage })
        setSent(true)
      } catch {
        setError('Could not send just now — please try again in a moment.')
      }
    })
  }

  return (
    <Modal title="Share feedback" onClose={onClose}>
      {sent ? (
        <div className="rounded-lg border border-border bg-surface-2 p-6 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary-dim">
            <Check size={20} className="text-primary" />
          </div>
          <p className="mt-3 text-sm font-semibold">Thank you — got it</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Your feedback goes straight to the team. If it needs a reply, we&apos;ll email your account address.
          </p>
          <button
            onClick={onClose}
            className="mono-label mt-4 rounded-lg bg-primary px-4 py-2.5 text-[11px] text-primary-foreground"
          >
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Tell us what&apos;s working, what isn&apos;t, or what you&apos;d love to see. It helps shape what we build
            next.
          </p>

          {/* Optional mood */}
          <div>
            <span className="mono-label mb-2 block text-[10px] text-muted-foreground">
              How&apos;s it going? <span className="text-[#4d5c61]">(optional)</span>
            </span>
            <div className="grid grid-cols-3 gap-2">
              {SENTIMENTS.map((s) => {
                const Icon = s.icon
                const on = sentiment === s.key
                return (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSentiment(on ? null : s.key)}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 transition-colors ${
                      on
                        ? 'border-primary bg-primary-dim text-primary'
                        : 'border-border bg-surface-2 text-muted-foreground hover:border-border-strong'
                    }`}
                  >
                    <Icon size={20} aria-hidden="true" />
                    <span className="text-[11px] font-medium">{s.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Type */}
          <div>
            <span className="mono-label mb-2 block text-[10px] text-muted-foreground">What kind of feedback?</span>
            <div className="grid grid-cols-2 gap-2">
              {TYPES.map((t) => {
                const Icon = t.icon
                const on = type === t.label
                return (
                  <button
                    key={t.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setType(t.label)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[12px] font-medium transition-colors ${
                      on
                        ? 'border-primary bg-primary-dim text-primary'
                        : 'border-border bg-surface-2 text-muted-foreground hover:border-border-strong'
                    }`}
                  >
                    <Icon size={15} aria-hidden="true" /> {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject (optional)"
            aria-label="Feedback subject"
            className={inputClass}
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Share the details…"
            aria-label="Feedback message"
            rows={4}
            className={`${inputClass} resize-none`}
          />

          {error && (
            <p role="alert" className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending || !message.trim()}
            className="mono-label flex items-center justify-center gap-1.5 rounded-lg bg-primary py-3.5 text-[11px] text-primary-foreground disabled:opacity-60"
          >
            <Send size={14} aria-hidden="true" /> {pending ? 'Sending…' : 'Send feedback'}
          </button>
        </form>
      )}
    </Modal>
  )
}
