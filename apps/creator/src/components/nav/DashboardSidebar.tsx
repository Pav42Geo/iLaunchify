'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@ilaunchify/ui'
import {
  Home,
  Store,
  Package,
  ShoppingBag,
  Boxes,
  Plug,
  Sparkles,
  Settings,
  LifeBuoy,
  Lightbulb,
  FilePlus2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { LaunchChecklistTrigger } from '@/components/checklist/LaunchChecklistTrigger'
import { marketingUrl } from '@/lib/marketing-url'
import { isCoCreationPath } from './CoCreationTopbarSlots'
import { maybeStampRoomFirstVisit } from '@/app/(dashboard)/_actions/checklist-actions'

// Marketplace is the only entry that lives on apps/marketing (port 3010
// in dev). We render it as a plain <a> so navigation triggers a real
// cross-origin load — the creator sidebar still highlights every other
// route via Next/Link.
const NAV: Array<{
  href: string
  label: string
  icon: typeof Home
  external?: boolean
}> = [
  { href: '/dashboard',                    label: 'Dashboard',   icon: Home },
  { href: marketingUrl('/marketplace'),    label: 'Marketplace', icon: Store, external: true },
  { href: '/products',                     label: 'Products',    icon: Package },
  // Co-creation briefs (CO_CREATION_MARKETPLACE_SPEC §10 — Co-Creation Studio)
  { href: '/briefs',                       label: 'Briefs',      icon: Lightbulb },
  { href: '/orders',                       label: 'Orders',      icon: ShoppingBag },
  { href: '/inventory',                    label: 'Inventory',   icon: Boxes },
  { href: '/channels',                     label: 'Channels',    icon: Plug },
  { href: '/subscriptions',                label: 'Plans',       icon: Sparkles },
  { href: '/settings',                     label: 'Settings',    icon: Settings },
  { href: '/help',                         label: 'Help',        icon: LifeBuoy },
]

// Co-Creation Studio mode: while inside the tool the sidebar is reduced to
// the tool's own navigation and nothing else (Pavel 2026-07-11). Home /
// Marketplace / back-out live in the header icon cluster.
const CO_CREATION_NAV: Array<{
  href: string
  label: string
  icon: typeof Home
  external?: boolean
}> = [
  // "Post a brief" leads — the tool's primary action comes first (Pavel 2026-07-12).
  { href: '/products/new/brief', label: 'Post a brief', icon: FilePlus2 },
  { href: '/briefs',            label: 'Your briefs', icon: Lightbulb },
]

const STORAGE_KEY = 'ilf-creator-sidebar-collapsed'
// Co-creation keeps its OWN fold state so the focused tool starts folded by
// default (Pavel 2026-07-11) without touching the creator's global preference.
// Still fully togglable — once the user expands it, the choice persists here.
const CC_STORAGE_KEY = 'ilf-creator-cocreation-sidebar-collapsed'

export function DashboardSidebar({
  showBriefs = true,
  roomSeen = true,
}: {
  showBriefs?: boolean
  /** Account-level "has ever opened a Collaboration Room" flag
   *  (onboardingProgress.roomFirstVisitAt) — false triggers the one-shot fold. */
  roomSeen?: boolean
}) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  // Inside the Co-Creation Studio the sidebar shows ONLY the tool's nav
  // (Pavel 2026-07-11). Elsewhere: the full nav, minus Briefs until the module
  // opens (unless this creator already has briefs in flight).
  const coCreation = isCoCreationPath(pathname)
  const nav = coCreation
    ? CO_CREATION_NAV
    : showBriefs
      ? NAV
      : NAV.filter((n) => n.href !== '/briefs')

  // Co-creation fold state — starts collapsed (default), persisted separately.
  const [ccCollapsed, setCcCollapsed] = useState(true)

  // Persist the fold state across navigations / refreshes. Reads on mount
  // (slight flash from the expanded default is acceptable for V1). Co-creation
  // reads its own key and DEFAULTS to collapsed when unset (only an explicit
  // '0' expands it) so the tool opens folded the first time.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === '1')
      setCcCollapsed(window.localStorage.getItem(CC_STORAGE_KEY) !== '0')
    } catch {
      /* localStorage unavailable — stay expanded */
    }
  }, [])

  // First-room "look then fold" (Pavel 2026-07-12, behavior-driven): the FIRST
  // time this account ever enters a /rooms/* path, the sidebar starts OPEN so
  // the creator sees the tool nav, then auto-folds after a beat (animated via
  // transition-[width]) and persists folded as the new co-creation preference.
  // From then on it's pure user behavior: leave it folded and it stays folded;
  // re-expand and the toggle persists that instead. Stamped server-side
  // (roomFirstVisitAt) so the choreography never repeats — on any device. The
  // ref guards re-fires within this session (the server prop only refreshes on
  // the next full request).
  const inRoom = !!pathname?.startsWith('/rooms')
  const roomFoldFiredRef = useRef(false)
  useEffect(() => {
    if (!inRoom || roomSeen || roomFoldFiredRef.current) return
    roomFoldFiredRef.current = true
    setCcCollapsed(false) // first look: open
    const t = window.setTimeout(() => {
      setCcCollapsed(true) // …then fold, and keep it that way unless re-expanded
      try {
        window.localStorage.setItem(CC_STORAGE_KEY, '1')
      } catch {
        /* ignore */
      }
    }, 1600)
    void maybeStampRoomFirstVisit()
    return () => window.clearTimeout(t)
  }, [inRoom, roomSeen])

  // Effective fold state for the CURRENT surface (co-creation vs everywhere else).
  const collapsedNow = coCreation ? ccCollapsed : collapsed

  function toggle() {
    const key = coCreation ? CC_STORAGE_KEY : STORAGE_KEY
    const setter = coCreation ? setCcCollapsed : setCollapsed
    setter((c) => {
      const next = !c
      try {
        window.localStorage.setItem(key, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  return (
    <aside
      className={cn(
        'relative hidden shrink-0 border-r border-ink-200 p-3 transition-[width] duration-200 ease-out lg:block',
        // Co-creation mode: sidebar background matches the content area (light gray).
        coCreation ? 'bg-ink-50' : 'bg-white',
        collapsedNow ? 'w-[68px]' : 'w-56',
      )}
    >
      {/* Fold toggle — circular button straddling the right border (Printful-style) */}
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsedNow ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsedNow ? 'Expand' : 'Collapse'}
        className="absolute -right-3 top-5 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-500 shadow-sm transition-colors hover:border-ink-300 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
      >
        {collapsedNow ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>

      {/* Tool-context label so the reduced Co-Creation nav reads intentionally. */}
      {coCreation && !collapsedNow && (
        <div className="mb-2 px-3 text-ui-label uppercase tracking-wide text-ink-400">
          Co-Creation Studio
        </div>
      )}

      <nav className="space-y-1">
        {nav.map(({ href, label, icon: Icon, external }) => {
          const active =
            !external &&
            (pathname === href || (href !== '/dashboard' && pathname.startsWith(href)))
          const className = cn(
            'flex items-center rounded-md text-sm transition-colors',
            // Folded rail is icon-only (Pavel 2026-07-12 — labels tried, removed);
            // the title attr below keeps the name on hover.
            collapsedNow ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2',
            active ? 'bg-ink-100 font-medium text-ink-900' : 'text-ink-600 hover:bg-ink-50',
          )
          const inner = (
            <>
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {!collapsedNow && <span>{label}</span>}
            </>
          )
          if (external) {
            return (
              <a key={label} href={href} className={className} title={collapsedNow ? label : undefined}>
                {inner}
              </a>
            )
          }
          return (
            <Link key={href} href={href} className={className} title={collapsedNow ? label : undefined}>
              {inner}
            </Link>
          )
        })}

        {/* Launch Checklist trigger — full form only when expanded (its label +
            count badge don't fit the icon rail). Lives inside the
            LaunchChecklistProvider context wrapped by (dashboard)/layout.tsx.
            Hidden in co-creation mode (not part of the tool's nav). */}
        {!collapsedNow && !coCreation && (
          <div className="mt-4 border-t border-ink-200 pt-4">
            <LaunchChecklistTrigger />
          </div>
        )}
      </nav>
    </aside>
  )
}
