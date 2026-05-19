'use server'

import { requireUser } from '@ilaunchify/auth'
import { createConnectAccount, createConnectAccountLink } from '@ilaunchify/payments'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3002'

export async function startConnectOnboarding() {
  const user = await requireUser()
  if (user.role !== 'PARTNER') {
    return { ok: false as const, error: 'Only partners can connect payouts' }
  }

  try {
    const { accountId } = await createConnectAccount({
      userId: user.id,
      email: user.email,
      role: 'PARTNER',
    })

    const { url } = await createConnectAccountLink({
      accountId,
      refreshUrl: `${APP_URL}/onboarding/stripe?refresh=1`,
      returnUrl: `${APP_URL}/onboarding/stripe?return=1`,
    })

    return { ok: true as const, url }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false as const, error: msg }
  }
}
