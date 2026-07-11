// =============================================================================
// Admin Product Builder — co-creation oversight, ONE tabbed page
// =============================================================================
//
// PAVEL DECISION 2026-07-10: the admin co-creation module is "Product Builder" —
// one top-level nav item under APPLICATIONS, one page combining the former
// /briefs and /rooms lists behind a ?view switcher.
//
// URL contract:
//   ?view=briefs|rooms   — primary view switcher (default briefs)
//   plus the selected view's own filter params, unchanged from the old pages:
//     briefs: q / status / niche / sort / dir / page
//     rooms:  q / status / sort / dir / page
//   Only one view renders at a time, so the param names never collide. Every
//   filter/sort/page href inside a section carries view=… (via the section's
//   basePath + extraParams contract) so navigation stays on this page.
//
// Detail routes stay put: /briefs/[briefId] and /rooms/[roomId] are deep-linked
// from row actions, notifications, and cross-links. READ-ONLY oversight — no
// mutations anywhere on this surface.

import Link from 'next/link'
import { Lightbulb, DoorOpen, SlidersHorizontal } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import { getCoCreationSettings } from '@ilaunchify/db'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { BriefsListSection } from '../briefs/BriefsListSection'
import { RoomsListSection } from '../rooms/RoomsListSection'
import { CoCreationSettingsForm } from './CoCreationSettingsForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Product Builder — Admin' }

type ProductBuilderView = 'briefs' | 'rooms' | 'settings'

interface PageProps {
  searchParams: Promise<{
    view?: string
    q?: string
    status?: string
    niche?: string
    sort?: string
    dir?: string
    page?: string
  }>
}

export default async function ProductBuilderPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const view: ProductBuilderView =
    sp.view === 'rooms' ? 'rooms' : sp.view === 'settings' ? 'settings' : 'briefs'

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Applications · Co-creation"
        title="Product Builder"
        description="Creator ↔ manufacturer co-creation oversight — briefs in the opportunity pool, live collaboration rooms, and the decisions inside them. Read-only; every action deep-links."
      />

      <ViewSwitcher view={view} />

      {view === 'briefs' ? (
        <BriefsListSection
          sp={sp}
          basePath="/product-builder"
          extraParams={{ view: 'briefs' }}
        />
      ) : view === 'rooms' ? (
        <RoomsListSection
          sp={sp}
          basePath="/product-builder"
          extraParams={{ view: 'rooms' }}
        />
      ) : (
        <CoCreationSettingsForm initial={await getCoCreationSettings()} />
      )}
    </div>
  )
}

// =============================================================================
// Primary view switcher — ?view=briefs|rooms (repo primary-tab chip styling)
// =============================================================================

function ViewSwitcher({ view }: { view: ProductBuilderView }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="navigation" aria-label="Product Builder views">
      <ViewTab
        href="/product-builder?view=briefs"
        active={view === 'briefs'}
        icon={Lightbulb}
        label="Briefs"
      />
      <ViewTab
        href="/product-builder?view=rooms"
        active={view === 'rooms'}
        icon={DoorOpen}
        label="Rooms"
      />
      <ViewTab
        href="/product-builder?view=settings"
        active={view === 'settings'}
        icon={SlidersHorizontal}
        label="Settings"
      />
    </div>
  )
}

function ViewTab({
  href,
  active,
  icon: Icon,
  label,
}: {
  href: string
  active: boolean
  icon: LucideIcon
  label: string
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[12.5px] font-semibold transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
        active
          ? 'border-ink-900 bg-ink-900 text-white'
          : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Link>
  )
}
