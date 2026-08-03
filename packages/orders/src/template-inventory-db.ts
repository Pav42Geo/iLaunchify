// =============================================================================
// Manufacturer template inventory: DB-side enforcement helpers (I3)
// (docs/MANUFACTURER_INVENTORY_2026-07-27.md sections 4b/5).
//
// The ONLY writers of TemplateFlavorInventory quantities on the ORDER path.
// All math flows through ./template-inventory (the pure module); this file adds
// the two things purity cannot: the CONDITIONAL DECREMENT that makes overselling
// impossible under concurrency, and the ledger/cache writes around it.
//
//   - checkTemplateStock: pre-charge guard ("Only N units of X left"), advisory.
//   - consumeTemplateInventory: inside the order-create transaction. Per flavor:
//     updateMany({ id, tracked, quantityAvailable: { gte: need } }, decrement).
//     Zero rows affected = insufficient stock = the caller aborts the
//     transaction BEFORE any charge. Two concurrent checkouts for the last
//     units: exactly one wins; the database serializes it, not the app.
//   - reverseTemplateInventory: compensating ORDER_REVERSED entries on
//     cancel/refund (idempotent per order).
//
// Fail-open pre-push: if the delegates are not in the generated client yet
// (pre I1 db:push), consume/check no-op as "untracked" so ordering keeps
// working; the feature is simply dark until the push. After the push, a
// template with no tracked rows no-ops the same way (Unlimited).
//
// Works on either the root client or an interactive-transaction client: pass
// whichever `db` the call site is inside.
// =============================================================================

import { dispatchNotification } from '@ilaunchify/notifications'
import type { NotificationEvent } from '@ilaunchify/db'
import {
  BASE_FLAVOR_KEY,
  applyTemplateLedgerEntry,
  isTemplateSellable,
  mergeNeeds,
  shouldNotifyTemplateAlert,
  templateAlertState,
  type FlavorNeed,
  type FlavorStockRow,
  type TemplateStockAlertState,
} from './template-inventory'

/** One flavor's alert-state movement produced by a ledger-touching mutation. */
export interface StockAlertTransition {
  flavorPresetId: string
  prev: TemplateStockAlertState
  next: TemplateStockAlertState
  available: number
}

/** Everything a post-commit notifier needs (I4 PARTNER_STOCK_ALERT). */
export interface StockAlertBundle {
  productTemplateId: string
  transitions: StockAlertTransition[]
  soldOutFlip: 'HIDDEN' | 'RESTORED' | null
}

export type InventoryDb = unknown

interface InvRow {
  id: string
  flavorPresetId: string
  tracked: boolean
  quantityAvailable: number
  lowStockThreshold: number | null
  alertState: string
}

/** The ungenerated delegates, reached via the interim cast (pending I1 db:push). */
function cast(db: InventoryDb) {
  return db as {
    templateFlavorInventory: {
      findMany: (a: unknown) => Promise<InvRow[]>
      update: (a: unknown) => Promise<unknown>
      updateMany: (a: unknown) => Promise<{ count: number }>
    }
    templateInventoryLedger: {
      findMany: (a: unknown) => Promise<Array<{ id: string; inventoryId: string; delta: number; kind: string }>>
      create: (a: unknown) => Promise<unknown>
    }
    productTemplate: {
      findUnique: (a: unknown) => Promise<{
        minFlavorsPerPack: number | null
        inventorySoldOut?: boolean
        name?: string
        manufacturerService?: { partner: { userId: string } | null } | null
      } | null>
      update: (a: unknown) => Promise<unknown>
    }
    flavorPreset: {
      findMany: (a: unknown) => Promise<Array<{ id: string; name: string }>>
    }
  }
}

function hasDelegates(db: InventoryDb): boolean {
  const c = db as Record<string, unknown>
  return Boolean(c && typeof c === 'object' && 'templateFlavorInventory' in c && c.templateFlavorInventory)
}

async function flavorLabel(db: InventoryDb, flavorPresetId: string): Promise<string> {
  if (flavorPresetId === BASE_FLAVOR_KEY) return 'this product'
  try {
    const rows = await cast(db).flavorPreset.findMany({ where: { id: flavorPresetId }, select: { id: true, name: true } })
    return rows[0]?.name ?? 'this flavor'
  } catch {
    return 'this flavor'
  }
}

/**
 * Recompute + persist inventorySoldOut (orderability test, spec section 4).
 * Returns the FLIP when the value changed ('HIDDEN' = just left the
 * marketplace, 'RESTORED' = just came back), null when unchanged.
 */
