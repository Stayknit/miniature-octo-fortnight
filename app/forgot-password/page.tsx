import { ForgotPasswordForm } from "@/components/forgot-password-form"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

export default async function ForgotPasswordPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect("/")
  return <ForgotPasswordForm />
}
