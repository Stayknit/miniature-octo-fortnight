import { notFound } from "next/navigation"
import { getAdmin } from "@/lib/admin-auth"
import { AdminNav } from "@/components/admin/admin-nav"
import { SupportDashboard } from "@/components/admin/support-dashboard"
import { getUserStats, listTickets, listUsers } from "@/app/actions/admin-support"

// Hidden support console for the operator (OWNER_EMAIL). 404s for everyone
// else — hosts and owners can never see or reach it. All data on this page is
// loaded through server actions that re-check the same gate, so the 404 is a
// convenience, not the security boundary.
export default async function AdminSupportPage() {
  const admin = await getAdmin()
  if (!admin) notFound()

  // Initial data loaded server-side and passed down, so the client never
  // fetches on mount; later refreshes go through the same actions on demand.
  const [tickets, users, userStats] = await Promise.all([listTickets("open"), listUsers(), getUserStats()])

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-6">
      <AdminNav email={admin.email} />
      <header className="mb-5">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Support dashboard</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          AI drafts the first reply on every ticket; you review and send.
        </p>
      </header>
      <SupportDashboard initialTickets={tickets} initialUsers={users} initialUserStats={userStats} />
    </main>
  )
}
