'use client'

// Slide-out drawer modeled on Suplifulpattern (per Pavel screenshot 2026-05-25).
// Renders inside (dashboard) layout. Opens from the right edge over a backdrop;
// dashboard underneath stays interactive (semi-transparent, clickable backdrop).
//
// Each item:
//   - Icon in a soft tinted square
//   - Title + 1-line description
//   - Right-side arrow CTA that deep-links to where that step is configured
//   - Completed items strike-through, check icon, no arrow
//   - Locked items (rare — only step gates we add later) get a lock icon

import Link from 'next/link'
import {
  ArrowRight,
  Check,
  CreditCard,
  Globe,
  Palette,
  ShoppingBag,
  Sparkles,
  X,
} from 'lucide-react'
import type { ComponentType } from 'react'
import {
  computeChecklistCompletion,
  useLaunchChecklist,
  pendingChecklistCount,
} from './LaunchChecklistProvider'

interface ChecklistItem {
  id: 1 | 2 | 3 | 4 | 5
  title: string
  description: string
  href: string
  icon: ComponentType<{ className?: string }>
  ctaLabel: string
}

const ITEMS: ChecklistItem[] = [
  {
    id: 1,
    title: 'Tell us about you',
    description: 'Pick the markets you sell in and your audience size.',
    href: '/settings/profile',
    icon: Sparkles,
    ctaLabel: 'Set markets',
  },
  {
    id: 2,
    title: 'Set up payments',
    description: 'Connect Stripe so we can pay you out.',
    href: '/settings/payouts',
    icon: CreditCard,
    ctaLabel: 'Connect Stripe',
  },
  {
    id: 3,
    title: 'Connect a channel',
    description: 'Link your Shopify, Amazon, or brand storefront.',
    href: '/settings/channels',
    icon: Globe,
    ctaLabel: 'Connect',
  },
  {
    id: 4,
    title: 'Brand identity',
    description: 'Logo, colors, typography — drives your label designs.',
    href: '/brands/new',
    icon: Palette,
    ctaLabel: 'Set up',
  },
  {
    id: 5,
    title: 'Pick your first product',
    description: 'Browse our marketplace and customize a product.',
    href: '/marketplace',
    icon: ShoppingBag,
    ctaLabel: 'Browse',
  },
]

export function LaunchChecklistDrawer() {
  const { isOpen, close, snapshot } = useLaunchChecklist()
  const completion = computeChecklistCompletion(snapshot)
  const doneCount = Object.values(completion).filter(Boolean).length
  const progressPct = Math.round((doneCount / ITEMS.length) * 100)

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="launch-checklist-title"
      className="fixed inset-0 z-40 flex"
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      {/* Semi-transparent backdrop — clicks close the drawer */}
      <div className="flex-1 bg-zinc-900/20" />

      {/* Slide-out panel */}
      <aside className="flex w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-2xl">
        {/* Header */}
        <header className="flex items-start justify-between border-b border-zinc-200 p-6">
          <div>
            <h2 id="launch-checklist-title" className="text-lg font-bold text-zinc-900">
              Steps to complete
            </h2>
            <p className="mt-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
              Your progress
            </p>
            <p className="mt-1 text-sm text-zinc-700">
              {doneCount} of {ITEMS.length} completed
            </p>
            <div className="mt-2 flex gap-1.5">
              {ITEMS.map((item) => (
                <span
                  key={item.id}
                  className={`h-1.5 flex-1 rounded-full ${
                    completion[item.id] ? 'bg-emerald-500' : 'bg-zinc-200'
                  }`}
                  aria-hidden
                />
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close checklist"
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-4">
          <ul className="space-y-2">
            {ITEMS.map((item) => (
              <ChecklistRow
                key={item.id}
                item={item}
                isDone={completion[item.id]}
                onNavigate={close}
              />
            ))}
          </ul>
        </div>

        {/* Footer: small reassurance */}
        <footer className="border-t border-zinc-200 bg-zinc-50 px-6 py-3 text-xs text-zinc-500">
          {pendingChecklistCount(snapshot) === 0 ? (
            <>🎉 All set — you can close this drawer for good.</>
          ) : (
            <>You can come back any time from the &quot;Launch Checklist&quot; in the sidebar.</>
          )}
        </footer>
      </aside>
    </div>
  )
}

// -----------------------------------------------------------------------------
// One row
// -----------------------------------------------------------------------------

function ChecklistRow({
  item,
  isDone,
  onNavigate,
}: {
  item: ChecklistItem
  isDone: boolean
  onNavigate: () => void
}) {
  const Icon = item.icon

  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
          isDone
            ? 'border-emerald-200 bg-emerald-50/50'
            : 'border-zinc-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/30'
        }`}
      >
        <span
          className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${
            isDone ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'
          }`}
        >
          {isDone ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div
            className={`font-semibold ${
              isDone ? 'text-zinc-500 line-through' : 'text-zinc-900'
            }`}
          >
            {item.title}
          </div>
          <p
            className={`mt-0.5 text-xs ${isDone ? 'text-zinc-400 line-through' : 'text-zinc-500'}`}
          >
            {item.description}
          </p>
        </div>
        {!isDone && (
          <span
            className="ml-2 mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-zinc-200 text-zinc-500"
            aria-hidden
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        )}
      </Link>
    </li>
  )
}
