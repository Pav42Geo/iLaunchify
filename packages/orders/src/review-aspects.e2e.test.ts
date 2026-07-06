import { describe, expect, it } from 'vitest'
import {
  resolveAspectPartners,
  applyOfferedAspects,
  shouldOfferAttributionFork,
  applyAttributionOutcome,
  DEFAULT_ATTRIBUTION_CONTROLS,
  type OrderLeg,
  type ReviewAspect,
  type AttributionOutcome,
  type ReviewAttributionControls,
} from './review-aspects'

// End-to-end smoke: mirror the server action's decision sequence
// (apps/creator/.../rate/actions.ts submitProductReview) WITHOUT the DB — the
// risk lives in the resolve → offered-filter → fork → persistence-intent path.
// Given an order graph + a submitted review + admin controls, produce exactly
// what the action would persist: the effective product star, whether it was
// re-anchored, and the routed notes (partner + visibility) that would be written.

interface SubmittedNote {
  aspect: ReviewAspect
  body: string
}
interface PersistIntent {
  productRating: number
  reanchored: boolean
  openPartnerRating: boolean
  notes: Array<{ aspect: ReviewAspect; partnerServiceId: string | null; role: string | null; visibility: string; reanchored: boolean }>
  error?: string
}

function simulateSubmit(args: {
  legs: OrderLeg[]
  rating: number
  submittedNotes: SubmittedNote[]
  outcome?: AttributionOutcome
  newProductRating?: number
  controls?: ReviewAttributionControls
}): PersistIntent {
  const controls = args.controls ?? DEFAULT_ATTRIBUTION_CONTROLS

  if (!controls.attributionEnabled) {
    return { productRating: args.rating, reanchored: false, openPartnerRating: false, notes: [] }
  }

  const resolvedByAspect = new Map(
    applyOfferedAspects(resolveAspectPartners(args.legs), controls.offeredAspects)
      .filter((r) => r.aspect !== 'PRODUCT' && r.partnerServiceId)
      .map((r) => [r.aspect, r]),
  )
  const validNotes = args.submittedNotes.filter((n) => n.body.trim() && resolvedByAspect.has(n.aspect))

  let productRating = args.rating
  let reanchored = false
  let openPartnerRating = false
  if (controls.reanchorEnabled && args.outcome && shouldOfferAttributionFork(args.rating, validNotes.map((n) => n.aspect))) {
    const res = applyAttributionOutcome({
      outcome: args.outcome,
      originalRating: args.rating,
      newProductRating: args.newProductRating,
    })
    if (!res.ok) return { productRating: args.rating, reanchored: false, openPartnerRating: false, notes: [], error: res.error }
    productRating = res.result.productRating
    reanchored = res.result.reanchored
    openPartnerRating = res.result.openPartnerRating
  }

  const notes = validNotes.map((n) => {
    const r = resolvedByAspect.get(n.aspect)!
    return { aspect: n.aspect, partnerServiceId: r.partnerServiceId, role: r.role, visibility: r.visibility, reanchored }
  })
  return { productRating, reanchored, openPartnerRating, notes }
}

const FULL: OrderLeg[] = [
  { role: 'MANUFACTURER', partnerServiceId: 'mfr-1' },
  { role: 'PRINTER', partnerServiceId: 'prn-1' },
  { role: 'COPACKER', partnerServiceId: 'cop-1' },
  { role: 'WAREHOUSE', partnerServiceId: 'fc-1' },
]

