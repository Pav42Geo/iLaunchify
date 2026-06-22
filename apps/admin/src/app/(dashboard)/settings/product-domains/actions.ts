'use server'

// Admin product-domain on/off (2026-06-14). Toggles DomainSetting rows that gate
// which product domains a partner can pick in the new-product builder. Admin-gated
// + audited. Cast-guarded until the migration lands DomainSetting on the client.

import { prisma, getDomainSettings, DOMAIN_KEYS, type DomainKey } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

export { getDomainSettings }

export async function setDomainEnabled(domain: string, enabled: boolean): Promise<Result> {
  const admin = await requireCapability('platform:admin')
  if (!(DOMAIN_KEYS as string[]).includes(domain)) return { ok: false, error: 'Unknown domain.' }
  try {
    await (prisma as unknown as {
      domainSetting: { upsert: (a: unknown) => Promise<unknown> }
    }).domainSetting.upsert({
      where: { domain },
      update: { enabled },
      create: { domain, enabled },
    })
    await logAuditAs(admin, {
      entityType: 'DomainSetting',
      entityId: domain,
      action: enabled ? 'DOMAIN_ENABLED' : 'DOMAIN_DISABLED',
      payload: { domain, enabled },
    })
    revalidatePath('/settings/product-domains')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not update: ${(err as Error).message}` }
  }
}

export type { DomainKey }
