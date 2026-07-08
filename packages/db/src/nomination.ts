// Nomination feature gate reader (D7) — the kill switch.
// docs/legal/NOMINATION_LIABILITY_D7_FRAMEWORK.md. The whole nomination feature
// is built DARK: every nomination action/UI checks this first and no-ops when
// false. Fails CLOSED to false, so the feature cannot affect live routing until
// (a) counsel blesses the §6 liability allocation AND (b) an admin flips
// NominationSetting.enabled. Mirrors the rotation-engine enabled=false pattern.

import { prisma } from './index'

/** Is the nomination feature enabled platform-wide? Fails closed to false. */
export async function isNominationEnabled(): Promise<boolean> {
  try {
    const row = await (
      prisma as unknown as {
        nominationSetting: {
          findUnique: (a: unknown) => Promise<{ enabled: boolean } | null>
        }
      }
    ).nominationSetting
      .findUnique({ where: { id: 'singleton' }, select: { enabled: true } })
      .catch(() => null)
    return row?.enabled ?? false
  } catch {
    return false
  }
}