describe('review attribution — end-to-end scenarios', () => {
  it('happy path: 5★, no aspects → no fork, no notes, star stands', () => {
    const out = simulateSubmit({ legs: FULL, rating: 5, submittedNotes: [] })
    expect(out).toMatchObject({ productRating: 5, reanchored: false, notes: [] })
  })

  it('the pizza-on-the-restaurant fix: 2★ but "printer, product fine" → product re-anchored, note routes to printer (PUBLIC), product star protected', () => {
    const out = simulateSubmit({
      legs: FULL,
      rating: 2,
      submittedNotes: [{ aspect: 'PRINTING', body: 'Color came out muddy vs the proof' }],
      outcome: 'PARTNER',
      newProductRating: 5,
    })
    expect(out.productRating).toBe(5) // product NOT sunk by the printer's fault
    expect(out.reanchored).toBe(true)
    expect(out.notes).toEqual([
      { aspect: 'PRINTING', partnerServiceId: 'prn-1', role: 'PRINTER', visibility: 'PUBLIC', reanchored: true },
    ])
  })

  it('mix: 3★, product + printing both off → star stays, note routes, partner rating opened', () => {
    const out = simulateSubmit({
      legs: FULL,
      rating: 3,
      submittedNotes: [{ aspect: 'PRINTING', body: 'Slightly off but usable' }],
      outcome: 'MIX',
    })
    expect(out.productRating).toBe(3)
    expect(out.reanchored).toBe(false)
    expect(out.openPartnerRating).toBe(true)
    expect(out.notes[0]).toMatchObject({ role: 'PRINTER', reanchored: false })
  })

  it('fulfillment complaint routes to the FC as ADMIN_SELF (not public)', () => {
    const out = simulateSubmit({
      legs: FULL,
      rating: 2,
      submittedNotes: [{ aspect: 'FULFILLMENT', body: 'Arrived dented' }],
      outcome: 'MIX',
    })
    expect(out.notes[0]).toMatchObject({ partnerServiceId: 'fc-1', role: 'WAREHOUSE', visibility: 'ADMIN_SELF' })
  })

  it('packaging with no co-pack leg falls back to the manufacturer (PUBLIC)', () => {
    const legs: OrderLeg[] = [
      { role: 'MANUFACTURER', partnerServiceId: 'mfr-1' },
      { role: 'PRINTER', partnerServiceId: 'prn-1' },
    ]
    const out = simulateSubmit({
      legs,
      rating: 2,
      submittedNotes: [{ aspect: 'PACKAGING', body: 'Seal was weak' }],
      outcome: 'MIX',
    })
    expect(out.notes[0]).toMatchObject({ partnerServiceId: 'mfr-1', role: 'MANUFACTURER', visibility: 'PUBLIC' })
  })

  it('anti-gaming: re-anchor product-only star below the original is rejected', () => {
    const out = simulateSubmit({
      legs: FULL,
      rating: 3,
      submittedNotes: [{ aspect: 'PRINTING', body: 'meh' }],
      outcome: 'PARTNER',
      newProductRating: 2,
    })
    expect(out.error).toBeDefined()
  })

  it('admin disables the PRINTING aspect → the note is dropped even with a printer leg', () => {
    const controls: ReviewAttributionControls = { ...DEFAULT_ATTRIBUTION_CONTROLS, offeredAspects: ['PACKAGING', 'FULFILLMENT'] }
    const out = simulateSubmit({
      legs: FULL,
      rating: 2,
      submittedNotes: [{ aspect: 'PRINTING', body: 'blurry' }],
      outcome: 'MIX',
      controls,
    })
    expect(out.notes).toEqual([]) // PRINTING not offered → nothing routes
  })

  it('admin master-switch off → attribution ignored entirely, star untouched', () => {
    const controls: ReviewAttributionControls = { ...DEFAULT_ATTRIBUTION_CONTROLS, attributionEnabled: false }
    const out = simulateSubmit({
      legs: FULL,
      rating: 2,
      submittedNotes: [{ aspect: 'PRINTING', body: 'blurry' }],
      outcome: 'PARTNER',
      newProductRating: 5,
      controls,
    })
    expect(out).toMatchObject({ productRating: 2, reanchored: false, notes: [] })
  })

  it('low score but no partner aspect tagged → no fork offered (nothing to re-anchor into)', () => {
    const out = simulateSubmit({ legs: FULL, rating: 1, submittedNotes: [], outcome: 'PARTNER', newProductRating: 5 })
    expect(out.productRating).toBe(1) // fork not applicable → original stands
    expect(out.reanchored).toBe(false)
  })
})
