// Track C / C7.c + C7.d — implied component-slot derivation (pure).
//
// Given a packaging container category + the product's labeling regime, returns
// the PackagingComponent slots a product implies, per the brief's decision table
// (docs/builds/_V1_PACKAGING_COMPONENTS.md "Decision rules"):
//
//   BOTTLE / JAR → CONTAINER + CLOSURE (+ SEAL if FDA-required)
//   CAN          → CONTAINER (+ SEAL if FDA-required) — closure is integral
//   TUBE         → CONTAINER + CLOSURE (+ SEAL if FDA-required)
//   POUCH / SACHET / STICK_PACK → CONTAINER only (sealing is structural)
//   BOX / CARTON / CASE / OTHER → CONTAINER only
//
// FDA seal rule (21 CFR 211.132): when labelingType is DIETARY_SUPPLEMENT or
// OTC, a tamper-evident SEAL is mandatory on rigid containers. Flexible/
// structurally-sealed formats (pouch/sachet/stick) satisfy it structurally, so
// they get no discrete SEAL slot.
//
// No React / Prisma / 'use server' here so it stays unit-reasonable and importable
// from both the server action (C7.d) and the builder UI (C7.f).

import type { ContainerCategory, ComponentRole, LabelingType, PackagingTier } from '@ilaunchify/db'

export interface ComponentSlotSpec {
  tier: PackagingTier
  role: ComponentRole
  /** True when this slot is FDA-mandatory and the UI must block its removal. */
  fdaMandatory: boolean
}

/** A discrete tamper-evident SEAL is FDA-required for these labeling regimes. */
export function sealIsFdaMandatory(labelingType: LabelingType): boolean {
  return labelingType === 'DIETARY_SUPPLEMENT' || labelingType === 'OTC'
}

/** Whether to *suggest* (not force) a secondary outer carton. Supplement and OTC
 *  products conventionally ship a rigid bottle inside a folding carton, so we
 *  nudge the creator toward adding one — but it stays opt-in (plenty don't). */
export function cartonRecommended(labelingType: LabelingType): boolean {
  return labelingType === 'DIETARY_SUPPLEMENT' || labelingType === 'OTC'
}

/** Categories whose seal is structural (heat-sealed) — no discrete SEAL slot. */
const STRUCTURALLY_SEALED: ReadonlySet<ContainerCategory> = new Set<ContainerCategory>([
  'POUCH',
  'SACHET',
  'STICK_PACK',
])

/** Categories that carry a separate closure (cap/lid). CAN's closure is integral. */
const HAS_CLOSURE: ReadonlySet<ContainerCategory> = new Set<ContainerCategory>([
  'BOTTLE',
  'JAR',
  'TUBE',
])

export function impliedComponentSlots(
  category: ContainerCategory,
  labelingType: LabelingType,
): ComponentSlotSpec[] {
  const slots: ComponentSlotSpec[] = [{ tier: 'PRIMARY', role: 'CONTAINER', fdaMandatory: false }]

  if (HAS_CLOSURE.has(category)) {
    slots.push({ tier: 'PRIMARY', role: 'CLOSURE', fdaMandatory: false })
  }

  // Discrete tamper-evident seal: required for supplement/OTC on any container
  // that isn't structurally sealed.
  if (sealIsFdaMandatory(labelingType) && !STRUCTURALLY_SEALED.has(category)) {
    slots.push({ tier: 'PRIMARY', role: 'SEAL', fdaMandatory: true })
  }

  return slots
}
