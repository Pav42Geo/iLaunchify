// Pure view-model mapper for the Your-briefs list (design/your-briefs-prototype.html).
// No React, no Prisma — page.tsx resolves DB rows + CoCreationSettings and calls
// toBriefCardVM(); BriefsListClient renders the result. Unit-tested in
// brief-card-vm.test.ts (creator vitest node suite).

export type BriefBucket = 'open' | 'choosing' | 'room' | 'prod' | 'other'

export interface BriefCardVM {
  id: string
  title: string
  nicheName: string
  emoji: string
  /** Resolved CSS gradient (productGradient[nicheGradientKey(slug)]). */
  gradient: string
  bucket: BriefBucket
  rawStatus: string
  /** Server-computed relative time ("2d ago") — stable across hydration. */
  postedAgo: string
  createdAtMs: number
  vol: string | null
  budget: string | null
  lead: string | null
  category: string | null
  makerName: string | null
  roomId: string | null
  productId: string | null
  interested: number
  newInterests: number
  /** Days left in the interest window (pool statuses only). */
  poolDaysLeft: number | null
  /** Pulsing attention chip text — null when nothing needs the creator. */
  attention: string | null
  /** Warning-colored meta line, e.g. "recipe v2 needs your review". */
  roomLine: string | null
  /** 0 Posted · 1 Interests · 2 Shortlist · 3 Room · 4 Production · 5 done. */
  journey: number
  fresh: boolean
}

/** DB shape the mapper needs — page.tsx projects the Prisma row into this. */
export interface BriefRowInput {
  id: string
  title: string
  status: string
  createdAt: Date
  targetVolume: number | null
  /** Prisma Decimal | number | string | null — normalized via Number(). */
  budgetLow: unknown
  budgetHigh: unknown
  timelineWeeks: number | null
  categoryName: string | null
  /** createdAt of every live interest (SUBMITTED/SHORTLISTED/SELECTED). */
  interestCreatedAts: Date[]
  /** Latest room, if any. */
  room: {
    id: string
    materializedProductId: string | null
    partnerName: string
    /** First partner submission awaiting creator review (SUBMITTED/IN_REVIEW). */
    review: { kind: string; currentVersion: number } | null
  } | null
}

export interface BriefVmContext {
  now: number
  /** CoCreationSettings.interestWindowDays — admin-tunable, never hardcoded. */
  interestWindowDays: number
  nicheName: string
  emoji: string
  gradient: string
}

export const BUCKET: Record<string, BriefBucket> = {
  POSTED: 'open',
  INTEREST_OPEN: 'open',
  SHORTLISTING: 'choosing',
  MATCHED: 'room',
  IN_ROOM: 'room',
  IN_PRODUCTION: 'prod',
  COMPLETED: 'prod',
  DRAFT: 'other',
  CANCELLED: 'other',
  EXPIRED: 'other',
}

// Posted(0) → Interests(1) → Shortlist(2) → Room(3) → Production(4) → done(5)
export const JOURNEY_STEP: Record<string, number> = {
  DRAFT: 0,
  POSTED: 1,
  INTEREST_OPEN: 1,
  SHORTLISTING: 2,
  MATCHED: 3,
  IN_ROOM: 3,
  IN_PRODUCTION: 4,
  COMPLETED: 5,
  CANCELLED: 1,
  EXPIRED: 1,
}

export const DAY_MS = 86_400_000
/** An interest is "new" while younger than this (bold pink count in the stack). */
export const NEW_INTEREST_MS = 2 * DAY_MS
/** A brief is "fresh" (pink ring) while younger than this and still open. */
export const FRESH_MS = DAY_MS

export function fmtBudget(low: unknown, high: unknown): string | null {
  const lo = low == null ? null : Number(low)
  const hi = high == null ? null : Number(high)
  if (lo == null && hi == null) return null
  if (lo != null && hi != null) return `$${lo.toFixed(2)}–${hi.toFixed(2)}`
  return `$${(lo ?? hi)!.toFixed(2)}`
}

/** Server-safe relative time — prototype style ("6h ago" / "2d ago" / "6w ago"). */
export function postedAgo(date: Date, now: number): string {
  const m = Math.max(0, Math.round((now - date.getTime()) / 60_000))
  if (m < 60) return `${Math.max(1, m)}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  const w = Math.round(d / 7)
  if (w < 9) return `${w}w ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function toBriefCardVM(row: BriefRowInput, ctx: BriefVmContext): BriefCardVM {
  const bucket = BUCKET[row.status] ?? 'other'
  const review = row.room?.review ?? null
  const reviewKind = review ? review.kind.toLowerCase().replace(/_/g, ' ') : null
  const createdMs = row.createdAt.getTime()

  const interested = row.interestCreatedAts.length
  const newInterests = row.interestCreatedAts.filter(
    (d) => ctx.now - d.getTime() < NEW_INTEREST_MS,
  ).length

  // Pool window = createdAt + interestWindowDays (CoCreationSettings). Only
  // meaningful while the brief is actually in the pool.
  const inPool =
    row.status === 'POSTED' || row.status === 'INTEREST_OPEN' || row.status === 'SHORTLISTING'
  const poolDaysLeft = inPool
    ? Math.max(0, Math.ceil((createdMs + ctx.interestWindowDays * DAY_MS - ctx.now) / DAY_MS))
    : null

  // Attention = the creator is the blocker: interests waiting on a pick, or a
  // partner submission waiting on review. INTEREST_OPEN with interests counts —
  // SHORTLISTING only starts once the creator stars something (brief-fsm.ts),
  // so the pre-star pile-up is exactly the "compare & pick" moment.
  const attention =
    (bucket === 'choosing' || bucket === 'open') && interested > 0
      ? `${interested} interest${interested === 1 ? '' : 's'} — compare & pick`
      : bucket === 'room' && review
        ? `${reviewKind} v${review.currentVersion} — your review`
        : null

  return {
    id: row.id,
    title: row.title,
    nicheName: ctx.nicheName,
    emoji: ctx.emoji,
    gradient: ctx.gradient,
    bucket,
    rawStatus: row.status,
    postedAgo: postedAgo(row.createdAt, ctx.now),
    createdAtMs: createdMs,
    vol: row.targetVolume ? row.targetVolume.toLocaleString('en-US') : null,
    budget: fmtBudget(row.budgetLow, row.budgetHigh),
    lead: row.timelineWeeks ? `${row.timelineWeeks} wk` : null,
    category: row.categoryName,
    makerName: bucket === 'room' || bucket === 'prod' ? (row.room?.partnerName ?? null) : null,
    roomId: row.room?.id ?? null,
    productId: row.room?.materializedProductId ?? null,
    interested,
    newInterests,
    poolDaysLeft,
    attention,
    roomLine:
      bucket === 'room' && review ? `${reviewKind} v${review.currentVersion} needs your review` : null,
    journey: JOURNEY_STEP[row.status] ?? 0,
    fresh: bucket === 'open' && ctx.now - createdMs < FRESH_MS,
  }
}
