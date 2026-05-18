'use server'

import { requireUser } from '@ilaunchify/auth'
import { createConnectAccount, createConnectAccountLink } from '@ilaunchify/payments'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export async function startCreatorConnect() {
  const user = await requireUser()
  if (user.role !== 'CREATOR') {
    return { ok: false as const, error: 'Only creators have a payout account' }
  }

  try {
    const { accountId } = await createConnectAccount({
      userId: user.id,
      email: user.email,
      role: 'CREATOR',
    })
    const { url } = await createConnectAccountLink({
      accountId,
      refreshUrl: `${APP_URL}/settings/payouts?refresh=1`,
      returnUrl: `${APP_URL}/settings/payouts?return=1`,
    })
    return { ok: true as const, url }
  } catch (err) {
    return { ok: false as const, error: (err as Error).message }
  }
}
