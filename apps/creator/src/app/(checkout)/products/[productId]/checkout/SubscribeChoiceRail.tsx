'use client'

// Phase G6.c-rail — Amazon-style Subscribe & Save picker in the right
// rail (per Pavel 2026-05-30, modeled on Amazon product detail page).
//
// Pattern: COLLAPSED TEASER.
// - One-time purchase: top, expanded by default with price + body.
// - Subscribe & Save:  one-line teaser by default (radio + label +
//   discounted price). Clicking the row EXPANDS into the full panel
//   with bullets + foldable cadence/runs + "Add subscription to cart".
//
// Lives BETWEEN ActionsCard and OrderSummary in the right rail. Only
// visible on Step 2 with a real per-run total to compare against.
//
// Maker tier: Subscribe row shows a Builder lock badge; tapping it
// expands to a tight "Upgrade to Builder" prompt instead of the
// configuration panel.

import { useState } from 'react'
import {
  Check,
  ChevronDown,
  Info,
  Lock,
  Repeat,
  ShieldCheck,
  X,
  Zap,
} from 'lucide-react'
import {
  SUBSCRIPTION_DISCOUNT_LADDER,
  getMaxDiscountBp,
  getTierByRunCount,
  formatDiscountPct,
} from '@ilaunchify/plans'
import type { SubscriptionState } from './types'

const CADENCE_OPTIONS = [
  { value: 'MONTHLY' as const, label: 'Every month' },
  { value: 'QUARTERLY' as const, label: 'Every 3 months' },
]

// Discount ladder is the SINGLE source of truth (packages/plans).
// Per Pavel 2026-05-31 — every percentage shown in this rail must
// derive from it. V1.5 will swap the import to an admin-editable
// DB lookup; signatures stay the same.
const RUN_COUNT_OPTIONS = SUBSCRIPTION_DISCOUNT_LADDER.map((tier) => ({
  value: tier.runCount,
  label: tier.runCount === null ? 'Open-ended' : `${tier.runCount} runs`,
  discountBp: tier.discountBp,
}))
const MAX_DISCOUNT_BP = getMaxDiscountBp()
const MAX_DISCOUNT_PCT = formatDiscountPct(MAX_DISCOUNT_BP)

interface Props {
  state: SubscriptionState
  onChange: (patch: Partial<SubscriptionState>) => void
  /** Server-resolved feature flag — true = Builder+ */
  unlocked: boolean
  /** Per-run total in cents (label + packaging + finishes + platform fee). */
  perRunTotalCents: number
  /** Fired when the bottom primary button is clicked. Commits the
   *  current choice and advances the wizard to the next step. */
  onAdvance: () => void
  /** Wizard's autosave state — disables the button while persisting. */
  isSaving?: boolean
}

