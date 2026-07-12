// @ilaunchify/analytics — the single event writer.
//
// Mirrors @ilaunchify/audit: fire-and-forget by contract. A failure here NEVER
// propagates to the caller (analytics must not break checkout). The durable
// AnalyticsEvent row and the vendor sink are attempted independently — either
// failing is swallowed and logged.
//
// Write path ONLY — never touch prisma.analyticsEvent.create() directly.
// See docs/ANALYTICS_P0_SUBSTRATE_SPEC.md §2.4.

import { prisma } from '@ilaunchify/db'
import type { Prisma } from '@ilaunchify/db'
import { ANALYTICS_EVENT_NAMES } from './events'
import type { AnalyticsEventName } from './events'
import { getAnalyticsSink } from './sink'
import type { AnalyticsActorRole } from './sink'

export interface EmitEventInput {
  name: AnalyticsEventName
  source?: 'SERVER' | 'CLIENT'
  actorId?: string | null
  role?: AnalyticsActorRole
  tenantId?: string | null
  orderId?: string | null
  sessionId?: string | null
  properties?: Record<string, unknown>
  occurredAt?: Date
}

/**
 * Emit an analytics event. Fire-and-forget: never throws. Writes the durable
 * store (source of truth) then forwards to the vendor sink (no-op until P1).
 */
export async function emitEvent(input: EmitEventInput): Promise<void> {
  const occurredAt = input.occurredAt ?? new Date()
  const role: AnalyticsActorRole = input.role ?? 'SYSTEM'

  // Guard: reject unregistered names so a typo never pollutes the store. The
  // type system already constrains callers; this catches JS/runtime callers.
  if (!ANALYTICS_EVENT_NAMES.has(input.name)) {
    // eslint-disable-next-line no-console
    console.error('[analytics] unknown event name — not emitted', { name: input.name })
    return
  }

  // 1) durable store (source of truth)
  try {
    await prisma.analyticsEvent.create({
      data: {
        name: input.name,
        source: input.source ?? 'SERVER',
        actorId: input.actorId ?? null,
        role,
        tenantId: input.tenantId ?? null,
        orderId: input.orderId ?? null,
        sessionId: input.sessionId ?? null,
        properties: (input.properties ?? undefined) as
          | Prisma.InputJsonObject
          | undefined,
        occurredAt,
      },
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[analytics] failed to persist event', {
      name: input.name,
      err: (err as Error).message,
    })
  }

  // 2) vendor sink (no-op until P1 wires a PostHogSink)
  try {
    await getAnalyticsSink().capture({
      name: input.name,
      actorId: input.actorId ?? null,
      role,
      tenantId: input.tenantId ?? null,
      orderId: input.orderId ?? null,
      sessionId: input.sessionId ?? null,
      properties: input.properties,
      occurredAt,
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[analytics] sink capture failed', {
      name: input.name,
      err: (err as Error).message,
    })
  }
}

/**
 * Convenience: emit as a known user. Maps role and stamps the tenant. Most
 * server actions call requireUser() at the top and have the id + role handy.
 */
export async function emitEventAs(
  user: {
    id: string
    role: 'CREATOR' | 'PARTNER' | 'ADMIN'
    tenantId?: string | null
  },
  entry: Omit<EmitEventInput, 'actorId' | 'role'>,
): Promise<void> {
  return emitEvent({
    ...entry,
    actorId: user.id,
    role: user.role,
    tenantId: entry.tenantId ?? user.tenantId ?? null,
  })
}

/**
 * Convenience: platform-initiated event (Stripe webhooks, cron jobs, scheduled
 * FSM transitions). actorRole = SYSTEM.
 */
export async function emitSystemEvent(
  entry: Omit<EmitEventInput, 'actorId' | 'role'>,
): Promise<void> {
  return emitEvent({ ...entry, actorId: null, role: 'SYSTEM' })
}
