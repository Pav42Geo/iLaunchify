// Label responsible-party line composer — 21 CFR 101.5 (Pavel 2026-07-12).
//
// The signature line names the firm RESPONSIBLE for the product with its
// PLACE OF BUSINESS (company address — NOT the production facility; the plant
// address is permitted but never required). The creator chooses the mode per
// product (Product.responsiblePartyMode):
//
//   BRAND_MANUFACTURED_FOR → "Manufactured for [Brand], City, ST ZIP"
//   BRAND_DISTRIBUTED_BY   → "Distributed by [Brand], City, ST ZIP"
//   MANUFACTURER           → "Manufactured by [Partner], City, ST ZIP"
//
// MANUFACTURER mode requires the partner's own disclosureLevel = FULL — naming
// the manufacturer is the PARTNER'S opt-in, never the creator's to force.
//
// Pure + dependency-free: the Studio LabelDrawer (Code's zone), label
// renderers, and previews all call this with plain records.

export type ResponsiblePartyModeKey =
  | 'BRAND_MANUFACTURED_FOR'
  | 'BRAND_DISTRIBUTED_BY'
  | 'MANUFACTURER'

export interface ResponsibleBrandInput {
  /** Display name (Brand.name). */
  name: string
  /** Legal entity for the label (Brand.legalName) — falls back to `name`. */
  legalName?: string | null
  addressLine1?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
}

export interface ResponsibleManufacturerInput {
  companyName: string
  city?: string | null
  state?: string | null
  postalCode?: string | null
  /** PartnerService.disclosureLevel — MANUFACTURER mode needs 'FULL'. */
  disclosureLevel: 'FULL' | 'CITY_STATE' | 'ANONYMOUS' | (string & {})
}

export interface ResponsibilityLineResult {
  ok: boolean
  /** The composed line (best-effort even when !ok, for previews). */
  line: string
  /** Why the line isn't compliant yet (missing address, disclosure gate…). */
  problems: string[]
}

const join = (parts: (string | null | undefined)[]) => parts.filter(Boolean).join(', ')

/** "City, ST ZIP" tail — 101.5 minimum when the firm is directory-listed. */
function placeOfBusiness(i: {
  city?: string | null
  state?: string | null
  postalCode?: string | null
}): string {
  const cityState = [i.city, i.state].filter(Boolean).join(', ')
  return [cityState, i.postalCode].filter(Boolean).join(' ')
}

export function composeResponsibilityLine(input: {
  mode: ResponsiblePartyModeKey
  brand: ResponsibleBrandInput
  manufacturer?: ResponsibleManufacturerInput | null
}): ResponsibilityLineResult {
  const problems: string[] = []

  if (input.mode === 'MANUFACTURER') {
    const m = input.manufacturer
    if (!m) {
      return {
        ok: false,
        line: '',
        problems: ['No manufacturer is pinned to this product yet.'],
      }
    }
    if (m.disclosureLevel !== 'FULL')
      problems.push(
        "The manufacturer hasn't opted into being named on labels (disclosure isn't Full).",
      )
    const place = placeOfBusiness(m)
    if (!place) problems.push("The manufacturer's place of business (city/state) is missing.")
    return {
      ok: problems.length === 0,
      line: join([`Manufactured by ${m.companyName}`, place]),
      problems,
    }
  }

  const b = input.brand
  const firm = (b.legalName ?? '').trim() || b.name
  const verb = input.mode === 'BRAND_DISTRIBUTED_BY' ? 'Distributed by' : 'Manufactured for'
  const place = placeOfBusiness({ city: b.city, state: b.state, postalCode: b.postalCode })
  if (!firm) problems.push('The brand has no name for the label.')
  if (!place)
    problems.push(
      'Add your brand’s business address (city, state, ZIP) in Brand settings — required by 21 CFR 101.5.',
    )
  return { ok: problems.length === 0, line: join([`${verb} ${firm}`, place]), problems }
}

/** Which modes a creator may pick for a product, given the pinned manufacturer. */
export function availableResponsibilityModes(
  manufacturer?: Pick<ResponsibleManufacturerInput, 'disclosureLevel'> | null,
): ResponsiblePartyModeKey[] {
  const modes: ResponsiblePartyModeKey[] = ['BRAND_MANUFACTURED_FOR', 'BRAND_DISTRIBUTED_BY']
  if (manufacturer?.disclosureLevel === 'FULL') modes.push('MANUFACTURER')
  return modes
}
