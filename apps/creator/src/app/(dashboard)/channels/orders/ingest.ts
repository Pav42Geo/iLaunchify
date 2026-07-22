'use server'

// Channel-order INGEST engine (CHANNEL_MANAGEMENT_SPEC §3.3, Phase C2.1).
//
// One entry point per connection: pull orders through the adapter seam (webhook
// ingestion reuses the same core in C1 — webhooks are just a faster trigger),
// then for each external order:
//   1. idempotent upsert (unique [connectionId, externalOrderId]) — raw payload
//      stored verbatim as the immutable legal snapshot
//   2. map lines → ChannelVariantLink by externalVariantId (the mapping atom)
//   3. evaluateReadiness (@ilaunchify/channels — pure): both LOCKED mode gates +
//      manual-confirm training wheels → IMPORTED / MAPPED / READY / ON_HOLD /
//      NEEDS_ATTENTION, reason recorded
//   4. ChannelSyncEvent + AuditLog
// Routing READY orders into the production pipeline (create-order + auto-billing)
// is C2.2 — this module stops at READY. All new-model access is cast-guarded.

import { prisma } from '@ilaunchify/db'
import { normalizeDemandRegion, loadOnDemandEligibility, describeOnDemandIneligibility } from '@ilaunchify/orders'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import {
  resolveChannelAdapter,
  evaluateReadiness,
  manualConfirmActive,
  applyLedgerEntry,
  type ChannelCode,
  type ExternalOrder,
  type OrderLineReadiness,
} from '@ilaunchify/channels'
import { recomputeStockAlert } from '../inventory/alerts'

// --- cast-guarded delegates (degrade before db:push) --------------------------
type AnyDelegate = {
  findUnique?: (a: unknown) => Promise<Record<string, unknown> | null>
  findFirst?: (a: unknown) => Promise<Record<string, unknown> | null>
  findMany?: (a: unknown) => Promise<Array<Record<string, unknown>>>
  create?: (a: unknown) => Promise<Record<string, unknown>>
  update?: (a: unknown) => Promise<unknown>
  upsert?: (a: unknown) => Promise<unknown>
  count?: (a?: unknown) => Promise<number>
}
const d = (name: string): AnyDelegate | null => ((prisma as unknown as Record<string, AnyDelegate | undefined>)[name] ?? null)

async function logSync(connectionId: string, topic: string, outcome: 'OK' | 'ERROR', detail?: string) {
  await d('channelSyncEvent')
    ?.create?.({ data: { channelConnectionId: connectionId, direction: 'PULL', topic, outcome, detail: detail ?? null } })
    .catch(() => {})
}

export interface IngestSummary {
  pulled: number
  imported: number
  ready: number
  onHold: number
  needsAttention: number
  errors: string[]
}

