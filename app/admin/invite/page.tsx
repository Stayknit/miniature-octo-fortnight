import { notFound } from "next/navigation"
import { getAdmin } from "@/lib/admin-auth"
import { AdminNav } from "@/components/admin/admin-nav"
import { InviteLetterForm } from "@/components/admin/invite-letter-form"

// Hidden owner-only tool. The route 404s for everyone whose signed-in email
// does not match OWNER_EMAIL, so it is not discoverable or usable by hosts.
export default async function AdminInvitePage() {
  const admin = await getAdmin()
  if (!admin) notFound()

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <AdminNav email={admin.email} />
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Invite a pilot host</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Send a personalised invitation email straight from StayKnit (with the pilot letter attached as a PDF), or
          download the PDF letter / blank details form to send yourself.
        </p>
      </header>
      <InviteLetterForm />
    </main>
  )
}
