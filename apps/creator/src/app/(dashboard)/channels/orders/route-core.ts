// =============================================================================
// C2.2 - the READY -> production router + auto-billing core.
// docs/C22_BUILD_BRIEF_2026-07-22.md, CHANNEL_MANAGEMENT_SPEC §3.3/§3.5,
// docs/ON_DEMAND_FULL_SERVICE_GATE_2026-07-20.md (gate 4).
//
// NOT a 'use server' file on purpose: the cron sweep (/api/cron/channel-router)
// and the creator-facing server actions (route-actions.ts) share this one
// implementation, and a server-action file may only export async functions.
//
// One channel order at a time, per-order flow:
//   claim -> plan (pure, @ilaunchify/channels) -> per production job:
//   eligibility -> enablement -> capacityPerDay -> findRouting ->
//   assertSinglePartnerPlan -> velocity-banded ON_DEMAND price (ONE pricer) ->
//   daily spend cap -> saved-method off-session charge -> Charge row + PAID ->
//   ONE manufacturer dispatch (+ manifest + notify) -> ChannelOrder ROUTED.
//
// Failure discipline (brief LOCKED #4):
//   * configuration problems the CREATOR must fix -> NEEDS_ATTENTION + reason
//   * cap / capacity / charge failures -> ON_HOLD + reason, AUTO-RECOVERABLE:
//     the next cycle re-picks ON_HOLD orders and retries from scratch.
// Neither park ever throws away money state: charges happen LAST per job, and
// an order that charged successfully is never re-billed (the Stripe idempotency
// key is (channelOrderId, productionOrderId) and productionOrderId gates the
// claim).
//
// SINGLE DISPATCH BY LAW (gate doc §0): the pinned manufacturer executes the
// whole order in-house (mfg + print + pack + parcel). This router NEVER calls
// createDispatches (that builds the multi-partner graph); it creates ONE
// PRODUCT dispatch itself, after assertSinglePartnerPlan verified what
// findRouting actually resolved. RotationOrderContext has no ON_DEMAND value ON
// PURPOSE and this file is why: rotation stays unreachable from here.
//
// PRICING (PP-0d + §4b.5): the charge flows through computeOrderPricing with
// the creator's tier fee (resolveCreatorFeeBps), goods = the manufacturer's
// ON_DEMAND band via resolveTierGoodsCents(..., 'ON_DEMAND', bandSelectionUnits)
// selected by TRAILING 30-DAY velocity + this order's units (LOCKED 2026-07-21).
// No on-demand bands = REFUSE (park), never borrow the bulk curve. Shipping is
// 0 here: the full-service manufacturer parcels in-house and prices it into the
// band (same presentation as the PDP on-demand display + Studio estimate).
// Selection input is snapshotted on the Order (onDemandBandUnits columns +
// internalNotes + audit payload).
//
// Money boundary: the consumer's payment stays on the channel. This bills the
// CREATOR for production only (LOCKED decision #1).

import { prisma, getOrderSettings, listPaymentMethodRefs } from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import {
  findRouting,
  assertSinglePartnerPlan,
  loadOnDemandEligibility,
  describeOnDemandIneligibility,
  resolveOrderCoPackerServiceId,
  createOrderWithNumber,
  assertOrderTransition,
  generateOrderManifest,
  scopeManifestForDispatchType,
  resolveManufacturerMeritFeeBps,
  meritWithholdCents,
} from '@ilaunchify/orders'
import {
  resolveCreatorFeeBps,
  resolveCreatorFeeBounds,
  computeOrderPricing,
  composeProductionLines,
  resolveGoods,
} from '@ilaunchify/plans'
import { getCreatorTier } from '@ilaunchify/auth'
import { chargeSavedMethodOffSession } from '@ilaunchify/payments'
import {
  planChannelOrderRouting,
  trailingUnits,
  bandSelectionUnits,
  utcDayStartMs,
  withinDailySpendCap,
  withinDailyCapacity,
  type RoutePlanLine,
  type ProductionJob,
} from '@ilaunchify/channels'
import { resolveTierGoodsCents } from '@/app/(checkout)/products/[productId]/checkout/tier-pricing'

// --- cast-guarded delegates (degrade before db:push) --------------------------
type AnyDelegate = {
  findUnique?: (a: unknown) => Promise<Record<string, unknown> | null>
  findFirst?: (a: unknown) => Promise<Record<string, unknown> | null>
  findMany?: (a: unknown) => Promise<Array<Record<string, unknown>>>
  create?: (a: unknown) => Promise<Record<string, unknown>>
  createMany?: (a: unknown) => Promise<unknown>
  update?: (a: unknown) => Promise<unknown>
  updateMany?: (a: unknown) => Promise<{ count: number }>
}
const d = (name: string): AnyDelegate | null =>
  ((prisma as unknown as Record<string, AnyDelegate | undefined>)[name] ?? null)

/** Claim sentinel: the atomic in-flight marker. TIMESTAMPED (e2e finding
 *  2026-07-22): a run that dies mid-flight (crash, hot-reload, kill) would
 *  otherwise leave the claim set forever and the order stuck at "already being
 *  routed". A sentinel older than the takeover window is treated as abandoned
 *  and re-claimable; every terminal write overwrites the sentinel, so a fresh
 *  one only ever means a run is genuinely in flight. */
const ROUTING_SENTINEL_PREFIX = 'Routing in progress'
const ROUTING_CLAIM_TAKEOVER_MS = 5 * 60 * 1000
const routingSentinel = (nowMs: number) => `${ROUTING_SENTINEL_PREFIX} since ${new Date(nowMs).toISOString()}`
const isRoutingSentinel = (s: string | null | undefined): boolean => !!s && s.startsWith(ROUTING_SENTINEL_PREFIX)
function sentinelAgeMs(s: string, nowMs: number): number {
  const iso = s.slice(`${ROUTING_SENTINEL_PREFIX} since `.length)
  const t = Date.parse(iso)
  // Legacy/unparseable sentinel (e.g. the pre-fix constant): treat as stale.
  return Number.isFinite(t) ? nowMs - t : Number.POSITIVE_INFINITY
}

