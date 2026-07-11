import { prisma } from '@ilaunchify/db'
import { requireUser, getEffectiveCreatorTier, hasTier } from '@ilaunchify/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { nicheGradientKey } from '@ilaunchify/ui'
import { productGradient } from '@ilaunchify/ui/tokens'
import { PostBriefCta } from './PostBriefCta'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your briefs — iLaunchify' }

// Creator briefs index — every co-creation brief this creator owns, with a
// status-appropriate destination (interests page while choosing, room once
// matched). Closes the navigation gap where briefs were only reachable via
// notification deep links (2026-07-10).

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-ink-100 text-ink-600' },
  POSTED: { label: 'Routing', cls: 'bg-info-50 text-info-700' },
  INTEREST_OPEN: { label: 'Open in pool', cls: 'bg-info-50 text-info-700' },
  SHORTLISTING: { label: 'Shortlisting', cls: 'bg-warning-50 text-warning-700' },
  MATCHED: { label: 'Maker selected', cls: 'bg-success-50 text-success-700' },
  IN_ROOM: { label: 'In collaboration', cls: 'bg-success-50 text-success-700' },
  IN_PRODUCTION: { label: 'In production', cls: 'bg-success-50 text-success-700' },
  COMPLETED: { label: 'Completed', cls: 'bg-success-50 text-success-700' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-ink-100 text-ink-600' },
  EXPIRED: { label: 'Expired', cls: 'bg-ink-100 text-ink-600' },
}

function briefHref(brief: { id: string; status: string; roomId: string | null }): string {
  if (brief.roomId && (brief.status === 'IN_ROOM' || brief.status === 'IN_PRODUCTION' || brief.status === 'COMPLETED')) {
    return `/rooms/${brief.roomId}`
  }
  return `/briefs/${brief.id}/interests`
}

export default async function BriefsIndexPage() {
  const user = await requireUser()
  const profile = await prisma.creatorProfile.findUnique({ where: { userId: user.id } })
  if (!profile) redirect('/onboarding/creator')

  const briefs = await prisma.productBrief.findMany({
    where: { creatorId: profile.id },
    include: {
      // Latest room = current context (ACTIVE, or CLOSED_WON post-
      // materialization). 1:N since D-CC3 maker switching.
      rooms: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true } },
      categoryRef: { select: { name: true } },
      _count: { select: { interests: { where: { status: { in: ['SUBMITTED', 'SHORTLISTED', 'SELECTED'] } } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const niches = await prisma.niche.findMany({
    where: { isActive: true },
    select: { slug: true, name: true, iconEmoji: true },
  })
  const nicheBySlug = new Map(niches.map((n) => [n.slug, n]))
  const tier = await getEffectiveCreatorTier(user)
  const canPost = hasTier(tier, 'builder')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-s-3">
        <div>
          <h1 className="font-display text-ui-title">Your briefs</h1>
          <p className="mt-s-1 text-ui-body text-ink-500">
            Products you're co-creating with iLaunchify manufacturers — from idea to production.
          </p>
        </div>
        <span className="flex-1" />
        {/* Maker-tier gate lives here: Builder+ links to the builder, Maker
            opens the upgrade modal (Pavel 2026-07-11). */}
        <PostBriefCta canPost={canPost} label={canPost ? '＋ Post a brief' : 'Co-create a product →'} />
      </div>

      {briefs.length === 0 ? (
        <div className="rounded-xl border border-ink-200 bg-white px-s-5 py-s-8 text-center">
          <div className="text-3xl">💡</div>
          <p className="mt-s-2 font-display text-ui-section">No briefs yet</p>
          <p className="mx-auto mt-s-1 max-w-md text-ui-caption text-ink-500">
            Bring a recipe or just an idea — post a brief and fit-matched, verified manufacturers
            raise their hands. You compare, pick one, and build together in a private room.
          </p>
          <div className="mt-s-4">
            <PostBriefCta canPost={canPost} label="Start your first brief →" variant="link" />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {briefs.map((b) => {
            const n = nicheBySlug.get(b.nicheSlug)
            const pill = STATUS_PILL[b.status] ?? STATUS_PILL.DRAFT!
            return (
              <Link
                key={b.id}
                href={briefHref({ id: b.id, status: b.status, roomId: b.rooms[0]?.id ?? null })}
                className="flex items-center gap-s-3 rounded-xl border border-ink-200 bg-white p-s-4 shadow-sm transition hover:border-pink-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
              >
                <span
                  aria-hidden
                  className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-ui-section"
                  style={{ background: productGradient[nicheGradientKey(b.nicheSlug)] }}
                >
                  {n?.iconEmoji ?? '🧪'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-ui-section">{b.title}</span>
                  <span className="text-ui-caption text-ink-500">
                    {n ? `${n.iconEmoji ?? ''} ${n.name}` : b.nicheSlug}
                    {b.categoryRef ? ` · ${b.categoryRef.name}` : ''}
                    {b.targetVolume ? ` · ${b.targetVolume.toLocaleString()} units` : ''}
                  </span>
                </span>
                <span className="flex-none text-right">
                  <span className="block font-display text-ui-value text-pink-600">
                    {b._count.interests}
                  </span>
                  <span className="text-ui-label uppercase text-ink-400">
                    {b._count.interests === 1 ? 'maker' : 'makers'}
                  </span>
                </span>
                <span className={`flex-none rounded-pill px-s-3 py-s-1 text-ui-label tracking-normal ${pill.cls}`}>
                  {pill.label}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
