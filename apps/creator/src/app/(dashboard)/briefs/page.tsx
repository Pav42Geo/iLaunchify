import { prisma, getCoCreationSettings } from '@ilaunchify/db'
import { requireUser, getEffectiveCreatorTier, hasTier } from '@ilaunchify/auth'
import { resolveCreatorTierPricing } from '@ilaunchify/plans'
import { redirect } from 'next/navigation'
import { nicheGradientKey, relativeTime } from '@ilaunchify/ui'
import { productGradient } from '@ilaunchify/ui/tokens'
import { PostBriefCta } from './PostBriefCta'
import { BriefsListClient, type BriefBucket, type BriefCardVM } from './BriefsListClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your briefs — iLaunchify' }

// Creator briefs index — refactored 2026-07-12 to the approved prototype
// (design/your-briefs-prototype.html): stats strip, stage filter tabs, sort,
// and rich journey cards. This file resolves everything server-side into
// serializable view models; BriefsListClient owns filter/sort/render.

const BUCKET: Record<string, BriefBucket> = {
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
const JOURNEY_STEP: Record<string, number> = {
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

const DAY_MS = 86_400_000

function fmtBudget(low: unknown, high: unknown): string | null {
  const lo = low == null ? null : Number(low)
  const hi = high == null ? null : Number(high)
  if (lo == null && hi == null) return null
  if (lo != null && hi != null) return `$${lo.toFixed(2)}–${hi.toFixed(2)}`
  return `$${(lo ?? hi)!.toFixed(2)}`
}

export default async function BriefsIndexPage() {
  const user = await requireUser()
  const profile = await prisma.creatorProfile.findUnique({ where: { userId: user.id } })
  if (!profile) redirect('/onboarding/creator')

  const [briefs, niches, settings] = await Promise.all([
    prisma.productBrief.findMany({
      where: { creatorId: profile.id },
      include: {
        categoryRef: { select: { name: true } },
        interests: {
          where: { status: { in: ['SUBMITTED', 'SHORTLISTED', 'SELECTED'] } },
          select: { createdAt: true },
        },
        // Latest room = current context (ACTIVE, or CLOSED_WON post-
        // materialization). 1:N since D-CC3 maker switching.
        rooms: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            materializedProductId: true,
            partner: { select: { companyName: true } },
            // Partner submissions awaiting the creator's review — drives the
            // pulsing attention chip + warning meta line on room cards.
            objects: {
              where: { status: { in: ['SUBMITTED', 'IN_REVIEW'] } },
              select: { kind: true, currentVersion: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.niche.findMany({
      where: { isActive: true },
      select: { slug: true, name: true, iconEmoji: true },
    }),
    getCoCreationSettings(),
  ])

  const nicheBySlug = new Map(niches.map((n) => [n.slug, n]))
  const tier = await getEffectiveCreatorTier(user)
  const canPost = hasTier(tier, 'builder')
  // Live tier pricing for the Maker upgrade modal — resolved from the plan
  // ladder (never drifts). Only fetched when the creator is actually gated.
  const pricing = canPost ? undefined : await resolveCreatorTierPricing()

  const now = Date.now()
  const windowMs = settings.interestWindowDays * DAY_MS

  const cards: BriefCardVM[] = briefs.map((b) => {
    const n = nicheBySlug.get(b.nicheSlug)
    const bucket = BUCKET[b.status] ?? 'other'
    const room = b.rooms[0] ?? null
    const review = room?.objects[0] ?? null
    const reviewKind = review ? review.kind.toLowerCase().replace(/_/g, ' ') : null

    const interested = b.interests.length
    const newInterests = b.interests.filter((i) => now - i.createdAt.getTime() < 2 * DAY_MS).length

    const inPool = b.status === 'POSTED' || b.status === 'INTEREST_OPEN' || b.status === 'SHORTLISTING'
    const poolDaysLeft = inPool
      ? Math.max(0, Math.ceil((b.createdAt.getTime() + windowMs - now) / DAY_MS))
      : null

    const attention =
      bucket === 'choosing' && interested > 0
        ? `${interested} interest${interested === 1 ? '' : 's'} — compare & pick`
        : bucket === 'room' && review
          ? `${reviewKind} v${review.currentVersion} — your review`
          : null

    return {
      id: b.id,
      title: b.title,
      nicheName: n?.name ?? b.nicheSlug,
      emoji: n?.iconEmoji ?? '🧪',
      gradient: productGradient[nicheGradientKey(b.nicheSlug)],
      bucket,
      rawStatus: b.status,
      postedAgo: relativeTime(b.createdAt),
      createdAtMs: b.createdAt.getTime(),
      vol: b.targetVolume ? b.targetVolume.toLocaleString('en-US') : null,
      budget: fmtBudget(b.budgetLow, b.budgetHigh),
      lead: b.timelineWeeks ? `${b.timelineWeeks} wk` : null,
      category: b.categoryRef?.name ?? null,
      makerName: bucket === 'room' || bucket === 'prod' ? (room?.partner.companyName ?? null) : null,
      roomId: room?.id ?? null,
      productId: room?.materializedProductId ?? null,
      interested,
      newInterests,
      poolDaysLeft,
      attention,
      roomLine: bucket === 'room' && review ? `${reviewKind} v${review.currentVersion} needs your review` : null,
      journey: JOURNEY_STEP[b.status] ?? 0,
      fresh: bucket === 'open' && now - b.createdAt.getTime() < DAY_MS,
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-s-3">
        <div>
          <h1 className="font-display text-ui-title">Your briefs</h1>
          <p className="mt-s-1 text-ui-body text-ink-500">
            Products you're{' '}
            <em className="font-serif font-medium italic text-pink-700">co-creating</em> with
            iLaunchify manufacturers — from idea to production.
          </p>
        </div>
        <span className="flex-1" />
        {/* Maker-tier gate lives here: Builder+ links to the builder, Maker
            opens the upgrade modal (Pavel 2026-07-11). */}
        <PostBriefCta canPost={canPost} pricing={pricing} label={canPost ? '＋ Post a brief' : 'Co-create a product →'} />
      </div>

      {cards.length === 0 ? (
        <div className="rounded-xl border border-ink-200 bg-white px-s-5 py-s-8 text-center">
          <div className="text-[40px]">💡</div>
          <p className="mt-s-2 font-display text-ui-section">Nothing here yet</p>
          <p className="mx-auto mt-s-1 max-w-[46ch] text-ui-caption text-ink-500">
            Bring a recipe or just an idea — post a brief and fit-matched, verified manufacturers
            raise their hands. You compare, pick one, and build together in a private room.
          </p>
          <div className="mt-s-4">
            <PostBriefCta canPost={canPost} pricing={pricing} label="Start your first brief →" variant="link" />
          </div>
        </div>
      ) : (
        <BriefsListClient briefs={cards} />
      )}
    </div>
  )
}
