'use server'

// SR-3 — Routing & Rotation admin actions (docs/SMART_ROTATION_ENGINE.md §2.3).
//
// The control room's server side: policy writes (validated + audited), the
// dry-run preview (SAME pure engine as production — the simulator can't lie),
// and the per-provider kill switch. Nothing here writes PrintAwardLog: dry
// runs are dry.

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import {
  selectRotatingProvider,
  validateRotationPolicy,
  loadRotationPolicy,
  policyInputOf,
  type RotationCandidate,
  type RotationPolicyInput,
} from '@ilaunchify/orders'
import { revalidatePath } from 'next/cache'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export type PolicyServiceType = 'LABEL_PRINTING' | 'WAREHOUSE' | 'MANUFACTURING'
export type PolicyContext = 'DEFAULT' | 'SAMPLE' | 'REPLENISHMENT'

export interface RotationPolicyView {
  serviceType: PolicyServiceType
  context: PolicyContext
  exists: boolean
  enabled: boolean
  poolSize: number
  mode: 'EQUAL' | 'RANDOM' | 'WEIGHTED_EXACT' | 'BEST_ONLY'
  slotSharesPct: number[]
  newProviderSharePct: number
  newProviderMaxOpen: number
  ratingFloor: number | null
  locationBiasPct: number
  stickyReorders: boolean
}

export async function saveRotationPolicy(input: RotationPolicyView): Promise<Result<null>> {
  const gate = await requireCapability('billing:write')
  const policyInput: RotationPolicyInput = {
    enabled: input.enabled,
    poolSize: input.poolSize,
    mode: input.mode,
    slotSharesPct: input.slotSharesPct,
    newProviderSharePct: input.newProviderSharePct,
    newProviderMaxOpen: input.newProviderMaxOpen,
    ratingFloor: input.ratingFloor,
    locationBiasPct: input.locationBiasPct,
    stickyReorders: input.stickyReorders,
  }
  const invalid = validateRotationPolicy(policyInput)
  if (invalid) return { ok: false, error: invalid }

  const before = await prisma.rotationPolicy.findUnique({
    where: { serviceType_context: { serviceType: input.serviceType, context: input.context } },
  })
  const row = await prisma.rotationPolicy.upsert({
    where: { serviceType_context: { serviceType: input.serviceType, context: input.context } },
    create: {
      serviceType: input.serviceType,
      context: input.context,
      enabled: input.enabled,
      poolSize: input.poolSize,
      mode: input.mode,
      slotSharesPct: input.slotSharesPct,
      newProviderSharePct: input.newProviderSharePct,
      newProviderMaxOpen: input.newProviderMaxOpen,
      ratingFloor: input.ratingFloor,
      locationBiasPct: input.locationBiasPct,
      stickyReorders: input.stickyReorders,
      updatedById: gate.id,
    },
    update: {
      enabled: input.enabled,
      poolSize: input.poolSize,
      mode: input.mode,
      slotSharesPct: input.slotSharesPct,
      newProviderSharePct: input.newProviderSharePct,
      newProviderMaxOpen: input.newProviderMaxOpen,
      ratingFloor: input.ratingFloor,
      locationBiasPct: input.locationBiasPct,
      stickyReorders: input.stickyReorders,
      updatedById: gate.id,
    },
  })
  await logAuditAs(gate, {
    entityType: 'RotationPolicy',
    entityId: row.id,
    action: 'ROTATION_POLICY_SAVED',
    fromValue: before ? JSON.stringify({ enabled: before.enabled, mode: before.mode, poolSize: before.poolSize }) : null,
    toValue: JSON.stringify({ enabled: row.enabled, mode: row.mode, poolSize: row.poolSize }),
    payload: {
      serviceType: input.serviceType,
      context: input.context,
      slotSharesPct: input.slotSharesPct,
      newProviderSharePct: input.newProviderSharePct,
      ratingFloor: input.ratingFloor,
      locationBiasPct: input.locationBiasPct,
      stickyReorders: input.stickyReorders,
    },
  })
  revalidatePath('/routing-rotation')
  return { ok: true, data: null }
}