export type RouteOutcome =
  | { kind: 'ROUTED'; orderIds: string[]; chargedCents: number }
  | { kind: 'BULK_ONLY' }
  | { kind: 'PARKED'; park: 'ON_HOLD' | 'NEEDS_ATTENTION'; reason: string }
  | { kind: 'SKIPPED'; reason: string }

export interface RouterRunSummary {
  scanned: number
  routed: number
  bulkOnly: number
  onHold: number
  needsAttention: number
  skipped: number
  errors: string[]
}

interface ActorUser {
  id: string
  role: 'CREATOR'
  email: string
  name: string | null
}

async function loadActor(creatorUserId: string): Promise<ActorUser | null> {
  const row = await prisma.user.findUnique({
    where: { id: creatorUserId },
    select: { id: true, email: true, name: true, role: true },
  })
  if (!row || row.role !== 'CREATOR' || !row.email) return null
  return { id: row.id, role: 'CREATOR', email: row.email, name: row.name ?? null }
}

async function logSync(connectionId: string, outcome: 'OK' | 'ERROR', detail: string) {
  await d('channelSyncEvent')
    ?.create?.({
      data: { channelConnectionId: connectionId, direction: 'PUSH', topic: 'order.route', outcome, detail },
    })
    .catch(() => {})
}

/** Notify the creator ONCE per distinct hold reason (a capped creator must not
 *  be pinged every cycle). Best-effort; never blocks the router. */
async function notifyHold(
  creatorUserId: string,
  externalOrderId: string,
  channelName: string,
  reason: string,
  previousReason: string | null,
) {
  if (previousReason === reason) return
  try {
    const { dispatchNotification } = await import('@ilaunchify/notifications')
    await dispatchNotification({
      userId: creatorUserId,
      event: 'CREATOR_CHANNEL_ORDER_HOLD',
      audience: 'creator',
      data: { externalOrderId, channelName, reason },
    })
  } catch {
    // Notification is a courtesy; the ON_HOLD row + reason is the truth.
  }
}

// ─── Per-day ledgers (cast-guarded; pre-push they read as empty) ─────────────

/** ChannelVariantLink ids for one product (soft-FK resolution helper). */
async function variantLinkIdsForProduct(productId: string): Promise<string[]> {
  const links =
    (await d('channelVariantLink')
      ?.findMany?.({ where: { productId }, select: { id: true } })
      .catch(() => [])) ?? []
  return links.map((l) => String(l.id))
}

/** Trailing 30-day consumer-unit volume for (creator, product): the velocity
 *  input of the band selection (gate doc §4b.5). Counts every non-cancelled
 *  imported channel order line in the window EXCEPT the order being routed:
 *  bandSelectionUnits adds that order's units separately (trailing + order),
 *  so counting it here too would double it into the band pick (e2e finding
 *  2026-07-22, visible as a one-order product banding at 2x its real volume). */
export async function trailing30dUnitsFor(
  creatorUserId: string,
  productId: string,
  nowMs: number,
  excludeChannelOrderId?: string,
): Promise<number> {
  const linkIds = await variantLinkIdsForProduct(productId)
  if (linkIds.length === 0) return 0
  const cutoff = new Date(nowMs - 30 * 24 * 60 * 60 * 1000)
  const rows =
    (await d('channelOrderLine')
      ?.findMany?.({
        where: {
          channelVariantLinkId: { in: linkIds },
          channelOrder: {
            ...(excludeChannelOrderId ? { id: { not: excludeChannelOrderId } } : {}),
            placedAt: { gte: cutoff },
            status: { not: 'CANCELLED' },
            connection: { creatorUserId },
          },
        },
        select: { quantity: true, channelOrder: { select: { placedAt: true } } },
      })
      .catch(() => [])) ?? []
  return trailingUnits(
    rows.map((r) => ({
      placedAtMs: new Date(String((r.channelOrder as { placedAt?: unknown } | undefined)?.placedAt ?? 0)).getTime(),
      units: Number(r.quantity) || 0,
    })),
    nowMs,
  )
}

/** Units already routed TODAY for (creator, product): the capacityPerDay ledger.
 *  Reads ChannelOrder.routedAt (additive column) - pre-push it reads 0, which
 *  fails OPEN on capacity exactly while the whole auto-billing rail is dark. */
async function unitsRoutedTodayFor(creatorUserId: string, productId: string, nowMs: number): Promise<number> {
  const linkIds = await variantLinkIdsForProduct(productId)
  if (linkIds.length === 0) return 0
  const dayStart = new Date(utcDayStartMs(nowMs))
  const rows =
    (await d('channelOrderLine')
      ?.findMany?.({
        where: {
          channelVariantLinkId: { in: linkIds },
          channelOrder: { routedAt: { gte: dayStart }, connection: { creatorUserId } },
        },
        select: { quantity: true },
      })
      .catch(() => [])) ?? []
  return rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0)
}

/** Auto-charges billed TODAY for this creator: the daily-cap ledger
 *  (sum of ChannelOrder.productionChargeCents since UTC midnight). */
async function spentTodayCentsFor(creatorUserId: string, nowMs: number): Promise<number> {
  const dayStart = new Date(utcDayStartMs(nowMs))
  const rows =
    (await d('channelOrder')
      ?.findMany?.({
        where: { routedAt: { gte: dayStart }, connection: { creatorUserId } },
        select: { productionChargeCents: true },
      })
      .catch(() => [])) ?? []
  return rows.reduce((s, r) => s + (Number(r.productionChargeCents) || 0), 0)
}

