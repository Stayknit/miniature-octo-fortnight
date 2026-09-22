'use client'

import { ChevronDown, CornerDownLeft, Loader2, RotateCcw, Sparkles } from 'lucide-react'
import { useRef, useState } from 'react'
import { topicsFor, type Role } from '@/lib/help-content'

type AskState = 'idle' | 'streaming' | 'done' | 'error'

export function HelpManual({ role = 'host' }: { role?: Role }) {
  const TOPICS = topicsFor(role)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(TOPICS[0].id)

  const [asked, setAsked] = useState('')
  const [answer, setAnswer] = useState('')
  const [state, setState] = useState<AskState>('idle')
  const abortRef = useRef<AbortController | null>(null)

  async function ask(question: string) {
    const q = question.trim()
    if (!q || state === 'streaming') return

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setAsked(q)
    setAnswer('')
    setState('streaming')

    try {
      const res = await fetch('/api/help-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, role }),
        signal: ctrl.signal,
      })
      if (!res.ok || !res.body) throw new Error('Request failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let done = false
      while (!done) {
        const { value, done: d } = await reader.read()
        done = d
        if (value) setAnswer((prev) => prev + decoder.decode(value, { stream: true }))
      }
      setState('done')
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setState('error')
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    ask(query)
  }

  function reset() {
    abortRef.current?.abort()
    setAsked('')
    setAnswer('')
    setState('idle')
    setQuery('')
  }

  // Only filter the browse list while idle. Once a question has been asked, the
  // input text is an AI prompt, not a filter, so keep every topic browsable.
  const q = state === 'idle' ? query.trim().toLowerCase() : ''
  const results = q
    ? TOPICS.filter((t) =>
        [t.title, t.summary, t.kicker, t.keywords ?? '', ...t.steps.map((s) => s.text + ' ' + (s.note ?? ''))]
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
    : TOPICS

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed text-foreground">
        Ask a question and the assistant answers from StayKnit&apos;s guide — or browse the topics below.
      </p>

      <form onSubmit={onSubmit} className="relative">
        <Sparkles size={15} className="absolute left-3 top-3 text-primary" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault()
          }}
          placeholder="Ask about StayKnit…"
          className="w-full rounded-lg border border-border bg-surface-2 py-2.5 pl-9 pr-11 text-sm text-foreground outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={!query.trim() || state === 'streaming'}
          aria-label="Ask the assistant"
          className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-40"
        >
          {state === 'streaming' ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <CornerDownLeft size={14} />
          )}
        </button>
      </form>

      {state !== 'idle' && (
        <div className="rounded-lg border border-primary/40 bg-primary-dim/40 p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="mono-label flex items-center gap-1.5 text-[8px] text-primary">
              <Sparkles size={11} /> Assistant
            </span>
            <button
              onClick={reset}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            >
              <RotateCcw size={11} /> Clear
            </button>
          </div>
          <p className="mb-2 text-[12px] font-semibold text-foreground">{asked}</p>
          {state === 'error' ? (
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Something went wrong. Please try again, or use the support form below.
            </p>
          ) : (
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
              {answer}
              {state === 'streaming' && (
                <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-primary align-middle" />
              )}
            </p>
          )}
        </div>
      )}

      <div className="mt-1 flex flex-col gap-2">
        <span className="mono-label text-[8px] text-muted-foreground">
          {q ? `Matching topics` : 'Browse topics'}
        </span>
        {results.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface-2 px-4 py-5 text-center text-[13px] text-muted-foreground">
            No topics match. Try asking the assistant above.
          </p>
        ) : (
          results.map((t) => {
            const on = open === t.id
            return (
              <div key={t.id} className="overflow-hidden rounded-lg border border-border bg-surface-2">
                <button
                  onClick={() => setOpen(on ? null : t.id)}
                  aria-expanded={on}
                  className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="mono-label block text-[8px] text-primary">{t.kicker}</span>
                    <span className="mt-1 block text-sm font-semibold text-foreground">{t.title}</span>
                    {!on && <span className="mt-1 block text-[12px] leading-relaxed text-muted-foreground">{t.summary}</span>}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`mt-0.5 shrink-0 text-muted-foreground transition-transform ${on ? 'rotate-180' : ''}`}
                  />
                </button>

                {on && (
                  <div className="border-t border-border px-4 py-3">
                    <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">{t.summary}</p>
                    <ol className="flex flex-col gap-2.5">
                      {t.steps.map((s, i) => (
                        <li key={i} className="flex gap-2.5">
                          <span className="mono-label mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary-dim text-[9px] text-primary">
                            {i + 1}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[13px] leading-relaxed text-foreground">{s.text}</span>
                            {s.note && (
                              <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">{s.note}</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
