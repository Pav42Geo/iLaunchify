/**
 * ColdPackCalculator — deterministic coolant/insulation spec per shipment
 * (spec §6.1 item 5). Data-driven rules of thumb from cold-chain practice:
 *   - 1.5" EPS wall minimum, 2" for 3-day/summer
 *   - dry-ice : product weight ratio 1:1 (1–2 day) / 1.5:1 (2–3 day)
 *   - always pack for transit + 1 day
 * Pure; seasonality passed in (no Date.now inside).
 */

import type { CoolantType, StorageClass } from './types'

export interface ColdPackInput {
  storageClass: StorageClass
  productWeightLb: number
  transitDays: 1 | 2 | 3
  /** Summer = destination-month climate risk (May–Sep continental US default). */
  summer: boolean
}

export interface ColdPackSpec {
  coolantType: CoolantType
  coolantWeightLb: number
  insulationWallIn: number
  /** UN1845 air-leg no-paperwork ceiling is 2.5 kg (~5.5 lb) — flag when exceeded. */
  dryIceOverAirLimit: boolean
  notes: string[]
}

const DRY_ICE_AIR_LIMIT_LB = 5.5

export function computeColdPack(input: ColdPackInput): ColdPackSpec {
  const packDays = Math.min(input.transitDays + 1, 4) // pack for transit + 1
  const wall = input.summer || packDays >= 3 ? 2 : 1.5
  const notes: string[] = []

  if (input.storageClass === 'FROZEN') {
    const ratio = packDays >= 3 ? 1.5 : 1
    let coolant = Math.ceil(input.productWeightLb * ratio)
    if (input.summer) {
      coolant = Math.ceil(coolant * 1.3) // +30% summer dry-ice uplift
      notes.push('summer: +30% dry ice')
    }
    return {
      coolantType: 'DRY_ICE',
      coolantWeightLb: coolant,
      insulationWallIn: wall,
      dryIceOverAirLimit: coolant > DRY_ICE_AIR_LIMIT_LB,
      notes: [...notes, 'vented package required (UN1845 — never airtight)'],
    }
  }

  if (input.storageClass === 'CHILLED') {
    const coolant = Math.ceil(input.productWeightLb * (packDays >= 3 ? 1 : 0.75))
    return {
      coolantType: 'GEL_PACK',
      coolantWeightLb: coolant,
      insulationWallIn: wall,
      dryIceOverAirLimit: false,
      notes,
    }
  }

  if (input.storageClass === 'PROTECT_HEAT') {
    if (!input.summer) {
      return { coolantType: 'NONE', coolantWeightLb: 0, insulationWallIn: 0, dryIceOverAirLimit: false, notes: ['off-season: no coolant'] }
    }
    return {
      coolantType: 'GEL_PACK',
      coolantWeightLb: Math.max(1, Math.ceil(input.productWeightLb * 0.25)),
      insulationWallIn: 1.5,
      dryIceOverAirLimit: false,
      notes: ['meltable summer pack-out'],
    }
  }

  return { coolantType: 'NONE', coolantWeightLb: 0, insulationWallIn: 0, dryIceOverAirLimit: false, notes }
}
