// Creator → Brands — the Brand Kit hub (docs/BRAND_KIT_PROPOSAL.md).
//
// Lists the creator's brand kits as cards (logo + swatches), shows tier usage
// ("2 of 3 kits"), and gates "New brand kit" by brandLimits(tier). Each kit links
// to its asset editor. Collision-safe (profile area, not the canvas).

import Link from 'next/link'
import { Plus, ArrowRight, Lock, Palette } from 'lucide-react'
import { requireUser, getCreatorTier, brandLimits, nextTier } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { resolveAssetReadUrl } from '@/lib/asset-url'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Brand kits — iLaunchify' }

export default async function BrandsHubPage() {
  const user = await requireUser()
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })

  const tier = await getCreatorTier(user.id)
  const cap = brandLimits(tier).kits
  const capLabel = Number.isFinite(cap) ? String(cap) : 'Unlimited'
  const up = nextTier(tier)

  const brands = profile
    ? await prisma.brand.findMany({
        where: { creatorProfileId: profile.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          handle: true,
          tagline: true,
          isActive: true,
          colorPrimary: true,
          colorSecondary: true,
          colorAccent: true,
          brandSwatches: true,
          brandFontIds: true,
          logoAssetId: true,
        },
      })
    : []

  // logoAssetId is a loose FK (validated in app code) — resolve logo URLs in one query.
  const logoIds = brands.map((b) => b.logoAssetId).filter((x): x is string => Boolean(x))
  const logoAssets = logoIds.length
    ? await prisma.asset.findMany({
        where: { id: { in: logoIds } },
        select: { id: true, publicUrl: true, storageKey: true },
      })
    : []
  const logoUrlEntries = await Promise.all(
    logoAssets.map(async (a) => [a.id, await resolveAssetReadUrl(a)] as const),
  )
  const logoUrl = new Map(logoUrlEntries)

  const used = brands.length
  const atCap = Number.isFinite(cap) && used >= cap

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          Creator · Brand
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Brand kits
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Your logos, colors, and fonts — applied to your packaging in the Design Studio. Each
          kit is one brand identity.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="text-[13px] text-ink-700">
            <span className="font-semibold text-ink-900">{used}</span> of {capLabel}{' '}
            kit{capLabel === '1' ? '' : 's'} used
          </span>
          {atCap ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-medium text-ink-500">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              {up ? `Upgrade to ${up[0]!.toUpperCase() + up.slice(1)} for more` : 'Kit limit reached'}
            </span>
          ) : (
            <Link
              href="/brands/new"
              className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              New brand kit
            </Link>
          )}
          {atCap && up && (
            <Link href="/settings/plan" className="text-[12px] font-semibold text-pink-700 hover:text-pink-800">
              See plans →
            </Link>
          )}
        </div>
      </div>

      {brands.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-12 text-center">
          <Palette className="mx-auto h-7 w-7 text-ink-400" aria-hidden="true" />
          <p className="mt-3 text-[14px] font-semibold text-ink-900">Create your first brand kit</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-500">
            Add your logo, colors, and fonts once — then apply them to every product you design.
          </p>
          <Link
            href="/brands/new"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-ink-700"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New brand kit
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {brands.map((b) => {
            const swatches = [b.colorPrimary, b.colorSecondary, b.colorAccent, ...(b.brandSwatches ?? [])]
              .filter((c): c is string => Boolean(c))
              .slice(0, 6)
            const url = b.logoAssetId ? logoUrl.get(b.logoAssetId) ?? null : null
            return (
              <Link
                key={b.id}
                href={`/brands/${b.id}/assets`}
                className="group flex flex-col rounded-2xl border border-ink-200 bg-white p-5 transition-colors hover:border-ink-300 hover:bg-ink-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ink-200 bg-ink-50">
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="" className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-[15px] font-bold text-ink-400">
                        {b.name.trim().charAt(0).toUpperCase() || 'B'}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-display text-[16px] font-semibold text-ink-900">{b.name}</span>
                      {!b.isActive && (
                        <span className="rounded-full border border-ink-200 bg-ink-100 px-2 py-[1px] text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[12px] text-ink-500">@{b.handle}</div>
                  </div>
                </div>

                {b.tagline && <p className="mt-3 line-clamp-1 text-[13px] text-ink-600">{b.tagline}</p>}

                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {swatches.length > 0 ? (
                      swatches.map((c, i) => (
                        <span
                          key={i}
                          className="h-5 w-5 rounded-md border border-ink-200"
                          style={{ backgroundColor: c }}
                        />
                      ))
                    ) : (
                      <span className="text-[12px] text-ink-400">No colors yet</span>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-pink-700 group-hover:text-pink-800">
                    Edit kit
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </div>

                <div className="mt-2 text-[11px] text-ink-400">
                  {(b.brandFontIds?.length ?? 0)} font{(b.brandFontIds?.length ?? 0) === 1 ? '' : 's'} ·{' '}
                  {swatches.length} color{swatches.length === 1 ? '' : 's'}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