// ─── On-demand finish (gate doc §4b item 2) ──────────────────────────────────

/** The made-to-order finish the dispatch consumes:
 *  ProductTemplate.onDemandDecorationOfferingId (pin), or the manufacturer's
 *  SOLE active offering on the product's containers. Null = undeclared (legal:
 *  the manufacturer finishes in-house however they declared at enablement). */
async function resolveOnDemandFinish(
  productTemplateId: string | null,
): Promise<{ offeringId: string; decorationMethod: string } | null> {
  if (!productTemplateId) return null
  try {
    const template = await prisma.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: {
        manufacturerServiceId: true,
        variants: { where: { isActive: true }, select: { packagingTypeId: true } },
      },
    })
    if (!template?.manufacturerServiceId) return null
    const mfr = await prisma.partnerService.findUnique({
      where: { id: template.manufacturerServiceId },
      select: { partnerId: true },
    })
    if (!mfr) return null
    const typeIds = [...new Set(template.variants.map((v) => v.packagingTypeId).filter((x): x is string => !!x))]
    if (typeIds.length === 0) return null
    const candidates = await prisma.partnerPackagingOffering.findMany({
      where: { packagingTypeId: { in: typeIds }, status: 'ACTIVE', partnerService: { partnerId: mfr.partnerId } },
      select: { id: true, decorationMethod: true },
    })
    if (candidates.length === 0) return null
    // Pin (cast-guarded: the column may predate the generated client).
    const pinned = await (
      prisma.productTemplate as unknown as {
        findUnique: (a: unknown) => Promise<{ onDemandDecorationOfferingId?: string | null } | null>
      }
    )
      .findUnique({ where: { id: productTemplateId }, select: { onDemandDecorationOfferingId: true } })
      .catch(() => null)
    const chosen =
      candidates.find((c) => c.id === pinned?.onDemandDecorationOfferingId) ??
      (candidates.length === 1 ? candidates[0]! : null)
    return chosen ? { offeringId: chosen.id, decorationMethod: chosen.decorationMethod } : null
  } catch {
    return null
  }
}

// ─── The router ──────────────────────────────────────────────────────────────

interface LoadedChannelOrder {
  id: string
  status: string
  statusReason: string | null
  manualConfirmRequired: boolean
  externalOrderId: string
  productionOrderId: string | null
  shipToJson: {
    name?: string
    address1?: string
    address2?: string
    city?: string
    provinceCode?: string
    postalCode?: string
    countryCode?: string
    phone?: string
  } | null
  connection: { id: string; creatorUserId: string; channel: { code: string; displayName?: string } }
  lines: Array<{ id: string; channelVariantLinkId: string | null; quantity: number }>
}

/**
 * Route ONE channel order. `creatorUserId` scopes ownership (server actions pass
 * the session user; the cron passes the connection's creator). Safe to call on
 * anything - non-routable states return SKIPPED, never throw.
 */