export async function recomputeTemplateSoldOut(
  db: InventoryDb,
  productTemplateId: string,
): Promise<'HIDDEN' | 'RESTORED' | null> {
  const c = cast(db)
  const [tpl, invRows, presets] = await Promise.all([
    c.productTemplate.findUnique({ where: { id: productTemplateId }, select: { minFlavorsPerPack: true, inventorySoldOut: true } }),
    c.templateFlavorInventory.findMany({
      where: { productTemplateId },
      select: { id: true, flavorPresetId: true, tracked: true, quantityAvailable: true, lowStockThreshold: true, alertState: true },
    }),
    c.flavorPreset.findMany({ where: { productTemplateId, status: 'ACTIVE' }, select: { id: true, name: true } }),
  ])
  if (!tpl) return null // orphan inventory rows (or synthetic test ids): nothing to hide
  const activeIds = presets.length > 0 ? presets.map((p) => p.id) : [BASE_FLAVOR_KEY]
  const rows: FlavorStockRow[] = invRows.map((r) => ({
    flavorPresetId: r.flavorPresetId,
    tracked: r.tracked,
    quantityAvailable: r.quantityAvailable,
  }))
  const sellable = isTemplateSellable({ activeFlavorIds: activeIds, rows, minFlavorsPerPack: tpl?.minFlavorsPerPack ?? null })
  const prevSoldOut = tpl.inventorySoldOut === true
  const nextSoldOut = !sellable
  await c.productTemplate.update({ where: { id: productTemplateId }, data: { inventorySoldOut: nextSoldOut } })
  if (prevSoldOut === nextSoldOut) return null
  return nextSoldOut ? 'HIDDEN' : 'RESTORED'
}

export type StockCheck = { ok: true } | { ok: false; reason: string }

/**
 * Pre-charge guard (spec 4b): would this order fit in the remaining stock?
 * Advisory only: the conditional decrement in consumeTemplateInventory is the
 * authority under concurrency. `needs` are WHOLE-ORDER base units per flavor.
 */
export async function checkTemplateStock(
  db: InventoryDb,
  productTemplateId: string | null,
  needs: ReadonlyArray<FlavorNeed>,
): Promise<StockCheck> {
  if (!productTemplateId || !hasDelegates(db)) return { ok: true }
  try {
    const merged = mergeNeeds(needs)
    if (merged.length === 0) return { ok: true }
    const rows = await cast(db).templateFlavorInventory.findMany({
      where: { productTemplateId, flavorPresetId: { in: merged.map((n) => n.flavorPresetId) }, tracked: true },
      select: { id: true, flavorPresetId: true, tracked: true, quantityAvailable: true, lowStockThreshold: true, alertState: true },
    })
    const byKey = new Map(rows.map((r) => [r.flavorPresetId, r]))
    for (const need of merged) {
      const row = byKey.get(need.flavorPresetId)
      if (!row) continue // untracked flavor = Unlimited, never binds
      if (row.quantityAvailable < need.units) {
        const label = await flavorLabel(db, need.flavorPresetId)
        return {
          ok: false,
          reason: `Not enough stock: only ${row.quantityAvailable.toLocaleString()} units of ${label} left (${need.units.toLocaleString()} requested). Lower the quantity or remove the flavor.`,
        }
      }
    }
    return { ok: true }
  } catch {
    return { ok: true } // pre-push or transient read failure: the decrement still guards
  }
}

export type ConsumeResult =
  | { ok: true; consumed: boolean; alerts: StockAlertBundle | null }
  | { ok: false; reason: string }

/**
 * THE decrement (spec section 5). Call INSIDE the same transaction that creates
 * the order, BEFORE any charge. On { ok: false } the caller must throw so the
 * transaction rolls back. Ledger entries carry the orderId for provenance and
 * for reverseTemplateInventory.
 */
