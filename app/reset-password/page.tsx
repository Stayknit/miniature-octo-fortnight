import { ResetPasswordForm } from "@/components/reset-password-form"

export const metadata = {
  title: "Reset password · StayKnit",
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>
}) {
  const { token, error } = await searchParams
  return <ResetPasswordForm token={token ?? null} linkError={error ?? null} />
}