export async function routeReadyChannelOrder(creatorUserId: string, channelOrderId: string): Promise<RouteOutcome> {
  const od = d('channelOrder')
  const odFindFirst = od?.findFirst
  const odUpdate = od?.update
  const odUpdateMany = od?.updateMany
  if (!odFindFirst || !odUpdate || !odUpdateMany) {
    return { kind: 'SKIPPED', reason: 'Channel-order tables not migrated yet.' }
  }
  const actor = await loadActor(creatorUserId)
  if (!actor) return { kind: 'SKIPPED', reason: 'Creator account not found.' }

  const row = (await odFindFirst({
      where: { id: channelOrderId, connection: { creatorUserId } },
      include: {
        lines: true,
        connection: { select: { id: true, creatorUserId: true, channel: { select: { code: true, displayName: true } } } },
      },
    })
    .catch(() => null)) as unknown as LoadedChannelOrder | null
  if (!row) return { kind: 'SKIPPED', reason: 'Order not found.' }
  if (row.productionOrderId) return { kind: 'SKIPPED', reason: 'Already routed.' }
  // READY + ON_HOLD are the auto-retry pool (the scan feeds them). Manual
  // "Retry routing" also accepts NEEDS_ATTENTION: config parks need a human
  // fix first, and after fixing, the creator retries from the card (FSM:
  // NEEDS_ATTENTION -> ROUTED is a legal recovery). productionOrderId still
  // gates double-routing above.
  if (!['READY', 'ON_HOLD', 'NEEDS_ATTENTION'].includes(row.status)) {
    return { kind: 'SKIPPED', reason: `Order is ${row.status}, not routable.` }
  }
  if (row.manualConfirmRequired) return { kind: 'SKIPPED', reason: 'Awaiting creator approval (manual-confirm).' }
  const claimNowMs = Date.now()
  const staleClaim =
    isRoutingSentinel(row.statusReason) && sentinelAgeMs(row.statusReason as string, claimNowMs) >= ROUTING_CLAIM_TAKEOVER_MS
  if (isRoutingSentinel(row.statusReason) && !staleClaim) {
    return { kind: 'SKIPPED', reason: 'Already being routed.' }
  }
  const previousHoldReason = row.status === 'ON_HOLD' && !isRoutingSentinel(row.statusReason) ? row.statusReason : null

  // --- Plan (pure) BEFORE claiming, so a bulk-only order is never touched. ----
  const vlinkIds = row.lines.map((l) => l.channelVariantLinkId).filter((x): x is string => !!x)
  const vlinks =
    (await d('channelVariantLink')
      ?.findMany?.({
        where: { id: { in: vlinkIds } },
        select: { id: true, productId: true, flavorPresetId: true, channelProductLink: { select: { mode: true } } },
      })
      .catch(() => [])) ?? []
  const byId = new Map(vlinks.map((v) => [String(v.id), v]))
  const planLines: RoutePlanLine[] = row.lines.map((l) => {
    const link = l.channelVariantLinkId ? byId.get(l.channelVariantLinkId) : undefined
    const mode = (((link?.channelProductLink as { mode?: string } | undefined)?.mode ?? 'ON_DEMAND') === 'BULK'
      ? 'BULK'
      : 'ON_DEMAND') as 'ON_DEMAND' | 'BULK'
    const rawFlavor = link ? String(link.flavorPresetId ?? '') : ''
    return {
      mapped: !!link,
      productId: link ? String(link.productId) : null,
      // 'base' is the variantKey null-marker (order-fsm variantKey()).
      flavorPresetId: rawFlavor && rawFlavor !== 'base' ? rawFlavor : null,
      mode,
      quantity: l.quantity,
    }
  })
  const plan = planChannelOrderRouting(planLines)

  const park = async (
    where: 'ON_HOLD' | 'NEEDS_ATTENTION',
    reason: string,
    extra?: Record<string, unknown>,
  ): Promise<RouteOutcome> => {
    await odUpdate({ where: { id: row.id }, data: { status: where, statusReason: reason } }).catch(() => {})
    await logSync(row.connection.id, 'ERROR', reason)
    await logAuditAs(actor, {
      entityType: 'ChannelOrder',
      entityId: row.id,
      action: 'CHANNEL_ORDER_ROUTE_PARKED',
      toValue: where,
      payload: { externalOrderId: row.externalOrderId, reason, ...(extra ?? {}) },
    }).catch(() => {})
    if (where === 'ON_HOLD') {
      await notifyHold(
        creatorUserId,
        row.externalOrderId,
        row.connection.channel.displayName ?? row.connection.channel.code,
        reason,
        previousHoldReason,
      )
    }
    return { kind: 'PARKED', park: where, reason }
  }

  if (!plan.ok) {
    // Data problems (unmapped lines) are creator-fixable: NEEDS_ATTENTION.
    return park('NEEDS_ATTENTION', plan.refusal ?? 'The order could not be planned.')
  }
  if (plan.productionJobs.length === 0) {
    // Bulk-only: stock is already RESERVED (ingest gate #2) and ships from
    // stock via the self-ship / fulfillment flow. Nothing to produce or bill.
    return { kind: 'BULK_ONLY' }
  }

  const ship = row.shipToJson
  if (!ship?.address1 || !ship.city || !ship.postalCode || !ship.countryCode) {
    return park('NEEDS_ATTENTION', 'The channel order has no complete consumer ship-to address.')
  }

  // --- CLAIM: one router run at a time per order (double-click / cron overlap).
  // A sentinel statusReason instead of a status flip, so every terminal write
  // below is a single legal FSM step from the order's real state.
  // Stale takeover matches the EXACT abandoned sentinel value, so two sweeps
  // racing for the same dead claim still resolve to one winner atomically.
  const mySentinel = routingSentinel(claimNowMs)
  const claimed = await odUpdateMany({
      where: {
        id: row.id,
        status: row.status,
        productionOrderId: null,
        // NULL TRAP (e2e finding 2026-07-22): `NOT: { startsWith }` never
        // matches NULL statusReason (SQL NULL LIKE = NULL), so a freshly
        // approved order could never be claimed. Spell the NULL arm out.
        ...(staleClaim
          ? { statusReason: row.statusReason }
          : { OR: [{ statusReason: null }, { NOT: { statusReason: { startsWith: ROUTING_SENTINEL_PREFIX } } }] }),
      },
      data: { statusReason: mySentinel },
    })
    .catch(() => ({ count: 0 }))
  if (claimed.count !== 1) return { kind: 'SKIPPED', reason: 'This order is already being routed.' }

  try {
  const nowMs = Date.now()
  const orderSettings = await getOrderSettings()
  const creatorTier = await getCreatorTier(creatorUserId)
  const creatorFee = await resolveCreatorFeeBps(creatorTier)
  const feeBounds = await resolveCreatorFeeBounds(creatorTier)

  // Saved method: the go-live gate (PAYMENT_METHOD_MISSING) should make this
  // unreachable, but a method can be removed after go-live. Park, don't fail.
  const methods = await listPaymentMethodRefs(creatorUserId).catch(() => [])
  const savedMethod = methods.find((m) => m.isDefault) ?? methods[0] ?? null
  if (!savedMethod) {
    return park('ON_HOLD', 'No saved payment method on file. Add a card under Settings -> Billing, then the order retries automatically.')
  }

  const orderIds: string[] = []
  let chargedCents = 0
  let routedUnits = 0
  const bandSnapshots: Array<{ productId: string; trailing30dUnits: number; bandUnits: number }> = []

  for (const job of plan.productionJobs) {
    const partial = orderIds.length > 0
    // After the first successful charge a park must NOT return the order to the
    // auto-retry pool (a retry would re-route the already-charged product).
    const parkJob = async (where: 'ON_HOLD' | 'NEEDS_ATTENTION', reason: string): Promise<RouteOutcome> => {
      if (!partial) return park(where, reason)
      await odUpdate({
        where: { id: row.id },
        data: {
          status: 'NEEDS_ATTENTION',
          statusReason: `Partially routed (${orderIds.length} production order(s) created + charged). ${reason} Contact support to finish the split.`,
          productionOrderId: orderIds[0],
        },
      }).catch(() => {})
      await logSync(row.connection.id, 'ERROR', `partial route: ${reason}`)
      return { kind: 'PARKED', park: 'NEEDS_ATTENTION', reason }
    }

    const outcome = await routeOneJob({
      actor,
      row,
      job,
      ship,
      nowMs,
      orderSettings,
      creatorFee,
      feeBounds,
      savedMethodId: savedMethod.stripePaymentMethodId,
      spentTodayExtraCents: chargedCents,
    })
    if (!outcome.ok) return parkJob(outcome.park, outcome.reason)
    orderIds.push(outcome.orderId)
    chargedCents += outcome.chargedCents
    routedUnits += job.units
    bandSnapshots.push({ productId: job.productId, trailing30dUnits: outcome.trailing30dUnits, bandUnits: outcome.bandUnits })
  }

  // --- ROUTED: the one legal success transition (READY/ON_HOLD -> ... -> ROUTED
  //     via the recovery path; persistence writes the terminal state directly,
  //     same as ingest writes its verdicts).
  await odUpdate({
    where: { id: row.id },
    data: { status: 'ROUTED', statusReason: null, productionOrderId: orderIds[0] ?? null },
  })
  // Router snapshots (additive columns; a stale client degrades silently).
  await odUpdate({
    where: { id: row.id },
    data: { routedAt: new Date(nowMs), productionChargeCents: chargedCents, routedUnits },
  }).catch(() => {})
  await logSync(
    row.connection.id,
    'OK',
    `auto-routed -> ${orderIds.length} production order(s), $${(chargedCents / 100).toFixed(2)} charged`,
  )
  await logAuditAs(actor, {
    entityType: 'ChannelOrder',
    entityId: row.id,
    action: 'CHANNEL_ORDER_ROUTED',
    toValue: 'ROUTED',
    payload: {
      externalOrderId: row.externalOrderId,
      channel: row.connection.channel.code,
      orderIds,
      chargedCents,
      routedUnits,
      autoBilled: true,
      // §4b.5: the velocity-band selection input, snapshotted.
      bandSelection: bandSnapshots,
    },
  }).catch(() => {})

  return { kind: 'ROUTED', orderIds, chargedCents }
  } catch (err) {
    // Unexpected throw AFTER the claim (e2e finding 2026-07-22: a dev-server
    // hot-reload killed a run mid-flight). Park ON_HOLD so the claim never
    // leaks and the next cycle retries automatically; charges are protected by
    // the per-(channelOrder, order) Stripe idempotency key regardless.
    const reason = `Routing failed unexpectedly: ${err instanceof Error ? err.message : 'unknown error'}. It retries automatically next cycle.`
    await odUpdate({ where: { id: row.id }, data: { status: 'ON_HOLD', statusReason: reason } }).catch(() => {})
    await logSync(row.connection.id, 'ERROR', reason)
    return { kind: 'PARKED', park: 'ON_HOLD', reason }
  }
}