export async function consumeTemplateInventory(
  db: InventoryDb,
  input: { productTemplateId: string | null; needs: ReadonlyArray<FlavorNeed>; orderId: string; actorUserId?: string | null },
): Promise<ConsumeResult> {
  if (!input.productTemplateId || !hasDelegates(db)) return { ok: true, consumed: false, alerts: null }
  const c = cast(db)
  const merged = mergeNeeds(input.needs)
  if (merged.length === 0) return { ok: true, consumed: false, alerts: null }

  let touched = false
  const transitions: StockAlertTransition[] = []
  try {
    for (const need of merged) {
      const rows = await c.templateFlavorInventory.findMany({
        where: { productTemplateId: input.productTemplateId, flavorPresetId: need.flavorPresetId, tracked: true },
        select: { id: true, flavorPresetId: true, tracked: true, quantityAvailable: true, lowStockThreshold: true, alertState: true },
      })
      const row = rows[0]
      if (!row) continue // Unlimited flavor: nothing to consume

      // The invariant gate: precondition INSIDE the write. Concurrent orders
      // for the same stock serialize here; the loser affects 0 rows.
      const res = await c.templateFlavorInventory.updateMany({
        where: { id: row.id, tracked: true, quantityAvailable: { gte: need.units } },
        data: { quantityAvailable: { decrement: need.units } },
      })
      if (res.count === 0) {
        const label = await flavorLabel(db, need.flavorPresetId)
        const fresh = await c.templateFlavorInventory.findMany({ where: { id: row.id }, select: { id: true, flavorPresetId: true, tracked: true, quantityAvailable: true, lowStockThreshold: true, alertState: true } })
        const left = fresh[0]?.quantityAvailable ?? 0
        return { ok: false, reason: `Not enough stock: only ${left.toLocaleString()} units of ${label} left (${need.units.toLocaleString()} requested).` }
      }
      touched = true

      await c.templateInventoryLedger.create({
        data: { inventoryId: row.id, kind: 'ORDER_CONSUMED', delta: -need.units, orderId: input.orderId, actorUserId: input.actorUserId ?? null },
      })
      const nextAvailable = row.quantityAvailable - need.units
      const nextState = templateAlertState(nextAvailable, row.lowStockThreshold)
      transitions.push({
        flavorPresetId: row.flavorPresetId,
        prev: (row.alertState as TemplateStockAlertState) ?? 'HEALTHY',
        next: nextState,
        available: nextAvailable,
      })
      await c.templateFlavorInventory.update({
        where: { id: row.id },
        data: { alertState: nextState },
      })
    }
    let soldOutFlip: 'HIDDEN' | 'RESTORED' | null = null
    if (touched) soldOutFlip = await recomputeTemplateSoldOut(db, input.productTemplateId)
    return {
      ok: true,
      consumed: touched,
      // The caller notifies AFTER its transaction commits (consume runs inside
      // one, and an alert about a rolled-back order must never fire).
      alerts: touched ? { productTemplateId: input.productTemplateId, transitions, soldOutFlip } : null,
    }
  } catch (err) {
    // A throw here rolls back the surrounding transaction (order + decrement
    // together), which is exactly the safe failure mode: no order, no charge.
    throw err
  }
}

/**
 * Compensating entries on cancel/refund: put back exactly what the order's
 * ORDER_CONSUMED entries took. Idempotent: an order that already has
 * ORDER_REVERSED entries is skipped. Best-effort by design: callers should
 * .catch and continue (a failed reversal must never block a cancellation).
 */
export async function reverseTemplateInventory(
  db: InventoryDb,
  input: { productTemplateId: string | null; orderId: string; actorUserId?: string | null },
): Promise<{ ok: boolean; reversed: number }> {
  if (!input.productTemplateId || !hasDelegates(db)) return { ok: true, reversed: 0 }
  const c = cast(db)
  try {
    const entries = await c.templateInventoryLedger.findMany({
      where: { orderId: input.orderId },
      select: { id: true, inventoryId: true, delta: true, kind: true },
    })
    const consumed = entries.filter((e) => e.kind === 'ORDER_CONSUMED')
    const alreadyReversed = entries.some((e) => e.kind === 'ORDER_REVERSED')
    if (consumed.length === 0 || alreadyReversed) return { ok: true, reversed: 0 }

    let reversed = 0
    const transitions: StockAlertTransition[] = []
    for (const e of consumed) {
      const qty = Math.abs(e.delta)
      const rows = await c.templateFlavorInventory.findMany({
        where: { id: e.inventoryId },
        select: { id: true, flavorPresetId: true, tracked: true, quantityAvailable: true, lowStockThreshold: true, alertState: true },
      })
      const row = rows[0]
      if (!row) continue
      const applied = applyTemplateLedgerEntry(row.quantityAvailable, 'ORDER_REVERSED', qty)
      if (!applied.ok) continue
      await c.templateInventoryLedger.create({
        data: { inventoryId: row.id, kind: 'ORDER_REVERSED', delta: applied.delta, orderId: input.orderId, actorUserId: input.actorUserId ?? null },
      })
      const nextState = templateAlertState(applied.nextAvailable, row.lowStockThreshold)
      transitions.push({
        flavorPresetId: row.flavorPresetId,
        prev: (row.alertState as TemplateStockAlertState) ?? 'HEALTHY',
        next: nextState,
        available: applied.nextAvailable,
      })
      await c.templateFlavorInventory.update({
        where: { id: row.id },
        data: { quantityAvailable: applied.nextAvailable, alertState: nextState },
      })
      reversed += 1
    }
    let soldOutFlip: 'HIDDEN' | 'RESTORED' | null = null
    if (reversed > 0) soldOutFlip = await recomputeTemplateSoldOut(db, input.productTemplateId)
    if (reversed > 0) {
      // Reverse always runs post-commit on the root client, so unlike consume it
      // can notify directly (best-effort: alerts never block a cancellation).
      await notifyTemplateStockAlerts(db, {
        productTemplateId: input.productTemplateId,
        transitions,
        soldOutFlip,
      }).catch(() => {})
    }
    return { ok: true, reversed }
  } catch {
    return { ok: false, reversed: 0 }
  }
}

