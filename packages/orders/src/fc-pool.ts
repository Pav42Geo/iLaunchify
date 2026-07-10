// Public FC-pool eligibility — MAIN-ROLE RULE (Pavel 2026-07-09).
//
// Parallel to the print pool's `isPublicPrintPoolEligible` (rotation.ts): the
// public Fulfillment-Center selection pool (the FCs that serve OTHER partners'
// products) is barred to producers. A manufacturer's or co-packer's WAREHOUSE
// service exists to close its OWN cycle — that path is `HOLD_AT_MANUFACTURER`,
// resolved separately from `ctx.manufacturer` in destination-options.ts and NOT
// from any `type:'WAREHOUSE'` candidate query — so excluding producers here never
// touches own-goods fulfillment.
//
// (Option A of docs/FC_WAREHOUSE_PUBLIC_ROTATION_BRIEF_2026-07-09.md — the
// zero-schema hard gate. A future `offersPublicFulfillment` opt-in flag, Option
// C, would replace this predicate without changing its call sites.)

import type { Prisma } from '@ilaunchify/db'

/** Pure: is a partner's service set eligible for the PUBLIC FC pool? (has
 *  WAREHOUSE, and is NOT also a producer/co-packer). Mirrors isPublicPrintPoolEligible. */
export function isPublicFcPoolEligible(serviceTypes: readonly string[]): boolean {
  if (!serviceTypes.includes('WAREHOUSE')) return false
  return !serviceTypes.some((t) => t === 'MANUFACTURING' || t === 'COPACKING')
}

/** Prisma `where` fragment — spread into a `type:'WAREHOUSE'` candidate query to
 *  restrict it to public-FC-eligible partners (bar producers/co-packers). */
export const PUBLIC_FC_PARTNER_FILTER: Prisma.PartnerServiceWhereInput = {
  partner: { services: { none: { type: { in: ['MANUFACTURING', 'COPACKING'] } } } },
}
