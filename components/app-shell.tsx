'use client'

import { deleteProfile, exportMyData, restoreMyData, saveSettings, sendReferral } from '@/app/actions/stayknit'
import {
  applyTheme,
  DEFAULT_THEME,
  readStoredTheme,
  storeTheme,
  THEME_HINTS,
  THEME_LABELS,
  THEME_MODES,
  THEME_SWATCH,
  type ThemeMode,
} from '@/lib/theme'
import { authClient } from '@/lib/auth-client'
import { purgeAppCaches } from '@/lib/pwa-cache'
import { SupportForm } from '@/components/support-sheet'
import { FeedbackButton } from '@/components/feedback-button'
import { HelpManual } from '@/components/help-manual'
import { WhoWeAre } from '@/components/who-we-are'
import { SecurityQuestionsCard } from '@/components/security-questions-card'
import { TwoFactorCard } from '@/components/two-factor-card'
import { ActiveSessionsCard } from '@/components/active-sessions-card'
import { AccountDetailsCard } from '@/components/account-details-card'
import { Wordmark } from '@/components/wordmark'
import type { UserSettings } from '@/lib/types'
import { CURRENCY_LABELS } from '@/lib/currency'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import {
  Check,
  Download,
  FileText,
  HelpCircle,
  LogOut,
  Palette,
  Pencil,
  Send,
  Settings,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide-react'
import Link from 'next/link'

export type TabDef = {
  key: string
  label: string
  icon: ReactNode
}

// The real current date, formatted for the shell header. Computed per render so
// it never drifts a day behind across a midnight boundary.
function todayLabel(): string {
  return new Date()
    .toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Africa/Johannesburg',
    })
    .toUpperCase()
}

