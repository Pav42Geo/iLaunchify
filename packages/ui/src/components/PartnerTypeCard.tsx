import * as React from 'react'
import { cn } from '../lib/utils'

/**
 * PartnerTypeCard — renders a Partner *type* (Manufacturer / Co-packer /
 * Label printer / Logistics) at card size, used on the Business landing page
 * "What we're looking for" section.
 *
 * Per OOUX_OBJECT_MAP.md §6 this is the type-card view of the `Partner`
 * object — different from the admin CRM row or the partner detail page.
 *
 * Designed for DARK surfaces only (the partner-types section in the business
 * landing rhythm). Border lights up neon on hover. Active-count chip uses the
 * neon brand color for the "this many partners are live right now" signal.
 */
export interface PartnerTypeCardProps extends React.HTMLAttributes<HTMLElement> {
  /** Emoji or icon glyph. */
  icon: React.ReactNode
  /** Type name — e.g., "Manufacturer". */
  name: string
  /** One-line description of the role. */
  description: string
  /** Number of currently-active partners of this type. */
  activeCount: number
  /** When provided, renders the card as a clickable link. */
  href?: string
}

export const PartnerTypeCard = React.forwardRef<HTMLElement, PartnerTypeCardProps>(
  ({ icon, name, description, activeCount, href, className, ...props }, ref) => {
    const Wrapper = (href ? 'a' : 'article') as 'a' | 'article'
    return (
      <Wrapper
        ref={ref as never}
        href={href}
        className={cn(
          'bg-ink-800 border border-ink-700 rounded-lg p-[22px] flex flex-col gap-4 ' +
            'transition-[transform,border-color] duration-base ease-out-quart ' +
            (href ? 'cursor-pointer hover:-translate-y-0.5 hover:border-neon-500' : ''),
          className,
        )}
        {...props}
      >
        <span className="text-3xl leading-none">{icon}</span>
        <div className="flex-1">
          <div className="text-lg font-bold text-white mb-1">{name}</div>
          <div className="text-[13px] text-ink-400 leading-[1.5]">{description}</div>
        </div>
        <span className="inline-flex self-start items-center gap-1.5 text-xs font-semibold text-ink-900 bg-neon-500 px-2.5 py-1 rounded-pill">
          {activeCount.toLocaleString()} active
        </span>
      </Wrapper>
    )
  },
)
PartnerTypeCard.displayName = 'PartnerTypeCard'
