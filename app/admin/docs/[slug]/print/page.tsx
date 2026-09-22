import { notFound } from "next/navigation"
import { getAdmin } from "@/lib/admin-auth"
import { getAdminDoc } from "@/app/actions/admin-docs"
import { DocPrintView } from "@/components/admin/doc-print-view"

export const dynamic = "force-dynamic"

// Gated, print-optimized single-doc view used for "Save as PDF". The admin gate
// is the security boundary; ordinary users get a 404.
export default async function DocPrintPage({ params }: { params: Promise<{ slug: string }> }) {
  const admin = await getAdmin()
  if (!admin) notFound()

  const { slug } = await params
  const doc = await getAdminDoc(slug)
  if (!doc || doc.kind !== "markdown") notFound()

  return <DocPrintView title={doc.title} markdown={doc.markdown} />
}