/** Pull + ingest orders for ONE connection the caller owns. */
export async function importOrdersForConnection(connectionId: string): Promise<IngestSummary> {
  const user = await requireUser()
  const summary: IngestSummary = { pulled: 0, imported: 0, ready: 0, onHold: 0, needsAttention: 0, errors: [] }

  const conn = await prisma.channelConnection.findFirst({
    where: { id: connectionId, creatorUserId: user.id, status: 'CONNECTED' },
    include: { channel: { select: { code: true } } },
  })
  if (!conn) {
    summary.errors.push('Connection not found or not connected.')
    return summary
  }
  const orderDelegate = d('channelOrder')
  if (!orderDelegate?.create) {
    summary.errors.push('Channel-order tables not migrated yet — run db:push.')
    return summary
  }

  // Admin kill switch (spec §3.4a): platform-wide ingest pause for this channel.
  // Cast-guarded — before db:push the ops columns don't exist and the select
  // throws, which we treat as "not paused".
  const chOps = await d('channel')
    ?.findFirst?.({
      where: { code: conn.channel.code },
      select: { ingestPaused: true, maintenanceNote: true },
    })
    .catch(() => null)
  if (chOps?.ingestPaused) {
    const note = typeof chOps.maintenanceNote === 'string' && chOps.maintenanceNote ? ` — ${chOps.maintenanceNote}` : ''
    summary.errors.push(`Order sync for this channel is paused by iLaunchify${note}`)
    return summary
  }

  const adapter = resolveChannelAdapter(conn.channel.code as ChannelCode)
  if (!adapter) {
    summary.errors.push('No adapter available for this channel.')
    return summary
  }

  // Products whose pool moved this run — alert recompute at the end (C6.3).
  const touchedProducts = new Set<string>()

  const since = (conn.lastSyncAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000)).toISOString()
  let externals: ExternalOrder[] = []
  try {
    externals = await adapter.pullOrders(
      { connectionId: conn.id, externalAccountId: conn.externalAccountId, tokens: { accessToken: 'stub' } },
      since,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'pull failed'
    summary.errors.push(msg)
    await logSync(conn.id, 'order.pull', 'ERROR', msg)
    return summary
  }
  summary.pulled = externals.length

  // Manual-confirm training wheels (LOCKED #5): active for the first 10 FULFILLED
  // orders of this connection, then the connection setting decides.
  const fulfilledCount = (await orderDelegate.count?.({ where: { channelConnectionId: conn.id, status: { in: ['FULFILLED', 'CLOSED'] } } }).catch(() => 0)) ?? 0
  const settings = (conn as { settings?: unknown }).settings as { autoAfterTraining?: boolean } | null | undefined
  const manualConfirm = manualConfirmActive(fulfilledCount, settings?.autoAfterTraining ?? false)

  for (const ext of externals) {
    try {
      // 1. Idempotent import — skip anything already ingested.
      const existing = await orderDelegate.findFirst?.({
        where: { channelConnectionId: conn.id, externalOrderId: ext.externalOrderId },
        select: { id: true },
      })
      if (existing) continue

      // 2. Map lines via the variant links (join on externalVariantId, scoped to
      //    this connection's product links so ids can't cross tenants).
      const vlinks =
        (await d('channelVariantLink')?.findMany?.({
          where: {
            externalVariantId: { in: ext.lines.map((l) => l.externalVariantId) },
            channelProductLink: { channelConnectionId: conn.id },
          },
          select: { id: true, externalVariantId: true, productId: true, channelProductLink: { select: { mode: true } } },
        }).catch(() => [])) ?? []
      const byExt = new Map(vlinks.map((v) => [String(v.externalVariantId), v]))

      // 2b. The PINNED MANUFACTURER per product, batched. Needed because the
      //     enablement gate below is per (creator, product, MANUFACTURER) and this
      //     order's lines only carry productId (ChannelVariantLink.productId is a
      //     SOFT FK, so it cannot be nest-selected above).
      //
      //     WHY IT MATTERS (2026-07-16): OnDemandEnablement is "a manufacturer's
      //     standing agreement to accept on-demand production orders for ONE creator
      //     product WITH THE APPROVED BRANDING" (schema.prisma:5839), keyed
      //     @@unique([creatorUserId, productId, manufacturerServiceId]). Resolving it
      //     WITHOUT the manufacturer meant a re-pin carried consent across: pin to A,
      //     A approves, re-pin to B, and B's gate opened on A's agreement for branding
      //     B never saw. That is a consent bug, not a routing one.
      //
      //     Typed query (Product + ProductTemplate are migrated), same shape the
      //     REQUEST side uses at publish/actions.ts:324.
      const productIds = [...new Set(vlinks.map((v) => String(v.productId)))]
      const pinnedMfrByProduct = new Map<string, string | null>()
      if (productIds.length > 0) {
        const rows = await prisma.product
          .findMany({
            where: { id: { in: productIds } },
            select: { id: true, productTemplate: { select: { manufacturerServiceId: true } } },
          })
          .catch(() => [])
        for (const r of rows) pinnedMfrByProduct.set(r.id, r.productTemplate?.manufacturerServiceId ?? null)
      }

      // 2c. Full-service gate #4a (docs/ON_DEMAND_FULL_SERVICE_GATE_2026-07-20.md),
      //     batched per unique ON_DEMAND product. Go-live already checked this
      //     (gate #3), but the product can change AFTER go-live (an outside
      //     printer pinned, a co-packer added), and readiness is the last stop
      //     before C2.2 routes production. A blocker parks the line as
      //     NEEDS_ATTENTION with the concrete fix; loader failure parks too
      //     (fail-closed, same direction as the enablement lookup below).
      const fullServiceBlockerByProduct = new Map<string, string | null>()
      const onDemandProductIds = [
        ...new Set(
          vlinks
            .filter((v) => (((v.channelProductLink as { mode?: string } | undefined)?.mode ?? 'ON_DEMAND') === 'ON_DEMAND'))
            .map((v) => String(v.productId)),
        ),
      ]
      for (const pid of onDemandProductIds) {
        const eligibility = await loadOnDemandEligibility(pid, user.id).catch(() => null)
        fullServiceBlockerByProduct.set(
          pid,
          eligibility == null
            ? 'On-demand eligibility could not be verified.'
            : eligibility.eligible
              ? null
              : describeOnDemandIneligibility(eligibility.reasons),
        )
      }

      // 3. Readiness (pure) — both LOCKED gates. Spending cap wiring lands with
      //    C2.2 auto-billing; until then within-cap = true.
      const lines: OrderLineReadiness[] = await Promise.all(
        ext.lines.map(async (l) => {
          const link = byExt.get(l.externalVariantId)
          if (!link) return { mapped: false, mode: 'ON_DEMAND' as const, quantity: l.quantity }
          const mode = ((link.channelProductLink as { mode?: string } | undefined)?.mode ?? 'ON_DEMAND') as 'ON_DEMAND' | 'BULK'
          if (mode === 'ON_DEMAND') {
            // Scoped to the product's PINNED manufacturer (see 2b). A product with no
            // pinned manufacturer cannot have a valid enablement, so it resolves to
            // 'NONE' and the gate stays SHUT: fail-closed, which is the safe direction
            // for a consent gate.
            const pinnedMfr = pinnedMfrByProduct.get(String(link.productId)) ?? null
            const en = pinnedMfr
              ? await d('onDemandEnablement')
                  ?.findFirst?.({
                    where: {
                      creatorUserId: user.id,
                      productId: String(link.productId),
                      manufacturerServiceId: pinnedMfr,
                    },
                    select: { status: true },
                  })
                  .catch(() => null)
              : null
            return {
              mapped: true,
              mode,
              enablement: ((en?.status as string | undefined) ?? 'NONE') as OrderLineReadiness['enablement'],
              // Gate #4a (see 2c): non-null parks the order for the creator.
              fullServiceBlocker: fullServiceBlockerByProduct.get(String(link.productId)) ?? null,
              quantity: l.quantity,
            }
          }
          const pool = await d('inventoryPool')
            ?.findFirst?.({
              where: { creatorUserId: user.id, productId: String(link.productId) },
              select: { quantityOnHand: true, quantityReserved: true },
            })
            .catch(() => null)
          const available = pool ? Number(pool.quantityOnHand ?? 0) - Number(pool.quantityReserved ?? 0) : 0
          return { mapped: true, mode, poolAvailable: available, quantity: l.quantity }
        }),
      )

      const verdict = evaluateReadiness({
        financialStatus: ext.financialStatus,
        lines,
        manualConfirmActive: manualConfirm,
        withinSpendingCap: true, // C2.2 wires the OrderSettings daily cap
      })

      const status = verdict.next === 'READY' ? 'READY' : verdict.next
      const statusReason = 'reason' in verdict ? verdict.reason : null

      // 4. Persist order + lines (raw payload = legal snapshot).
      const created = await orderDelegate.create({
        data: {
          channelConnectionId: conn.id,
          externalOrderId: ext.externalOrderId,
          status,
          statusReason,
          financialStatus: ext.financialStatus,
          currency: ext.currency,
          totalPrice: Number(ext.totalPrice) || 0,
          placedAt: new Date(ext.placedAtIso),
          rawPayload: ext.raw as object,
          shipToJson: (ext.shipTo as object | null) ?? undefined,
          manualConfirmRequired: verdict.next === 'READY' ? verdict.holdForConfirm : false,
          lines: {
            create: ext.lines.map((l) => ({
              externalLineId: l.externalLineId,
              externalVariantId: l.externalVariantId,
              channelVariantLinkId: byExt.get(l.externalVariantId)?.id ? String(byExt.get(l.externalVariantId)!.id) : null,
              quantity: l.quantity,
              unitPrice: Number(l.unitPrice) || 0,
              title: l.title ?? null,
            })),
          },
        },
      })

      // AFE P3.0 — accumulate demand-by-region (best-effort, non-blocking). The
      // end-buyer's ship-to state is the demand signal that feeds future multi-FC
      // placement and the AFE outbound-zone weight. Non-US / unknown → skipped.
      try {
        const ship = ext.shipTo as { provinceCode?: string; state?: string } | null
        const region = normalizeDemandRegion(ship?.provinceCode ?? ship?.state ?? null)
        const demand = d('productDemandSignal')
        if (region && demand?.upsert) {
          const now = new Date()
          for (const l of ext.lines) {
            const productId = byExt.get(l.externalVariantId)?.productId
            const qty = Number(l.quantity) || 0
            if (!productId || qty <= 0) continue
            await demand
              .upsert({
                where: { productId_regionCode: { productId: String(productId), regionCode: region } },
                create: { productId: String(productId), regionCode: region, units: qty, orderCount: 1, lastOrderAt: now },
                update: { units: { increment: qty }, orderCount: { increment: 1 }, lastOrderAt: now },
              })
              .catch(() => {})
          }
        }
      } catch {
        // Best-effort — a demand-signal failure must never affect order ingestion.
      }

      summary.imported += 1
      if (status === 'READY') summary.ready += 1
      else if (status === 'ON_HOLD') summary.onHold += 1
      else if (status === 'NEEDS_ATTENTION') summary.needsAttention += 1

      // BULK lines on a READY order RESERVE stock immediately (gate #2) — the
      // reservation converts to a CHANNEL_SALE at fulfillment, or RELEASEs on
      // cancel. Pure invariants via applyLedgerEntry; pool + ledger cast-guarded.
      if (status === 'READY') {
        for (let i = 0; i < ext.lines.length; i++) {
          const l = ext.lines[i]!
          const link = byExt.get(l.externalVariantId)
          const mode = (link?.channelProductLink as { mode?: string } | undefined)?.mode
          if (!link || mode !== 'BULK') continue
          const pool = await d('inventoryPool')
            ?.findFirst?.({
              where: { creatorUserId: user.id, productId: String(link.productId) },
              select: { id: true, quantityOnHand: true, quantityReserved: true },
            })
            .catch(() => null)
          if (!pool) continue
          const verdictR = applyLedgerEntry(
            { onHand: Number(pool.quantityOnHand ?? 0), reserved: Number(pool.quantityReserved ?? 0) },
            'RESERVATION',
            l.quantity,
          )
          if (!verdictR.ok) continue // readiness already guarded; race → order stays READY, fulfillment re-checks
          await d('inventoryPool')
            ?.update?.({ where: { id: String(pool.id) }, data: { quantityReserved: verdictR.next.reserved } })
            .catch(() => {})
          await d('inventoryLedger')
            ?.create?.({
              data: {
                poolId: String(pool.id),
                kind: 'RESERVATION',
                delta: l.quantity,
                channelOrderId: String(created.id),
                note: `channel order ${ext.externalOrderId}`,
              },
            })
            .catch(() => {})
          touchedProducts.add(String(link.productId))
        }
      }

      await logAuditAs(user, {
        entityType: 'ChannelOrder',
        entityId: String(created.id),
        action: 'CHANNEL_ORDER_IMPORTED',
        payload: { channel: conn.channel.code, externalOrderId: ext.externalOrderId, status, reason: statusReason },
      })
    } catch (err) {
      summary.errors.push(err instanceof Error ? err.message : `import failed for ${ext.externalOrderId}`)
    }
  }

  // Alert recompute for every pool this sync touched (once per product, never
  // per order) — notifies the creator on state ESCALATION only (§3.5a).
  for (const pid of touchedProducts) await recomputeStockAlert(user.id, pid)

  await prisma.channelConnection.update({ where: { id: conn.id }, data: { lastSyncAt: new Date() } }).catch(() => {})
  await logSync(conn.id, 'order.pull', summary.errors.length ? 'ERROR' : 'OK', `pulled ${summary.pulled} · imported ${summary.imported}${summary.errors.length ? ` · ${summary.errors[0]}` : ''}`)
  return summary
}

