'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@ilaunchify/ui'
import {
  FileCheck2,
  LifeBuoy,
  ChevronLeft,
  ChevronRight,
  Rocket,
  Lightbulb,
} from 'lucide-react'
import type { PartnerStatus } from '@ilaunchify/db'
import { roleNavFor, type PartnerNavItem } from '@/lib/role-skins'
import { isCoCreationPath } from './CoCreationTopbarSlots'

// Full nav is now resolved per role — docs/PARTNER_ROLE_ACCOUNTS.md §2 (one
// chassis, role skins). The registry owns which surfaces each ServiceType
// sees; this component just renders whatever it resolves.
//
// /my-application is intentionally absent from the active nav — once a partner
// is ACTIVE the application is closed; the record lives in the admin console.
// It only shows in RESTRICTED_NAV (pre-approval applicants).

// Restricted shell — pre-approval, in-progress, or suspended partners.
// They can see their application and get help; everything else is hidden.
const RESTRICTED_NAV: PartnerNavItem[] = [
  { href: '/my-application',  label: 'My Application',  icon: FileCheck2 },
  { href: '/help',            label: 'Help',            icon: LifeBuoy },
]

// Co-Creation Studio mode: while inside the tool the sidebar shows ONLY the
// tool's own navigation (Pavel 2026-07-11). Home / Marketplace / back-out live
// in the header icon cluster.
const CO_CREATION_NAV: PartnerNavItem[] = [
  { href: '/opportunities', label: 'Opportunity pool', icon: Lightbulb },
]

// Limited "in-profile" nav shown post-approval while the partner is still
// finishing Activation Setup (not yet live on every service).
// SLIMMED (Pavel 2026-07-12, phased sidebar): exactly TWO destinations —
//   1. Onboarding — the approved application, rendered READ-ONLY
//      (my-application suppresses its Edit buttons for approved partners);
//   2. Activation Setup — the Launch Console.
// Every other surface (products, packaging, certifications, services,
// settings…) stays reachable via the Launch Console's own deep links but is
// hidden from the nav until EVERY service is live — then the full role-skinned
// menu (incl. the new profile settings hub) is revealed.
const LIMITED_ACTIVATION_NAV: PartnerNavItem[] = [
  { href: '/my-application', label: 'Onboarding', icon: FileCheck2 },
  { href: '/activation', label: 'Activation Setup', icon: Rocket },
]

interface PartnerSidebarProps {
  status: PartnerStatus
  restricted: boolean
  /** The partner's ServiceType values (strings — RSC-boundary safe); drives the role-skinned nav. */
  serviceTypes?: string[]
  /** Org-wide admin (founder or isAdmin membership) — commercial nav items. */
  isOrgAdmin?: boolean
  /** Nomination feature enabled → show the Co-partners nav item (manufacturers). */
  showCoPartners?: boolean
  /** Pool-access policy allows co-packers → show Opportunities on COPACKING-only orgs. */
  copackBriefPool?: boolean
  /** Co-creation module kick-off switch — false hides Opportunities entirely. */
  briefPoolEnabled?: boolean
  /** ACTIVE but not yet live on every service → show the limited setup nav. */
  activationLimited?: boolean
}

function statusBadge(status: PartnerStatus): {
  label: string
  className: string
  dotClassName: string
} {
  switch (status) {
    case 'ACTIVE':
      return { label: 'Active', className: 'bg-success-50 text-success-700 ring-success-200', dotClassName: 'bg-success-500' }
    case 'UNDER_REVIEW':
      return { label: 'Under review', className: 'bg-info-50 text-info-700 ring-info-200', dotClassName: 'bg-info-500' }
    case 'IN_PROGRESS':
      return { label: 'Action needed', className: 'bg-warning-50 text-warning-700 ring-warning-200', dotClassName: 'bg-warning-500' }
    case 'SUSPENDED':
      return { label: 'Suspended', className: 'bg-danger-50 text-danger-700 ring-danger-200', dotClassName: 'bg-danger-500' }
    case 'DRAFT':
    case 'INVITED':
    default:
      return { label: status, className: 'bg-ink-100 text-ink-700 ring-ink-200', dotClassName: 'bg-ink-400' }
  }
}