/** Per-provider kill switch — out of the AUTO pool, manual/pinned untouched. */
export async function setExcludeFromAutoRotation(input: {
  partnerServiceId: string
  exclude: boolean
}): Promise<Result<null>> {
  const gate = await requireCapability('billing:write')
  const svc = await prisma.partnerService.findUnique({
    where: { id: input.partnerServiceId },
    select: { id: true, excludeFromAutoRotation: true, partner: { select: { companyName: true } } },
  })
  if (!svc) return { ok: false, error: 'Service not found' }
  await prisma.partnerService.update({
    where: { id: svc.id },
    data: { excludeFromAutoRotation: input.exclude },
  })
  await logAuditAs(gate, {
    entityType: 'PartnerService',
    entityId: svc.id,
    action: input.exclude ? 'AUTO_ROTATION_EXCLUDED' : 'AUTO_ROTATION_REINSTATED',
    payload: { companyName: svc.partner.companyName },
  })
  revalidatePath('/routing-rotation')
  return { ok: true, data: null }
}

// ---------------------------------------------------------------------------
// Dry-run preview — print leg
// ---------------------------------------------------------------------------

export interface PreviewCandidateRow {
  partnerServiceId: string
  companyName: string
  ratingMean: number | null
  ratingBayesian: number | null
  ratingCount: number
  isNew: boolean
  excluded: boolean
  inPool: boolean
  rankScore: number | null
  /** Simulated share over the run count (0–100, one decimal). */
  simulatedSharePct: number
}

export interface PrintPreviewResult {
  /** Deterministic bindings short-circuit rotation — reported honestly. */
  binding:
    | { kind: 'CONFIG_BOUND' | 'OWNER_SELF_LABEL' | 'NO_DIE_CUT'; note: string }
    | { kind: 'ROTATION'; policyContext: PolicyContext; enabled: boolean }
  candidates: PreviewCandidateRow[]
  runs: number
}

