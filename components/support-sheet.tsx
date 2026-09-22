'use client'

import { submitSupportTicket } from '@/app/actions/stayknit'
import { inputClass } from '@/components/modal'
import { Check, LifeBuoy, Send } from 'lucide-react'
import { useState, useTransition } from 'react'

const CATEGORIES = [
  { key: 'clash', label: 'Double-booking / clash' },
  { key: 'ical', label: 'iCal not syncing' },
  { key: 'payout', label: 'Payout or statement' },
  { key: 'general', label: 'Something else' },
]

// The "send to a human" escalation — used inside the Help sheet.
export function SupportForm() {
  const [pending, startTransition] = useTransition()
  const [category, setCategory] = useState('clash')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    startTransition(async () => {
      await submitSupportTicket({ category, subject, message })
      setSent(true)
      setSubject('')
      setMessage('')
    })
  }

  if (sent) {
    return (
      <div className="rounded-lg border border-border bg-surface-2 p-5 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary-dim">
          <Check size={18} className="text-primary" />
        </div>
        <p className="mt-3 text-sm font-semibold">Sent to a human</p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          We’ll reply to your account email within one business day. Urgent clash? We prioritise those first.
        </p>
        <button
          onClick={() => setSent(false)}
          className="mono-label mt-3 rounded border border-border px-3 py-1.5 text-[10px] text-primary hover:border-primary"
        >
          Send another
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <LifeBuoy size={16} className="text-primary" /> Talk to a human
      </div>
      <div>
        <span className="mono-label mb-2 block text-[10px] text-muted-foreground">What’s up?</span>
        <div className="grid grid-cols-2 gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key)}
              className={`rounded-lg border px-3 py-2.5 text-left text-[12px] font-medium transition-colors ${
                category === c.key
                  ? 'border-primary bg-primary-dim text-primary'
                  : 'border-border bg-surface-2 text-muted-foreground hover:border-border-strong'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject (optional)"
        className={inputClass}
      />
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Tell us what happened — which unit, which channels, and when."
        rows={4}
        className={`${inputClass} resize-none`}
      />
      <button
        type="submit"
        disabled={pending || !message.trim()}
        className="mono-label flex items-center justify-center gap-1.5 rounded-lg bg-primary py-3.5 text-[11px] text-primary-foreground disabled:opacity-60"
      >
        <Send size={14} /> {pending ? 'Sending…' : 'Send to support'}
      </button>
    </form>
  )
}
