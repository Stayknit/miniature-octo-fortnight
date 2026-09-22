import { notFound } from "next/navigation"
import { getAdmin } from "@/lib/admin-auth"
import { AdminNav } from "@/components/admin/admin-nav"
import { DocsPanel } from "@/components/admin/docs-panel"

// Owner-only reader for the project's legal & operational docs. 404s for
// everyone else; the doc content itself is loaded through admin-gated server
// actions, so the 404 is a convenience, not the security boundary.
export default async function AdminDocsPage() {
  const admin = await getAdmin()
  if (!admin) notFound()

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-6">
      <AdminNav email={admin.email} />
      <header className="mb-5">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Docs</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Legal &amp; operational documents. Read them here, or download as Word or PDF.
        </p>
      </header>
      <DocsPanel />
    </main>
  )
}