// ─── One production job: eligibility -> routing -> price -> charge -> dispatch ─

type JobOutcome =
  | { ok: true; orderId: string; chargedCents: number; trailing30dUnits: number; bandUnits: number }
  | { ok: false; park: 'ON_HOLD' | 'NEEDS_ATTENTION'; reason: string }

async function routeOneJob(ctx: {
  actor: ActorUser
  row: LoadedChannelOrder
  job: ProductionJob
  ship: NonNullable<LoadedChannelOrder['shipToJson']>
  nowMs: number
  orderSettings: Awaited<ReturnType<typeof getOrderSettings>>
  creatorFee: Awaited<ReturnType<typeof resolveCreatorFeeBps>>
  feeBounds: Awaited<ReturnType<typeof resolveCreatorFeeBounds>>
  savedMethodId: string
  /** Cents already charged earlier in THIS router run (same UTC day, not yet
   *  visible to the ledger read). */
  spentTodayExtraCents: number
}): Promise<JobOutcome> {
  const { actor, row, job, ship, nowMs } = ctx
  const user = actor

  const product = await prisma.product.findFirst({
    where: { id: job.productId, brand: { creatorProfile: { userId: user.id } } },
    select: {
      id: true,
      name: true,
      brandId: true,
      productTemplateId: true,
      brand: { select: { name: true, operatingRegionId: true } },
      productTemplate: { select: { manufacturerServiceId: true } },
    },
  })
  if (!product) return { ok: false, park: 'NEEDS_ATTENTION', reason: 'Product not found for a mapped line.' }
  const pinnedMfr = product.productTemplate?.manufacturerServiceId ?? null
  if (!pinnedMfr) {
    return { ok: false, park: 'NEEDS_ATTENTION', reason: `${product.name} has no pinned manufacturer.` }
  }

  // Full-service gate (last stop before money): the product may have changed
  // since go-live. Fail-closed on a loader error.
  const eligibility = await loadOnDemandEligibility(product.id, user.id).catch(() => null)
  if (!eligibility) {
    return { ok: false, park: 'NEEDS_ATTENTION', reason: 'On-demand eligibility could not be verified.' }
  }
  if (!eligibility.eligible) {
    return {
      ok: false,
      park: 'NEEDS_ATTENTION',
      reason: `On-demand needs a full-service manufacturer: ${describeOnDemandIneligibility(eligibility.reasons)}`,
    }
  }

  // Consent gate (LOCKED #1 of the enablement loop) + the partner capacity cap.
  const enablement = (await d('onDemandEnablement')
    ?.findFirst?.({
      where: { creatorUserId: user.id, productId: product.id, manufacturerServiceId: pinnedMfr },
      select: { status: true, capacityPerDay: true },
    })
    .catch(() => null)) as { status?: string; capacityPerDay?: number | null } | null
  if (enablement?.status !== 'ENABLED') {
    return {
      ok: false,
      park: 'ON_HOLD',
      reason: `Manufacturer on-demand enablement is ${enablement?.status ?? 'NONE'}.`,
    }
  }
  const capacity = withinDailyCapacity({
    unitsRoutedToday: await unitsRoutedTodayFor(user.id, product.id, nowMs),
    orderUnits: job.units,
    capacityPerDay: enablement.capacityPerDay ?? null,
  })
  if (!capacity.ok) return { ok: false, park: 'ON_HOLD', reason: capacity.reason }

  // Routing (owner-pinned) + the single-partner assertion (gate 4). This is the
  // line that makes print rotation unreachable regardless of upstream state.
  const primaryMarket = await prisma.brandTargetMarket.findFirst({
    where: { brandId: product.brandId, isPrimary: true },
    select: { marketId: true },
  })
  const routing = await findRouting({
    productId: product.id,
    quantity: job.units,
    templateId: product.productTemplateId,
    destinationRegionId: product.brand.operatingRegionId,
    targetMarketId: primaryMarket?.marketId ?? null,
    creatorUserId: user.id,
    // Made-to-order: the enablement is the consent to qty-1 runs; the bulk
    // MOQ floor does not gate this path (capacityPerDay guards volume).
    onDemandMadeToOrder: true,
  })
  if (!routing.ok) return { ok: false, park: 'NEEDS_ATTENTION', reason: routing.message }
  const coPackerServiceId = product.productTemplateId
    ? await resolveOrderCoPackerServiceId(product.productTemplateId).catch(() => null)
    : null
  try {
    assertSinglePartnerPlan({
      manufacturingServiceId: routing.manufacturingServiceId,
      manufacturingUserId: routing.manufacturingUserId,
      labelPrintingServiceId: routing.labelPrintingServiceId,
      labelPrintingUserId: routing.labelPrintingUserId,
      coPackerServiceId,
    })
  } catch (err) {
    return {
      ok: false,
      park: 'NEEDS_ATTENTION',
      reason: err instanceof Error ? err.message : 'On-demand order resolved to a multi-partner plan.',
    }
  }
  if (routing.manufacturingServiceId !== pinnedMfr) {
    // Cannot happen while routing is owner-pinned; belt for a future regression.
    return { ok: false, park: 'NEEDS_ATTENTION', reason: 'Routing did not resolve to the pinned manufacturer.' }
  }

  // Velocity-banded ON_DEMAND price (LOCKED 2026-07-21) through the ONE pricer.
  const trailing30dUnits = await trailing30dUnitsFor(user.id, product.id, nowMs, row.id)
  const bandUnits = bandSelectionUnits(trailing30dUnits, job.units)
  const tierGoods = await resolveTierGoodsCents(product.productTemplateId, job.units, 'ON_DEMAND', {
    bandSelectionUnits: bandUnits,
  })
  // Flavor deltas: the manufacturer's premium-flavor price, folded into goods
  // exactly as the PDP folds it (resolveGoods flavorDeltaTotalCents SSOT).
  let flavorDeltaTotalCents = 0
  const flavorIds = job.flavors.map((f) => f.flavorPresetId).filter((x): x is string => !!x)
  const presets = flavorIds.length
    ? await prisma.flavorPreset.findMany({
        where: { id: { in: flavorIds }, status: 'ACTIVE' },
        select: { id: true, name: true, statementOfIdentity: true, priceDeltaCents: true },
      })
    : []
  const presetById = new Map(presets.map((p) => [p.id, p]))
  for (const f of job.flavors) {
    if (!f.flavorPresetId) continue
    flavorDeltaTotalCents += (presetById.get(f.flavorPresetId)?.priceDeltaCents ?? 0) * f.units
  }
  const goods = resolveGoods({
    isPackOrder: false,
    packPricedSubtotalCents: 0,
    tierGoodsCents: tierGoods,
    flavorDeltaTotalCents,
  })
  if (!goods) {
    // NO on-demand bands = the manufacturer has not priced on-demand. REFUSE;
    // never borrow the bulk curve, never invent a number (PP-0 doctrine).
    return {
      ok: false,
      park: 'NEEDS_ATTENTION',
      reason: `${product.name} has no on-demand price bands from its manufacturer yet.`,
    }
  }
  const priced = computeOrderPricing({
    production: composeProductionLines({ goods, finishesCents: 0, decorationCents: 0, componentsCents: 0 }),
    // Shipping 0: the full-service manufacturer parcels in-house (priced into
    // the band, same presentation as the PDP on-demand display). Tax: G5.
    feeBps: ctx.creatorFee.feeBps,
    feeBounds: ctx.feeBounds,
  })

  // Daily spend cap (LOCKED #1, creator protection).
  const spentToday = (await spentTodayCentsFor(user.id, nowMs)) + ctx.spentTodayExtraCents
  const cap = withinDailySpendCap({
    spentTodayCents: spentToday,
    nextChargeCents: priced.totalCents,
    capCents: ctx.orderSettings.channelDailySpendCapCents,
  })
  if (!cap.ok) return { ok: false, park: 'ON_HOLD', reason: cap.reason }

  // Made-to-order finish (gate doc §4b item 2): the pin, or the sole candidate.
  const finish = await resolveOnDemandFinish(product.productTemplateId)

  // --- Create the production order (PENDING_PAYMENT until the charge lands). --
  const internalNotes = [
    `ORIGIN: CHANNEL (${row.connection.channel.code}) · consumer order ${row.externalOrderId} · ChannelOrder ${row.id} · AUTO-BILLED. Ship DIRECT TO CONSUMER at the address on this order.`,
    `ON-DEMAND PRICING (velocity-banded, gate doc §4b.5): trailing30dUnits=${trailing30dUnits} orderUnits=${job.units} bandUnits=${bandUnits} basis=${goods.basis}.`,
    finish ? `ON-DEMAND FINISH: ${finish.decorationMethod} in-house (offering ${finish.offeringId}).` : 'ON-DEMAND FINISH: manufacturer in-house (no pin).',
  ].join('\n')

  // Lock the exact DesignVersion sold (same rule as checkout: the newest
  // version of the ACTIVE design, never a draft alternate) so the partner's
  // work packet carries the artwork. Null = no design yet; the order still
  // routes and the manifest marks the bundle for admin follow-up, matching
  // checkout's legacy-edge behavior. (Pavel 2026-07-22: the first e2e run
  // showed made-to-order dispatches without the design pointer.)
  const lockedDesign = await prisma.design
    .findFirst({
      where: { productId: product.id, isActiveAlternate: true },
      orderBy: { updatedAt: 'desc' },
      include: { versions: { orderBy: { version: 'desc' }, take: 1, select: { id: true } } },
    })
    .catch(() => null)
  const lockedDesignVersionId = lockedDesign?.versions[0]?.id ?? null

  const order = await createOrderWithNumber(async (orderNumber) => {
    return prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber,
          brandId: product.brandId,
          creatorUserId: user.id,
          status: 'PENDING_PAYMENT',
          subtotalCents: priced.productionSubtotalCents,
          shippingCents: 0,
          taxCents: 0,
          totalCents: priced.totalCents,
          platformFeeBps: ctx.creatorFee.feeBps,
          platformFeeCents: priced.platformFeeCents,
          platformFeeSource: ctx.creatorFee.source,
          manufacturerServiceId: routing.manufacturingServiceId,
          printProviderServiceId: routing.labelPrintingServiceId,
          shipToType: 'CREATOR_ADDRESS', // DIRECT_CONSUMER enum pending (logistics)
          shipToContactName: ship.name ?? 'Consumer',
          shipToContactPhone: ship.phone ?? null,
          shipToAddressLine1: ship.address1!,
          shipToAddressLine2: ship.address2 ?? null,
          shipToCity: ship.city!,
          shipToState: ship.provinceCode ?? null,
          shipToPostalCode: ship.postalCode!,
          shipToCountry: ship.countryCode!,
          internalNotes,
        } as Parameters<typeof tx.order.create>[0]['data'],
      })
      const item = await tx.orderItem.create({
        data: {
          orderId: created.id,
          productId: product.id,
          quantity: job.units,
          unitPriceCents: Math.round(priced.productionSubtotalCents / Math.max(1, job.units)),
          totalCents: priced.productionSubtotalCents,
          designVersionId: lockedDesignVersionId,
        } as Parameters<typeof tx.orderItem.create>[0]['data'],
      })
      // Per-flavor split for the partner manifest (cast-guarded model).
      const flavorRows = job.flavors.filter((f) => f.flavorPresetId && presetById.has(f.flavorPresetId))
      if (flavorRows.length > 0) {
        await (tx as unknown as { orderItemFlavor: { createMany: (a: unknown) => Promise<unknown> } }).orderItemFlavor
          .createMany({
            data: flavorRows.map((f) => {
              const p = presetById.get(f.flavorPresetId as string)!
              return {
                orderItemId: item.id,
                flavorPresetId: f.flavorPresetId,
                qty: f.units,
                flavorName: p.name,
                soiSnapshot: p.statementOfIdentity,
              }
            }),
          })
          .catch(() => {})
      }
      return created
    })
  })

  // Band-selection snapshot columns (additive; stale client degrades to notes).
  await (prisma.order as unknown as { update: (a: unknown) => Promise<unknown> })
    .update({
      where: { id: order.id },
      data: { onDemandBandUnits: bandUnits, onDemandTrailing30dUnits: trailing30dUnits },
    })
    .catch(() => {})

  await logAuditAs(user, {
    entityType: 'Order',
    entityId: order.id,
    action: 'ORDER_CREATED',
    toValue: 'PENDING_PAYMENT',
    payload: {
      brandId: product.brandId,
      productId: product.id,
      quantity: job.units,
      subtotalCents: priced.productionSubtotalCents,
      platformFeeCents: priced.platformFeeCents,
      platformFeeBps: ctx.creatorFee.feeBps,
      platformFeeSource: ctx.creatorFee.source,
      totalCents: priced.totalCents,
      surface: 'channel-router',
      channelOrderId: row.id,
      onDemandBandUnits: bandUnits,
      onDemandTrailing30dUnits: trailing30dUnits,
      onDemandFinishOfferingId: finish?.offeringId ?? null,
    },
  }).catch(() => {})

  // --- Auto-charge the saved method (off-session). ---------------------------
  const charge = await chargeSavedMethodOffSession({
    orderId: order.id,
    channelOrderId: row.id,
    creator: { userId: user.id, email: user.email, name: user.name },
    stripePaymentMethodId: ctx.savedMethodId,
    amountCents: priced.totalCents,
    platformFeeCents: priced.platformFeeCents,
    brandName: product.brand?.name ?? 'iLaunchify',
  })
  if (!charge.ok) {
    // Cancel the unfunded order (PENDING_PAYMENT -> CANCELLED is verified legal)
    // and park the channel order. ON_HOLD auto-retries next cycle; the Stripe
    // idempotency key changes with the next order id, so the retry can charge.
    try {
      assertOrderTransition('PENDING_PAYMENT', 'CANCELLED')
      await prisma.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } as never })
      await logAuditAs(user, {
        entityType: 'Order',
        entityId: order.id,
        action: 'ORDER_CANCELLED_CHANNEL_ROUTE_FAILED',
        fromValue: 'PENDING_PAYMENT',
        toValue: 'CANCELLED',
        payload: { reason: `auto_charge_${charge.code.toLowerCase()}` },
      }).catch(() => {})
    } catch {
      /* stale order is swept by the auto-cancel policy */
    }
    return { ok: false, park: 'ON_HOLD', reason: charge.message }
  }

  // --- Record the Charge + flip PAID (the router owns this; see off-session.ts
  //     header for why the webhook deliberately stays out). ---------------------
  await prisma.$transaction(async (tx) => {
    await tx.charge.create({
      data: {
        orderId: order.id,
        stripeChargeId: charge.stripeChargeId,
        stripePaymentIntentId: charge.paymentIntentId,
        amountCents: priced.totalCents,
        currency: 'usd',
        applicationFeeCents: priced.platformFeeCents,
        status: 'SUCCEEDED',
      },
    })
    await tx.order.update({ where: { id: order.id }, data: { status: 'PAID', paidAt: new Date() } })
  })

  // --- ONE manufacturer dispatch (single-dispatch by construction). -----------
  const acceptDeadlineAt = new Date(nowMs + (ctx.orderSettings.acceptWindowHours ?? 24) * 60 * 60 * 1000)
  const meritFeeBps = await resolveManufacturerMeritFeeBps(routing.manufacturingServiceId).catch(() => 0)
  const item = await prisma.orderItem.findFirst({ where: { orderId: order.id }, select: { id: true } })
  await prisma.$transaction(async (tx) => {
    const dispatch = (await (
      tx as unknown as { orderDispatch: { create: (a: unknown) => Promise<{ id: string }> } }
    ).orderDispatch.create({
      data: {
        orderId: order.id,
        orderItemId: item?.id ?? null,
        type: 'PRODUCT',
        partnerServiceId: routing.manufacturingServiceId,
        status: 'PENDING_ACCEPT',
        acceptDeadlineAt,
        // The manufacturer receives their AUTHORED price: the whole production
        // subtotal (payout doctrine 2026-07-18, no fabricated splits). Platform
        // revenue = the creator fee + the merit withhold below, nothing hidden.
        costCents: priced.productionSubtotalCents,
        meritFeeBps,
        meritFeeCents: meritWithholdCents(priced.productionSubtotalCents, meritFeeBps),
      },
    })) as { id: string }
    await tx.order.update({ where: { id: order.id }, data: { status: 'ROUTING' } })
    try {
      const manifest = await generateOrderManifest(tx, { orderId: order.id, orderDispatchId: dispatch.id })
      const packet = scopeManifestForDispatchType(manifest, manifest.dispatchType, { isFinalShipper: true })
      await tx.orderDispatch.update({
        where: { id: dispatch.id },
        data: { finishManifestJson: packet as unknown as object, bundleStatus: 'PENDING_GENERATION' },
      })
    } catch (err) {
      await tx.orderDispatch.update({ where: { id: dispatch.id }, data: { bundleStatus: 'FAILED' } }).catch(() => {})
      console.warn(`[channel-router] manifest generation failed for dispatch ${dispatch.id}:`, err)
    }
  })

  // Tell the manufacturer a made-to-order dispatch is waiting (role-routed).
  try {
    const { dispatchToPartnerService } = await import('@ilaunchify/notifications')
    await dispatchToPartnerService(routing.manufacturingServiceId, {
      event: 'DISPATCH_RECEIVED',
      audience: 'partner',
      data: { orderId: order.id, brandName: product.brand?.name, type: 'PRODUCT' },
    })
  } catch {
    /* best-effort */
  }

  return { ok: true, orderId: order.id, chargedCents: priced.totalCents, trailing30dUnits, bandUnits }
}

