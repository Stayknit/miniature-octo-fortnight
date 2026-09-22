import { notFound } from "next/navigation"
import { getAdmin } from "@/lib/admin-auth"
import { AdminNav } from "@/components/admin/admin-nav"
import { AccountsDashboard } from "@/components/admin/accounts-dashboard"
import { getAccountStats, getPendingInvoices } from "@/app/actions/admin-accounts"

export const dynamic = "force-dynamic"

export default async function AdminAccountsPage() {
  const admin = await getAdmin()
  if (!admin) notFound()

  const [stats, pendingInvoices] = await Promise.all([getAccountStats(), getPendingInvoices()])

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-6">
      <AdminNav email={admin.email} />
      <header className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Accounts</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Subscriptions, revenue run-rate, and every paying account. Amounts in ZAR.
        </p>
      </header>
      <AccountsDashboard stats={stats} pendingInvoices={pendingInvoices} />
    </main>
  )
}
