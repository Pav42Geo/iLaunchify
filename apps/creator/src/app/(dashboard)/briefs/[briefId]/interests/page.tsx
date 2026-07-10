import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { InterestsClient, type InterestCard } from './InterestsClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Interested makers — iLaunchify' }

/**
 * Shortlist & Selection — compare interested makers, star, compare up to 3,
 * select one. CO_CREATION_MARKETPLACE_SPEC §16 P0, prototype screen ③.
 * Ownership is enforced in the query (creator: { userId }) — a foreign brief
 * 404s rather than leaking existence (tenant isolation, threat #1).
 */
export default async function BriefInterestsPage({
  params,
}: {
  params: Promise<{ briefId: string }>
}) {
  const user = await requireUser()
  const { briefId } = await params

  const brief = await prisma.productBrief.findFirst({
    where: { id: briefId, creator: { userId: user.id } },
    include: {
      room: { select: { id: true } },
      interests: {
        where: { status: { in: ['SUBMITTED', 'SHORTLISTED', 'SELECTED'] } },
        include: {
          partner: {
            select: { companyName: true, city: true, state: true, tier: true },
          },
          service: { select: { ratingBayesian: true } },
        },
        orderBy: { fitScore: 'desc' },
      },
    },
  })
  if (!brief) notFound()

  // Already matched → go straight to the room.
  if (brief.status === 'IN_ROOM' && brief.room) {
    redirect(`/rooms/${brief.room.id}`)
  }

  const niche = await prisma.niche.findFirst({
    where: { slug: brief.nicheSlug },
    select: { name: true, iconEmoji: true },
  })

  const cards: InterestCard[] = brief.interests.map((i) => ({
    id: i.id,
    status: i.status,
    partnerName: i.partner.companyName,
    partnerTier: i.partner.tier,
    location: [i.partner.city, i.partner.state].filter(Boolean).join(', ') || null,
    rating: i.service?.ratingBayesian === null || i.service?.ratingBayesian === undefined
      ? null
      : Number(i.service.ratingBayesian),
    fitScore: i.fitScore,
    priceLow: i.priceLow === null ? null : String(i.priceLow),
    priceHigh: i.priceHigh === null ? null : String(i.priceHigh),
    moq: i.moq,
    leadTimeWeeks: i.leadTimeWeeks,
    offersSample: i.offersSample,
    pitch: i.pitch,
    claimFit: (i.claimFit ?? {}) as Record<string, boolean>,
  }))

  return (
    <div className="space-y-6">
      <div>
        <nav className="mb-2 text-ui-caption text-ink-500">
          <Link href="/products" className="hover:underline">
            ← Products
          </Link>
        </nav>
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <h1 className="font-display text-ui-title">{brief.title}</h1>
            <p className="mt-1 text-ui-body text-ink-500">
              Your brief · {niche ? `${niche.iconEmoji ?? ''} ${niche.name}` : brief.nicheSlug}
              {brief.targetVolume ? ` · ${brief.targetVolume.toLocaleString()} units` : ''}
              {brief.timelineWeeks ? ` · ${brief.timelineWeeks} wk` : ''}
            </p>
          </div>
          <div className="ml-auto rounded-2xl border border-ink-200 bg-white px-5 py-3 text-center">
            <div className="font-display text-ui-value">{cards.length}</div>
            <div className="text-ui-caption text-ink-500">
              {cards.length === 1 ? 'maker interested' : 'makers interested'}
            </div>
          </div>
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-3xl border border-ink-200 bg-white px-6 py-14 text-center">
          <div className="text-3xl">📡</div>
          <p className="mt-2 font-display text-ui-subhead">No interest yet</p>
          <p className="mx-auto mt-1 max-w-md text-ui-caption text-ink-500">
            Your brief is live with fit-matched manufacturers. Interest usually starts within
            hours — we’ll notify you the moment a maker raises their hand.
          </p>
        </div>
      ) : (
        <InterestsClient briefId={brief.id} briefClaims={brief.claims} interests={cards} />
      )}
    </div>
  )
}