export function AppShell({
  user,
  roleLabel,
  tabs,
  active,
  onSelect,
  children,
  settings,
  view,
  onSwitchView,
  showViewSwitch = true,
}: {
  user: { name: string; email: string }
  roleLabel: string
  tabs: TabDef[]
  active: string
  onSelect: (key: string) => void
  children: ReactNode
  settings?: UserSettings
  view?: 'host' | 'owner'
  onSwitchView?: (v: 'host' | 'owner') => void
  showViewSwitch?: boolean
}) {
  const router = useRouter()
  const [sheet, setSheet] = useState<null | 'settings' | 'help'>(null)
  const activeTab = tabs.find((t) => t.key === active)

  async function signOut() {
    await authClient.signOut()
    await purgeAppCaches()
    router.push('/sign-in')
    router.refresh()
  }

  return (
    <div className="flex min-h-dvh justify-center bg-background lg:justify-start">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-panel lg:flex">
        <div className="flex items-center gap-2.5 border-b border-border px-6 py-5">
          <Wordmark />
          <span className="mono-label rounded bg-primary px-2 py-1 text-[9px] text-primary-foreground">
            {roleLabel}
          </span>
        </div>

        {view && onSwitchView && showViewSwitch && (
          <div className="border-b border-border px-3 py-3">
            <ViewSwitch view={view} onSwitchView={onSwitchView} />
          </div>
        )}

        <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
          {tabs.map((t) => {
            const on = t.key === active
            return (
              <button
                key={t.key}
                onClick={() => onSelect(t.key)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  on
                    ? 'bg-primary-dim text-primary'
                    : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                }`}
              >
                <span className={on ? 'text-primary' : ''}>{t.icon}</span>
                {t.label}
              </button>
            )
          })}
        </nav>

        <div className="border-t border-border px-3 py-4">
          <p className="mono-label px-3 pb-2 text-[9px] text-muted-foreground">{todayLabel()}</p>
          <div className="mb-3 rounded-lg bg-surface-2 px-3 py-2.5">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
          </div>
          <SidebarAction icon={<Settings size={15} />} label="Settings" onClick={() => setSheet('settings')} />
          <SidebarAction icon={<HelpCircle size={15} />} label="Help & support" onClick={() => setSheet('help')} />
          <SidebarAction icon={<LogOut size={15} />} label="Sign out" onClick={signOut} />
        </div>
      </aside>

      {/* Main column: phone frame on mobile, fluid dashboard on desktop */}
      <div className="relative flex min-h-dvh w-full max-w-md flex-col border-x border-border bg-panel lg:max-w-none lg:border-x-0 lg:bg-background">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between gap-2 border-b border-border px-5 py-3.5 lg:hidden">
          <div className="flex items-center gap-2.5">
            <Wordmark size={28} />
            <span className="mono-label rounded bg-primary px-2 py-1 text-[9px] text-primary-foreground">
              {roleLabel}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSheet('settings')}
              className="mono-label rounded border border-border px-2.5 py-1.5 text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              Settings
            </button>
            <button
              onClick={signOut}
              className="mono-label rounded border border-border px-2.5 py-1.5 text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              Sign out
            </button>
          </div>
        </header>

        {view && onSwitchView && showViewSwitch && (
          <div className="px-5 pt-3 lg:hidden">
            <ViewSwitch view={view} onSwitchView={onSwitchView} />
          </div>
        )}

        {/* Mobile date + help row */}
        <div className="flex items-center justify-between px-5 pb-1 pt-3 lg:hidden">
          <span className="mono-label text-[11px] text-muted-foreground">{todayLabel()}</span>
          <button
            onClick={() => setSheet('help')}
            className="mono-label rounded border border-border px-2.5 py-1.5 text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            Help
          </button>
        </div>

        {/* Desktop header */}
        <header className="hidden items-center justify-between border-b border-border px-8 py-5 lg:flex">
          <div className="flex items-center gap-3">
            <span className="text-primary">{activeTab?.icon}</span>
            <h1 className="font-sans text-lg font-bold">{activeTab?.label}</h1>
          </div>
          <span className="mono-label text-[11px] text-muted-foreground">{todayLabel()}</span>
        </header>

        {/* Scrollable content */}
        <main className="app-scroll flex-1 overflow-y-auto pb-24 lg:pb-10">{children}</main>

        {/* Mobile bottom nav */}
        <nav className="absolute inset-x-0 bottom-0 z-10 flex border-t border-border bg-panel/95 backdrop-blur lg:hidden">
          {tabs.map((t) => {
            const on = t.key === active
            return (
              <button
                key={t.key}
                onClick={() => onSelect(t.key)}
                className={`flex flex-1 flex-col items-center gap-1 py-3 transition-colors ${
                  on ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className={on ? 'opacity-100' : 'opacity-80'}>{t.icon}</span>
                <span className="mono-label text-[9px]">{t.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Floating feedback entry point — on every authed screen, scoped to
            this relative column so its overlay behaves like the sheet above. */}
        <FeedbackButton />

        {sheet && (
          <Sheet title={sheet === 'settings' ? 'Settings' : 'Help & support'} onClose={() => setSheet(null)}>
            {sheet === 'settings' ? (
            <SettingsPanel user={user} settings={settings} />
          ) : (
            <HelpPanel role={roleLabel.toLowerCase() === 'owner' ? 'owner' : 'host'} />
          )}
          </Sheet>
        )}
      </div>
    </div>
  )
}

// Segmented control letting a single account switch between the Host and
// Owner portals. Both views share the same underlying data.
function ViewSwitch({ view, onSwitchView }: { view: 'host' | 'owner'; onSwitchView: (v: 'host' | 'owner') => void }) {
  const opts: { key: 'host' | 'owner'; label: string }[] = [
    { key: 'host', label: 'Host' },
    { key: 'owner', label: 'Owner' },
  ]
  return (
    <div>
      <p className="mono-label mb-1.5 px-1 text-[8px] text-muted-foreground">Viewing as</p>
      <div className="flex gap-1 rounded-lg border border-border bg-surface-2 p-1">
        {opts.map((o) => {
          const on = o.key === view
          return (
            <button
              key={o.key}
              onClick={() => onSwitchView(o.key)}
              aria-pressed={on}
              className={`mono-label flex-1 rounded-md px-2 py-1.5 text-[10px] transition-colors ${
                on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SidebarAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
    >
      {icon}
      {label}
    </button>
  )
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-30 flex flex-col justify-end lg:items-center lg:justify-center lg:p-6">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div className="animate-slidein relative max-h-[85%] overflow-y-auto rounded-t-2xl border-t border-border bg-surface lg:w-full lg:max-w-lg lg:rounded-2xl lg:border">
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-surface px-5 py-4">
          <h2 className="font-sans text-lg font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="mono-label rounded border border-border px-2.5 py-1.5 text-[10px] text-muted-foreground hover:border-primary hover:text-primary"
          >
            Done
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

const NOTIF = [
  { group: 'Push', k: 'pushNew', t: 'New booking', s: 'The moment any site confirms' },
  { group: 'Push', k: 'pushClash', t: 'Sync failure or clash', s: 'A channel did not take the block' },
  { group: 'Push', k: 'pushCheckin', t: 'Check-ins today', s: 'Morning list, 07:00' },
  { group: 'Email', k: 'mailDaily', t: 'Daily summary', s: 'Arrivals, departures, open dates' },
  { group: 'Email', k: 'mailStatement', t: 'Monthly statements', s: 'Owner payouts on the 1st' },
] as const

const CURRENCIES = CURRENCY_LABELS
const TIMEZONES = ['Africa/Johannesburg', 'Africa/Windhoek', 'Europe/London', 'Europe/Berlin', 'UTC']
const SYNC_OPTIONS = [15, 30, 60, 180]

type SettingsForm = {
  pushNew: boolean
  pushClash: boolean
  pushCheckin: boolean
  mailDaily: boolean
  mailStatement: boolean
  autoAccept: boolean
  syncMinutes: number
  currency: string
  timezone: string
  businessName: string
  businessEmail: string
  businessPhone: string
}

const DEFAULTS: SettingsForm = {
  pushNew: true,
  pushClash: true,
  pushCheckin: true,
  mailDaily: false,
  mailStatement: true,
  autoAccept: false,
  syncMinutes: 15,
  currency: CURRENCIES[0],
  timezone: TIMEZONES[0],
  businessName: '',
  businessEmail: '',
  businessPhone: '',
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-border'}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition-all ${on ? 'left-[18px]' : 'left-0.5'}`}
      />
    </button>
  )
}

function SettingsPanel({
  user,
  settings,
}: {
  user: { name: string; email: string }
  settings?: UserSettings
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [form, setForm] = useState<SettingsForm>(() =>
    settings
      ? {
          pushNew: settings.pushNew,
          pushClash: settings.pushClash,
          pushCheckin: settings.pushCheckin,
          mailDaily: settings.mailDaily,
          mailStatement: settings.mailStatement,
          autoAccept: settings.autoAccept,
          syncMinutes: settings.syncMinutes,
          currency: settings.currency,
          timezone: settings.timezone,
          businessName: settings.businessName,
          businessEmail: settings.businessEmail,
          businessPhone: settings.businessPhone,
        }
      : DEFAULTS,
  )
  const [editingAccount, setEditingAccount] = useState(false)

  // Permanent profile deletion — confirm, wipe all data, then sign out.
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  async function removeProfile() {
    setDeleting(true)
    try {
      await deleteProfile()
      await authClient.signOut()
      await purgeAppCaches()
      router.push('/sign-in')
      router.refresh()
    } catch {
      setDeleting(false)
    }
  }

  // Self-service data export (report #13) — downloads a JSON of the account,
  // which doubles as the account backup file.
  const [exporting, setExporting] = useState(false)
  async function downloadMyData() {
    setExporting(true)
    try {
      const data = await exportMyData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `stayknit-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  // Restore from a backup file. The chosen file is parsed client-side, then a
  // confirm step gates the destructive replace before the server action runs.
  const restoreInputRef = useRef<HTMLInputElement>(null)
  const [restoreStage, setRestoreStage] = useState<'idle' | 'confirm' | 'working' | 'done' | 'error'>('idle')
  const [restoreFileName, setRestoreFileName] = useState('')
  const [restoreError, setRestoreError] = useState('')
  const [restorePayload, setRestorePayload] = useState<unknown>(null)

  function pickRestoreFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset so choosing the same file again re-triggers change.
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        setRestorePayload(parsed)
        setRestoreFileName(file.name)
        setRestoreError('')
        setRestoreStage('confirm')
      } catch {
        setRestoreError('That file is not valid JSON.')
        setRestoreStage('error')
      }
    }
    reader.onerror = () => {
      setRestoreError('Could not read that file.')
      setRestoreStage('error')
    }
    reader.readAsText(file)
  }

  async function confirmRestore() {
    setRestoreStage('working')
    try {
      const res = await restoreMyData(restorePayload)
      if (res.ok) {
        setRestoreStage('done')
        setRestorePayload(null)
        router.refresh()
      } else {
        setRestoreError(res.error ?? 'Restore failed.')
        setRestoreStage('error')
      }
    } catch {
      setRestoreError('Restore failed — your existing data was left unchanged.')
      setRestoreStage('error')
    }
  }

  function resetRestore() {
    setRestoreStage('idle')
    setRestoreError('')
    setRestorePayload(null)
    setRestoreFileName('')
  }

  // Referral
  const [inviteEmail, setInviteEmail] = useState('')
  const [referralCode, setReferralCode] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  // Persist the whole form after every change — settings are server-backed.
  function persist(patch: Partial<SettingsForm>) {
    const next = { ...form, ...patch }
    setForm(next)
    startTransition(() => {
      void saveSettings(next)
    })
  }

  function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    const email = inviteEmail.trim()
    if (!email || !email.includes('@')) return
    setSending(true)
    startTransition(async () => {
      const code = await sendReferral(email)
      setReferralCode(code)
      setInviteEmail('')
      setSending(false)
    })
  }

  const fieldClass =
    'w-full rounded-lg border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-primary'
  const groups = ['Push', 'Email'] as const

  // Owners get a minimal panel — no host-only notification, sync, or billing
  // controls — but still get their own appearance preference.
  if (!settings) {
    return (
      <div className="flex flex-col gap-6">
        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <p className="mono-label text-[9px] text-muted-foreground">Signed in as</p>
          <p className="mt-1 font-semibold">{user.name}</p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        <AppearanceCard />
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          You have a read-only owner view of your own units. Your host manages sync, statements, and billing.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Editable account details — changes require password confirmation, and
          email changes go through a confirmation link (see AccountDetailsCard). */}
      <AccountDetailsCard />

      {groups.map((g) => (
        <div key={g}>
          <p className="mono-label mb-2 text-[9px] text-muted-foreground">{g} notifications</p>
          <div className="flex flex-col gap-1.5">
            {NOTIF.filter((n) => n.group === g).map((n) => (
              <div
                key={n.k}
                className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-4 py-3 text-left"
              >
                <span>
                  <span className="block text-sm font-medium">{n.t}</span>
                  <span className="block text-[12px] text-muted-foreground">{n.s}</span>
                </span>
                <Toggle on={form[n.k]} onClick={() => persist({ [n.k]: !form[n.k] } as Partial<SettingsForm>)} />
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Sync */}
      <div>
        <p className="mono-label mb-2 text-[9px] text-muted-foreground">Sync</p>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-4 py-3">
            <span>
              <span className="block text-sm font-medium">Auto-accept new bookings</span>
              <span className="block text-[12px] text-muted-foreground">
                {form.autoAccept ? 'Confirmed automatically' : 'Ask before confirming'}
              </span>
            </span>
            <Toggle on={form.autoAccept} onClick={() => persist({ autoAccept: !form.autoAccept })} />
          </div>
          <label className="block rounded-lg border border-border bg-surface-2 px-4 py-3">
            <span className="mono-label mb-1.5 block text-[9px] text-muted-foreground">Sync frequency</span>
            <select
              value={form.syncMinutes}
              onChange={(e) => persist({ syncMinutes: Number(e.target.value) })}
              className={fieldClass}
            >
              {SYNC_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `Every ${m} minutes` : `Every ${m / 60} hour${m > 60 ? 's' : ''}`}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Security */}
      <div>
        <p className="mono-label mb-2 text-[9px] text-muted-foreground">Security</p>
        <TwoFactorCard />
        <SecurityQuestionsCard />
        <ActiveSessionsCard />
      </div>

      {/* Host details on statements */}
      <div>
        <p className="mono-label mb-2 text-[9px] text-muted-foreground">Host details on statements</p>
        <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-surface-2 p-4">
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Printed at the top of every owner statement. Leave the business name blank to use your own name (
            {user.name}).
          </p>
          <label className="block">
            <span className="mono-label mb-1.5 block text-[9px] text-muted-foreground">Business / agency name</span>
            <input
              value={form.businessName}
              onChange={(e) => persist({ businessName: e.target.value })}
              placeholder="e.g. Blue Bay Property Management"
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className="mono-label mb-1.5 block text-[9px] text-muted-foreground">Contact email</span>
            <input
              type="email"
              value={form.businessEmail}
              onChange={(e) => persist({ businessEmail: e.target.value })}
              placeholder={user.email}
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className="mono-label mb-1.5 block text-[9px] text-muted-foreground">Contact phone</span>
            <input
              type="tel"
              value={form.businessPhone}
              onChange={(e) => persist({ businessPhone: e.target.value })}
              placeholder="e.g. +27 82 123 4567"
              className={fieldClass}
            />
          </label>
        </div>
      </div>

      {/* Invite a friend */}
      <div>
        <p className="mono-label mb-2 text-[9px] text-muted-foreground">Invite a friend</p>
        <form onSubmit={sendInvite} className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-4">
          <p className="text-[12px] leading-relaxed text-muted-foreground">
              Invite another host to StayKnit.
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => {
                setInviteEmail(e.target.value)
                setReferralCode(null)
              }}
              placeholder="friend@email.com"
              className={fieldClass}
            />
            <button
              type="submit"
              disabled={sending}
              className="mono-label flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[10px] text-primary-foreground disabled:opacity-60"
            >
              <Send size={13} /> Send
            </button>
          </div>
          {referralCode && (
            <p className="mono-label flex items-center gap-1.5 text-[10px] text-primary">
              <Check size={12} /> Invite sent · code {referralCode}
            </p>
          )}
        </form>
      </div>

      {/* Account & access */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="mono-label text-[9px] text-muted-foreground">Account & access</p>
          <button
            onClick={() => {
              if (editingAccount) {
                // Currency and timezone drive server-rendered money and the Plan
                // page, so refresh to apply them app-wide. (They already persist
                // immediately via persist(); this just re-renders with them.)
                startTransition(() => router.refresh())
              }
              setEditingAccount((v) => !v)
            }}
            className="mono-label flex items-center gap-1.5 rounded border border-border px-2.5 py-1 text-[10px] text-primary transition-colors hover:border-primary"
          >
            {editingAccount ? <Check size={12} /> : <Pencil size={12} />}
            {editingAccount ? 'Done' : 'Edit'}
          </button>
        </div>

        {editingAccount ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-4">
            <label className="block">
              <span className="mono-label mb-1.5 block text-[9px] text-muted-foreground">Currency</span>
              <select value={form.currency} onChange={(e) => persist({ currency: e.target.value })} className={fieldClass}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mono-label mb-1.5 block text-[9px] text-muted-foreground">Time zone</span>
              <select value={form.timezone} onChange={(e) => persist({ timezone: e.target.value })} className={fieldClass}>
                {TIMEZONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <AccountRow label="Currency" value={form.currency} />
            <AccountRow label="Time zone" value={form.timezone} />
          </div>
        )}
      </div>

      {/* Backup & restore — self-service export (report #13) plus restore */}
      <div>
        <p className="mono-label mb-2 text-[9px] text-muted-foreground">Backup &amp; restore</p>
        <div className="flex flex-col gap-2.5">
          {/* Backup / export */}
          <div className="rounded-lg border border-border bg-surface-2 p-4">
            <p className="text-[13px] font-semibold text-foreground">Back up your data</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              Download everything in your account — properties, channels, bookings, owners, statements, and settings —
              as a single JSON file. Keep it somewhere safe; it&apos;s also your restore point.
            </p>
            <button
              onClick={downloadMyData}
              disabled={exporting}
              className="mono-label mt-3 flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-2 text-[9px] text-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
            >
              <Download size={12} /> {exporting ? 'Preparing…' : 'Download backup'}
            </button>
          </div>

          {/* Restore */}
          <div className="rounded-lg border border-border bg-surface-2 p-4">
            <p className="text-[13px] font-semibold text-foreground">Restore from a backup</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              Replace your properties, channels, bookings, owners, cost lines and settings with those from a backup
              file. Your login, billing and support history are left untouched.
            </p>

            <input
              ref={restoreInputRef}
              type="file"
              accept="application/json,.json"
              onChange={pickRestoreFile}
              className="hidden"
            />

            {restoreStage === 'confirm' ? (
              <div className="mt-3 flex flex-col gap-2.5 rounded-lg border border-warning/50 bg-warning/10 px-3 py-3">
                <p className="flex items-start gap-1.5 text-[12px] text-foreground">
                  <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" />
                  Restoring <span className="font-semibold">{restoreFileName}</span> overwrites your current
                  properties, channels, bookings, owners and cost lines. This can&apos;t be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={confirmRestore}
                    className="mono-label flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary py-2 text-[9px] text-primary-foreground"
                  >
                    <Upload size={12} /> Restore now
                  </button>
                  <button
                    onClick={resetRestore}
                    className="mono-label rounded-md border border-border px-3 py-2 text-[9px] text-muted-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : restoreStage === 'working' ? (
              <p className="mono-label mt-3 text-[10px] text-muted-foreground">Restoring…</p>
            ) : restoreStage === 'done' ? (
              <p className="mono-label mt-3 flex items-center gap-1.5 text-[10px] text-primary">
                <Check size={12} /> Backup restored
              </p>
            ) : (
              <button
                onClick={() => restoreInputRef.current?.click()}
                className="mono-label mt-3 flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-2 text-[9px] text-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <Upload size={12} /> Choose backup file
              </button>
            )}

            {restoreStage === 'error' && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-danger">
                <TriangleAlert size={12} /> {restoreError}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Legal links — authenticated-app entry point (report #11) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4">
        <Link
          href="/terms"
          className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:underline"
        >
          <FileText size={13} /> Terms of Service
        </Link>
        <Link href="/privacy" className="text-[12px] text-muted-foreground hover:text-foreground hover:underline">
          Privacy Policy
        </Link>
        <Link href="/cookie-policy" className="text-[12px] text-muted-foreground hover:text-foreground hover:underline">
          Cookie Policy
        </Link>
      </div>

      {/* Danger zone — permanent profile deletion */}
      <div>
        <p className="mono-label mb-2 text-[9px] text-danger">Danger zone</p>
        <div className="rounded-lg border border-danger/40 bg-danger/5 p-4">
          <p className="text-[13px] font-semibold text-foreground">Delete profile</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Permanently erase your account and all data — channels, bookings, owners, statements, and settings. This
            cannot be undone. Profiles inactive for 12 months are deleted automatically.
          </p>
          {confirmDelete ? (
            <div className="mt-3 flex flex-col gap-2.5 rounded-lg border border-danger/50 bg-danger/10 px-3 py-3">
              <p className="flex items-start gap-1.5 text-[12px] text-foreground">
                <TriangleAlert size={14} className="mt-0.5 shrink-0 text-danger" />
                This permanently deletes your profile and every record tied to it. There is no recovery.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={removeProfile}
                  disabled={deleting}
                  className="mono-label flex flex-1 items-center justify-center gap-1.5 rounded-md bg-danger py-2 text-[9px] text-white disabled:opacity-60"
                >
                  <Trash2 size={12} /> {deleting ? 'Deleting…' : 'Delete permanently'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="mono-label rounded-md border border-border px-3 py-2 text-[9px] text-muted-foreground disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="mono-label mt-3 flex items-center gap-1.5 rounded-md border border-danger/50 px-3 py-2 text-[9px] text-danger transition-colors hover:bg-danger/10"
            >
              <Trash2 size={12} /> Delete my profile
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Color-mode picker. The preference is client-only (localStorage + <html
// data-theme>), so we sync from storage after mount to match what the
// beforeInteractive init script already applied, avoiding a hydration mismatch.
function AppearanceCard() {
  const [theme, setTheme] = useState<ThemeMode>(DEFAULT_THEME)

  useEffect(() => {
    setTheme(readStoredTheme())
  }, [])

  function choose(mode: ThemeMode) {
    setTheme(mode)
    applyTheme(mode)
    storeTheme(mode)
  }

  return (
    <div>
      <p className="mono-label mb-2 flex items-center gap-1.5 text-[9px] text-muted-foreground">
        <Palette size={12} /> Appearance
      </p>
      <div className="grid grid-cols-2 gap-2">
        {THEME_MODES.map((mode) => {
          const on = theme === mode
          const sw = THEME_SWATCH[mode]
          return (
            <button
              key={mode}
              onClick={() => choose(mode)}
              aria-pressed={on}
              className={`flex flex-col gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                on ? 'border-primary bg-primary-dim' : 'border-border bg-surface-2 hover:border-border-strong'
              }`}
            >
              <span
                className="flex h-9 items-center gap-1.5 rounded-md border px-2"
                style={{ backgroundColor: sw.bg, borderColor: on ? sw.primary : 'transparent' }}
              >
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: sw.primary }} />
                <span className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: sw.fg, opacity: 0.5 }} />
              </span>
              <span className="flex items-center justify-between">
                <span className={`text-[12px] font-semibold ${on ? 'text-primary' : 'text-foreground'}`}>
                  {THEME_LABELS[mode]}
                </span>
                {on && <Check size={13} className="text-primary" />}
              </span>
              <span className="text-[10px] leading-tight text-muted-foreground">{THEME_HINTS[mode]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AccountRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-3 last:border-b-0">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="text-[13px] font-medium">{value}</span>
    </div>
  )
}

function HelpPanel({ role }: { role: 'host' | 'owner' }) {
  return (
    <div className="flex flex-col gap-5 text-sm leading-relaxed text-muted-foreground">
      <HelpManual role={role} />
      <details className="group border-t border-border pt-4">
        <summary className="mono-label flex cursor-pointer list-none items-center justify-between text-[9px] text-muted-foreground">
          About StayKnit
          <span className="text-muted-foreground transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="pt-4">
          <WhoWeAre />
        </div>
      </details>
      <div className="border-t border-border pt-4">
        <p className="mono-label mb-3 text-[9px] text-muted-foreground">Still stuck?</p>
        <SupportForm />
      </div>
      <p>
        Or email{' '}
        <a href="mailto:support@stayknit.org" className="text-primary hover:underline">
          support@stayknit.org
        </a>
        .
      </p>
    </div>
  )
}
