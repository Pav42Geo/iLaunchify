// Shared PSS snapshot shapes. Kept out of the 'use server' action file (those
// may only export async functions) so the client + viewer can import the types.

export interface SpecSheetOption {
  axisKey: string
  axisLabel: string
  valueId: string
  valueLabel: string
  affectsLabel: boolean
  overlayOp: string | null
  unitCostDeltaCents: number
  leadTimeDeltaDays: number
  moqOverride: number | null
  priceDeltaCents: number
}

export interface SpecSheetSnapshot {
  productId: string
  productName: string
  templateId: string
  templateName: string
  flavor: { id: string; name: string } | null
  options: SpecSheetOption[]
  quantity: number
  firstRun: boolean
  quote: {
    unitCostCents: number
    leadTimeDays: number
    moq: number
    oneTimeFeesCents: number
    perUnitFeesCents: number
    perOrderFeesCents: number
    subtotalCents: number
    priceDeltaCents: number
    valid: boolean
  }
  /** Recomputed Facts panel (PanelData JSON) — null when no label-affecting picks. */
  label: unknown | null
  recipe: string[]
}
