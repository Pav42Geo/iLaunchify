'use client'

// AppHeaderUserMenu — shared dropdown menu for the right cluster of every
// dashboard / marketplace header (REBUILD R1.3).
//
// Lifted from apps/marketing/src/components/UserMenu.tsx and made
// composable so creator / partner / admin / marketplace can all use it
// while keeping their role-specific item list, plan chip, and active
// brand display.
//
// Behaviour:
//   - Closes on outside click + Escape
//   - Renders identity header with optional tier badge + active-brand chip
//   - Body = list of sections, each section a flat array of items
//   - Items can be in-app (next/link) or cross-app (raw <a>) via `external`
//   - Sign-out button at the bottom calls onSignOut

import * as React from 'react'
import Link from 'next/link'
import { ChevronDown, Crown, LogOut, type LucideIcon } from 'lucide-react'
import { cn } from '../lib/utils'

export interface AppHeaderUserMenuItem {
  label: string
  href: string
  icon: LucideIcon
  /** Use raw <a> for cross-origin (cross-app) targets. */
  external?: boolean
}

export interface AppHeaderUserMenuSection {
  items: AppHeaderUserMenuItem[]
}

export interface AppHeaderUserMenuProps {
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
    /** Subscription tier shown as a chip under the name (creators only). */
    tier?: string | null
    /** Currently-active brand label (multi-brand creators). */
    activeBrandName?: string | null
  }
  /** Each section renders with a divider between it and the next. */
  sections: AppHeaderUserMenuSection[]
  /** Map tier key → label (e.g. {maker: 'Maker', builder: 'Builder'}). */
  tierLabels?: Record<string, string>
  /** Href the "Manage plan" link in the tier chip points at. */
  manageTierHref?: string
  /** Href the active-brand chip links to (typically /brands). */
  activeBrandHref?: string
  /** Avatar accent color — defaults to pink (creator). Use ink-900 for partner / admin. */
  avatarTone?: 'pink' | 'ink'
  /** Called when the user clicks "Sign out". */
  onSignOut?: () => void
}

export function AppHeaderUserMenu({
  user,
  sections,
  tierLabels = {},
  manageTierHref,
  activeBrandHref,
  avatarTone = 'pink',
  onSignOut,
}: AppHeaderUserMenuProps) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const initials = React.useMemo(() => {
    const source = user.name ?? user.email ?? '?'
    return source
      .split(/[\s@]/)
      .filter(Boolean)
      .map((s) => s[0]!.toUpperCase())
      .slice(0, 2)
      .join('')
  }, [user.name, user.email])

  const tierLabel =
    user.tier && tierLabels[user.tier] ? tierLabels[user.tier] : null

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="group ml-1 flex items-center gap-1.5 focus:outline-none"
      >
        <span
          className={cn(
            'relative flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-semibold text-white ring-2 ring-transparent transition-shadow group-focus-visible:ring-offset-2',
            avatarTone === 'pink'
              ? 'bg-pink-500 group-focus-visible:ring-pink-500'
              : 'bg-ink-900 group-focus-visible:ring-ink-900',
          )}
        >
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt=""
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            initials
          )}
        </span>
        <ChevronDown
          strokeWidth={2}
          className={cn(
            'h-3.5 w-3.5 text-ink-500 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-72 origin-top-right rounded-xl border border-ink-200 bg-white py-2 shadow-xl"
        >
          {/* Identity */}
          <div className="border-b border-ink-100 px-4 py-3">
            <div className="text-[14px] font-semibold leading-tight text-ink-900">
              {user.name ?? 'Welcome'}
            </div>
            {user.email && (
              <div className="mt-0.5 truncate text-[12px] text-ink-500">
                {user.email}
              </div>
            )}
            {tierLabel && (
              <a
                href={manageTierHref ?? '#'}
                className="group mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-pink-700 transition-colors hover:bg-pink-100"
              >
                <Crown strokeWidth={2.5} className="h-3 w-3" />
                {tierLabel} plan
                <span className="ml-0.5 font-medium normal-case tracking-normal text-pink-700/60 transition-colors group-hover:text-pink-700">
                  · Manage
                </span>
              </a>
            )}
          </div>

          {/* Active brand chip */}
          {user.activeBrandName && (
            <a
              href={activeBrandHref ?? '#'}
              className="mx-2 my-2 flex items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-ink-50"
            >
              <span className="h-7 w-7 flex-shrink-0 rounded-md bg-gradient-to-br from-pink-400 to-pink-600" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-500">
                  Active brand
                </div>
                <div className="truncate text-[13px] font-semibold text-ink-900">
                  {user.activeBrandName}
                </div>
              </div>
              <ChevronDown
                strokeWidth={2}
                className="h-3.5 w-3.5 -rotate-90 text-ink-400"
              />
            </a>
          )}

          {/* Body: sections separated by dividers */}
          {sections.map((section, sectionIdx) => (
            <React.Fragment key={sectionIdx}>
              <div className="my-1 border-t border-ink-100" />
              {section.items.map((item, itemIdx) => (
                <MenuLink
                  key={`${sectionIdx}-${itemIdx}`}
                  item={item}
                  onClick={() => setOpen(false)}
                />
              ))}
            </React.Fragment>
          ))}

          <div className="my-1 border-t border-ink-100" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onSignOut?.()
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-[13px] text-ink-700 transition-colors hover:bg-ink-50"
          >
            <LogOut strokeWidth={1.75} className="h-4 w-4 text-ink-500" />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// MenuLink — internal vs cross-app
// =============================================================================

function MenuLink({
  item,
  onClick,
}: {
  item: AppHeaderUserMenuItem
  onClick?: () => void
}) {
  const cls =
    'flex items-center gap-2.5 px-4 py-2 text-[13px] text-ink-700 hover:bg-ink-50 transition-colors'
  const inner = (
    <>
      <item.icon strokeWidth={1.75} className="h-4 w-4 text-ink-500" />
      {item.label}
    </>
  )
  if (item.external) {
    return (
      <a href={item.href} className={cls} onClick={onClick}>
        {inner}
      </a>
    )
  }
  return (
    <Link href={item.href} role="menuitem" onClick={onClick} className={cls}>
      {inner}
    </Link>
  )
}
