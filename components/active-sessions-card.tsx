"use client"

import { authClient } from "@/lib/auth-client"
import { Check, Laptop, LogOut, Monitor, RefreshCw, Smartphone, Tablet } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

type SessionRow = {
  id: string
  token: string
  userAgent?: string | null
  ipAddress?: string | null
  createdAt: string | Date
  updatedAt: string | Date
  expiresAt: string | Date
}

export function ActiveSessionsCard() {
  const { data: current } = authClient.useSession()
  // The token of the device viewing this screen, so it can be labelled
  // "This device" and never offered a self sign-out button (use the main
  // Sign out control for that).
  const currentToken = (current?.session as { token?: string } | undefined)?.token

  const [sessions, setSessions] = useState<SessionRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyToken, setBusyToken] = useState<string | null>(null)
  const [revokingOthers, setRevokingOthers] = useState(false)
  const [justRevokedOthers, setJustRevokedOthers] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    const { data, error } = await authClient.listSessions()
    if (error || !data) {
      setError("Couldn't load your signed-in devices. Please try again.")
      setSessions([])
      return
    }
    // Most recently active first.
    const rows = [...(data as unknown as SessionRow[])].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    setSessions(rows)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function revokeOne(token: string) {
    setError(null)
    setBusyToken(token)
    const { error } = await authClient.revokeSession({ token })
    setBusyToken(null)
    if (error) {
      setError("Couldn't sign out that device. Please try again.")
      return
    }
    setSessions((prev) => (prev ? prev.filter((s) => s.token !== token) : prev))
  }

  async function revokeOthers() {
    setError(null)
    setRevokingOthers(true)
    const { error } = await authClient.revokeOtherSessions()
    setRevokingOthers(false)
    if (error) {
      setError("Couldn't sign out the other devices. Please try again.")
      return
    }
    setSessions((prev) => (prev ? prev.filter((s) => s.token === currentToken) : prev))
    setJustRevokedOthers(true)
    setTimeout(() => setJustRevokedOthers(false), 4000)
  }

  const others = sessions?.filter((s) => s.token !== currentToken) ?? []

  return (
    <div className="mt-2 rounded-lg border border-border bg-surface-2 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-start gap-2.5">
          <Monitor size={16} className="mt-0.5 text-primary" />
          <span>
            <span className="text-sm font-medium">Signed-in devices</span>
            <span className="mt-0.5 block text-[12px] text-muted-foreground">
              Devices and browsers with an active session on your account. Sign out any you don&apos;t recognise.
            </span>
          </span>
        </span>
        <button
          onClick={load}
          aria-label="Refresh device list"
          className="mono-label flex shrink-0 items-center gap-1.5 rounded-md border border-border-strong px-2.5 py-1.5 text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {justRevokedOthers && (
        <p className="mono-label mt-2 flex items-center gap-1.5 text-[10px] text-primary">
          <Check size={12} /> Signed out of all other devices
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {sessions === null && <p className="text-[12px] text-muted-foreground">Loading your devices…</p>}

        {sessions?.map((s) => {
          const isCurrent = s.token === currentToken
          const { Icon, label } = describeDevice(s.userAgent)
          return (
            <div
              key={s.id}
              className="flex items-start justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2.5"
            >
              <span className="flex min-w-0 items-start gap-2.5">
                <Icon size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium text-foreground">{label}</span>
                    {isCurrent && (
                      <span className="mono-label rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[8px] leading-none text-primary">
                        This device
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {s.ipAddress ? `IP ${s.ipAddress} · ` : ""}Active {relativeTime(s.updatedAt)}
                  </span>
                </span>
              </span>

              {!isCurrent && (
                <button
                  onClick={() => revokeOne(s.token)}
                  disabled={busyToken === s.token}
                  className="mono-label flex shrink-0 items-center gap-1.5 rounded-md border border-border-strong px-2.5 py-1.5 text-[10px] text-primary transition-colors hover:border-primary disabled:opacity-60"
                >
                  <LogOut size={12} /> {busyToken === s.token ? "Signing out…" : "Sign out"}
                </button>
              )}
            </div>
          )
        })}

        {sessions !== null && sessions.length === 0 && !error && (
          <p className="text-[12px] text-muted-foreground">No active sessions found.</p>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-danger">
          {error}
        </p>
      )}

      {others.length > 0 && (
        <button
          onClick={revokeOthers}
          disabled={revokingOthers}
          className="mono-label mt-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-danger py-2.5 text-[10px] text-white disabled:opacity-60"
        >
          <LogOut size={13} />{" "}
          {revokingOthers
            ? "Signing out…"
            : `Sign out of all other devices (${others.length})`}
        </button>
      )}
    </div>
  )
}

// Turn a raw user-agent string into a friendly "Browser on OS" label and a
// matching device icon. Best-effort only — user agents are not authoritative.
function describeDevice(ua?: string | null): { Icon: typeof Monitor; label: string } {
  if (!ua) return { Icon: Monitor, label: "Unknown device" }
  const s = ua.toLowerCase()

  const os = /iphone|ipod/.test(s)
    ? "iPhone"
    : /ipad/.test(s)
      ? "iPad"
      : /android/.test(s)
        ? "Android"
        : /mac os x|macintosh/.test(s)
          ? "macOS"
          : /windows/.test(s)
            ? "Windows"
            : /linux/.test(s)
              ? "Linux"
              : "device"

  const browser = /edg\//.test(s)
    ? "Edge"
    : /chrome|crios/.test(s)
      ? "Chrome"
      : /firefox|fxios/.test(s)
        ? "Firefox"
        : /safari/.test(s)
          ? "Safari"
          : "Browser"

  const Icon = /iphone|ipod|android.*mobile/.test(s)
    ? Smartphone
    : /ipad|tablet/.test(s)
      ? Tablet
      : /mac os x|macintosh|windows|linux/.test(s)
        ? Laptop
        : Monitor

  return { Icon, label: `${browser} on ${os}` }
}

function relativeTime(value: string | Date): string {
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return "recently"
  const diff = Date.now() - then
  const mins = Math.round(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`
  return new Date(value).toLocaleDateString()
}
