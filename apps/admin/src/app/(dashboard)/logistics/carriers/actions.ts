'use server'

// Admin CarrierServiceRule editor actions (Phase L2). The rule matrix is the
// Stage-2 eligibility filter + Stage-3 fallback chain the checkout quote and
// (later) the partner label-purchase flow consume (docs/LOGISTICS_AND_
// FULFILLMENT.md §6.2). Guarded like the logistics-gates page
// (requireCapability('platform:admin')) + audited on every mutation.

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { SHIPMENT_MODES, STORAGE_CLASSES, HAZMAT_CLASSES } from './carrier-enums'

type Result = { ok: true } | { ok: false; error: string }
type CreateResult = { ok: true; ruleId: string } | { ok: false; error: string }

// Enum values validated against the hardcoded lists in carrier-data.ts —
// mirrors of schema.prisma enums ShipmentMode / StorageClass / HazmatClass
// (storageClasses + hazmatAllowed are String[] columns, so zod is the fence).
const ruleSchema = z.object({
  carrier: z.string().trim().min(1, 'Carrier is required.').max(64),
  serviceLevel: z.string().trim().min(1, 'Service level is required.').max(64),
  modes: z.array(z.enum(SHIPMENT_MODES)).min(1, 'Pick at least one mode.'),
  storageClasses: z.array(z.enum(STORAGE_CLASSES)).min(1, 'Pick at least one storage class.'),
  // Empty list = NONE-only shipments (eligibility semantics in @ilaunchify/shipping).
  hazmatAllowed: z.array(z.enum(HAZMAT_CLASSES)),
  maxWeightLb: z.number().int().positive().max(100_000).nullable(),
  maxTransitDays: z.number().int().positive().max(60).nullable(),
  groundOnly: z.boolean(),
  // Seasonal window JSON (meltable pause / frozen ship days) — free-form but
  // must parse; the eligibility engine reads it defensively.
  seasonalWindowJson: z.string().trim().max(4000).nullable(),
  priority: z.number().int().min(0).max(10_000),
  active: z.boolean(),
})

export type CarrierRuleInput = z.input<typeof ruleSchema>

function parseRuleInput(
  input: CarrierRuleInput,
): { ok: true; data: z.output<typeof ruleSchema>; seasonal: unknown } | { ok: false; error: string } {
  const parsed = ruleSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid rule input.' }
  }
  let seasonal: unknown = null
  if (parsed.data.seasonalWindowJson) {
    try {
      seasonal = JSON.parse(parsed.data.seasonalWindowJson)
    } catch {
      return { ok: false, error: 'Seasonal window must be valid JSON (or empty).' }
    }
    if (seasonal !== null && (typeof seasonal !== 'object' || Array.isArray(seasonal))) {
      return { ok: false, error: 'Seasonal window JSON must be an object, e.g. {"frozenShipDays":[1,2,3]}.' }
    }
  }
  return { ok: true, data: parsed.data, seasonal }
}

// CarrierServiceRule isn't in packages/audit AUDIT_ENTITY_TYPES yet (packages/**
// is out of scope this session) — log under 'LogisticsSetting', the closest
// existing logistics entity, with the rule id as entityId.
const CARRIER_RULE_ENTITY = 'LogisticsSetting' as const

export async function createCarrierRule(input: CarrierRuleInput): Promise<CreateResult> {
  const admin = await requireCapability('platform:admin')
  const parsed = parseRuleInput(input)
  if (!parsed.ok) return parsed

  try {
    const created = await prisma.carrierServiceRule.create({
      data: {
        carrier: parsed.data.carrier,
        serviceLevel: parsed.data.serviceLevel,
        modes: parsed.data.modes,
        storageClasses: parsed.data.storageClasses,
        hazmatAllowed: parsed.data.hazmatAllowed,
        maxWeightLb: parsed.data.maxWeightLb,
        maxTransitDays: parsed.data.maxTransitDays,
        groundOnly: parsed.data.groundOnly,
        seasonalWindowJson: parsed.seasonal === null ? undefined : (parsed.seasonal as object),
        priority: parsed.data.priority,
        active: parsed.data.active,
      },
    })

    await logAuditAs(admin, {
      entityType: CARRIER_RULE_ENTITY,
      entityId: created.id,
      action: 'CARRIER_RULE_CREATED',
      toValue: parsed.data.active ? 'ACTIVE' : 'INACTIVE',
      payload: {
        carrier: parsed.data.carrier,
        serviceLevel: parsed.data.serviceLevel,
        modes: parsed.data.modes,
        storageClasses: parsed.data.storageClasses,
        hazmatAllowed: parsed.data.hazmatAllowed,
        priority: parsed.data.priority,
      },
    })

    revalidatePath('/logistics/carriers')
    return { ok: true, ruleId: created.id }
  } catch (err) {
    return { ok: false, error: `Could not create the rule: ${(err as Error).message}` }
  }
}

export async function updateCarrierRule(
  ruleId: string,
  input: CarrierRuleInput,
): Promise<Result> {
  const admin = await requireCapability('platform:admin')
  const parsed = parseRuleInput(input)
  if (!parsed.ok) return parsed

  try {
    const existing = await prisma.carrierServiceRule.findUnique({ where: { id: ruleId } })
    if (!existing) return { ok: false, error: 'Rule not found.' }

    await prisma.carrierServiceRule.update({
      where: { id: ruleId },
      data: {
        carrier: parsed.data.carrier,
        serviceLevel: parsed.data.serviceLevel,
        modes: parsed.data.modes,
        storageClasses: parsed.data.storageClasses,
        hazmatAllowed: parsed.data.hazmatAllowed,
        maxWeightLb: parsed.data.maxWeightLb,
        maxTransitDays: parsed.data.maxTransitDays,
        groundOnly: parsed.data.groundOnly,
        // Prisma Json column: null clears via DbNull-equivalent object write —
        // we pass an empty object when cleared so reads stay defensively typed.
        seasonalWindowJson: parsed.seasonal === null ? {} : (parsed.seasonal as object),
        priority: parsed.data.priority,
        active: parsed.data.active,
      },
    })

    await logAuditAs(admin, {
      entityType: CARRIER_RULE_ENTITY,
      entityId: ruleId,
      action: 'CARRIER_RULE_UPDATED',
      fromValue: existing.active ? 'ACTIVE' : 'INACTIVE',
      toValue: parsed.data.active ? 'ACTIVE' : 'INACTIVE',
      payload: {
        carrier: parsed.data.carrier,
        serviceLevel: parsed.data.serviceLevel,
        modes: parsed.data.modes,
        storageClasses: parsed.data.storageClasses,
        hazmatAllowed: parsed.data.hazmatAllowed,
        maxWeightLb: parsed.data.maxWeightLb,
        maxTransitDays: parsed.data.maxTransitDays,
        groundOnly: parsed.data.groundOnly,
        priority: parsed.data.priority,
        active: parsed.data.active,
      },
    })

    revalidatePath('/logistics/carriers')
    revalidatePath(`/logistics/carriers/${ruleId}`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not update the rule: ${(err as Error).message}` }
  }
}
