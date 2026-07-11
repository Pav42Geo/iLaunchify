// Single source of truth for the creator tier-upgrade modal (TierUpgradeModal).
//
// The comparison table (plans + benefit rows) is defined ONCE here; every gated
// feature reuses the same modal and only supplies its own `UpgradeFeature`
// (eyebrow, headline, the "Unlocks XXX" tag, and which benefit row to spotlight).
// To gate a new feature behind a tier, add one entry to CREATOR_UPGRADE_FEATURES
// (and, if it isn't already a row, one row to CREATOR_UPGRADE_ROWS) — nothing
// else changes.
//
// Prices / fees mirror the plan ladder (packages/db seed-subscription-plans.ts +
// @ilaunchify/plans): Maker free · 15% / Builder $29 · 12% / Agency $99 · 8%.
// Keep them in step if the seed changes.

export type CreatorPlanKey = 'maker' | 'builder' | 'agency'

export interface UpgradePlan {
  key: CreatorPlanKey
  name: string
  /** Big price in the radio card, e.g. "$29". Empty for the free tier. */
  price: string
  /** Sub-line in the radio card, e.g. "/month · or $290/yr · 12% platform fee". */
  priceSub: string
  /** Small column header caption, e.g. "$29/mo" or "Current · free". */
  columnCaption: string
  /** Default marketing tag when this plan is NOT the recommended one. */
  defaultTag?: string
  isCurrent?: boolean
}

/** Ordered low → high; the first entry is the current/free tier. */
export const CREATOR_UPGRADE_PLANS: Record<CreatorPlanKey, UpgradePlan> = {
  maker: {
    key: 'maker',
    name: 'Maker',
    price: '',
    priceSub: 'Free · 15% platform fee',
    columnCaption: 'Current · free',
    isCurrent: true,
  },
  builder: {
    key: 'builder',
    name: 'Builder',
    price: '$29',
    priceSub: '/month · or $290/yr · 12% platform fee',
    columnCaption: '$29/mo',
    defaultTag: 'Most popular',
  },
  agency: {
    key: 'agency',
    name: 'Agency',
    price: '$99',
    priceSub: '/month · or $990/yr · 8% platform fee',
    columnCaption: '$99/mo',
    defaultTag: 'Lowest fee · scale',
  },
}

export const CREATOR_PLAN_ORDER: CreatorPlanKey[] = ['maker', 'builder', 'agency']

/** A cell value: `true` → check, `false` → dash, or literal text. */
export type BenefitValue = boolean | string

export interface UpgradeBenefitRow {
  key: string
  label: string
  values: Record<CreatorPlanKey, BenefitValue>
}

// Canonical benefit rows. `key` is what an UpgradeFeature spotlights.
export const CREATOR_UPGRADE_ROWS: UpgradeBenefitRow[] = [
  {
    key: 'cocreation',
    label: 'Co-create products with makers',
    values: { maker: false, builder: true, agency: true },
  },
  {
    key: 'fee',
    label: 'Platform fee on production',
    values: { maker: '15%', builder: '12%', agency: '8%' },
  },
  {
    key: 'brandKits',
    label: 'Brand kits',
    values: { maker: '1', builder: '3', agency: 'Unlimited' },
  },
  {
    key: 'templates',
    label: 'Saved templates per kit',
    values: { maker: '3', builder: '15', agency: 'Unlimited' },
  },
  {
    key: 'channels',
    label: 'Connected sales channels',
    values: { maker: '1', builder: '3', agency: 'Unlimited' },
  },
  {
    key: 'alternates',
    label: 'Design alternates per slot',
    values: { maker: '2', builder: '5', agency: 'Unlimited' },
  },
  {
    key: 'customFont',
    label: 'Custom brand font upload',
    values: { maker: false, builder: true, agency: true },
  },
  {
    key: 'compliance',
    label: 'Compliance label file downloads',
    values: { maker: false, builder: false, agency: true },
  },
]

/** Per-feature framing — the ONLY thing that differs between gated surfaces. */
export interface UpgradeFeature {
  /** Eyebrow chip, e.g. "🤝 Co-creation is a Builder feature". */
  eyebrow: string
  /** Headline (plain text); `emphasis` is rendered as a serif-italic accent. */
  title: string
  emphasis?: string
  subtitle: string
  /** Tag shown on the recommended plan card, e.g. "Unlocks co-creation". */
  unlocksLabel: string
  /** Canonical benefit row key to spotlight (must exist in CREATOR_UPGRADE_ROWS). */
  highlightKey: string
  /** Small "why" line under the spotlighted row. */
  why: string
  /** CTA verb suffix appended after the plan name, e.g. "& post my brief". */
  ctaSuffix?: string
  /** Lowest tier that unlocks the feature → the recommended / pre-selected plan. */
  requiredTier: Exclude<CreatorPlanKey, 'maker'>
}

// Registry of gated features. Add an entry to gate a new surface — the label
// "Unlocks XXX" and the spotlighted row are all that change.
export const CREATOR_UPGRADE_FEATURES = {
  cocreation: {
    eyebrow: '🤝 Co-creation is a Builder feature',
    title: 'Co-create your',
    emphasis: 'next product',
    subtitle:
      'Post a brief — a recipe or just an idea — and matched, verified makers raise their hands to build it with you. Included on Builder and Agency.',
    unlocksLabel: 'Unlocks co-creation',
    highlightKey: 'cocreation',
    why: "The reason you're here — post briefs to the maker pool",
    ctaSuffix: '& post my brief',
    requiredTier: 'builder',
  },
} satisfies Record<string, UpgradeFeature>

export type CreatorUpgradeFeatureKey = keyof typeof CREATOR_UPGRADE_FEATURES