export function SubscribeChoiceRail({
  state,
  onChange,
  unlocked,
  perRunTotalCents,
  onAdvance,
  isSaving,
}: Props) {
  const subscribeSelected = state.offerAccepted
  // Local "expanded" state for the Subscribe row. Auto-expands when
  // selected, but the user can also click the chevron to peek without
  // committing — matches Amazon's behaviour where the panel slides
  // open under the radio.
  const [subExpanded, setSubExpanded] = useState(subscribeSelected)
  // Click-to-toggle info popover that explains the Builder-tier
  // benefits (per Pavel 2026-05-31 — replaces the "Upgrade to Builder"
  // CTA we used to render in the locked branch). Anchored to the (i)
  // icon next to the "Subscribe & Save" label.
  const [showInfo, setShowInfo] = useState(false)

  const pickedTier = getTierByRunCount(state.runCount)
  const discountBp = pickedTier.discountBp
  const previewPerRunCents = Math.max(
    0,
    Math.round((perRunTotalCents * (10_000 - discountBp)) / 10_000),
  )
  const savingsCents = perRunTotalCents - previewPerRunCents
  const pctOff = formatDiscountPct(discountBp)

  // Mark the offer as seen the first render — fuels future analytics on
  // impression vs accept rates.
  if (!state.seenOffer) {
    queueMicrotask(() => onChange({ seenOffer: true }))
  }

  function pickOneTime() {
    // User switched to One-time → no need for the Subscribe benefits
    // popup to keep occupying space. They can reopen it any time via
    // "What's included?".
    setShowInfo(false)
    onChange({
      offerAccepted: false,
      cadence: null,
      runCount: null,
      discountBp: 0,
    })
  }

  function pickSubscribe() {
    // Per Pavel 2026-05-31 — open the benefits popup (the "What's
    // included" tier card) so the creator sees what Subscribe & Save
    // offers without hunting. DON'T auto-expand the configuration
    // dropdown — Pavel doesn't like that. They click the chevron if
    // they want to tweak cadence / runs.
    setShowInfo(true)
    // The radio flips for everyone. Tier-gating happens downstream
    // in placeOrderFromCheckoutDraft — Maker's soft-fail keeps the
    // day-1 order intact and skips Stripe subscription creation.
    onChange({
      offerAccepted: true,
      cadence: state.cadence ?? 'MONTHLY',
      runCount: state.runCount ?? 6,
      discountBp: pickedTier.discountBp,
    })
  }

  function setCadence(cadence: 'MONTHLY' | 'QUARTERLY') {
    onChange({ cadence })
  }

  function setRunCount(value: number | null) {
    const match =
      RUN_COUNT_OPTIONS.find((o) => o.value === value) ?? RUN_COUNT_OPTIONS[1]!
    onChange({ runCount: value, discountBp: match.discountBp })
  }

  return (
    <section
      aria-labelledby="subscribe-choice-heading"
      /* overflow-visible (was -hidden) so the Builder-tier hover card
         can float past the section's rounded edge. The card's z-index
         layers it above OrderSummary below. */
      className="rounded-xl border border-ink-200 bg-white"
    >
      <h3 id="subscribe-choice-heading" className="sr-only">
        Purchase frequency
      </h3>

      {/* --- One-time row (expanded, default selected) ------------------ */}
      <button
        type="button"
        onClick={pickOneTime}
        aria-pressed={!subscribeSelected}
        className={
          'flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors focus:outline-none focus-visible:bg-ink-50 ' +
          (!subscribeSelected ? 'bg-white' : 'bg-white hover:bg-ink-50/60')
        }
      >
        <RadioDot selected={!subscribeSelected} tone="ink" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <ShieldCheck
              className="h-3.5 w-3.5 text-ink-700"
              aria-hidden="true"
            />
            <p className="text-[13px] font-semibold text-ink-900">
              One-time purchase
            </p>
          </div>
          <p className="mt-1 font-display text-lg font-bold tabular-nums text-ink-900">
            {perRunTotalCents > 0 ? formatCents(perRunTotalCents) : '$—.——'}
          </p>
          <p className="mt-0.5 text-[10.5px] leading-snug text-ink-500">
            Pay this batch only. No commitment.
          </p>
        </div>
      </button>

      {/* CTA slot for One-time mode — anchored UNDER the One-time row.
          Per Pavel 2026-05-31: label here is "Add to cart" (no
          subscription); the Subscribe-mode slot below uses
          "Add subscription to cart". The button MOVES between the
          two slots based on the selected radio. */}
      {!subscribeSelected && (
        // No border-top — the button reads as part of the One-time
        // card, not a separate action (Pavel 2026-06-01).
        <div className="bg-white px-4 pb-4">
          <button
            type="button"
            onClick={() => {
              pickOneTime() // idempotent re-confirm
              onAdvance()
            }}
            disabled={isSaving}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-pink-500 px-5 py-2.5 text-[12.5px] font-semibold uppercase tracking-wider text-white shadow-sm hover:bg-pink-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 disabled:opacity-50"
          >
            Add to cart
          </button>
        </div>
      )}

      {/* divider */}
      <div className="h-px bg-ink-100" />

      {/* --- Subscribe & Save row -------------------------------------- */}
      {/* Per Pavel 2026-06-01 — gray bg (a notch darker than the
          white rail) instead of the pink-50 tint. Reads as "available
          but not active" without leaning on brand pink. Same gray on
          both selected and idle so the row's visual identity stays
          stable across radio toggles — selection is communicated by
          the RadioDot itself, not by the row tint. */}
      <div className="bg-ink-50 transition-colors">
        {/* TEASER (always visible) — radio + label + price + chevron.
            Must NOT be a <button> — it contains nested interactive
            elements (the 'What's included?' link button + the
            BuilderLockBadgeWithHoverCard's tabbable badge), and a
            <button> inside another <button> is an HTML hydration
            error. Using a div with role="button" + tabIndex +
            keyboard handler preserves the click-to-toggle UX without
            the invalid nesting. */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            if (subExpanded && unlocked) {
              setSubExpanded(false)
            } else {
              pickSubscribe()
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              if (subExpanded && unlocked) {
                setSubExpanded(false)
              } else {
                pickSubscribe()
              }
            }
          }}
          aria-expanded={subExpanded}
          aria-pressed={subscribeSelected}
          className="flex w-full cursor-pointer items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-ink-50/40 focus:outline-none focus-visible:bg-ink-50"
        >
          <RadioDot selected={subscribeSelected} tone="pink" />
          <div className="relative min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Repeat
                className={
                  'h-3.5 w-3.5 ' +
                  (subscribeSelected ? 'text-pink-700' : 'text-ink-700')
                }
                aria-hidden="true"
              />
              <p className="text-[13px] font-semibold text-ink-900">
                Subscribe &amp; Save
              </p>
              {unlocked
                ? perRunTotalCents > 0 && savingsCents > 0 && (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                      −{pctOff}%
                    </span>
                  )
                : (
                  // Static Lock badge — the Builder tier card now
                  // lives in the "What's included?" popup (Pavel
                  // 2026-06-01), so this badge no longer needs hover
                  // behaviour. It's purely a status indicator.
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-ink-100 px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wider text-ink-600">
                    <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                    Builder
                  </span>
                )}
            </div>
            {/* Always render the discounted price — per Pavel
                2026-05-31, the price is "decision-making driven" data
                even for Maker (it tells them what they'd pay if they
                were on Builder, so they can decide whether to upgrade).
                For locked users we still hide the strikethrough +
                savings chip to keep the row readable. */}
            <div className="mt-1 flex items-baseline gap-2">
              <p className="font-display text-lg font-bold tabular-nums text-pink-700">
                {perRunTotalCents > 0
                  ? formatCents(previewPerRunCents)
                  : '$—.——'}
              </p>
              {perRunTotalCents > 0 && savingsCents > 0 && (
                <p className="text-[11.5px] tabular-nums text-ink-400 line-through">
                  {formatCents(perRunTotalCents)}
                </p>
              )}
            </div>
            {/* Per Pavel 2026-06-01 — caption is two lines for both
                tiers: first line is the savings promise, second line
                is the reassurance. The Builder-plan prefix moves into
                the popup ("What's included?") so it doesn't clutter
                the teaser. */}
            <p className="mt-0.5 text-[10.5px] leading-snug text-ink-500">
              Save up to {MAX_DISCOUNT_PCT}% off every run
            </p>
            <p className="text-[10.5px] leading-snug text-ink-500">
              Cancel anytime
            </p>
            {/* "What's included?" trigger — a visible inline link with
                icon, in pink so it reads as a discoverable action
                instead of the tiny grey (i) it replaced. Stops
                propagation so the popover open doesn't also toggle
                the row's expand state. Anchored under the price
                caption so it sits in the user's natural read path. */}
            <button
              type="button"
              aria-label="See what's included with Subscribe & Save"
              aria-expanded={showInfo}
              onClick={(e) => {
                e.stopPropagation()
                setShowInfo((v) => !v)
              }}
              className="mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold text-pink-700 underline decoration-pink-300 decoration-1 underline-offset-2 transition-colors hover:bg-pink-50 hover:decoration-pink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-1"
            >
              <Info className="h-3 w-3" aria-hidden="true" />
              What&rsquo;s included?
            </button>
          </div>
          <ChevronDown
            aria-hidden="true"
            className={
              'mt-1 h-4 w-4 flex-shrink-0 text-ink-500 transition-transform ' +
              (subExpanded ? 'rotate-180' : '')
            }
          />
        </div>

        {/* INFO POPOVER — toggled by the "What's included?" link
            (and auto-opened on Subscribe pick). Per Pavel 2026-06-01,
            the popup now uses the Builder tier card design (was a
            plain bulleted list). Same content as the Studio
            UpgradeOverlay's middle card — visual consistency across
            the app. */}
        {showInfo && (
          <div className="relative mx-3 mb-3 rounded-xl border-2 border-pink-200 bg-white p-4 shadow-md">
            <button
              type="button"
              aria-label="Close info"
              onClick={() => setShowInfo(false)}
              className="absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
            {/* Tier header — same pattern as Studio UpgradeOverlay */}
            <div className="flex items-center gap-2 pr-5">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-pink-100">
                <Zap className="h-3.5 w-3.5 text-pink-700" aria-hidden="true" />
              </span>
              <span className="text-[13px] font-bold text-ink-900">Builder</span>
              <span className="ml-auto rounded-full bg-emerald-100 px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wider text-emerald-700">
                Recommended
              </span>
            </div>
            {/* Price */}
            <div className="mt-2 flex items-baseline gap-1">
              <span className="font-display text-xl font-bold tabular-nums text-ink-900">
                $29
              </span>
              <span className="text-[10.5px] text-ink-500">/ month</span>
            </div>
            <p className="mt-0.5 text-[10.5px] text-ink-600">
              For creators ready to ship orders.
            </p>
            {/* Features list */}
            <ul className="mt-3 space-y-1 text-[11px] text-ink-700">
              <li className="flex items-start gap-1.5">
                <Check
                  className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-700"
                  aria-hidden="true"
                />
                <span>Subscribe &amp; Save (up to {MAX_DISCOUNT_PCT}% off every run)</span>
              </li>
              <li className="flex items-start gap-1.5">
                <Check
                  className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-700"
                  aria-hidden="true"
                />
                <span>Print-ready PDF + PNG export</span>
              </li>
              <li className="flex items-start gap-1.5">
                <Check
                  className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-700"
                  aria-hidden="true"
                />
                <span>Multi-channel push (Shopify, Etsy…)</span>
              </li>
              <li className="flex items-start gap-1.5">
                <Check
                  className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-700"
                  aria-hidden="true"
                />
                <span>Volume pricing (~{MAX_DISCOUNT_PCT}% off catalog)</span>
              </li>
            </ul>
          </div>
        )}

        {/* EXPANDED PANEL — bullets + foldable cadence/runs + commit
            CTA (unlocked) OR neutral "available on Builder" copy
            (locked). Slides under the teaser; only renders when the
            user has expanded it. */}
        {subExpanded && unlocked && (
          <div className="space-y-3 border-t border-pink-100 px-4 pb-4 pt-3">
              {/* Short benefit bullets per Pavel — no redundant savings
                  line here (OrderSummary already shows "Subscription
                  savings (X%)" as a recalculated breakdown row). */}
              <ul className="space-y-1 text-[11.5px] text-ink-700">
                <li className="flex items-center gap-1.5">
                  <Check
                    className="h-3 w-3 flex-shrink-0 text-emerald-700"
                    aria-hidden="true"
                  />
                  Low fees
                </li>
                <li className="flex items-center gap-1.5">
                  <Check
                    className="h-3 w-3 flex-shrink-0 text-emerald-700"
                    aria-hidden="true"
                  />
                  Cancel anytime
                </li>
              </ul>

              {/* Foldable cadence + runs */}
              <div className="space-y-2">
                <SelectField
                  id="sub-cadence"
                  label="Deliver every"
                  value={(state.cadence ?? 'MONTHLY') as string}
                  onChange={(v) => setCadence(v as 'MONTHLY' | 'QUARTERLY')}
                  options={CADENCE_OPTIONS.map((o) => ({
                    value: o.value,
                    label: o.label,
                  }))}
                />
                <SelectField
                  id="sub-runs"
                  label="Total runs"
                  value={String(state.runCount ?? 6)}
                  onChange={(v) => setRunCount(v === 'null' ? null : Number(v))}
                  /* Each option shows its REAL per-run price (per
                     Pavel 2026-05-31, "decision-making driven model"
                     — the creator can compare actual dollar amounts
                     across plans before committing). */
                  options={RUN_COUNT_OPTIONS.map((o) => {
                    const optPerRunCents = Math.max(
                      0,
                      Math.round(
                        (perRunTotalCents * (10_000 - o.discountBp)) / 10_000,
                      ),
                    )
                    const pricePart =
                      perRunTotalCents > 0
                        ? ` · ${formatCents(optPerRunCents)}/run`
                        : ''
                    return {
                      value: o.value === null ? 'null' : String(o.value),
                      label: `${o.label} · save ${(o.discountBp / 100).toFixed(0)}%${pricePart}`,
                    }
                  })}
                />
              </div>

              <p className="text-[10.5px] leading-snug text-ink-500">
                Recurring billing starts{' '}
                {state.cadence === 'QUARTERLY' ? '3 months' : '30 days'} from
                today.
              </p>
            </div>
          )}
        {/* Locked branch — intentionally renders nothing in the
            expanded area. The hover-revealed Builder tier card on
            the Lock badge + the auto-opened info popup on Subscribe
            pick handle all the explanation. Per Pavel: "remove the
            'included with Builder plan' text — it's redundant." */}
      </div>

      {/* CTA slot for Subscribe mode — symmetric with the One-time
          slot above. Anchored as a SIBLING below the Subscribe row
          (not inside the configuration panel), so the button stays
          visible even if the user collapses the panel via the
          chevron. Renders whenever Subscribe is the active radio,
          regardless of tier (per Pavel 2026-05-31: the button MUST
          appear under whichever plan is selected). The downstream
          placeOrderFromCheckoutDraft handles Maker tier-gating —
          here in the UI the button is the advance affordance. */}
      {subscribeSelected && (
        // No border-top + gray bg matching the Subscribe row above
        // (bg-ink-50). Per Pavel 2026-06-01 — the divider line + pink
        // tint made the button feel like a separate action; now it
        // reads as part of the same card.
        <div className="bg-ink-50 px-4 pb-4">
          <button
            type="button"
            onClick={() => {
              pickSubscribe() // idempotent re-confirm cadence/runs
              onAdvance()
            }}
            disabled={isSaving}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-pink-500 px-5 py-2.5 text-[12.5px] font-semibold uppercase tracking-wider text-white shadow-sm hover:bg-pink-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 disabled:opacity-50"
          >
            Add subscription to cart
          </button>
        </div>
      )}
    </section>
  )
}

