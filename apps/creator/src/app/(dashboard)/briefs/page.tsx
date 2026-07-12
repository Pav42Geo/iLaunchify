import { prisma, getCoCreationSettings } from '@ilaunchify/db'
import { requireUser, getEffectiveCreatorTier, hasTier } from '@ilaunchify/auth'
import { resolveCreatorTierPricing } from '@ilaunchify/plans'
import { redirect } from 'next/navigation'
import { nicheGradientKey } from '@ilaunchify/ui'
import { productGradient } from '@ilaunchify/ui/tokens'
import { PostBriefCta } from './PostBriefCta'
import { BriefsListClient } from './BriefsListClient'
import { toBriefCardVM, type BriefCardVM } from './brief-card-vm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your briefs — iLaunchify' }

// Creator briefs index — refactored 2026-07-12 to the approved prototype
// (design/your-briefs-prototype.html): stats strip, stage filter tabs, sort,
// and rich journey cards. All numbers are DB-resolved (interests, rooms,
// review-pending BuildObjects) + admin-tunable CoCreationSettings; the pure
// mapping lives in brief-card-vm.ts (unit-tested), BriefsListClient renders.

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

  const cards: BriefCardVM[] = briefs.map((b) => {
    const n = nicheBySlug.get(b.nicheSlug)
    const room = b.rooms[0] ?? null
    return toBriefCardVM(
      {
        id: b.id,
        title: b.title,
        status: b.status,
        createdAt: b.createdAt,
        targetVolume: b.targetVolume,
        budgetLow: b.budgetLow,
        budgetHigh: b.budgetHigh,
        timelineWeeks: b.timelineWeeks,
        categoryName: b.categoryRef?.name ?? null,
        interestCreatedAts: b.interests.map((i) => i.createdAt),
        room: room
          ? {
              id: room.id,
              materializedProductId: room.materializedProductId,
              partnerName: room.partner.companyName,
              review: room.objects[0] ?? null,
            }
          : null,
      },
      {
        now,
        interestWindowDays: settings.interestWindowDays,
        nicheName: n?.name ?? b.nicheSlug,
        emoji: n?.iconEmoji ?? '🧪',
        gradient: productGradient[nicheGradientKey(b.nicheSlug)],
      },
    )
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
