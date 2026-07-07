'use client'

// AppHeaderUserMenu — shared dropdown menu for the right cluster of every
// dashboard / marketplace header (REBUILD R1.3 · v2 2026-07-06).
//
// v2 (docs/ACCOUNT_MENUS_PROPOSAL.md): the menu is identity + account +
// context switching — NOT a second nav (each app's sidebar owns nav; one
// high-frequency "work" row per role is the only exception, Pavel
// 2026-07-06). Additive capabilities on top of v1:
//
//   - roleChip     — partner status / admin RBAC role (info-only; never
//                    benefit copy per the locked partner-tier rule)
//   - brandCards   — creator brand cards: switch + manage + tier-aware
//                    add/upgrade CTA (replaces the lone active-brand chip)
//   - contextCard  — partner company card (replaces the misused
//                    activeBrandName slot — correct semantics + ink tone)
//   - shortcuts    — tile grid of badge-bearing work queues (admin)
//   - children     — items may carry a one-level drill-in sub-panel
//                    (Facebook-style back-header panel; admin derives these
//                    from sidebar-config so labels can never drift)
//
// v1 props (tierLabels / manageTierHref / activeBrandName / activeBrandHref)
// still work — the marketing fork migration (P3) depends on it.
//
// Behaviour:
//   - Closes on outside click + Escape (drill state resets on close)
//   - Items can be in-app (next/link) or cross-app (raw <a>) via `external`

import * as React from 'react'
import Link from 'next/link'
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crown,
  LogOut,
  Plus,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../lib/utils'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface AppHeaderUserMenuChildItem {
  label: string
  /** Omit href to render a non-interactive section label inside the panel. */
  href?: string
  icon?: LucideIcon
  external?: boolean
}

export interface AppHeaderUserMenuItem {
  label: string
  /** Ignored when `children` is set (the row drills instead of navigating). */
  href?: string
  icon: LucideIcon
  /** Use raw <a> for cross-origin (cross-app) targets. */
  external?: boolean
  /** One-level drill-in sub-panel (Facebook-style). */
  children?: AppHeaderUserMenuChildItem[]
}

export interface AppHeaderUserMenuSection {
  /** Optional uppercase mini-label above the section. */
  label?: string
  items: AppHeaderUserMenuItem[]
}

export interface AppHeaderUserMenuShortcut {
  label: string
  href: string
  icon: LucideIcon
  badge?: number
  external?: boolean
}

export interface AppHeaderUserMenuBrand {
  id: string
  name: string
  handle?: string | null
}

export interface AppHeaderUserMenuBrandCards {
  /** Section label. Defaults to "Your brands". */
  label?: string
  brands: AppHeaderUserMenuBrand[]
  activeBrandId?: string
  /** Called with the brand id when a non-active card is clicked (switch). */
  onSelect?: (brandId: string) => void
  /** Href builder for the per-card "Manage" affordance. */
  manageHref?: (brandId: string) => string
  /** "Add brand" CTA — pass only when the tier still has brand headroom. */
  addBrandHref?: string
  /** Upgrade nudge — pass when the tier is at its brand cap (Maker). */
  upgradeNudge?: { text: string; cta: string; href: string }
  /** "View all brands" link when brands.length > maxVisible. */
  viewAllHref?: string
  /** Max cards rendered before the view-all link. Default 3. */
  maxVisible?: number
}

export interface AppHeaderUserMenuProps {
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
    /** Subscription tier shown as a chip under the name (creators only). */
    tier?: string | null
    /** @deprecated v1 active-brand chip — creator uses `brandCards`, partner
        uses `contextCard`. Kept for the marketing fork until P3. */
    activeBrandName?: string | null
  }
  /** Each section renders with a divider between it and the next. */
  sections: AppHeaderUserMenuSection[]
  /** Map tier key → label (e.g. {maker: 'Maker', builder: 'Builder'}). */
  tierLabels?: Record<string, string>
  /** Href the "Manage plan" link in the tier chip points at. */
  manageTierHref?: string
  /** Href the (deprecated) active-brand chip links to. */
  activeBrandHref?: string
  /** Info-only role/status chip in the identity header (partner status,
      admin RBAC role). `dark` = ink-900 bg + neon text (admin). */
  roleChip?: { label: string; tone?: 'ink' | 'dark' }
  /** Creator brand cards section (renders below the identity header). */
  brandCards?: AppHeaderUserMenuBrandCards
  /** Single context card (partner company). Mutually exclusive with
      brandCards by convention, not enforced. */
  contextCard?: { label: string; name: string; href: string }
  /** Tile grid of badge-bearing work-queue shortcuts (admin). */
  shortcuts?: AppHeaderUserMenuShortcut[]
  /** Avatar accent color — defaults to pink (creator). Use ink-900 for partner / admin. */
  avatarTone?: 'pink' | 'ink'
  /** Panel width. `wide` (360px) for the admin shortcut grid. */
  width?: 'default' | 'wide'
  /** Called when the user clicks "Sign out". */
  onSignOut?: () => void
}

