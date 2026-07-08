// Platform-wide partner-access mode reader (2026-07-07).
// docs/PARTNER_ONBOARDING_STRATEGY_2026-07.md §7. The admin flips the
// PartnerAccessSetting singleton between PRIVATE (invite-only) and PUBLIC (open
// signup); consumers read it from here to drive the partnerCta() label/href swap
// and to gate onboarding entry. Defaults to PRIVATE (fail closed) and never
// throws — safe to call from any server component.

import { prisma } from './index'

export type PartnerAccessMode = 'PRIVATE' | 'PUBLIC'

/** Current partner access mode. Fails closed to PRIVATE (invite-only). */
export async function getPartnerAccessMode(): Promise<PartnerAccessMode> {
  try {
    const row = await (
      prisma as unknown as {
        partnerAccessSetting: {
          findUnique: (a: unknown) => Promise<{ mode: PartnerAccessMode } | null>
        }
      }
    ).partnerAccessSetting
      .findUnique({ where: { id: 'singleton' }, select: { mode: true } })
      .catch(() => null)
    return row?.mode ?? 'PRIVATE'
  } catch {
    return 'PRIVATE'
  }
}

/** True when the platform is in invite-only (private) mode. */
export async function isPartnerAccessPrivate(): Promise<boolean> {
  return (await getPartnerAccessMode()) === 'PRIVATE'
}
