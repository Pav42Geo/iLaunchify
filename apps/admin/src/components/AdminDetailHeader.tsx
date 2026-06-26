import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

/**
 * AdminDetailHeader — the richer sibling of {@link AdminPageHeader} for DETAIL
 * pages (Hero Usage Policy, 2026-06-25). List/settings pages use AdminPageHeader
 * (eyebrow / title / description / actions). Detail pages need more: a back-link
 * to the parent list, an inline entity meta row (email · date · chips), a
 * top-right status/priority pill cluster, and often a sub-strip baked into the
 * same card (a KPI row or a `<dl>` meta grid). This component locks all of that
 * into ONE shape so every detail header reads identically.
 *
 * Locked layout — pass content via props, never restyle per-page:
 *   <AdminDetailHeader
 *     backHref="/partners" backLabel="Partners"
 *     eyebrow="Partners · Detail" title={partner.companyName}
 *     meta={<>…email · services…</>}
 *     status={<StatusPill/>}
 *     actions={<Button/>}
 *   >
 *     {/* optional KPI strip / <dl> grid — render with its own border-t *\/}
 *   </AdminDetailHeader>
 *
 * Slots:
 *   backHref/backLabel — renders a "← {backLabel}" link above the card.
 *   avatar             — optional node left of the title (creator/niche avatars).
 *   eyebrow            — small caps line above the title.
 *   title              — the h1 (required). Normalized to text-xl for consistency.
 *   meta               — inline meta row (caller composes the `·`-separated items).
 *   status             — top-right pill cluster (status / priority / SLA).
 *   actions            — top-right buttons/links (rendered after status).
 *   children           — sub-content INSIDE the card, below the band (give it its
 *                        own `border-t border-ink-100`).
 */
export function AdminDetailHeader({
  backHref,
  backLabel = 'Back',
  eyebrow,
  title,
  avatar,
  meta,
  status,
  actions,
  children,
}: {
  backHref?: string
  backLabel?: string
  eyebrow?: ReactNode
  title: ReactNode
  avatar?: ReactNode
  meta?: ReactNode
  status?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="space-y-2">
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-500 transition-colors hover:text-ink-800 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> {backLabel}
        </Link>
      )}
      <header className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <div className="bg-[var(--bg-hero)] px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3.5">
              {avatar && <div className="flex-none">{avatar}</div>}
              <div className="min-w-0">
                {eyebrow && (
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">{eyebrow}</p>
                )}
                <h1 className="mt-1 font-display text-xl font-bold leading-tight tracking-[-0.02em] text-ink-900">
                  {title}
                </h1>
                {meta && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-600">
                    {meta}
                  </div>
                )}
              </div>
            </div>
            {(status || actions) && (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                {status}
                {actions}
              </div>
            )}
          </div>
        </div>
        {children}
      </header>
    </div>
  )
}
