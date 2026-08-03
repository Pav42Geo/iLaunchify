'use server'

// I2 (docs/MANUFACTURER_INVENTORY_2026-07-27.md): builder Inventory card + list
// Restock actions for the manufacturer's per-flavor sellable stock
// (TemplateFlavorInventory rows + TemplateInventoryLedger movements).
//
// Doctrine: the ledger is truth, row quantities are DERIVED. Nothing here sets a
// count directly: the builder writes the delta between the typed target and the
// current quantity as an audited ADJUSTMENT; Restock writes RESTOCK entries. All
// math goes through @ilaunchify/orders/template-inventory (the same pure module
// the I3 checkout guard + decrement will use), so surfaces can never disagree.
//
// Unlimited (Pavel 2026-07-27): tracked=false (or no row at all) = unlimited,
// today's behavior. Card-level "Unlimited" untracks every row; a per-flavor
// Unlimited checkbox untracks just that flavor. Untracked flavors never hide the
// product and never cap order quantity.
//
// Cast-guarded: templateFlavorInventory / templateInventoryLedger and
// ProductTemplate.inventorySoldOut are not in the generated client until the I1
// db:push (the product-batch-actions.ts pattern next door). Compiles now, runs
// after the push; loads return safe defaults, saves return a clear error.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import {
  BASE_FLAVOR_KEY,
  applyTemplateLedgerEntry,
  templateAlertState,
  type TemplateLedgerKind,
} from '@ilaunchify/orders/template-inventory'
import { recomputeTemplateSoldOut } from '@ilaunchify/orders/template-inventory-db'

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }

export interface InventoryFlavorRow {
  /** FlavorPreset id, or BASE_FLAVOR_KEY for a flavorless template. */
  flavorKey: string
  /** Display name ("Chocolate"; "All units" for the base row). */
  name: string
  tracked: boolean
  quantityAvailable: number
  alertState: string
}

export interface TemplateInventoryState {
  /** true when ANY row is tracked: the card's Limited/Unlimited master switch. */
  limited: boolean
  lowStockThreshold: number | null
  rows: InventoryFlavorRow[]
  /** false until the I1 db:push has run; the card shows a hint instead of inputs. */
  ready: boolean
}

interface InvRow {
  id: string
  flavorPresetId: string
  tracked: boolean
  quantityAvailable: number
  lowStockThreshold: number | null
  alertState: string
}

/** Ungenerated delegates, reached via the interim cast (pending I1 db:push). */
function castClient(client: unknown) {
  return client as {
    templateFlavorInventory: {
      findMany: (a: unknown) => Promise<InvRow[]>
      upsert: (a: unknown) => Promise<InvRow>
      update: (a: unknown) => Promise<unknown>
      updateMany: (a: unknown) => Promise<{ count: number }>
    }
    templateInventoryLedger: {
      create: (a: unknown) => Promise<unknown>
    }
    productTemplate: {
      findUnique: (a: unknown) => Promise<{ manufacturerServiceId: string | null; minFlavorsPerPack: number | null } | null>
      update: (a: unknown) => Promise<unknown>
    }
  }
}

async function ownerServiceIds(userId: string): Promise<string[]> {
  const partner = await prisma.partner.findUnique({
    where: { userId },
    select: { services: { where: { type: 'MANUFACTURING' }, select: { id: true } } },
  })
  return partner?.services.map((s) => s.id) ?? []
}

/** Ownership fence (tenant isolation, threat #1): the template must belong to the caller. */
async function requireOwnedTemplate(productTemplateId: string) {
  const user = await requireUser()
  const ownIds = await ownerServiceIds(user.id)
  const p = castClient(prisma)
  const tpl = await p.productTemplate.findUnique({
    where: { id: productTemplateId },
    select: { manufacturerServiceId: true, minFlavorsPerPack: true },
  })
  if (!tpl) throw new Error('Product not found.')
  if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) {
    throw new Error('You do not own this product.')
  }
  return { user, tpl }
}

/** ACTIVE flavor presets of the template; empty = flavorless (base sentinel). */
async function activeFlavors(productTemplateId: string): Promise<Array<{ id: string; name: string }>> {
  return prisma.flavorPreset.findMany({
    where: { productTemplateId, status: 'ACTIVE' },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true },
  })
}

export async function loadTemplateInventory(productTemplateId: string): Promise<TemplateInventoryState> {
  const empty: TemplateInventoryState = { limited: false, lowStockThreshold: null, rows: [], ready: false }
  try {
    const { } = await requireOwnedTemplate(productTemplateId)
    const p = castClient(prisma)
    const [flavors, invRows] = await Promise.all([
      activeFlavors(productTemplateId),
      p.templateFlavorInventory.findMany({
        where: { productTemplateId },
        select: { id: true, flavorPresetId: true, tracked: true, quantityAvailable: true, lowStockThreshold: true, alertState: true },
      }),
    ])
    const byKey = new Map(invRows.map((r) => [r.flavorPresetId, r]))
    const keys: Array<{ flavorKey: string; name: string }> =
      flavors.length > 0
        ? flavors.map((f) => ({ flavorKey: f.id, name: f.name }))
        : [{ flavorKey: BASE_FLAVOR_KEY, name: 'All units' }]
    const rows: InventoryFlavorRow[] = keys.map((k) => {
      const r = byKey.get(k.flavorKey)
      return {
        flavorKey: k.flavorKey,
        name: k.name,
        tracked: r?.tracked ?? false,
        quantityAvailable: r?.quantityAvailable ?? 0,
        alertState: r?.alertState ?? 'HEALTHY',
      }
    })
    return {
      limited: rows.some((r) => r.tracked),
      lowStockThreshold: invRows.find((r) => r.lowStockThreshold != null)?.lowStockThreshold ?? null,
      rows,
      ready: true,
    }
  } catch {
    return empty // delegates not generated yet (pre I1 db:push), or not the owner
  }
}