export async function runPrintRotationPreview(input: {
  productId: string
  quantity: number
  context: PolicyContext
  runs?: number
}): Promise<Result<PrintPreviewResult>> {
  await requireCapability('billing:write')
  const runs = Math.min(1000, Math.max(50, Math.floor(input.runs ?? 100)))
  const qty = Math.max(1, Math.floor(input.quantity || 0))

  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    select: {
      id: true,
      template: { select: { dieCutTemplateId: true } },
      packagingComponents: {
        where: { partnerOfferingId: { not: null } },
        select: {
          partnerOffering: {
            select: { partnerService: { select: { id: true, type: true, status: true } } },
          },
        },
      },
    },
  })
  if (!product) return { ok: false, error: 'Product not found' }

  const bound = product.packagingComponents
    .map((c) => c.partnerOffering?.partnerService)
    .find((s) => s?.type === 'LABEL_PRINTING' && s.status === 'ACTIVE')
  if (bound) {
    return {
      ok: true,
      data: {
        binding: {
          kind: 'CONFIG_BOUND',
          note: 'This product bound its printer at configuration time (offering pick) — rotation never runs for it.',
        },
        candidates: [],
        runs,
      },
    }
  }
  const dieCutTemplateId = product.template?.dieCutTemplateId
  if (!dieCutTemplateId) {
    return {
      ok: true,
      data: {
        binding: {
          kind: 'NO_DIE_CUT',
          note: 'No die-cut on this product — the owning manufacturer self-labels; there is no commodity shop to rotate.',
        },
        candidates: [],
        runs,
      },
    }
  }

  // Mirror findRouting's commodity-shop filters exactly.
  const now = new Date()
  const services = await prisma.partnerService.findMany({
    where: {
      type: 'LABEL_PRINTING',
      status: 'ACTIVE',
      partner: { status: 'ACTIVE' },
      dieCutSupport: { some: { dieCutTemplateId } },
    },
    select: {
      id: true,
      capabilities: true,
      ratingMean: true,
      ratingBayesian: true,
      ratingCount: true,
      excludeFromAutoRotation: true,
      partner: { select: { companyName: true, user: { select: { stripeAccountStatus: true } } } },
      blackoutDates: { where: { startsOn: { lte: now }, endsOn: { gte: now } }, take: 1 },
    },
  })
  const eligible = services.filter((s) => {
    if (s.blackoutDates.length > 0) return false
    const caps = s.capabilities as Record<string, unknown>
    const moqMin = (caps.moqMin as number | undefined) ?? 0
    return qty >= moqMin && s.partner.user?.stripeAccountStatus === 'ACTIVE'
  })
  if (eligible.length === 0) {
    return {
      ok: true,
      data: {
        binding: {
          kind: 'OWNER_SELF_LABEL',
          note: 'No separate printer passes the hard filters at this quantity — the owning manufacturer self-labels.',
        },
        candidates: [],
        runs,
      },
    }
  }

  const policyRow = await loadRotationPolicy('LABEL_PRINTING', input.context)
  const policy = policyInputOf(policyRow)

  const serviceIds = eligible.map((s) => s.id)
  const [awardAgg, openCounts] = await Promise.all([
    prisma.printAwardLog.groupBy({
      by: ['partnerServiceId'],
      where: { partnerServiceId: { in: serviceIds } },
      _max: { awardedAt: true },
    }),
    prisma.printAwardLog.groupBy({
      by: ['partnerServiceId'],
      where: {
        partnerServiceId: { in: serviceIds },
        awardedAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
      },
      _count: { _all: true },
    }),
  ])
  const lastBy = new Map(awardAgg.map((a) => [a.partnerServiceId, a._max.awardedAt]))
  const openBy = new Map(openCounts.map((a) => [a.partnerServiceId, a._count._all]))

  const candidates: RotationCandidate[] = eligible.map((s) => ({
    serviceId: s.id,
    ratingBayesian: s.ratingBayesian === null ? null : Number(s.ratingBayesian),
    ratingCount: s.ratingCount,
    isNew: s.ratingCount < 3,
    excludeFromAutoRotation: s.excludeFromAutoRotation,
    distanceMiles: null,
    openAwardCount: openBy.get(s.id) ?? 0,
    lastAwardedAt: lastBy.get(s.id) ?? null,
  }))

  // Simulate: evenly-spaced rolls cover the distribution deterministically
  // (no Math.random noise in the preview — same inputs, same picture).
  const wins = new Map<string, number>()
  let poolSnapshot: Array<{ serviceId: string; rankScore: number }> = []
  let traceSnapshot: ReturnType<typeof selectRotatingProvider>['trace'] = []
  for (let i = 0; i < runs; i++) {
    const roll = (i + 0.5) / runs
    const poolRoll = ((i * 7919) % runs + 0.5) / runs // decorrelated second roll
    const d = selectRotatingProvider(candidates, {
      policy: { ...policy, stickyReorders: false }, // preview shows the POOL split
      previousProviderServiceId: null,
      roll,
      poolRoll,
    })
    if (d.winnerServiceId) wins.set(d.winnerServiceId, (wins.get(d.winnerServiceId) ?? 0) + 1)
    if (i === 0) {
      poolSnapshot = d.pool
      traceSnapshot = d.trace
    }
  }
  const poolIds = new Set(poolSnapshot.map((p) => p.serviceId))
  const scoreBy = new Map(poolSnapshot.map((p) => [p.serviceId, p.rankScore]))
  const traceBy = new Map(traceSnapshot.map((t) => [t.serviceId, t]))

  const rows: PreviewCandidateRow[] = eligible
    .map((s) => ({
      partnerServiceId: s.id,
      companyName: s.partner.companyName,
      ratingMean: s.ratingMean === null ? null : Number(s.ratingMean),
      ratingBayesian: s.ratingBayesian === null ? null : Number(s.ratingBayesian),
      ratingCount: s.ratingCount,
      isNew: s.ratingCount < 3,
      excluded: s.excludeFromAutoRotation,
      inPool: poolIds.has(s.id),
      rankScore: scoreBy.get(s.id) ?? traceBy.get(s.id)?.rankScore ?? null,
      simulatedSharePct: Math.round(((wins.get(s.id) ?? 0) / runs) * 1000) / 10,
    }))
    .sort((a, b) => b.simulatedSharePct - a.simulatedSharePct)

  return {
    ok: true,
    data: {
      binding: { kind: 'ROTATION', policyContext: input.context, enabled: policy.enabled },
      candidates: rows,
      runs,
    },
  }
}
