/**
 * Phase L2 — Stage-3 rate shopping (spec §6.2): pick the cheapest quote whose
 * (carrier, service) is in the eligible CarrierServiceRule set and whose
 * transit meets the shipment's SLA. PURE. Never crosses temp classes — the
 * eligible set already encodes that (Stage 2).
 */

import type { CarrierServiceRuleRow, ShipmentClassification } from './types'
import type { RateQuote } from './gateway'

/**
 * Maps CarrierServiceRule (carrier, serviceLevel) → EasyPost (carrier, service)
 * name fragments. A quote matches a rule when the carrier matches exactly and
 * the EasyPost service name contains the fragment (EasyPost uses e.g.
 * "Ground", "GroundAdvantage", "2ndDayAir", "FEDEX_2_DAY").
 */
const SERVICE_FRAGMENTS: Record<string, string[]> = {
  GROUND: ['ground'],
  GROUND_ADVANTAGE: ['groundadvantage'],
  '2DAY': ['2day', '2_day', '2nddayair'],
  '2ND_DAY_AIR': ['2nddayair', '2_day'],
  OVERNIGHT: ['overnight', 'priority_overnight', 'nextday'],
}

export function quoteMatchesRule(quote: RateQuote, rule: CarrierServiceRuleRow): boolean {
  if (quote.carrier.toLowerCase() !== rule.carrier.toLowerCase()) return false
  const fragments = SERVICE_FRAGMENTS[rule.serviceLevel] ?? [rule.serviceLevel.toLowerCase()]
  const service = quote.service.toLowerCase().replace(/[^a-z0-9]/g, '')
  return fragments.some((f) => service.includes(f.replace(/[^a-z0-9]/g, '')))
}

export interface RateShopResult {
  chosen: (RateQuote & { ruleId: string }) | null
  /** Quotes rejected + why (admin/debug visibility). */
  rejected: Array<{ quote: RateQuote; reason: string }>
}

export function shopRates(
  quotes: RateQuote[],
  eligibleRules: CarrierServiceRuleRow[],
  shipment: ShipmentClassification,
): RateShopResult {
  const rejected: RateShopResult['rejected'] = []
  const matched: Array<RateQuote & { ruleId: string; rulePriority: number }> = []

  for (const quote of quotes) {
    const rule = eligibleRules.find((r) => quoteMatchesRule(quote, r))
    if (!rule) {
      rejected.push({ quote, reason: 'no eligible carrier-service rule' })
      continue
    }
    if (
      shipment.maxTransitDays !== null &&
      (quote.transitDays === null || quote.transitDays > shipment.maxTransitDays)
    ) {
      rejected.push({ quote, reason: `transit ${quote.transitDays ?? '?'}d > SLA ${shipment.maxTransitDays}d` })
      continue
    }
    matched.push({ ...quote, ruleId: rule.id, rulePriority: rule.priority })
  }

  // Cheapest wins; rule priority breaks price ties (fallback-chain semantics).
  matched.sort((a, b) => a.rateCents - b.rateCents || a.rulePriority - b.rulePriority)
  const first = matched[0]
  return { chosen: first ?? null, rejected }
}

/** L5: creator pays carrier rate + platform margin at checkout. */
export function applyFirstLegMargin(rateCents: number, marginBps: number): number {
  return rateCents + Math.round((rateCents * Math.max(0, marginBps)) / 10_000)
}
