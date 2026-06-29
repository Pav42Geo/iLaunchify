'use server'

// Per-draft finishes (docs/PER_DRAFT_FINISHES.md, phases 1–3). The manufacturer
// declares which of their service's PartnerFinish rows are offered on THIS
// product template, via a ProductTemplateFinish join. Builder Packaging-step
// card reads/writes these; the Passport surfaces them.
//
// ProductTemplateFinish lands on the generated Prisma client only AFTER the
// additive migration (pnpm db:push → db:generate). Until then every access to
// the model is cast-guarded (`prisma as unknown as { … }`) so this typechecks
// against the CURRENT client and degrades to empty arrays / no-ops at runtime.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string }

// ── pricing-summary formatting ────────────────────────────────────────────────
// Compact one-line "+$0.08/unit · +2d · MOQ 500" string from PartnerFinish
// pricing fields. Returns null when nothing meaningful is set.

interface FinishPricingFields {
  pricingMode: string
  basePriceCents: number
  perUnitPriceCents: number
  pricePerSqInCents: number | null
  pricePerObjectCents: number | null
  pricePerColorCents: number | null
  leadTimeDays: number
  moqMin: number
}

function usd(c: number): string {
  return `$${(c / 100).toFixed(2)}`
}

function buildFinishPricingSummary(f: FinishPricingFields): string | null {
  const parts: string[] = []
  switch (f.pricingMode) {
    case 'PER_UNIT':
      if (f.perUnitPriceCents > 0) parts.push(`+${usd(f.perUnitPriceCents)}/unit`)
      break
    case 'PER_AREA':
      if (f.pricePerSqInCents && f.pricePerSqInCents > 0) parts.push(`+${usd(f.pricePerSqInCents)}/sq in`)
      break
    case 'PER_OBJECT':
      if (f.pricePerObjectCents && f.pricePerObjectCents > 0) parts.push(`+${usd(f.pricePerObjectCents)}/object`)
      break
    case 'PER_COLOR':
      if (f.pricePerColorCents && f.pricePerColorCents > 0) parts.push(`+${usd(f.pricePerColorCents)}/color`)
      break
    case 'FLAT_PER_ORDER':
      if (f.basePriceCents > 0) parts.push(`+${usd(f.basePriceCents)}/order`)
      break
    case 'TIERED':
      parts.push('tiered')
      break
    default:
      if (f.perUnitPriceCents > 0) parts.push(`+${usd(f.perUnitPriceCents)}/unit`)
  }
  // A setup fee on top of a per-unit/area/object/color mode.
  if (f.pricingMode !== 'FLAT_PER_ORDER' && f.basePriceCents > 0) parts.push(`+${usd(f.basePriceCents)} setup`)
  if (f.leadTimeDays > 0) parts.push(`+${f.leadTimeDays}d`)
  if (f.moqMin > 0) parts.push(`MOQ ${f.moqMin.toLocaleString()}`)
  return parts.length ? parts.join(' · ') : null
}

// ── editor data ───────────────────────────────────────────────────────────────

export interface FinishOption {
  partnerFinishId: string
  /** Partner override name, falling back to the FinishType catalog name. */
  name: string
  /** FinishCategory enum value (SURFACE / FOIL_METALLIC / …). */
  category: string
  /** Compact "+$0.08/unit · +2d · MOQ 500" string, or null. */
  pricingSummary: string | null
  leadTimeDays: number
  moqMin: number
  /** Substrate slugs this finish is compatible with (runtime gating, Studio). */
  compatibleSubstrates: string[]
}

export interface SelectedFinish {
  partnerFinishId: string
  isDefault: boolean
  isIncludedInPrice: boolean
  note: string | null
  sortOrder: number
}

export interface FinishesEditorData {
  options: FinishOption[]
  selected: SelectedFinish[]
}

async function requirePartner() {
  const user = await requireUser()
  if (user.role !== 'PARTNER') return { user, partner: null as null, error: 'Not a partner account.' }
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, services: { select: { id: true } } },
  })
  if (!partner) return { user, partner: null as null, error: 'Partner profile not found.' }
  return { user, partner, error: null as null }
}

/** Load the draft's manufacturer-service finish menu + the finishes currently
 *  offered on this product. Ownership-checked; cast-guarded; degrades to empty. */