const STORAGE_KEY = 'ilf-partner-sidebar-collapsed'
// Co-creation keeps its OWN fold state so the focused tool starts folded by
// default (Pavel 2026-07-11) without touching the partner's global preference.
// Still fully togglable — once expanded, the choice persists here.
const CC_STORAGE_KEY = 'ilf-partner-cocreation-sidebar-collapsed'

export function PartnerSidebar({ status, restricted, serviceTypes, isOrgAdmin, showCoPartners, copackBriefPool, briefPoolEnabled, activationLimited }: PartnerSidebarProps) {
  const pathname = usePathname()
  // Inside the Co-Creation Studio the sidebar shows ONLY the tool's nav
  // (Pavel 2026-07-11) — regardless of role skin.
  const coCreation = isCoCreationPath(pathname)
  const nav = coCreation
    ? CO_CREATION_NAV
    : restricted
      ? RESTRICTED_NAV
      : activationLimited
        ? LIMITED_ACTIVATION_NAV
        : roleNavFor(serviceTypes ?? [], { isOrgAdmin, showCoPartners, copackBriefPool, briefPoolEnabled })
  const badge = statusBadge(status)

  const [collapsed, setCollapsed] = useState(false)
  // Co-creation fold state — starts collapsed (default), persisted separately.
  const [ccCollapsed, setCcCollapsed] = useState(true)

  // Persist the fold state across navigations / refreshes (mirrors the creator
  // sidebar — its own key so the two apps don't share state). Co-creation reads
  // its own key and DEFAULTS to collapsed when unset (only an explicit '0'
  // expands it) so the tool opens folded the first time.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === '1')
      setCcCollapsed(window.localStorage.getItem(CC_STORAGE_KEY) !== '0')
    } catch {
      /* localStorage unavailable — stay expanded */
    }
  }, [])

  // Effective fold state for the CURRENT surface (co-creation vs everywhere else).
  const collapsedNow = coCreation ? ccCollapsed : collapsed

  // Bridge: the Add-Product builder folds this sidebar to icons (and moves it to
  // the right via body.gb-active CSS) on enter, and restores the prior state on
  // exit, by dispatching `ilf:sidebar-collapse`. The shared layout doesn't
  // re-mount on client nav, so an event is how the builder reaches us.
  useEffect(() => {
    function onForce(e: Event) {
      const v = (e as CustomEvent<boolean>).detail
      if (typeof v === 'boolean') setCollapsed(v)
    }
    window.addEventListener('ilf:sidebar-collapse', onForce as EventListener)
    return () => window.removeEventListener('ilf:sidebar-collapse', onForce as EventListener)
  }, [])

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
      data-partner-sidebar
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

      {/* Co-creation mode: a tool label replaces the partner-portal status block
          so the reduced nav reads intentionally. */}
      {coCreation ? (
        !collapsedNow && (
          <div className="mb-4 mt-1 px-2 text-ui-label uppercase tracking-wide text-ink-400">
            Co-Creation Studio
          </div>
        )
      ) : collapsedNow ? (
        <div className="mb-4 mt-1 flex justify-center" title={`Partner portal · ${badge.label}`}>
          <span className={cn('inline-block h-2.5 w-2.5 rounded-full', badge.dotClassName)} />
        </div>
      ) : (
        <div className="mb-6 px-2">
          <div className="text-ui-caption font-medium text-ink-500">Partner portal</div>
          <span
            className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ring-1 ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>
      )}

      <nav className="space-y-1">
        {nav.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              title={collapsedNow ? label : undefined}
              className={cn(
                'flex items-center rounded-md text-sm transition-colors',
                collapsedNow ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2',
                active ? 'bg-ink-100 font-medium text-ink-900' : 'text-ink-600 hover:bg-ink-50',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {!collapsedNow && <span>{label}</span>}
            </Link>
          )
        })}
      </nav>

      {restricted && !coCreation && !collapsedNow && (
        <p className="mt-6 px-2 text-ui-caption text-ink-500">
          {status === 'UNDER_REVIEW' && (
            <>Your application is being reviewed. We&apos;ll email you when there&apos;s an update.</>
          )}
          {status === 'IN_PROGRESS' && (
            <>An admin has requested changes. See My Application for details.</>
          )}
          {status === 'SUSPENDED' && (
            <>Your account is suspended. Reach out to partners@ilaunchify.com to discuss.</>
          )}
        </p>
      )}
    </aside>
  )
}
