'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Chip } from '@ilaunchify/ui'
import type {
  LifestyleTagGroups,
  MarketplaceLifestyleTag,
} from '@/lib/lifestyle-tags-db'

/**
 * LifestyleTagFilters — Layer 4 marketplace filter chips.
 *
 * Multi-select, URL-driven (`?tag=keto&tag=vegan`). Filter semantics
 * (consumed server-side in marketplace/page.tsx):
 *   - AND across the three groups (Lifestyle / Audience / Trend)
 *   - OR within a group
 *
 * The chips render in three labelled sub-rows so users see how the
 * groups are organised. Groups with zero rows are hidden (graceful
 * degradation when the LifestyleTag seed isn't run yet — the chip rail
 * just doesn't appear).
 *
 * Lives outside the left filter rail because the chip count grows over
 * time and we want a horizontal pill bar above the product grid.
 */
export function LifestyleTagFilters({ groups }: { groups: LifestyleTagGroups }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // URL stores tags as repeated ?tag=foo&tag=bar values for clean semantics.
  const activeSlugs = React.useMemo(() => {
    return new Set(searchParams.getAll('tag').map((s) => s.toLowerCase()))
  }, [searchParams])

  function toggleTag(slug: string) {
    const params = new URLSearchParams(searchParams.toString())
    const lower = slug.toLowerCase()
    const current = params.getAll('tag').map((s) => s.toLowerCase())
    params.delete('tag')
    if (current.includes(lower)) {
      current
        .filter((s) => s !== lower)
        .forEach((s) => params.append('tag', s))
    } else {
      current.forEach((s) => params.append('tag', s))
      params.append('tag', lower)
    }
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  // If every group is empty, render nothing — keeps the marketplace clean
  // pre-seed (and respects the "fail gracefully" fallback contract).
  const hasAny =
    groups.lifestyle.length + groups.audience.length + groups.trend.length > 0
  if (!hasAny) return null

  return (
    <section className="mb-6 rounded-xl border border-ink-200 bg-white px-4 py-3.5">
      <div className="text-[12px] font-bold uppercase tracking-[0.07em] text-ink-700 mb-2.5">
        Lifestyle tags
      </div>
      <div className="flex flex-col gap-2.5">
        {groups.lifestyle.length > 0 && (
          <Row
            label="Diet & lifestyle"
            tags={groups.lifestyle}
            isActive={(s) => activeSlugs.has(s.toLowerCase())}
            onToggle={toggleTag}
          />
        )}
        {groups.audience.length > 0 && (
          <Row
            label="Audience"
            tags={groups.audience}
            isActive={(s) => activeSlugs.has(s.toLowerCase())}
            onToggle={toggleTag}
          />
        )}
        {groups.trend.length > 0 && (
          <Row
            label="Trend"
            tags={groups.trend}
            isActive={(s) => activeSlugs.has(s.toLowerCase())}
            onToggle={toggleTag}
          />
        )}
      </div>
    </section>
  )
}

function Row({
  label,
  tags,
  isActive,
  onToggle,
}: {
  label: string
  tags: MarketplaceLifestyleTag[]
  isActive: (slug: string) => boolean
  onToggle: (slug: string) => void
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-1 shrink-0 text-[11px] font-semibold text-ink-500 w-[88px]">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => {
          const active = isActive(t.slug)
          return (
            <Chip
              key={t.slug}
              active={active}
              onClick={() => onToggle(t.slug)}
            >
              {t.iconEmoji ? `${t.iconEmoji} ` : ''}
              {t.name}
            </Chip>
          )
        })}
      </div>
    </div>
  )
}