export interface SaveInventoryInput {
  limited: boolean
  lowStockThreshold: number | null
  /** Target quantities per flavor. `unlimited: true` untracks that flavor. */
  flavors: Array<{ flavorKey: string; unlimited: boolean; quantity: number | null }>
}

const cleanQty = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0

const cleanThreshold = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : null

/**
 * Builder card save (autosaved): reconcile each flavor row to its target.
 * Quantity changes are written as audited ADJUSTMENT deltas through the pure
 * helper (reject-not-clamp), never as direct count writes.
 */
export async function saveTemplateInventory(
  productTemplateId: string,
  input: SaveInventoryInput,
): Promise<Result> {
  try {
    const { user, tpl } = await requireOwnedTemplate(productTemplateId)
    const p = castClient(prisma)
    const threshold = cleanThreshold(input.lowStockThreshold)

    for (const f of input.flavors) {
      if (!f.flavorKey) continue
      const tracked = input.limited && !f.unlimited
      const target = cleanQty(f.quantity)

      const row = await p.templateFlavorInventory.upsert({
        where: { productTemplateId_flavorPresetId: { productTemplateId, flavorPresetId: f.flavorKey } },
        create: { productTemplateId, flavorPresetId: f.flavorKey, tracked, quantityAvailable: 0, lowStockThreshold: threshold },
        update: {},
        select: { id: true, flavorPresetId: true, tracked: true, quantityAvailable: true, lowStockThreshold: true, alertState: true },
      })

      const delta = tracked ? target - row.quantityAvailable : 0
      let nextAvailable = row.quantityAvailable
      if (delta !== 0) {
        const applied = applyTemplateLedgerEntry(row.quantityAvailable, 'ADJUSTMENT', delta)
        if (!applied.ok) return { ok: false, error: applied.reason }
        nextAvailable = applied.nextAvailable
        await p.templateInventoryLedger.create({
          data: { inventoryId: row.id, kind: 'ADJUSTMENT' satisfies TemplateLedgerKind, delta: applied.delta, note: 'Builder quantity set', actorUserId: user.id },
        })
      }
      await p.templateFlavorInventory.update({
        where: { id: row.id },
        data: {
          tracked,
          quantityAvailable: nextAvailable,
          lowStockThreshold: threshold,
          alertState: tracked ? templateAlertState(nextAvailable, threshold) : 'HEALTHY',
        },
      })
    }

    await recomputeTemplateSoldOut(prisma, productTemplateId)
    await logAuditAs(user, {
      entityType: 'ProductTemplate',
      entityId: productTemplateId,
      action: 'TEMPLATE_INVENTORY_SAVED',
      payload: { limited: input.limited, lowStockThreshold: threshold, flavors: input.flavors.length },
    })
    return { ok: true }
  } catch (err) {
    const msg = (err as Error).message || ''
    if (msg.includes('own this product') || msg.includes('not found')) return { ok: false, error: msg }
    return { ok: false, error: 'Inventory is not available yet: run the pending db:push + generate first.' }
  }
}

/**
 * Restock from the products list (I2b): adds units to tracked flavors via
 * RESTOCK ledger entries with a note. Never touches Unlimited flavors.
 */
export async function restockTemplateInventory(
  productTemplateId: string,
  entries: Array<{ flavorKey: string; quantity: number }>,
  note: string | null,
): Promise<Result> {
  try {
    const { user, tpl } = await requireOwnedTemplate(productTemplateId)
    const p = castClient(prisma)
    let applied = 0

    for (const e of entries) {
      const qty = cleanQty(e.quantity)
      if (!e.flavorKey || qty <= 0) continue
      const rows = await p.templateFlavorInventory.findMany({
        where: { productTemplateId, flavorPresetId: e.flavorKey },
        select: { id: true, flavorPresetId: true, tracked: true, quantityAvailable: true, lowStockThreshold: true, alertState: true },
      })
      const row = rows[0]
      if (!row || !row.tracked) continue // Unlimited flavors have nothing to restock
      const r = applyTemplateLedgerEntry(row.quantityAvailable, 'RESTOCK', qty)
      if (!r.ok) return { ok: false, error: r.reason }
      await p.templateInventoryLedger.create({
        data: { inventoryId: row.id, kind: 'RESTOCK' satisfies TemplateLedgerKind, delta: r.delta, note: note?.slice(0, 300) || null, actorUserId: user.id },
      })
      await p.templateFlavorInventory.update({
        where: { id: row.id },
        data: { quantityAvailable: r.nextAvailable, alertState: templateAlertState(r.nextAvailable, row.lowStockThreshold) },
      })
      applied += 1
    }

    if (applied === 0) return { ok: false, error: 'Nothing to restock: enter units for a Limited flavor.' }
    await recomputeTemplateSoldOut(prisma, productTemplateId)
    await logAuditAs(user, {
      entityType: 'ProductTemplate',
      entityId: productTemplateId,
      action: 'TEMPLATE_INVENTORY_RESTOCKED',
      payload: { entries: entries.length, note: note?.slice(0, 100) ?? null },
    })
    return { ok: true }
  } catch (err) {
    const msg = (err as Error).message || ''
    if (msg.includes('own this product') || msg.includes('not found')) return { ok: false, error: msg }
    return { ok: false, error: 'Inventory is not available yet: run the pending db:push + generate first.' }
  }
}