// ── I4: PARTNER_STOCK_ALERT emission (fires once per TRANSITION) ─────────────

/**
 * Notify the owning manufacturer about alert-state transitions + marketplace
 * flips. Call AFTER the mutating transaction commits (consume returns the
 * bundle for exactly this reason; reverse calls it internally). Best-effort:
 * an alert must never break the money/inventory mutation it follows.
 */
export async function notifyTemplateStockAlerts(db: InventoryDb, bundle: StockAlertBundle): Promise<void> {
  if (!hasDelegates(db)) return
  try {
    const c = cast(db)
    const tpl = await c.productTemplate.findUnique({
      where: { id: bundle.productTemplateId },
      select: { minFlavorsPerPack: true, name: true, manufacturerService: { select: { partner: { select: { userId: true } } } } },
    })
    const ownerUserId = tpl?.manufacturerService?.partner?.userId ?? null
    if (!ownerUserId) return
    const productName = tpl?.name ?? 'Your product'

    const flavorIds = bundle.transitions.map((t) => t.flavorPresetId).filter((id) => id !== BASE_FLAVOR_KEY)
    const presets = flavorIds.length
      ? await c.flavorPreset.findMany({ where: { id: { in: flavorIds } }, select: { id: true, name: true } }).catch(() => [])
      : []
    const flavorName = new Map(presets.map((p) => [p.id, p.name]))
    const labelFor = (id: string) => (id === BASE_FLAVOR_KEY ? productName : `${productName}: ${flavorName.get(id) ?? 'a flavor'}`)

    const event: NotificationEvent = 'PARTNER_STOCK_ALERT' // de-cast 2026-07-27

    for (const t of bundle.transitions) {
      if (!shouldNotifyTemplateAlert(t.prev, t.next)) continue
      const copy =
        t.next === 'STOCKOUT'
          ? { title: `${labelFor(t.flavorPresetId)} is out of stock`, body: 'New orders for it are blocked until you restock from your products list.' }
          : t.next === 'LOW'
            ? { title: `${labelFor(t.flavorPresetId)} is running low`, body: `${t.available.toLocaleString()} units left. Restock from your products list to keep orders flowing.` }
            : { title: `${labelFor(t.flavorPresetId)} is back to healthy stock`, body: `${t.available.toLocaleString()} units available. No action needed.` }
      await dispatchNotification({
        userId: ownerUserId,
        event,
        audience: 'partner',
        data: { title: copy.title, body: copy.body, productName, alertState: t.next },
      }).catch(() => {})
    }

    if (bundle.soldOutFlip === 'HIDDEN') {
      await dispatchNotification({
        userId: ownerUserId,
        event,
        audience: 'partner',
        data: {
          title: `${productName} is now hidden from the marketplace`,
          body: 'Its remaining stock can no longer complete a valid order. Restock to relist it: hiding reverses automatically.',
          productName,
          alertState: 'SOLD_OUT_HIDDEN',
        },
      }).catch(() => {})
    } else if (bundle.soldOutFlip === 'RESTORED') {
      await dispatchNotification({
        userId: ownerUserId,
        event,
        audience: 'partner',
        data: {
          title: `${productName} is back on the marketplace`,
          body: 'Stock is available again, so the product is visible and orderable.',
          productName,
          alertState: 'RESTORED',
        },
      }).catch(() => {})
    }
  } catch {
    // never throw from an alert path
  }
}
