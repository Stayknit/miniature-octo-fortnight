'use client'

import { createAuthClient } from 'better-auth/react'
import { inferAdditionalFields, twoFactorClient } from 'better-auth/client/plugins'
import type { auth } from '@/lib/auth'

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields<typeof auth>(),
    // Mirrors the server twoFactor plugin. On sign-in with 2FA enabled the
    // browser is sent to /2fa to verify a code; `onTwoFactorRedirect` centralises
    // that navigation for any sign-in entry point.
    twoFactorClient({
      onTwoFactorRedirect() {
        window.location.href = '/2fa'
      },
    }),
  ],
})

export const { signIn, signUp, signOut, useSession, requestPasswordReset, resetPassword, twoFactor } =
  authClient
