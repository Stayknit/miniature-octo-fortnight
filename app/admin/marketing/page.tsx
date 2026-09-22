import { notFound } from "next/navigation"
import { getAdmin } from "@/lib/admin-auth"
import { AdminNav } from "@/components/admin/admin-nav"
import { listCampaigns } from "@/app/actions/admin-marketing"
import { MarketingHub } from "@/components/admin/marketing-hub"

// Hidden Marketing / Ads hub for the operator (OWNER_EMAIL). 404s for everyone
// else, exactly like the support console. Data is loaded server-side and passed
// down; every mutation goes through server actions that re-check the same gate.
export default async function AdminMarketingPage() {
  const admin = await getAdmin()
  if (!admin) notFound()

  const campaigns = await listCampaigns()

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-6">
      <AdminNav email={admin.email} />
      <header className="mb-5">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Marketing &amp; ads</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Plan and track campaigns across every platform in one place.
        </p>
      </header>
      <MarketingHub initialCampaigns={campaigns} siteUrl="https://stayknit.org" />
    </main>
  )
}