/** Sync every CONNECTED channel for the current creator ("Sync now"). */
export async function importOrdersForAllConnections(): Promise<IngestSummary> {
  const user = await requireUser()
  const conns = await prisma.channelConnection.findMany({
    where: { creatorUserId: user.id, status: 'CONNECTED' },
    select: { id: true },
  })
  const total: IngestSummary = { pulled: 0, imported: 0, ready: 0, onHold: 0, needsAttention: 0, errors: [] }
  for (const c of conns) {
    const s = await importOrdersForConnection(c.id)
    total.pulled += s.pulled
    total.imported += s.imported
    total.ready += s.ready
    total.onHold += s.onHold
    total.needsAttention += s.needsAttention
    total.errors.push(...s.errors)
  }
  return total
}

/** Manual-confirm approval (LOCKED #5): creator releases a held READY order.
 *  C2.2's router then picks up READY + !manualConfirmRequired for production. */
export async function approveChannelOrder(channelOrderId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  const od = d('channelOrder')
  if (!od?.findFirst || !od.update) return { ok: false, error: 'Channel-order tables not migrated yet.' }
  const row = await od
    .findFirst({
      where: { id: channelOrderId, connection: { creatorUserId: user.id } },
      select: { id: true, status: true, manualConfirmRequired: true },
    })
    .catch(() => null)
  if (!row) return { ok: false, error: 'Order not found.' }
  if (row.status !== 'READY' || !row.manualConfirmRequired) return { ok: false, error: 'Nothing to approve on this order.' }
  await od.update({ where: { id: channelOrderId }, data: { manualConfirmRequired: false } })
  await logAuditAs(user, { entityType: 'ChannelOrder', entityId: channelOrderId, action: 'CHANNEL_ORDER_APPROVED', payload: {} })
  return { ok: true }
}