export async function getDraftFinishesEditorData(draftId: string): Promise<FinishesEditorData> {
  const empty: FinishesEditorData = { options: [], selected: [] }
  try {
    const { partner, error } = await requirePartner()
    if (error || !partner) return empty

    const tpl = await prisma.productTemplate.findUnique({
      where: { id: draftId },
      select: { manufacturerServiceId: true },
    })
    if (!tpl) return empty
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return empty
    // No bound manufacturer service ⇒ no finish menu to offer.
    if (!tpl.manufacturerServiceId) return empty

    // The service's ACTIVE PartnerFinish rows = the menu.
    const finishRows = await prisma.partnerFinish.findMany({
      where: { partnerServiceId: tpl.manufacturerServiceId, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        pricingMode: true,
        basePriceCents: true,
        perUnitPriceCents: true,
        pricePerSqInCents: true,
        pricePerObjectCents: true,
        pricePerColorCents: true,
        leadTimeDays: true,
        moqMin: true,
        compatibleSubstrates: true,
        finishType: { select: { name: true, category: true } },
      },
      orderBy: { createdAt: 'asc' },
    }).catch(() => [] as Array<{
      id: string
      name: string | null
      pricingMode: string
      basePriceCents: number
      perUnitPriceCents: number
      pricePerSqInCents: number | null
      pricePerObjectCents: number | null
      pricePerColorCents: number | null
      leadTimeDays: number
      moqMin: number
      compatibleSubstrates: string[]
      finishType: { name: string; category: string }
    }>)

    const options: FinishOption[] = finishRows.map((f) => ({
      partnerFinishId: f.id,
      name: f.name?.trim() || f.finishType.name,
      category: String(f.finishType.category),
      pricingSummary: buildFinishPricingSummary({
        pricingMode: String(f.pricingMode),
        basePriceCents: f.basePriceCents,
        perUnitPriceCents: f.perUnitPriceCents,
        pricePerSqInCents: f.pricePerSqInCents,
        pricePerObjectCents: f.pricePerObjectCents,
        pricePerColorCents: f.pricePerColorCents,
        leadTimeDays: f.leadTimeDays,
        moqMin: f.moqMin,
      }),
      leadTimeDays: f.leadTimeDays,
      moqMin: f.moqMin,
      compatibleSubstrates: f.compatibleSubstrates ?? [],
    }))

    // Existing offers for this draft — cast-guarded (model lands post-migration).
    const selectedRows =
      (await (prisma as unknown as {
        productTemplateFinish?: {
          findMany: (a: unknown) => Promise<
            Array<{
              partnerFinishId: string
              isDefault: boolean
              isIncludedInPrice: boolean
              note: string | null
              sortOrder: number
            }>
          >
        }
      }).productTemplateFinish
        ?.findMany({
          where: { productTemplateId: draftId },
          orderBy: { sortOrder: 'asc' },
          select: { partnerFinishId: true, isDefault: true, isIncludedInPrice: true, note: true, sortOrder: true },
        })
        .catch(() => [])) ?? []

    const selected: SelectedFinish[] = selectedRows.map((r) => ({
      partnerFinishId: r.partnerFinishId,
      isDefault: r.isDefault,
      isIncludedInPrice: r.isIncludedInPrice,
      note: r.note,
      sortOrder: r.sortOrder,
    }))

    return { options, selected }
  } catch (err) {
    console.error('[getDraftFinishesEditorData] failed:', err)
    return empty
  }
}

// ── save ──────────────────────────────────────────────────────────────────────

export interface SaveFinishRow {
  partnerFinishId: string
  isDefault: boolean
  isIncludedInPrice: boolean
  note?: string
}

/** Replace the draft's offered finish set (clear + recreate, preserving the
 *  caller's array order as sortOrder). Ownership-checked; cast-guarded; writes
 *  one AuditLog row. */
export async function saveDraftFinishes(draftId: string, rows: SaveFinishRow[]): Promise<Result> {
  try {
    const { user, partner, error } = await requirePartner()
    if (error || !partner) return { ok: false, error: error ?? 'Partner profile not found.' }

    const tpl = await prisma.productTemplate.findUnique({
      where: { id: draftId },
      select: { manufacturerServiceId: true },
    })
    if (!tpl) return { ok: false, error: 'Draft not found.' }
    const ownIds = partner.services.map((s) => s.id)
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) {
      return { ok: false, error: 'Not your product.' }
    }

    // Validate the partnerFinishIds belong to the draft's manufacturer service
    // (ACTIVE) — never let a draft offer another service's finishes.
    const validIds = new Set<string>()
    if (tpl.manufacturerServiceId) {
      const valid = await prisma.partnerFinish.findMany({
        where: {
          id: { in: [...new Set(rows.map((r) => r.partnerFinishId))] },
          partnerServiceId: tpl.manufacturerServiceId,
          status: 'ACTIVE',
        },
        select: { id: true },
      }).catch(() => [] as Array<{ id: string }>)
      for (const v of valid) validIds.add(v.id)
    }

    // De-dupe by partnerFinishId, keep first occurrence, preserve order.
    const seen = new Set<string>()
    const clean = rows
      .filter((r) => validIds.has(r.partnerFinishId) && !seen.has(r.partnerFinishId) && seen.add(r.partnerFinishId))
      .map((r, i) => ({
        productTemplateId: draftId,
        partnerFinishId: r.partnerFinishId,
        isDefault: Boolean(r.isDefault),
        isIncludedInPrice: Boolean(r.isIncludedInPrice),
        note: r.note?.trim() ? r.note.trim() : null,
        sortOrder: i,
      }))

    const px = prisma as unknown as {
      productTemplateFinish: {
        deleteMany: (a: unknown) => Promise<unknown>
        createMany: (a: unknown) => Promise<unknown>
      }
    }
    await px.productTemplateFinish.deleteMany({ where: { productTemplateId: draftId } })
    if (clean.length) await px.productTemplateFinish.createMany({ data: clean })

    await logAuditAs(user, {
      entityType: 'ProductTemplate',
      entityId: draftId,
      action: 'PRODUCT_TEMPLATE_UPDATE',
      payload: { finishes: clean.length },
    }).catch(() => {})

    return { ok: true }
  } catch (err) {
    console.error('[saveDraftFinishes] failed:', err)
    return { ok: false, error: `Could not save finishes: ${(err as Error).message}` }
  }
}
