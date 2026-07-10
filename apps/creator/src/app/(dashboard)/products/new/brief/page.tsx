import { prisma } from '@ilaunchify/db'
import { requireUser, getEffectiveCreatorTier, hasTier } from '@ilaunchify/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { marketingUrl } from '@/lib/marketing-url'
import { BriefBuilderClient } from './BriefBuilderClient'

export const dynamic = 'force-dynamic'

/**
 * Co-creation Brief Builder — two doors, wizard, live manufacturer preview.
 * CO_CREATION_MARKETPLACE_SPEC §16 P0, prototype screen ①.
 *
 * D-CC1: co-creation is a Builder/Agency feature. Maker-tier creators see an
 * upgrade panel (the familiar /settings/plan self-serve path) instead of the
 * wizard; the postBrief server action enforces the same gate server-side.
 */
export default async function BriefBuilderPage() {
  const user = await requireUser()
  if (user.role !== 'CREATOR' && user.role !== 'ADMIN') {
    redirect(marketingUrl('/marketplace?error=creator-only'))
  }

  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: user.id },
  })
  if (!profile) redirect('/onboarding/creator')

  // D-CC1 tier gate (UX layer — the server action re-checks).
  const tier = await getEffectiveCreatorTier(user)
  if (!hasTier(tier, 'builder')) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-ink-200 bg-white p-10 text-center">
        <div className="text-4xl">🤝</div>
        <h1 className="mt-3 font-display text-ui-title">Co-create with a manufacturer</h1>
        <p className="mt-2 text-ui-body text-ink-500">
          Post your own product brief — a recipe or just an idea — and get it formulated, branded,
          and produced by a matched, verified maker. Co-creation briefs are included in the{' '}
          <b>Builder</b> and <b>Agency</b> plans.
        </p>
        <Link
          href="/settings/plan"
          className="mt-6 inline-flex items-center justify-center rounded-full bg-ink-900 px-6 py-3 text-ui-body font-semibold text-white transition hover:-translate-y-px"
        >
          Upgrade to Builder →
        </Link>
      </div>
    )
  }

  // Taxonomy for the wizard: 8 locked niches + 13 locked categories (D-CC7:
  // all 13 open — no category gate).
  const [niches, categories] = await Promise.all([
    prisma.niche.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
      select: { slug: true, name: true, iconEmoji: true },
    }),
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
      select: { id: true, name: true, icon: true },
    }),
  ])

  return (
    <div className="space-y-6">
      <BriefBuilderClient
        niches={niches.map((n) => ({ slug: n.slug, name: n.name, icon: n.iconEmoji ?? '✦' }))}
        categories={categories}
        creatorName={profile.displayName}
        creatorHandle={profile.handle ? `@${profile.handle}` : null}
      />
    </div>
  )
}
