"use client"

import { useMemo, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import {
  AD_PLATFORMS,
  type AdCampaignRow,
  type AdPlatformSlug,
  type CampaignInput,
  type CampaignStatus,
} from "@/lib/marketing"
import { createCampaign, updateCampaign, setCampaignStatus, deleteCampaign } from "@/app/actions/admin-marketing"
import { ExternalLink, Copy, Check, Plus, Pencil, Trash2, Megaphone, Film, Download } from "lucide-react"

const STATUS_STYLES: Record<CampaignStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  paused: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  ended: "bg-muted text-muted-foreground line-through",
}
const STATUSES: CampaignStatus[] = ["draft", "active", "paused", "ended"]

function platformLabel(slug: AdPlatformSlug) {
  return AD_PLATFORMS.find((p) => p.slug === slug)?.label ?? slug
}

function formatBudget(minor: number, currency: string) {
  if (!minor) return "—"
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100)
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`
  }
}

export function MarketingHub({
  initialCampaigns,
  siteUrl,
}: {
  initialCampaigns: AdCampaignRow[]
  siteUrl: string
}) {
  const [campaigns, setCampaigns] = useState(initialCampaigns)
  const [editing, setEditing] = useState<AdCampaignRow | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [prefillUtm, setPrefillUtm] = useState<{ url: string; campaign: string } | null>(null)

  function openNew(prefill?: { url: string; campaign: string }) {
    setEditing(null)
    setPrefillUtm(prefill ?? null)
    setShowForm(true)
  }
  function openEdit(c: AdCampaignRow) {
    setEditing(c)
    setPrefillUtm(null)
    setShowForm(true)
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PromoKitSection />
      <AdManagersSection />
      <UtmBuilder siteUrl={siteUrl} onUse={(url, campaign) => openNew({ url, campaign })} />
      <CampaignTracker
        campaigns={campaigns}
        setCampaigns={setCampaigns}
        onNew={() => openNew()}
        onEdit={openEdit}
      />
      {showForm && (
        <CampaignForm
          key={editing?.id ?? "new"}
          editing={editing}
          prefillUtm={prefillUtm}
          onClose={() => setShowForm(false)}
          onSaved={(row, isNew) => {
            setCampaigns((prev) => (isNew ? [row, ...prev] : prev.map((c) => (c.id === row.id ? row : c))))
            setShowForm(false)
          }}
        />
      )}
    </div>
  )
}

// ---- Promo advert kit ------------------------------------------------------

function PromoKitSection() {
  return (
    <section aria-labelledby="promo-kit-h" className="rounded-xl border border-border bg-card p-4">
      <div className="mb-1 flex items-center gap-2">
        <Film className="size-4 text-muted-foreground" aria-hidden />
        <h2 id="promo-kit-h" className="text-sm font-semibold text-foreground">
          Promo advert kit
        </h2>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Four AI-generated b-roll clips (~8s each, silent 16:9) plus the voiceover script and CapCut assembly notes. Cut
        them together for a 20–30 second advert to run in the campaigns below.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <a
          href="/promo"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Film className="size-4 shrink-0" aria-hidden />
          Preview clips &amp; script
          <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </a>
        <a
          href="/promo/download"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Download className="size-4 shrink-0" aria-hidden />
          Download kit (.zip)
        </a>
      </div>
    </section>
  )
}

// ---- Ad-manager deep links -------------------------------------------------

function AdManagersSection() {
  return (
    <section aria-labelledby="ad-managers-h" className="rounded-xl border border-border bg-card p-4">
      <div className="mb-1 flex items-center gap-2">
        <Megaphone className="size-4 text-muted-foreground" aria-hidden />
        <h2 id="ad-managers-h" className="text-sm font-semibold text-foreground">
          Platform ad managers
        </h2>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        StayKnit can&apos;t buy ads programmatically — each platform gates that behind its own approval. These open the
        native Ads Manager where you create and launch the actual ad. Tag every ad&apos;s destination with a UTM link
        below so signups are attributed back here.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {AD_PLATFORMS.map((p) => (
          <a
            key={p.slug}
            href={p.adManagerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            {p.label}
            <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          </a>
        ))}
      </div>
    </section>
  )
}

// ---- UTM link builder ------------------------------------------------------

function UtmBuilder({ siteUrl, onUse }: { siteUrl: string; onUse: (url: string, campaign: string) => void }) {
  const [base, setBase] = useState(siteUrl)
  const [source, setSource] = useState<AdPlatformSlug | "">("")
  const [medium, setMedium] = useState("paid_social")
  const [campaign, setCampaign] = useState("")
  const [term, setTerm] = useState("")
  const [content, setContent] = useState("")
  const [copied, setCopied] = useState(false)

  const url = useMemo(() => {
    if (!base.trim()) return ""
    let normalizedBase = base.trim()
    if (!/^https?:\/\//i.test(normalizedBase)) normalizedBase = `https://${normalizedBase}`
    let u: URL
    try {
      u = new URL(normalizedBase)
    } catch {
      return ""
    }
    const params: [string, string][] = [
      ["utm_source", source],
      ["utm_medium", medium.trim()],
      ["utm_campaign", campaign.trim()],
      ["utm_term", term.trim()],
      ["utm_content", content.trim()],
    ]
    for (const [k, v] of params) if (v) u.searchParams.set(k, v)
    return u.toString()
  }, [base, source, medium, campaign, term, content])

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked; the field is selectable as a fallback */
    }
  }

  const field = "rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
  const label = "mb-1 block text-xs font-medium text-foreground"

  return (
    <section aria-labelledby="utm-h" className="rounded-xl border border-border bg-card p-4">
      <h2 id="utm-h" className="mb-1 text-sm font-semibold text-foreground">
        UTM link builder
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Build one trackable link per platform so your analytics show which ad drove each signup.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-3">
          <label htmlFor="utm-base" className={label}>
            Destination URL
          </label>
          <input id="utm-base" className={`${field} w-full`} value={base} onChange={(e) => setBase(e.target.value)} />
        </div>
        <div>
          <label htmlFor="utm-source" className={label}>
            Source (platform)
          </label>
          <select
            id="utm-source"
            className={`${field} w-full`}
            value={source}
            onChange={(e) => setSource(e.target.value as AdPlatformSlug | "")}
          >
            <option value="">Select…</option>
            {AD_PLATFORMS.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="utm-medium" className={label}>
            Medium
          </label>
          <input id="utm-medium" className={`${field} w-full`} value={medium} onChange={(e) => setMedium(e.target.value)} />
        </div>
        <div>
          <label htmlFor="utm-campaign" className={label}>
            Campaign
          </label>
          <input
            id="utm-campaign"
            className={`${field} w-full`}
            placeholder="spring_launch"
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="utm-term" className={label}>
            Term (optional)
          </label>
          <input id="utm-term" className={`${field} w-full`} value={term} onChange={(e) => setTerm(e.target.value)} />
        </div>
        <div>
          <label htmlFor="utm-content" className={label}>
            Content (optional)
          </label>
          <input
            id="utm-content"
            className={`${field} w-full`}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <code className="flex-1 truncate rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground">
          {url || "Fill in a destination URL to generate a link"}
        </code>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={copy} disabled={!url}>
            {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            <span className="ml-1">{copied ? "Copied" : "Copy"}</span>
          </Button>
          <Button type="button" size="sm" onClick={() => onUse(url, campaign.trim())} disabled={!url}>
            <Plus className="size-3.5" aria-hidden />
            <span className="ml-1">New campaign</span>
          </Button>
        </div>
      </div>
    </section>
  )
}

// ---- Campaign tracker ------------------------------------------------------

function CampaignTracker({
  campaigns,
  setCampaigns,
  onNew,
  onEdit,
}: {
  campaigns: AdCampaignRow[]
  setCampaigns: React.Dispatch<React.SetStateAction<AdCampaignRow[]>>
  onNew: () => void
  onEdit: (c: AdCampaignRow) => void
}) {
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<number | null>(null)

  function changeStatus(id: number, status: CampaignStatus) {
    setBusyId(id)
    startTransition(async () => {
      const res = await setCampaignStatus(id, status)
      if (res.ok) setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)))
      setBusyId(null)
    })
  }

  function remove(id: number) {
    if (!confirm("Delete this campaign? This only removes the tracking record, not any live ad.")) return
    setBusyId(id)
    startTransition(async () => {
      const res = await deleteCampaign(id)
      if (res.ok) setCampaigns((prev) => prev.filter((c) => c.id !== id))
      setBusyId(null)
    })
  }

  return (
    <section aria-labelledby="tracker-h" className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="tracker-h" className="text-sm font-semibold text-foreground">
          Campaigns
        </h2>
        <Button type="button" size="sm" onClick={onNew}>
          <Plus className="size-3.5" aria-hidden />
          <span className="ml-1">Add campaign</span>
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No campaigns yet. Build a UTM link above, then add your first campaign.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {campaigns.map((c) => (
            <li key={c.id} className="rounded-lg border border-border bg-surface-2 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{c.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[c.status]}`}>
                      {c.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {c.platforms.length ? c.platforms.map(platformLabel).join(" · ") : "No platforms"}
                    {c.objective ? ` — ${c.objective}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Budget {formatBudget(c.budgetMinor, c.currency)}
                    {c.startDate ? ` · ${c.startDate}` : ""}
                    {c.endDate ? ` → ${c.endDate}` : ""}
                  </p>
                  {c.utmUrl && (
                    <a
                      href={c.utmUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs text-primary hover:underline"
                    >
                      <span className="truncate">{c.utmUrl}</span>
                      <ExternalLink className="size-3 shrink-0" aria-hidden />
                    </a>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <select
                    aria-label={`Status for ${c.name}`}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    value={c.status}
                    disabled={pending && busyId === c.id}
                    onChange={(e) => changeStatus(c.id, e.target.value as CampaignStatus)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${c.name}`}
                    onClick={() => onEdit(c)}
                  >
                    <Pencil className="size-3.5" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${c.name}`}
                    disabled={pending && busyId === c.id}
                    onClick={() => remove(c.id)}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>
              </div>
              {c.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{c.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ---- Create / edit form ----------------------------------------------------

function CampaignForm({
  editing,
  prefillUtm,
  onClose,
  onSaved,
}: {
  editing: AdCampaignRow | null
  prefillUtm: { url: string; campaign: string } | null
  onClose: () => void
  onSaved: (row: AdCampaignRow, isNew: boolean) => void
}) {
  const [name, setName] = useState(editing?.name ?? prefillUtm?.campaign ?? "")
  const [platforms, setPlatforms] = useState<AdPlatformSlug[]>(editing?.platforms ?? [])
  const [objective, setObjective] = useState(editing?.objective ?? "")
  const [status, setStatus] = useState<CampaignStatus>(editing?.status ?? "draft")
  const [budget, setBudget] = useState(editing ? (editing.budgetMinor / 100).toString() : "")
  const [currency, setCurrency] = useState(editing?.currency ?? "ZAR")
  const [startDate, setStartDate] = useState(editing?.startDate ?? "")
  const [endDate, setEndDate] = useState(editing?.endDate ?? "")
  const [destinationUrl, setDestinationUrl] = useState(editing?.destinationUrl ?? "")
  const [utmUrl, setUtmUrl] = useState(editing?.utmUrl ?? prefillUtm?.url ?? "")
  const [notes, setNotes] = useState(editing?.notes ?? "")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function togglePlatform(slug: AdPlatformSlug) {
    setPlatforms((prev) => (prev.includes(slug) ? prev.filter((p) => p !== slug) : [...prev, slug]))
  }

  function submit() {
    setError(null)
    const budgetNum = parseFloat(budget)
    const input: CampaignInput = {
      name,
      platforms,
      objective,
      status,
      budgetMinor: Number.isFinite(budgetNum) ? Math.round(budgetNum * 100) : 0,
      currency,
      startDate: startDate || null,
      endDate: endDate || null,
      destinationUrl,
      utmUrl,
      notes,
    }
    startTransition(async () => {
      const res = editing ? await updateCampaign(editing.id, input) : await createCampaign(input)
      if (!res.ok) {
        setError(res.error)
        return
      }
      onSaved(
        {
          id: res.id,
          name: name.trim(),
          platforms,
          objective: objective.trim(),
          status,
          budgetMinor: input.budgetMinor ?? 0,
          currency: currency.toUpperCase(),
          startDate: startDate || null,
          endDate: endDate || null,
          destinationUrl: destinationUrl.trim(),
          utmUrl: utmUrl.trim(),
          notes: notes.trim(),
          createdAt: editing?.createdAt ?? new Date().toISOString(),
        },
        !editing,
      )
    })
  }

  const field =
    "rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
  const label = "mb-1 block text-xs font-medium text-foreground"

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editing ? "Edit campaign" : "New campaign"}
      onClick={onClose}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-y-auto rounded-t-2xl bg-card p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-base font-semibold text-foreground">{editing ? "Edit campaign" : "New campaign"}</h2>
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="f-name" className={label}>
              Campaign name
            </label>
            <input id="f-name" className={`${field} w-full`} value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <span className={label}>Platforms</span>
            <div className="flex flex-wrap gap-1.5">
              {AD_PLATFORMS.map((p) => {
                const on = platforms.includes(p.slug)
                return (
                  <button
                    key={p.slug}
                    type="button"
                    onClick={() => togglePlatform(p.slug)}
                    aria-pressed={on}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-surface-2 text-foreground hover:bg-muted"
                    }`}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="f-objective" className={label}>
                Objective
              </label>
              <input
                id="f-objective"
                className={`${field} w-full`}
                placeholder="Signups"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="f-status" className={label}>
                Status
              </label>
              <select
                id="f-status"
                className={`${field} w-full`}
                value={status}
                onChange={(e) => setStatus(e.target.value as CampaignStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label htmlFor="f-budget" className={label}>
                Total budget
              </label>
              <input
                id="f-budget"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                className={`${field} w-full`}
                placeholder="0.00"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="f-currency" className={label}>
                Currency
              </label>
              <input
                id="f-currency"
                className={`${field} w-full`}
                maxLength={3}
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="f-start" className={label}>
                Start date
              </label>
              <input
                id="f-start"
                type="date"
                className={`${field} w-full`}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="f-end" className={label}>
                End date
              </label>
              <input
                id="f-end"
                type="date"
                className={`${field} w-full`}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="f-dest" className={label}>
              Destination URL
            </label>
            <input
              id="f-dest"
              className={`${field} w-full`}
              placeholder="https://stayknit.org"
              value={destinationUrl}
              onChange={(e) => setDestinationUrl(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="f-utm" className={label}>
              UTM tracking link
            </label>
            <input
              id="f-utm"
              className={`${field} w-full`}
              placeholder="https://stayknit.org/?utm_source=…"
              value={utmUrl}
              onChange={(e) => setUtmUrl(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="f-notes" className={label}>
              Notes
            </label>
            <textarea
              id="f-notes"
              rows={3}
              className={`${field} w-full resize-y`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "Saving…" : editing ? "Save changes" : "Create campaign"}
          </Button>
        </div>
      </div>
    </div>
  )
}
