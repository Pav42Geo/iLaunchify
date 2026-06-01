// =============================================================================
// CategoryHub — dashboard-style landing page for a top-level sidebar group
// =============================================================================
//
// When the sidebar links to a category landing page (/manage, /inbox, etc.),
// THIS is what renders. It reads the locked sidebar config tree for that
// group label and lays out every descendant as clickable cards so the admin
// can reach the sub-routes without the sidebar having to expand.
//
// Layout:
//   1. Page header — cream band, group name, subtitle, return-to-Dashboard
//   2. For each direct child of the group:
//        - If child is a leaf (kind: 'item'):       render as a full-width row
//        - If child is a sub-group (kind: 'group'): render a section with the
//          sub-group label and a responsive grid of its own children as cards
//        - Sub-sub-groups (3rd level — Global Compliance Center) recurse
//          inline using the same renderer.
//
// Every clickable leaf shows its icon, label, and a small Coming soon pill
// when the underlying page hasn't shipped (per hiddenUntilBuilt).

import Link from 'next/link'
import { ArrowLeft, Sparkles, ArrowRight } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import type { LucideIcon } from 'lucide-react'
import {
  SIDEBAR_REGIONS,
  type SidebarItem,
} from '@/components/nav/sidebar-config'

interface CategoryHubProps {
  /** Group label as it appears in sidebar-config (e.g. 'Manage'). */
  label: string
  /** Optional one-liner shown under the title. */
  subtitle?: string
}

export function CategoryHub({ label, subtitle }: CategoryHubProps) {
  const group = findGroup(label)
  if (!group) {
    return (
      <NotFoundShell
        label={label}
        message={`No group named "${label}" in the locked sidebar tree.`}
      />
    )
  }

  return (
    <div className="space-y-6">
      <HubHeader
        label={group.label}
        icon={group.icon}
        subtitle={
          subtitle ??
          `Hub for ${countLeaves(group.children)} ${group.label.toLowerCase()} routes.`
        }
      />

      <div className="space-y-6">
        {group.children.map((child, idx) => (
          <ChildRenderer key={childKey(child, idx)} child={child} depth={0} />
        ))}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Child rendering — recursive (handles up to 3 levels deep)
// -----------------------------------------------------------------------------

function ChildRenderer({ child, depth }: { child: SidebarItem; depth: number }) {
  if (child.kind === 'item') {
    // Leaf at this level — render as a single-cell wide LeafCard. Won't happen
    // often at depth 0 of Manage (only Products & Categories) but does at
    // Settings + Help & Support.
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <LeafCard item={child} />
      </div>
    )
  }

  // Sub-group at this level — section header + grid of children.
  return (
    <section>
      <SubGroupHeader label={child.label} icon={child.icon} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {child.children.map((grandchild, idx) =>
          grandchild.kind === 'item' ? (
            <LeafCard key={childKey(grandchild, idx)} item={grandchild} />
          ) : (
            // Third-level group (e.g. Global Compliance Center inside
            // Languages & Markets). Render its leaves inline as cards in the
            // same grid for now — the visual hierarchy is light but clear.
            <NestedGroupCard
              key={childKey(grandchild, idx)}
              group={grandchild}
            />
          ),
        )}
      </div>
    </section>
  )
}

// -----------------------------------------------------------------------------
// Cards
// -----------------------------------------------------------------------------

function LeafCard({
  item,
}: {
  item: Extract<SidebarItem, { kind: 'item' }>
}) {
  const Icon = item.icon
  const coming = item.hiddenUntilBuilt === true

  return (
    <Link
      href={item.href}
      className={cn(
        'group relative flex items-start gap-3 rounded-2xl border border-ink-200 bg-white p-4',
        'transition-[transform,box-shadow,border-color] duration-base ease-out-quart',
        'hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
          coming ? 'bg-ink-100 text-ink-500' : 'bg-pink-100 text-pink-700',
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[14px] font-semibold leading-tight tracking-tight text-ink-900">
          {item.label}
        </p>
        <p className="mt-1 truncate text-[11.5px] text-ink-500">{item.href}</p>
      </div>
      {coming ? (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider text-amber-800">
          <Sparkles className="h-2.5 w-2.5" />
          Soon
        </span>
      ) : (
        <ArrowRight
          className="h-3.5 w-3.5 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-600"
          aria-hidden="true"
        />
      )}
    </Link>
  )
}

function NestedGroupCard({
  group,
}: {
  group: Extract<SidebarItem, { kind: 'group' }>
}) {
  const Icon = group.icon
  return (
    <div className="rounded-2xl border border-ink-200 bg-[#FBFAF7] p-4">
      <div className="mb-3 flex items-center gap-2.5">
        {Icon && (
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-ink-100 text-ink-700">
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        )}
        <p className="font-display text-[12.5px] font-semibold uppercase tracking-[0.06em] text-ink-700">
          {group.label}
        </p>
      </div>
      <ul className="space-y-1.5">
        {group.children.map((child, idx) =>
          child.kind === 'item' ? (
            <li key={childKey(child, idx)}>
              <Link
                href={child.href}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-ink-700 transition-colors hover:bg-white hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
              >
                <child.icon className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden="true" />
                <span className="flex-1 truncate">{child.label}</span>
                {child.hiddenUntilBuilt && (
                  <span className="text-[9.5px] font-semibold uppercase tracking-wider text-amber-700">
                    Soon
                  </span>
                )}
              </Link>
            </li>
          ) : null,
        )}
      </ul>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Chrome
// -----------------------------------------------------------------------------

function HubHeader({
  label,
  icon: Icon,
  subtitle,
}: {
  label: string
  icon?: LucideIcon
  subtitle: string
}) {
  return (
    <header className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <div className="bg-gradient-to-br from-[#F3EFE8] via-white to-pink-50/40 px-6 py-5">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-[11.5px] font-medium text-pink-700 hover:text-pink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 focus-visible:rounded"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          Back to Dashboard
        </Link>
        <div className="mt-2 flex items-center gap-3">
          {Icon && (
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-pink-100 text-pink-700">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
          )}
          <div>
            <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight text-ink-900">
              {label}
            </h1>
            <p className="mt-0.5 text-[13px] text-ink-600">{subtitle}</p>
          </div>
        </div>
      </div>
    </header>
  )
}

function SubGroupHeader({
  label,
  icon: Icon,
}: {
  label: string
  icon?: LucideIcon
}) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      {Icon && (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-ink-100 text-ink-700">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      )}
      <h2 className="font-display text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500">
        {label}
      </h2>
      <span className="h-px flex-1 bg-ink-200" />
    </div>
  )
}

function NotFoundShell({
  label,
  message,
}: {
  label: string
  message: string
}) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-zinc-50/40 p-8 text-center">
      <h1 className="font-display text-xl font-semibold text-ink-900">{label}</h1>
      <p className="mt-2 text-[13px] text-ink-600">{message}</p>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function findGroup(
  label: string,
): Extract<SidebarItem, { kind: 'group' }> | null {
  for (const region of SIDEBAR_REGIONS) {
    for (const item of region.items) {
      if (item.kind === 'group' && item.label === label) return item
    }
  }
  return null
}

function countLeaves(items: SidebarItem[]): number {
  let total = 0
  for (const item of items) {
    if (item.kind === 'item') total += 1
    else total += countLeaves(item.children)
  }
  return total
}

function childKey(child: SidebarItem, idx: number): string {
  if (child.kind === 'item') return `i:${child.href}:${child.label}`
  return `g:${child.label}:${idx}`
}
