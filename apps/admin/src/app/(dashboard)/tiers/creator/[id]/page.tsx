// REBUILD R15.d — admin per-creator tier + override edit page.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { listEntityHistory } from '@ilaunchify/audit'
import { AccountTierEditor } from '../../AccountTierEditor'
import { CREATOR_TIER_STYLE, tierPillStyle } from '../../tier-style'
import { changeCreatorTier, setCreatorFeeOverride } from '../../actions'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CreatorTierEditPage({ params }: PageProps) {
  await requireRole(['ADMIN'])
  const { id } = await params

  const profile = await prisma.creatorProfile.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, name: true } },
      _count: { select: { brands: true } },
    },
  })
  if (!profile) notFound()

  const history = await listEntityHistory('CreatorProfile', profile.id, 20)
  const palette = CREATOR_TIER_STYLE[profile.subscriptionTier]

  return (
    <div className="space-y-6">
      <Link
        href="/tiers"
        className="inline-flex items-center gap-1 text-[12px] text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden="true" /> All creators
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-5">
        <div className="min-w-0">
          <div className="text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500">
            Creator
          </div>
          <h1 className="mt-1 font-display text-xl font-semibold tracking-tight text-zinc-900">
            {profile.displayName}
          </h1>
          <p className="mt-0.5 text-[12.5px] text-zinc-500">
            @{profile.handle} · {profile.user.email} · {profile._count.brands} brand
            {profile._count.brands === 1 ? '' : 's'}
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[10.5px] font-medium uppercase tracking-[0.04em]"
          style={tierPillStyle(palette)}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: palette.dot }}
          />
          {palette.label}
        </span>
      </header>

      <AccountTierEditor
        audience="CREATOR"
        currentTier={profile.subscriptionTier}
        currentFeeOverrideBp={profile.feeRateOverrideBp}
        currentFeeOverrideReason={profile.feeRateOverrideReason}
        onChangeTier={async (newTier, reason) =>
          changeCreatorTier({
            creatorProfileId: profile.id,
            newTier: newTier as 'MAKER' | 'BUILDER' | 'AGENCY',
            reason,
          })
        }
        onSaveOverride={async (overrideBp, reason) =>
          setCreatorFeeOverride({
            creatorProfileId: profile.id,
            overrideBp,
            reason,
          })
        }
        backHref="/tiers"
      />

      <HistoryCard history={history} />
    </div>
  )
}

function HistoryCard({
  history,
}: {
  history: Awaited<ReturnType<typeof listEntityHistory>>
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white">
      <header className="border-b border-zinc-100 px-5 py-3">
        <h2 className="text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500">
          Audit history
        </h2>
      </header>
      {history.length === 0 ? (
        <p className="p-5 text-[13px] text-zinc-500">
          No prior tier or fee-override changes for this creator.
        </p>
      ) : (
        <ol className="divide-y divide-zinc-100 text-[12.5px]">
          {history.map((h) => (
            <li key={h.id} className="px-5 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-[11px] text-zinc-500">
                  {h.action}
                </span>
                <span className="text-[11px] text-zinc-500">
                  {new Date(h.createdAt).toLocaleString()}
                </span>
              </div>
              {(h.fromValue || h.toValue) && (
                <div className="mt-0.5 text-zinc-700">
                  <span className="font-mono text-zinc-500">{h.fromValue ?? '∅'}</span>
                  {' → '}
                  <span className="font-mono">{h.toValue ?? '∅'}</span>
                </div>
              )}
              {h.payload &&
                typeof h.payload === 'object' &&
                'reason' in (h.payload as Record<string, unknown>) && (
                  <p className="mt-1 text-[12px] italic text-zinc-600">
                    &ldquo;{String((h.payload as Record<string, unknown>).reason)}&rdquo;
                  </p>
                )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
