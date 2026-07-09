// Platform-wide support-tier policy reader (Pavel 2026-06-20). The admin tunes
// the SupportSettings singleton; ticket intake (@ilaunchify/support createTicket)
// reads it from here so the tier → SLA-target + priority-floor mapping is
// admin-switchable without a deploy.
//
// Seeded from PLATFORM_SPEC §Tier 1 (Maker 48h / Builder 24h / Agency 4h).
// PARTNER tickets are intentionally absent — partner-tier meaning is undecided,
// so partners stay info-only (badge, no auto-prioritization).
//
// Cast-guarded: the model lands on the generated client only after the migration,
// and a missing row falls back to the defaults — so this is always safe to call.

import { prisma } from './index'

// Mirror of the Prisma TicketPriority enum (string-compatible) so this module
// has no hard dependency on the generated enum value pre-migration.
export type SupportPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

export interface SupportSettingsValues {
  slaTargetsEnabled: boolean
  priorityFloorEnabled: boolean
  makerResponseMinutes: number
  builderResponseMinutes: number
  agencyResponseMinutes: number
  makerMinPriority: SupportPriority
  builderMinPriority: SupportPriority
  agencyMinPriority: SupportPriority
  /** Destination for public Contact-us footer submissions. null = fall back to AUTH_EMAIL_FROM. */
  contactForwardingEmail: string | null
}

export const SUPPORT_SETTINGS_DEFAULTS: SupportSettingsValues = {
  slaTargetsEnabled: true,
  priorityFloorEnabled: true,
  makerResponseMinutes: 2880, // 48h
  builderResponseMinutes: 1440, // 24h
  agencyResponseMinutes: 240, // 4h
  makerMinPriority: 'LOW',
  builderMinPriority: 'MEDIUM',
  agencyMinPriority: 'HIGH',
  contactForwardingEmail: null,
}

export async function getSupportSettings(): Promise<SupportSettingsValues> {
  try {
    const row = await (
      prisma as unknown as {
        supportSettings: {
          findUnique: (a: unknown) => Promise<Partial<SupportSettingsValues> | null>
        }
      }
    ).supportSettings
      .findUnique({
        where: { id: 'default' },
        select: {
          slaTargetsEnabled: true,
          priorityFloorEnabled: true,
          makerResponseMinutes: true,
          builderResponseMinutes: true,
          agencyResponseMinutes: true,
          makerMinPriority: true,
          builderMinPriority: true,
          agencyMinPriority: true,
          contactForwardingEmail: true,
        },
      })
      .catch(() => null)
    return row ? { ...SUPPORT_SETTINGS_DEFAULTS, ...row } : SUPPORT_SETTINGS_DEFAULTS
  } catch {
    return SUPPORT_SETTINGS_DEFAULTS
  }
}
