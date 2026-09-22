import { notFound } from "next/navigation"
import Link from "next/link"
import { LifeBuoy, Megaphone, Mail, Wallet, ArrowRight } from "lucide-react"
import { getAdmin } from "@/lib/admin-auth"
import { AdminNav } from "@/components/admin/admin-nav"
import { getUserStats, listTickets } from "@/app/actions/admin-support"
import { listCampaigns } from "@/app/actions/admin-marketing"
import { getAccountStats } from "@/app/actions/admin-accounts"
import { formatMoney } from "@/lib/pricing"

export const dynamic = "force-dynamic"

export default async function AdminHomePage() {
  const admin = await getAdmin()
  if (!admin) notFound()

  const [userStats, openTickets, campaigns, accountStats] = await Promise.all([
    getUserStats(),
    listTickets("open"),
    listCampaigns(),
    getAccountStats(),
  ])
  const activeCampaigns = campaigns.filter((c) => c.status === "active").length

  const cards: {
    href: string
    label: string
    description: string
    icon: typeof LifeBuoy
    stat: string
  }[] = [
    {
      href: "/admin/accounts",
      label: "Accounts",
      description: "Subscriptions, revenue run-rate, and every paying account.",
      icon: Wallet,
      stat: `${formatMoney(accountStats.mrrCents, "zar")} MRR · ${accountStats.paying} paying`,
    },
    {
      href: "/admin/support",
      label: "Support",
      description: "Tickets with AI-drafted replies, user lookup, and account tools.",
      icon: LifeBuoy,
      stat: `${openTickets.length} open ${openTickets.length === 1 ? "ticket" : "tickets"}`,
    },
    {
      href: "/admin/marketing",
      label: "Marketing & ads",
      description: "Plan campaigns, build UTM links, and jump to each ad manager.",
      icon: Megaphone,
      stat: `${activeCampaigns} active ${activeCampaigns === 1 ? "campaign" : "campaigns"}`,
    },
    {
      href: "/admin/invite",
      label: "Invitations",
      description: "Generate pilot-host invitation letters to onboard new hosts.",
      icon: Mail,
      stat: "Send an invite",
    },
  ]

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-6">
      <AdminNav email={admin.email} />

      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Admin home</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything for running StayKnit in one place. Pick a dashboard to get started.
        </p>
      </header>

      <section aria-label="Overview" className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "MRR", value: formatMoney(accountStats.mrrCents, "zar") },
          { label: "Paying", value: new Intl.NumberFormat().format(userStats.paying) },
          { label: "New (30 days)", value: new Intl.NumberFormat().format(userStats.newLast30) },
          { label: "Open tickets", value: new Intl.NumberFormat().format(openTickets.length) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{s.value}</p>
            <p className="mt-0.5 text-xs font-medium text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </section>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Dashboards</h2>
      <section aria-label="Dashboards" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <Link
              key={card.href}
              href={card.href}
              className="group flex flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary hover:bg-surface-2"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-foreground">{card.label}</h3>
              <p className="mt-1 flex-1 text-sm leading-relaxed text-muted-foreground">{card.description}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{card.stat}</span>
                <span className="flex items-center gap-1 text-sm font-medium text-primary">
                  Open
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </div>
            </Link>
          )
        })}
      </section>
    </main>
  )
}
