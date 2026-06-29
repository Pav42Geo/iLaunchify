import * as React from 'react'

type SectionLabelProps = React.HTMLAttributes<HTMLElement> & {
  /** Element to render. Defaults to 'div'. */
  as?: React.ElementType
}

/**
 * Eyebrow / section-label text — the small uppercase heading above font groups, cards,
 * form sections, and lists across the platform.
 *
 * Locked style (Pavel 2026-06-23): 12px bold uppercase, dark gray (ink-700). This is the
 * single source of truth for this text type; the faint 10–11px ink-400/500 version was
 * nearly invisible. Pass layout classes (margins/padding) via `className`.
 *
 *   <SectionLabel className="mb-2">Recently used</SectionLabel>
 */
export function SectionLabel({ as, className = '', children, ...rest }: SectionLabelProps) {
  const Tag = (as ?? 'div') as React.ElementType
  return (
    <Tag
      className={`text-ui-label uppercase text-ink-700 ${className}`.trim()}
      {...rest}
    >
      {children}
    </Tag>
  )
}
