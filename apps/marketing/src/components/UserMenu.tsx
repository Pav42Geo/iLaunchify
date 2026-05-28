'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  ChevronDown,
  LayoutDashboard,
  Layers,
  Package,
  Truck,
  Crown,
  Plug,
  CreditCard,
  Settings,
  HelpCircle,
  LogOut,
} from 'lucide-react'
import { creatorUrl } from '@/lib/app-urls'

/**
 * UserMenu — avatar + dropdown for logged-in creators in the marketplace
 * header. Replaces the "Start launching" guest CTA + the bare pink avatar.
 *
 * Closes on outside click + Escape. Items are a starter set; we'll trim with
 * Pavel before locking the V1 nav contract.
 */
export interface UserMenuProps {
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
    /** Subscription tier shown as a chip under the name. */
    tier?: 'maker' | 'builder' | 'agency'
    /** Currently-active brand label (multi-brand support per memory). */
    activeBrandName?: string | null
  }
  /** Called when the user clicks "Sign out". */
  onSignOut?: () => void
}

const TIER_LABEL: Record<NonNullable<UserMenuProps['user']['tier']>, string> = {
  maker: 'Maker',
  builder: 'Builder',
  agency: 'Agency',
}

export function UserMenu({ user, onSignOut }: UserMenuProps) {
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

  const initials = (() => {
    const source = user.name ?? user.email ?? '?'
    return source
      .split(/[\s@]/)
      .filter(Boolean)
      .map((s) => s[0]!.toUpperCase())
      .slice(0, 2)
      .join('')
  })()

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 ml-1 group focus:outline-none"
      >
        <span className="relative w-9 h-9 rounded-pill bg-pink-500 text-white font-semibold text-[13px] flex items-center justify-center ring-2 ring-transparent group-focus-visible:ring-pink-500 group-focus-visible:ring-offset-2 transition-shadow">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt=""
              className="w-full h-full rounded-pill object-cover"
            />
          ) : (
            initials
          )}
        </span>
        <ChevronDown
          strokeWidth={2}
          className={
            'w-3.5 h-3.5 text-ink-500 transition-transform duration-base ease-out-quart ' +
            (open ? 'rotate-180' : '')
          }
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-72 bg-white border border-ink-200 rounded-xl shadow-xl py-2 z-50 origin-top-right"
        >
          {/* Header — identity + current subscription plan chip (links to manage) */}
          <div className="px-4 py-3 border-b border-ink-100">
            <div className="text-[14px] font-semibold text-ink-900 leading-tight">
              {user.name ?? 'Welcome'}
            </div>
            {user.email && (
              <div className="text-[12px] text-ink-500 truncate mt-0.5">
                {user.email}
              </div>
            )}
            {user.tier && (
              <a
                href={creatorUrl('/settings/profile')}
                className="inline-flex items-center gap-1.5 mt-2.5 text-[11px] font-bold uppercase tracking-[0.06em] bg-pink-50 text-pink-700 px-2.5 py-1 rounded-pill hover:bg-pink-100 transition-colors group"
              >
                <Crown strokeWidth={2.5} className="w-3 h-3" />
                {TIER_LABEL[user.tier]} plan
                <span className="text-pink-700/60 group-hover:text-pink-700 transition-colors normal-case font-medium tracking-normal ml-0.5">
                  · Manage
                </span>
              </a>
            )}
          </div>

          {/* Active brand chip — only when multi-brand */}
          {user.activeBrandName && (
            <a
              href={creatorUrl('/brands')}
              className="mx-2 my-2 px-2 py-2 rounded-md flex items-center gap-2 hover:bg-ink-50 transition-colors"
            >
              <span className="w-7 h-7 rounded-md bg-gradient-to-br from-pink-400 to-pink-600 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-500">
                  Active brand
                </div>
                <div className="text-[13px] font-semibold text-ink-900 truncate">
                  {user.activeBrandName}
                </div>
              </div>
              <ChevronDown
                strokeWidth={2}
                className="w-3.5 h-3.5 text-ink-400 -rotate-90"
              />
            </a>
          )}

          <div className="border-t border-ink-100 my-1" />

          {/* Work — what the creator does on iLaunchify (all cross-app) */}
          <MenuLink href={creatorUrl('/dashboard')} icon={LayoutDashboard} crossApp>
            Dashboard
          </MenuLink>
          <MenuLink href={creatorUrl('/brands')} icon={Layers} crossApp>
            My brands
          </MenuLink>
          <MenuLink href={creatorUrl('/products')} icon={Package} crossApp>
            My products
          </MenuLink>
          <MenuLink href={creatorUrl('/products')} icon={Truck} crossApp>
            Production orders
          </MenuLink>

          <div className="border-t border-ink-100 my-1" />

          {/* Account — connections + settings */}
          <MenuLink href={creatorUrl('/settings/channels')} icon={Plug} crossApp>
            Channels
          </MenuLink>
          <MenuLink href={creatorUrl('/settings/payouts')} icon={CreditCard} crossApp>
            Payments
          </MenuLink>
          <MenuLink href={creatorUrl('/settings/profile')} icon={Settings} crossApp>
            Settings
          </MenuLink>

          <div className="border-t border-ink-100 my-1" />

          <MenuLink href="/help" icon={HelpCircle} onClick={() => setOpen(false)}>
            Help &amp; support
          </MenuLink>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onSignOut?.()
            }}
            className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-ink-700 hover:bg-ink-50 transition-colors"
          >
            <LogOut strokeWidth={1.75} className="w-4 h-4 text-ink-500" />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function MenuLink({
  href,
  icon: Icon,
  children,
  onClick,
  crossApp,
}: {
  href: string
  icon: React.ComponentType<{ strokeWidth?: number; className?: string }>
  children: React.ReactNode
  onClick?: () => void
  /** Use raw <a> for cross-origin (apps/creator) targets. */
  crossApp?: boolean
}) {
  const cls =
    'flex items-center gap-2.5 px-4 py-2 text-[13px] text-ink-700 hover:bg-ink-50 transition-colors'
  if (crossApp) {
    return (
      <a href={href} className={cls}>
        <Icon strokeWidth={1.75} className="w-4 h-4 text-ink-500" />
        {children}
      </a>
    )
  }
  return (
    <Link href={href} role="menuitem" onClick={onClick} className={cls}>
      <Icon strokeWidth={1.75} className="w-4 h-4 text-ink-500" />
      {children}
    </Link>
  )
}
