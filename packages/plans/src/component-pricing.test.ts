// PP-0 pins for the extracted decoration + component-upgrade derivation.
// Throw-based, same convention as packages/plans/src/*.test.ts (no vitest import).
//
// These exist because this math was silently absent from the real charge. The
// pin that matters most is the FIELD NAME one: the JSON contract key is
// `pricePerUnitCents`, and while extracting this I first guessed `unitPriceCents`,
// which prices every decoration at 0 without throwing. That failure mode is
// invisible in production and would have made the shadow report "no gap" for the
// exact line the shadow exists to measure. Never let that key drift.

import { priceComponents, pickTierPriceCents, type ComponentRow } from './component-pricing'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`)
}

function row(over: Partial<ComponentRow> = {}): ComponentRow {
  return {
    id: 'c1',
    tier: 'SECONDARY',
    role: 'CLOSURE',
    unitsPerParent: 1,
    partnerOfferingId: null,
    decorationMethod: null,
    selectedVariant: null,
    partnerOffering: null,
    ...over,
  }
}

const TIERS = [
  { minQty: 1, pricePerUnitCents: 120 },
  { minQty: 500, pricePerUnitCents: 90 },
  { minQty: 5000, pricePerUnitCents: 60 },
]

// ── the JSON contract key ────────────────────────────────────────────────────
{
  assert(pickTierPriceCents(TIERS, 1000) === 90, 'reads pricePerUnitCents at the 500 break')
  // The exact bug guarded against: a renamed key must NOT quietly price to 0.
  const renamed = [{ minQty: 1, unitPriceCents: 120 }]
  assert(pickTierPriceCents(renamed, 10) === 0, 'a wrong key prices to 0: proof the key IS the contract')
}

// ── volume breaks ────────────────────────────────────────────────────────────
{
  assert(pickTierPriceCents(TIERS, 1) === 120, 'lowest tier at qty 1')
  assert(pickTierPriceCents(TIERS, 499) === 120, 'below the break stays on the low tier')
  assert(pickTierPriceCents(TIERS, 500) === 90, 'the break is inclusive (minQty <= qty)')
  assert(pickTierPriceCents(TIERS, 5_000_000) === 60, 'saturates at the top tier')
  assert(pickTierPriceCents([...TIERS].reverse(), 500) === 90, 'unsorted input still sorts')
}

// ── malformed JSON never throws inside a checkout ────────────────────────────
{
  assert(pickTierPriceCents([], 100) === 0, 'empty tiers')
  assert(pickTierPriceCents(null, 100) === 0, 'null')
  assert(pickTierPriceCents('nonsense', 100) === 0, 'wrong type')
  assert(pickTierPriceCents([{ minQty: 'x', pricePerUnitCents: 5 }], 100) === 0, 'bad member filtered')
}

// ── C8.2: the priced primary is decoration, and is NOT double-counted ────────
{
  const primary = row({
    id: 'primary',
    tier: 'PRIMARY',
    role: 'CONTAINER',
    partnerOfferingId: 'off1',
    decorationMethod: 'DIRECT_PRINT',
    partnerOffering: { pricingTiers: TIERS },
    // A surcharge on the priced primary must be IGNORED (the offering prices it).
    selectedVariant: { baseSurchargePerUnit: 99 },
  })
  const cap = row({ id: 'cap', selectedVariant: { baseSurchargePerUnit: 0.25 } })

  const p = priceComponents([primary, cap], 1000)
  assert(p.decorationUnitCents === 90, 'primary decoration prices off the offering tier')
  assert(p.decorationMethod === 'DIRECT_PRINT', 'method comes from the primary')
  assert(p.componentsUnitCents === 25, 'only the cap surcharges: 0.25 dollars -> 25 cents')
  assert(p.componentsUnitCents !== 25 + 9900, 'the priced primary is excluded from surcharges')
}

// ── dollars -> cents, and unitsPerParent multiplies ──────────────────────────
{
  const p = priceComponents([row({ selectedVariant: { baseSurchargePerUnit: 0.5 }, unitsPerParent: 4 })], 10)
  assert(p.componentsUnitCents === 200, '0.50 dollars x 4 per parent = 200 cents')
  const zeroParent = priceComponents(
    [row({ selectedVariant: { baseSurchargePerUnit: 0.5 }, unitsPerParent: 0 })],
    10,
  )
  assert(zeroParent.componentsUnitCents === 50, 'unitsPerParent 0 falls back to 1 (|| 1)')
}

// ── no offering / no variants = zero, never NaN ──────────────────────────────
{
  const p = priceComponents([row(), row({ tier: 'PRIMARY', role: 'CONTAINER' })], 100)
  assert(p.decorationUnitCents === 0 && p.componentsUnitCents === 0, 'nothing selected prices to zero')
  assert(p.decorationMethod === null, 'no method without an offering')
  assert(!Number.isNaN(p.componentsUnitCents), 'never NaN')
  assert(priceComponents([], 100).decorationUnitCents === 0, 'empty product')
}

// ── a PRIMARY without an offering link is NOT the priced primary ─────────────
{
  const p = priceComponents(
    [row({ tier: 'PRIMARY', role: 'CONTAINER', selectedVariant: { baseSurchargePerUnit: 1 } })],
    100,
  )
  assert(p.decorationUnitCents === 0, 'no offering: no decoration')
  assert(p.componentsUnitCents === 100, 'so it surcharges like any other component')
}

// eslint-disable-next-line no-console
console.log('component-pricing: all pins passed')