// ─── The scan (cron-able; also behind the creator "Run router" action) ───────

/**
 * Route every routable channel order for ONE creator: READY without a pending
 * manual-confirm, plus ON_HOLD orders with no production order yet (the
 * auto-recovery half of LOCKED #1: cap resets at UTC midnight, cards get fixed,
 * enablements flip to ENABLED - the next cycle picks them back up).
 */
export async function scanAndRouteForCreator(creatorUserId: string): Promise<RouterRunSummary> {
  const summary: RouterRunSummary = { scanned: 0, routed: 0, bulkOnly: 0, onHold: 0, needsAttention: 0, skipped: 0, errors: [] }
  const od = d('channelOrder')
  const odFindMany = od?.findMany
  if (!odFindMany) {
    summary.errors.push('Channel-order tables not migrated yet.')
    return summary
  }
  const candidates =
    (await odFindMany({
        where: {
          connection: { creatorUserId },
          productionOrderId: null,
          manualConfirmRequired: false,
          status: { in: ['READY', 'ON_HOLD'] },
        },
        orderBy: { placedAt: 'asc' },
        select: { id: true },
      })
      .catch(() => [])) ?? []
  for (const c of candidates) {
    summary.scanned += 1
    try {
      const outcome = await routeReadyChannelOrder(creatorUserId, String(c.id))
      if (outcome.kind === 'ROUTED') summary.routed += 1
      else if (outcome.kind === 'BULK_ONLY') summary.bulkOnly += 1
      else if (outcome.kind === 'SKIPPED') summary.skipped += 1
      else if (outcome.park === 'ON_HOLD') summary.onHold += 1
      else summary.needsAttention += 1
    } catch (err) {
      summary.errors.push(err instanceof Error ? err.message : `route failed for ${String(c.id)}`)
    }
  }
  return summary
}

