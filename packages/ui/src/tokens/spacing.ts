/**
 * iLaunchify spacing tokens — strict 8pt grid.
 *
 * Most-broken rule on early drafts:
 *   Internal spacing inside a component must be <= external spacing around it.
 * Enforce on every new component.
 */

/** 8pt grid scale. Tailwind exposes as `p-s-1`, `gap-s-5`, etc. */
export const spacing = {
  /** 4px — fine-tune inside components (icon offset, badge padding) */
  's-1': '4px',
  /** 8px — minimum component-internal spacing */
  's-2': '8px',
  /** 12px — button/input internal padding */
  's-3': '12px',
  /** 16px — compact card padding (partner mode) */
  's-4': '16px',
  /** 24px — comfortable card padding (creator mode) */
  's-5': '24px',
  /** 32px — between distinct content blocks */
  's-6': '32px',
  /** 48px — section breathers */
  's-7': '48px',
  /** 64px — hero / major section gaps */
  's-8': '64px',
  /** 96px — landing page section gaps */
  's-9': '96px',
  /** 128px — marketing surface section gaps */
  's-10': '128px',
} as const

/**
 * Density-mode card padding. Wire to `<html data-surface="creator|partner">`.
 */
export const cardPadding = {
  creator: spacing['s-5'], // 24px — comfortable
  partner: spacing['s-4'], // 16px — compact
} as const

/** Density-mode section gap. */
export const sectionGap = {
  creator: spacing['s-7'], // 48px
  partner: spacing['s-5'], // 24px
} as const

export type SpacingToken = keyof typeof spacing
