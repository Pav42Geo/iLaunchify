// Room label Studio — server resolver (A8, self-design-on-dieline slice 3).
//
// One place that answers "can this user open the room label editor, and with
// what?" — used by the Studio page loader AND the save/lock actions so the
// guard + substrate + Design-row adapter never drift between them.
//
// Guard chain (deny → honest reason):
//   getCollaboratorAccessForUser (owner=full, invited designer=NDA-gated caps)
//   → room ACTIVE → PACKAGING object APPROVED (D2) → maker die-line with a
//   curated normalizedSvg (D-S2: block honestly if none, NO on-the-fly
//   dielineSvgFromSpec fallback) → room owner-creator has a brand.
//
// Design persistence: one Design row per room (roomId soft FK; productId null —
// relaxed 2026-07-13). brandId = the room owner-creator's brand.

import { prisma } from '@ilaunchify/db'
import { getCollaboratorAccessForUser, getOpenDesignReview, resolveRoomRecipeLabel, type RoomRecipeLabel } from '@ilaunchify/orders'
import { getSignedReadUrl } from '@ilaunchify/storage'
import { extractSvgInner, checkRoomLabelReadiness, type RoomComplianceReport } from '@ilaunchify/ui'
import type { PanelData } from '@ilaunchify/types'

export type RoomLabelBlock =
  | 'NO_ACCESS' // no live seat / not the owner
  | 'NOT_ACTIVE' // room closed/won/cancelled
  | 'PACKAGING_NOT_APPROVED' // D2 gate
  | 'DIELINE_NOT_READY' // D-S2 — no curated normalized artifact yet
  | 'NO_BRAND' // owner-creator hasn't set up a brand

export interface RoomLabelDielineChoice {
  id: string
  name: string
}

export interface RoomLabelStudioContext {
  roomId: string
  labelObjectId: string
  briefTitle: string
  partnerName: string
  /** Live capabilities for THIS user (owner or seat). */
  access: { isOwner: boolean; seatId: string | null; canView: boolean; canComment: boolean; canEdit: boolean }
  /** Chosen die-line (provenance for the proof + the substrate source). */
  dielineId: string
  /** Maker's verified die-lines that have a curated normalizedSvg (the picker). */
  dielineChoices: RoomLabelDielineChoice[]
  /** Inner SVG markup of the maker's normalized die-line (mm space), locked substrate. */
  substrateSvg: string
  /** Full-bleed canvas dims (mm), matching the substrate viewBox + the composer. */
  widthMm: number
  heightMm: number
  bleedMm: number
  /** The room's Design row + its latest saved Fabric JSON (null = blank canvas). */
  designId: string
  latestVersion: number
  designJson: unknown | null
  /** C9 attribution — recent saves, newest first, with who saved each. */
  versions: RoomLabelVersion[]
  /** C7 — a PENDING internal design-review request already exists for this room. */
  openReviewPending: boolean
  /** A10 — compliance readiness for the proof submit (non-gating; blocking = why not). */
  submitReadiness: { outcome: RoomComplianceReport['outcome']; blocking: string[] }
  /** A11 — deterministic regulated panel to composite into the proof (null = skip). */
  regulated: RoomLabelRegulated | null
}

export interface RoomLabelRegulated {
  /** FOOD/BEVERAGE Nutrition Facts panel data (fed to NutritionFactsSvg). */
  panel: PanelData
  ingredientStatement: string | null
  contains: string | null
  /** Where the panel sits, in full-bleed mm (the die-line's NUTRITION_FACTS frame). */
  frameBoxMm: { x: number; y: number; w: number; h: number }
}

export interface RoomLabelVersion {
  version: number
  savedByName: string
  savedAt: string
}

export type RoomLabelStudioResult =
  | { ok: false; reason: RoomLabelBlock }
  | { ok: true; ctx: RoomLabelStudioContext }