/** Cron sweep: every creator with a routable order (auto-recovery included). */
export async function scanAndRouteAllCreators(): Promise<RouterRunSummary> {
  const total: RouterRunSummary = { scanned: 0, routed: 0, bulkOnly: 0, onHold: 0, needsAttention: 0, skipped: 0, errors: [] }
  const od = d('channelOrder')
  const odFindMany = od?.findMany
  if (!odFindMany) {
    total.errors.push('Channel-order tables not migrated yet.')
    return total
  }
  const rows =
    (await odFindMany({
        where: { productionOrderId: null, manualConfirmRequired: false, status: { in: ['READY', 'ON_HOLD'] } },
        select: { connection: { select: { creatorUserId: true } } },
      })
      .catch(() => [])) ?? []
  const creators = [
    ...new Set(rows.map((r) => String((r.connection as { creatorUserId?: unknown } | undefined)?.creatorUserId ?? '')).filter(Boolean)),
  ]
  for (const creatorUserId of creators) {
    const s = await scanAndRouteForCreator(creatorUserId)
    total.scanned += s.scanned
    total.routed += s.routed
    total.bulkOnly += s.bulkOnly
    total.onHold += s.onHold
    total.needsAttention += s.needsAttention
    total.skipped += s.skipped
    total.errors.push(...s.errors)
  }
  return total
}