// =============================================================================
// SelectField — labeled native <select> with subtle chrome
// =============================================================================

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[10.5px] font-semibold uppercase tracking-widest text-ink-600"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-ink-900 shadow-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

// =============================================================================
// RadioDot — Amazon-style filled circle for the selected mode
// =============================================================================

function RadioDot({
  selected,
  tone,
}: {
  selected: boolean
  tone: 'pink' | 'ink'
}) {
  return (
    <span
      aria-hidden="true"
      className={
        'mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ' +
        (selected
          ? tone === 'pink'
            ? 'border-pink-500 bg-pink-500'
            : 'border-ink-900 bg-ink-900'
          : 'border-ink-300 bg-white')
      }
    >
      {selected && (
        <span className="block h-1.5 w-1.5 rounded-full bg-white" />
      )}
    </span>
  )
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

// =============================================================================
// BuilderLockBadgeWithHoverCard — DEPRECATED 2026-06-01
//
// Pavel asked to remove the hover-revealed tier card. The same content
// is now the body of the "What's included?" popover (one place for
// "what's in this plan"). This component is no longer rendered; keeping
// it here in case we want to revive the hover affordance later.
// =============================================================================

function _BuilderLockBadgeWithHoverCard_DEPRECATED() {
  const [open, setOpen] = useState(false)
  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span
        tabIndex={0}
        aria-describedby="builder-tier-hover-card"
        className="inline-flex cursor-help items-center gap-0.5 rounded-full bg-ink-100 px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wider text-ink-600 transition-colors hover:bg-pink-100 hover:text-pink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-1"
      >
        <Lock className="h-2.5 w-2.5" aria-hidden="true" />
        Builder
      </span>

      {/* Hover card — anchored to the bottom-left of the badge so it
          opens INTO the rail (avoids overflowing the viewport's right
          edge). z-30 puts it above the OrderSummary card stacked below. */}
      {open && (
        <div
          id="builder-tier-hover-card"
          role="tooltip"
          className="absolute left-0 top-full z-30 mt-2 w-64 rounded-xl border-2 border-pink-200 bg-white p-4 text-left shadow-xl"
        >
          {/* Tier header — same pattern as Studio's UpgradeOverlay */}
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-pink-100">
              <Zap className="h-3.5 w-3.5 text-pink-700" aria-hidden="true" />
            </span>
            <span className="text-[13px] font-bold text-ink-900">Builder</span>
            <span className="ml-auto rounded-full bg-emerald-100 px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wider text-emerald-700">
              Recommended
            </span>
          </div>

          {/* Price */}
          <div className="mt-2 flex items-baseline gap-1">
            <span className="font-display text-xl font-bold tabular-nums text-ink-900">
              $29
            </span>
            <span className="text-[10.5px] text-ink-500">/ month</span>
          </div>
          <p className="mt-0.5 text-[10.5px] text-ink-600">
            For creators ready to ship orders.
          </p>

          {/* Feature list — keeps parity with the Studio overlay's
              Builder card but trimmed for the rail's narrower width. */}
          <ul className="mt-3 space-y-1 text-[11px] text-ink-700">
            <li className="flex items-start gap-1.5">
              <Check
                className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-700"
                aria-hidden="true"
              />
              <span>Subscribe &amp; Save (up to {MAX_DISCOUNT_PCT}% off every run)</span>
            </li>
            <li className="flex items-start gap-1.5">
              <Check
                className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-700"
                aria-hidden="true"
              />
              <span>Print-ready PDF + PNG export</span>
            </li>
            <li className="flex items-start gap-1.5">
              <Check
                className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-700"
                aria-hidden="true"
              />
              <span>Multi-channel push (Shopify, Etsy…)</span>
            </li>
            <li className="flex items-start gap-1.5">
              <Check
                className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-700"
                aria-hidden="true"
              />
              <span>Volume pricing (~{MAX_DISCOUNT_PCT}% off catalog)</span>
            </li>
          </ul>
        </div>
      )}
    </span>
  )
}