function num(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'object' && 'toNumber' in (v as object) ? (v as { toNumber(): number }).toNumber() : Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Resolve the full room-label Studio context for a user, or a block reason.
 * `dielineParam` is the ?dieline= choice (falls back to the first ready one).
 */
export async function resolveRoomLabelStudio(
  roomId: string,
  userId: string,
  dielineParam?: string | null,
): Promise<RoomLabelStudioResult> {
  const access = await getCollaboratorAccessForUser(roomId, userId)
  if (!access.canView) return { ok: false, reason: 'NO_ACCESS' }

  const room = await prisma.coCreationRoom.findUnique({
    where: { id: roomId },
    select: {
      status: true,
      partnerId: true,
      partner: { select: { companyName: true } },
      brief: {
        select: {
          title: true,
          creator: { select: { userId: true, brands: { select: { id: true }, orderBy: { createdAt: 'asc' }, take: 1 } } },
        },
      },
      objects: { select: { id: true, kind: true, status: true } },
    },
  })
  if (!room || room.status !== 'ACTIVE') return { ok: false, reason: 'NOT_ACTIVE' }

  const label = room.objects.find((o) => o.kind === 'LABEL')
  const packaging = room.objects.find((o) => o.kind === 'PACKAGING')
  if (!label) return { ok: false, reason: 'NOT_ACTIVE' }
  if (packaging?.status !== 'APPROVED') return { ok: false, reason: 'PACKAGING_NOT_APPROVED' }

  // D-S2: only die-lines with a curated normalizedSvg are designable.
  const dielines = await prisma.packagingDieline.findMany({
    where: {
      partnerService: { partnerId: room.partnerId },
      status: { in: ['ADMIN_VERIFIED', 'ACTIVE'] },
      normalizedSvgKey: { not: null },
    },
    select: {
      id: true,
      normalizedSvgKey: true,
      widthMm: true,
      heightMm: true,
      bleedMm: true,
      frames: true,
      packagingType: { select: { displayName: true } },
    },
    orderBy: { partnerConfirmedAt: 'asc' },
  })
  if (dielines.length === 0) return { ok: false, reason: 'DIELINE_NOT_READY' }

  const chosen = dielines.find((d) => d.id === dielineParam) ?? dielines[0]!
  if (!chosen.normalizedSvgKey) return { ok: false, reason: 'DIELINE_NOT_READY' }

  const brand = room.brief.creator.brands[0]
  if (!brand) return { ok: false, reason: 'NO_BRAND' }

  // Substrate: fetch the normalized SVG bytes server-side and inline the inner
  // markup (the composer + canvas want a fragment, not a full <svg> document).
  let substrateSvg = ''
  try {
    const url = await getSignedReadUrl(chosen.normalizedSvgKey, { expiresInSeconds: 300 })
    const res = await fetch(url)
    if (res.ok) substrateSvg = extractSvgInner(await res.text())
  } catch {
    /* fall through — empty substrate blocks below */
  }
  if (!substrateSvg) return { ok: false, reason: 'DIELINE_NOT_READY' }

  const widthMm = num(chosen.widthMm) ?? 0
  const heightMm = num(chosen.heightMm) ?? 0
  const bleedMm = num(chosen.bleedMm) ?? 3
  if (widthMm <= 0 || heightMm <= 0) return { ok: false, reason: 'DIELINE_NOT_READY' }

  // One Design row per room (roomId scoped, owner-creator's brand, no product).
  let designRow = await prisma.design.findFirst({ where: { roomId }, select: { id: true } })
  if (!designRow) {
    designRow = await prisma.design.create({
      data: { roomId, brandId: brand.id, labelSource: 'STUDIO_BUILT', status: 'DRAFT' },
      select: { id: true },
    })
  }
  // Latest working JSON (heavy) separately from the attribution list (light).
  const latest = await prisma.designVersion.findFirst({
    where: { designId: designRow.id },
    orderBy: { version: 'desc' },
    select: { version: true, designJson: true },
  })
  const versionRows = await prisma.designVersion.findMany({
    where: { designId: designRow.id },
    orderBy: { version: 'desc' },
    take: 20,
    select: { version: true, savedByUserId: true, createdAt: true },
  })
  const saverIds = [...new Set(versionRows.flatMap((v) => (v.savedByUserId ? [v.savedByUserId] : [])))]
  const savers = saverIds.length
    ? await prisma.user.findMany({ where: { id: { in: saverIds } }, select: { id: true, name: true } })
    : []
  const saverName = new Map(savers.map((u) => [u.id, u.name]))
  const versions: RoomLabelVersion[] = versionRows.map((v) => ({
    version: v.version,
    savedByName: (v.savedByUserId && saverName.get(v.savedByUserId)) || 'Someone',
    savedAt: v.createdAt.toISOString(),
  }))

  const openReviewPending = !!(await getOpenDesignReview(roomId))

  // A11 — regulated layer (V1: FOOD/BEVERAGE Nutrition Facts). Resolve the room's
  // RECIPE label once; reuse for readiness + the deterministic panel. The panel is
  // placed into the die-line's NUTRITION_FACTS frame (normalized to the TRIM box)
  // converted to full-bleed mm; null when there's no panel data or no such frame
  // (skip — the maker reviews). Other domains + a no-frame default are follow-ups.
  const recipeLabel = await loadRoomRecipeLabel(roomId)
  const readiness = recipeLabel
    ? checkRoomLabelReadiness(recipeLabel)
    : ({ outcome: 'NOT_READY', items: [{ id: 'no-recipe', severity: 'BLOCKING', message: 'The recipe isn’t submitted yet — the label’s Facts panel can’t be generated.' }] } as RoomComplianceReport)

  let regulated: RoomLabelRegulated | null = null
  const isFoodish = recipeLabel?.domain === 'FOOD' || recipeLabel?.domain === 'BEVERAGE_FUNCTIONAL'
  if (recipeLabel && isFoodish && recipeLabel.panel) {
    const framesJson = chosen.frames as { frames?: Array<{ kind?: string; box?: { x: number; y: number; w: number; h: number } }> } | null
    const factsBox = framesJson?.frames?.find((f) => f.kind === 'NUTRITION_FACTS')?.box ?? null
    if (factsBox) {
      regulated = {
        panel: recipeLabel.panel,
        ingredientStatement: recipeLabel.statement,
        contains: recipeLabel.containsLine,
        // NormBox is 0..1 of the TRIM box; place inside the full-bleed canvas.
        frameBoxMm: {
          x: bleedMm + factsBox.x * widthMm,
          y: bleedMm + factsBox.y * heightMm,
          w: factsBox.w * widthMm,
          h: factsBox.h * heightMm,
        },
      }
    }
  }

  return {
    ok: true,
    ctx: {
      roomId,
      labelObjectId: label.id,
      briefTitle: room.brief.title,
      partnerName: room.partner.companyName,
      access: {
        isOwner: access.isOwner,
        seatId: access.seatId,
        canView: access.canView,
        canComment: access.canComment,
        canEdit: access.canEdit,
      },
      dielineId: chosen.id,
      dielineChoices: dielines.map((d) => ({ id: d.id, name: d.packagingType?.displayName ?? 'Die-line' })),
      substrateSvg,
      widthMm: widthMm + 2 * bleedMm,
      heightMm: heightMm + 2 * bleedMm,
      bleedMm,
      designId: designRow.id,
      latestVersion: latest?.version ?? 0,
      designJson: latest?.designJson ?? null,
      versions,
      openReviewPending,
      submitReadiness: {
        outcome: readiness.outcome,
        blocking: readiness.items.filter((i) => i.severity === 'BLOCKING').map((i) => i.message),
      },
      regulated,
    },
  }
}

/**
 * A10 — label compliance readiness for the room's proof submit. Resolves the
 * room's RECIPE label (same inputs as the room page) and runs the pure
 * checkRoomLabelReadiness pass. NOT_READY (with a reason) when there is no
 * submitted recipe / the facts can't be computed yet. Used by BOTH the Studio
 * resolver (to disable the submit button) and creatorSubmitLabelProof (the
 * authoritative gate) so they never disagree.
 */
/** Resolve the room's live domain-aware label from its latest submitted RECIPE
 *  version (same inputs as the room page). null when no recipe / not computable.
 *  Shared by the readiness pass (A10) and the regulated-layer build (A11). */
async function loadRoomRecipeLabel(roomId: string): Promise<RoomRecipeLabel | null> {
  const room = await prisma.coCreationRoom.findUnique({
    where: { id: roomId },
    select: {
      partnerId: true,
      brief: { select: { category: true } },
      objects: {
        where: { kind: 'RECIPE' },
        select: { versions: { orderBy: { version: 'desc' }, take: 1, select: { payload: true } } },
      },
    },
  })
  const payload = room?.objects[0]?.versions[0]?.payload
  if (!room || payload == null) return null
  return resolveRoomRecipeLabel({ partnerId: room.partnerId, domain: room.brief.category, payload })
}

export async function resolveRoomLabelReadiness(roomId: string): Promise<RoomComplianceReport> {
  const label = await loadRoomRecipeLabel(roomId)
  if (!label) {
    return {
      outcome: 'NOT_READY',
      items: [{ id: 'no-recipe', severity: 'BLOCKING', message: 'The recipe isn’t submitted yet — the label’s Facts panel can’t be generated.' }],
    }
  }
  return checkRoomLabelReadiness(label)
}

/** Human copy for a block reason (shown on the Studio gate screen). */
export function roomLabelBlockCopy(reason: RoomLabelBlock): { title: string; body: string } {
  switch (reason) {
    case 'NO_ACCESS':
      return { title: 'No access to this workspace', body: 'You need an active invitation to design this label.' }
    case 'NOT_ACTIVE':
      return { title: 'This room isn’t active', body: 'The collaboration room is closed, so its label workspace is unavailable.' }
    case 'PACKAGING_NOT_APPROVED':
      return {
        title: 'Approve the packaging first',
        body: 'The packaging has to be approved before you design its label — that’s what pins the die-line you’ll design on.',
      }
    case 'DIELINE_NOT_READY':
      return {
        title: 'The maker’s die-line is being prepared',
        body: 'A print-ready die-line isn’t available for this packaging yet. You’ll be able to design as soon as the maker’s die-line is normalized.',
      }
    case 'NO_BRAND':
      return { title: 'Set up your brand first', body: 'Add a brand (logo, colors) in your brand settings — the label editor builds on it.' }
  }
}
