// Co-creation staged reveal — the PUBLIC projection of a ProductBrief.
// docs/CO_CREATION_MARKETPLACE_SPEC.md §9 + §13. A partner may only ever see
// this projection until they are SELECTED and the mutual NDA exists; the
// private payload (privateFormula, privateNotes, isPrivate attachments)
// reveals only inside the room.
//
// SECURITY SHAPE: this is an ALLOWLIST constructor, not a field-blocklist.
// Every public field is copied explicitly, so adding a new private column to
// ProductBrief can never leak by default. Pure + Prisma-free (structural
// input type) so it runs in run-vitest-suites.mjs and can wrap any query
// result. NEVER send a raw ProductBrief row through pool/interest APIs —
// always pass it through toPublicBriefProjection first.

/** Narrow structural view of a ProductBrief row (+ optional relations). */
export interface BriefProjectionInput {
  id: string
  title: string
  origin: string // BriefOrigin
  status: string // BriefStatus
  nicheSlug: string
  category: string // ProductCategory domain enum
  categoryId?: string | null
  claims: string[]
  targetVolume?: number | null
  budgetLow?: unknown // Prisma Decimal | number | string | null
  budgetHigh?: unknown
  timelineWeeks?: number | null
  formulationMode: string // FormulationMode
  createdAt?: Date | string
  // Private payload — accepted so callers can pass a full row, NEVER emitted.
  privateFormula?: unknown
  privateNotes?: string | null
  attachments?: Array<{ id: string; isPrivate: boolean; assetId: string; kind: string }>
  // Optional public creator context for the pool card (screen ②).
  creator?: {
    displayName?: string | null
    handle?: string | null
    audienceSize?: number | null
  } | null
}

/** What the Opportunity Pool + interest APIs are allowed to serve. */
export interface PublicBriefProjection {
  id: string
  title: string
  origin: string
  status: string
  nicheSlug: string
  category: string
  categoryId: string | null
  claims: string[]
  targetVolume: number | null
  budgetLow: string | null
  budgetHigh: string | null
  timelineWeeks: number | null
  formulationMode: string
  createdAt: string | null
  /** Public attachments only (isPrivate === false). */
  attachments: Array<{ id: string; assetId: string; kind: string }>
  creator: {
    displayName: string | null
    handle: string | null
    audienceSize: number | null
  } | null
}

function decimalToString(v: unknown): string | null {
  if (v === null || v === undefined) return null
  return String(v)
}

/**
 * Build the public projection of a brief. Explicit allowlist — do not
 * spread the input. See module header.
 */
export function toPublicBriefProjection(brief: BriefProjectionInput): PublicBriefProjection {
  return {
    id: brief.id,
    title: brief.title,
    origin: brief.origin,
    status: brief.status,
    nicheSlug: brief.nicheSlug,
    category: brief.category,
    categoryId: brief.categoryId ?? null,
    claims: [...brief.claims],
    targetVolume: brief.targetVolume ?? null,
    budgetLow: decimalToString(brief.budgetLow),
    budgetHigh: decimalToString(brief.budgetHigh),
    timelineWeeks: brief.timelineWeeks ?? null,
    formulationMode: brief.formulationMode,
    createdAt: brief.createdAt ? new Date(brief.createdAt).toISOString() : null,
    attachments: (brief.attachments ?? [])
      .filter((a) => a.isPrivate === false)
      .map((a) => ({ id: a.id, assetId: a.assetId, kind: a.kind })),
    creator: brief.creator
      ? {
          displayName: brief.creator.displayName ?? null,
          handle: brief.creator.handle ?? null,
          audienceSize: brief.creator.audienceSize ?? null,
        }
      : null,
  }
}