// Deterministic card swatch — same brand always gets the same gradient.
const BRAND_SWATCHES = [
  'linear-gradient(135deg,#FF7EA8,#FF2E63)',
  'linear-gradient(135deg,#7B8CFF,#4A3AFF)',
  'linear-gradient(135deg,#3DDCA0,#0FA96F)',
  'linear-gradient(135deg,#FFB65C,#F27D14)',
  'linear-gradient(135deg,#5CC8FF,#1E7FD4)',
] as const

function brandSwatch(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return BRAND_SWATCHES[Math.abs(hash) % BRAND_SWATCHES.length]!
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function AppHeaderUserMenu({
  user,
  sections,
  tierLabels = {},
  manageTierHref,
  activeBrandHref,
  roleChip,
  brandCards,
  contextCard,
  shortcuts,
  avatarTone = 'pink',
  width = 'default',
  onSignOut,
}: AppHeaderUserMenuProps) {
  const [open, setOpen] = React.useState(false)
  // Key of the drilled item ("sectionIdx-itemIdx"), null = main panel.
  const [drill, setDrill] = React.useState<string | null>(null)
  const ref = React.useRef<HTMLDivElement>(null)

  const close = React.useCallback(() => {
    setOpen(false)
    setDrill(null)
  }, [])

  React.useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open, close])

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

  const drilledItem = React.useMemo(() => {
    if (!drill) return null
    const [s, i] = drill.split('-').map(Number)
    return sections[s ?? -1]?.items[i ?? -1] ?? null
  }, [drill, sections])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
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
          className={cn(
            'absolute right-0 top-full z-50 mt-2 max-h-[min(720px,80vh)] origin-top-right overflow-y-auto rounded-xl border border-ink-200 bg-white py-2 shadow-xl',
            width === 'wide' ? 'w-[360px]' : 'w-72',
          )}
        >
          {drilledItem?.children ? (
            <SubPanel item={drilledItem} onBack={() => setDrill(null)} onNavigate={close} />
          ) : (
            <>
              {/* Identity card */}
              <div className="border-b border-ink-100 px-3 pb-3 pt-3">
                <div className="flex items-center gap-3 rounded-xl border border-ink-200 bg-ink-50 px-3 py-2.5">
                  <span
                    className={cn(
                      'flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full text-[15px] font-semibold text-white',
                      avatarTone === 'pink' ? 'bg-pink-500' : 'bg-ink-900',
                    )}
                  >
                    {user.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      initials
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold leading-tight text-ink-900">
                      {user.name ?? 'Welcome'}
                    </div>
                    {user.email && (
                      <div className="mt-0.5 truncate text-[12px] text-ink-500">
                        {user.email}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 px-0.5">
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
                  {roleChip && (
                    <span
                      className={cn(
                        'mt-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em]',
                        // Neon accent on dark surfaces ONLY (design system LOCKED rule).
                        roleChip.tone === 'dark'
                          ? 'bg-ink-900 text-neon-500'
                          : 'bg-ink-100 text-ink-700',
                      )}
                    >
                      {roleChip.label}
                    </span>
                  )}
                </div>
              </div>

              {/* Creator brand cards */}
              {brandCards && <BrandCards cards={brandCards} onNavigate={close} />}

              {/* Partner company / context card */}
              {contextCard && (
                <Link
                  href={contextCard.href}
                  onClick={close}
                  className="mx-2 mt-2 flex items-center gap-2.5 rounded-lg border border-ink-200 px-2.5 py-2 transition-colors hover:bg-ink-50"
                >
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-ink-900 text-[13px] font-extrabold text-white">
                    {contextCard.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10.5px] font-bold uppercase tracking-[0.07em] text-ink-400">
                      {contextCard.label}
                    </span>
                    <span className="block truncate text-[13px] font-semibold text-ink-900">
                      {contextCard.name}
                    </span>
                  </span>
                  <ChevronRight strokeWidth={2} className="h-3.5 w-3.5 text-ink-400" />
                </Link>
              )}

              {/* Deprecated v1 active-brand chip (marketing fork until P3) */}
              {!brandCards && !contextCard && user.activeBrandName && (
                <a
                  href={activeBrandHref ?? '#'}
                  className="mx-2 my-2 flex items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-ink-50"
                >
                  <span className="h-7 w-7 flex-shrink-0 rounded-md bg-gradient-to-br from-pink-400 to-pink-600" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-700">
                      Active brand
                    </div>
                    <div className="truncate text-[13px] font-semibold text-ink-900">
                      {user.activeBrandName}
                    </div>
                  </div>
                  <ChevronRight strokeWidth={2} className="h-3.5 w-3.5 text-ink-400" />
                </a>
              )}

              {/* Admin shortcut grid */}
              {shortcuts && shortcuts.length > 0 && (
                <div className="grid grid-cols-3 gap-2 px-3 pb-1 pt-2.5">
                  {shortcuts.map((s) => (
                    <ShortcutTile key={s.href + s.label} shortcut={s} onNavigate={close} />
                  ))}
                </div>
              )}

              {/* Body: sections separated by dividers */}
              {sections.map((section, sectionIdx) => (
                <React.Fragment key={sectionIdx}>
                  <div className="my-1 border-t border-ink-100" />
                  {section.label && (
                    <div className="px-4 pb-0.5 pt-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-400">
                      {section.label}
                    </div>
                  )}
                  {section.items.map((item, itemIdx) => (
                    <MenuRow
                      key={`${sectionIdx}-${itemIdx}`}
                      item={item}
                      onDrill={() => setDrill(`${sectionIdx}-${itemIdx}`)}
                      onNavigate={close}
                    />
                  ))}
                </React.Fragment>
              ))}

              <div className="my-1 border-t border-ink-100" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  close()
                  onSignOut?.()
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-[13px] text-ink-700 transition-colors hover:bg-ink-50"
              >
                <LogOut strokeWidth={1.75} className="h-4 w-4 text-ink-500" />
                Sign out
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Internals
// =============================================================================

function BrandCards({
  cards,
  onNavigate,
}: {
  cards: AppHeaderUserMenuBrandCards
  onNavigate: () => void
}) {
  const max = cards.maxVisible ?? 3
  const visible = cards.brands.slice(0, max)
  const overflow = cards.brands.length > max
  return (
    <div className="pt-2">
      <div className="px-4 pb-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-400">
        {cards.label ?? 'Your brands'}
      </div>
      {visible.map((b) => {
        const active = b.id === cards.activeBrandId
        return (
          <div
            key={b.id}
            className={cn(
              'mx-2 mt-1.5 flex items-center gap-2.5 rounded-lg border px-2.5 py-2',
              active
                ? 'border-pink-500 ring-1 ring-pink-500'
                : 'border-ink-200',
            )}
          >
            <button
              type="button"
              disabled={active}
              onClick={() => {
                if (!active) {
                  cards.onSelect?.(b.id)
                  onNavigate()
                }
              }}
              className={cn(
                'flex min-w-0 flex-1 items-center gap-2.5 text-left',
                !active && 'cursor-pointer',
              )}
              aria-label={active ? `${b.name} (active brand)` : `Switch to ${b.name}`}
            >
              <span
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-[13px] font-extrabold text-white"
                style={{ background: brandSwatch(b.name) }}
              >
                {b.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-ink-900">
                  {b.name}
                </span>
                {b.handle && (
                  <span className="block truncate text-[11px] text-ink-500">
                    /{b.handle}
                  </span>
                )}
              </span>
              {active ? (
                <Check strokeWidth={2.5} className="h-4 w-4 flex-shrink-0 text-pink-500" />
              ) : (
                <span className="flex-shrink-0 text-[11px] font-medium text-ink-400">
                  switch
                </span>
              )}
            </button>
            {cards.manageHref && (
              <Link
                href={cards.manageHref(b.id)}
                onClick={onNavigate}
                className="flex-shrink-0 rounded-md px-1.5 py-1 text-[11px] font-semibold text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900"
              >
                Manage
              </Link>
            )}
          </div>
        )
      })}
      {overflow && cards.viewAllHref && (
        <Link
          href={cards.viewAllHref}
          onClick={onNavigate}
          className="mx-2 mt-1.5 block rounded-md px-2.5 py-1.5 text-[12px] font-medium text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900"
        >
          View all {cards.brands.length} brands →
        </Link>
      )}
      {cards.addBrandHref && (
        <Link
          href={cards.addBrandHref}
          onClick={onNavigate}
          className="mx-2 mt-2 flex items-center gap-2 rounded-lg border border-dashed border-ink-200 px-2.5 py-2 text-[12.5px] text-ink-500 transition-colors hover:border-pink-500 hover:text-pink-700"
        >
          <Plus strokeWidth={2} className="h-4 w-4" />
          Add brand
        </Link>
      )}
      {cards.upgradeNudge && (
        <a
          href={cards.upgradeNudge.href}
          className="mx-3 mt-2 block rounded-lg bg-ink-900 px-3 py-2 text-[12px] leading-relaxed text-white transition-opacity hover:opacity-90"
        >
          {cards.upgradeNudge.text}{' '}
          {/* Neon accent on dark surfaces ONLY (design system LOCKED rule). */}
          <span className="font-bold text-neon-500">{cards.upgradeNudge.cta}</span>
        </a>
      )}
    </div>
  )
}

function ShortcutTile({
  shortcut,
  onNavigate,
}: {
  shortcut: AppHeaderUserMenuShortcut
  onNavigate: () => void
}) {
  const inner = (
    <>
      {typeof shortcut.badge === 'number' && shortcut.badge > 0 && (
        <span className="absolute right-1.5 top-1.5 rounded-full bg-pink-500 px-1.5 py-px text-[10px] font-bold text-white">
          {shortcut.badge > 99 ? '99+' : shortcut.badge}
        </span>
      )}
      <shortcut.icon strokeWidth={1.75} className="h-[18px] w-[18px] text-ink-700" />
      <span className="w-full text-center text-[11px] font-semibold leading-tight text-ink-700">{shortcut.label}</span>
    </>
  )
  const cls =
    'relative flex flex-col items-center gap-1.5 rounded-lg border border-ink-200 px-1 pb-2.5 pt-3 transition-colors hover:bg-ink-50'
  if (shortcut.external) {
    return (
      <a href={shortcut.href} className={cls} onClick={onNavigate}>
        {inner}
      </a>
    )
  }
  return (
    <Link href={shortcut.href} onClick={onNavigate} className={cls}>
      {inner}
    </Link>
  )
}

function MenuRow({
  item,
  onDrill,
  onNavigate,
}: {
  item: AppHeaderUserMenuItem
  onDrill: () => void
  onNavigate: () => void
}) {
  const cls =
    'flex w-full items-center gap-2.5 px-4 py-2 text-[13px] text-ink-700 hover:bg-ink-50 transition-colors'
  const inner = (
    <>
      <item.icon strokeWidth={1.75} className="h-4 w-4 flex-shrink-0 text-ink-500" />
      <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
    </>
  )
  if (item.children && item.children.length > 0) {
    return (
      <button type="button" role="menuitem" onClick={onDrill} className={cls}>
        {inner}
        <ChevronRight strokeWidth={2} className="h-3.5 w-3.5 flex-shrink-0 text-ink-400" />
      </button>
    )
  }
  if (item.external) {
    return (
      <a href={item.href ?? '#'} className={cls} onClick={onNavigate}>
        {inner}
      </a>
    )
  }
  return (
    <Link href={item.href ?? '#'} role="menuitem" onClick={onNavigate} className={cls}>
      {inner}
    </Link>
  )
}

function SubPanel({
  item,
  onBack,
  onNavigate,
}: {
  item: AppHeaderUserMenuItem
  onBack: () => void
  onNavigate: () => void
}) {
  return (
    <div role="group" aria-label={item.label}>
      <button
        type="button"
        onClick={onBack}
        className="flex w-full items-center gap-2 border-b border-ink-100 px-3 py-2.5 text-[13px] font-bold text-ink-900 transition-colors hover:bg-ink-50"
      >
        <ChevronLeft strokeWidth={2.25} className="h-4 w-4 text-ink-500" />
        {item.label}
      </button>
      {(item.children ?? []).map((child, idx) => {
        if (!child.href) {
          return (
            <div
              key={`label-${idx}`}
              className="flex items-center gap-2 px-4 pb-0.5 pt-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-400"
            >
              {child.icon && (
                <child.icon strokeWidth={2} className="h-3 w-3 flex-shrink-0" />
              )}
              {child.label}
            </div>
          )
        }
        const cls =
          'flex items-center gap-2.5 px-4 py-2 text-[13px] text-ink-700 hover:bg-ink-50 transition-colors'
        const inner = (
          <>
            {child.icon && (
              <child.icon
                strokeWidth={1.75}
                className="h-4 w-4 flex-shrink-0 text-ink-500"
              />
            )}
            <span className="min-w-0 flex-1 truncate">{child.label}</span>
          </>
        )
        if (child.external) {
          return (
            <a key={idx} href={child.href} className={cls} onClick={onNavigate}>
              {inner}
            </a>
          )
        }
        return (
          <Link key={idx} href={child.href} role="menuitem" onClick={onNavigate} className={cls}>
            {inner}
          </Link>
        )
      })}
    </div>
  )
}
