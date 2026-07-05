// Partner order packets — product passport + per-role need-to-know scoping.
//
// docs/PARTNER_ORDER_PACKETS.md. A single production order fans out to several
// partners (a manufacturer produces, a printer decorates the label, a co-packer
// assembles, a fulfillment center receives). Today `generateOrderManifest`
// builds ONE manifest and every partner gets the whole thing — including the
// full food formula and the creator's street address. That's over-exposure.
//
// This module is the PURE scoping layer: given a full ProductionManifest and a
// partner role, it returns (a) the shared, read-only PRODUCT PASSPORT — "what
// the product IS", safe for everyone — plus (b) a role-scoped WORK PACKET
// carrying only the fields that role executes on, with need-to-know redaction:
//
//   • formulation / recipe  → MANUFACTURER only.
//   • label finishes         → PRINTER only, and always cost-stripped.
//   • end-customer address   → only the final shipper (or the warehouse it
//                              ships into); intermediate hops see region only.
//   • cost / pricing         → never fan-out; each partner sees only their own
//                              payout (which the manifest does not carry, so all
//                              embedded pricing is stripped here).
//
// Side-effect-free by design → unit-testable without a DB. Code wires this into
// manifest.ts so each dispatch's stored manifest IS its packet, and renders the
// shared passport once. Extends the existing scopeDispatchComponents (which
// already role-filters `components[]`) to EVERY field of the manifest.

import type { ProductionManifest } from './manifest'

/** The four production roles an order fans out to. */
export type PartnerRole = 'MANUFACTURER' | 'PRINTER' | 'COPACKER' | 'WAREHOUSE'

/**
 * PURE — map an OrderDispatch.type to its partner role. PRODUCT→MANUFACTURER,
 * LABEL→PRINTER, COPACKING→COPACKER, WAREHOUSE/INBOUND→WAREHOUSE (the future FC
 * leg, docs/PARTNER_ORDER_PACKETS.md G2). Unknown types fall back to
 * MANUFACTURER (the producing role) so a packet is always well-formed.
 */
export function roleForDispatchType(dispatchType: string): PartnerRole {
  switch (dispatchType) {
    case 'PRODUCT':
      return 'MANUFACTURER'
    case 'LABEL':
      return 'PRINTER'
    case 'COPACKING':
      return 'COPACKER'
    case 'WAREHOUSE':
    case 'INBOUND':
      return 'WAREHOUSE'
    default:
      return 'MANUFACTURER'
  }
}

/**
 * The SHARED Product Passport — "what the product IS". Safe for every partner +
 * admin. Carries identity, quantities, the design lock, die-cut geometry, flavor
 * IDENTITY (name + on-label Statement of Identity, NOT recipe), pack structure,
 * the committed production lead, and the ship-to REGION only (no street). It
 * deliberately excludes formulation, finishes, and the full address — those are
 * role-scoped in the packet.
 */
export interface ProductPassport {
  manifestVersion: ProductionManifest['manifestVersion']
  generatedAt: string
  orderId: string
  orderDispatchId: string
  brandName: string
  productName: string
  quantity: number
  designVersionId: string | null
  designVersion: number | null
  dieCut: ProductionManifest['dieCut']
  /** Flavor IDENTITY only — name + on-label SoI. No qty-derived recipe, no extras. */
  flavors: Array<{ flavorName: string; qty: number; statementOfIdentity: string | null }>
  pack: ProductionManifest['pack']
  production: ProductionManifest['production']
  /** Ship-to REGION only — enough for lead/logistics estimation, never the street. */
  shipRegion: {
    type: ProductionManifest['shipTo']['type']
    city: string
    state: string | null
    country: string
  }
}

/** A finish stripped of all pricing (need-to-know: partners never see cost fan-out). */
export interface FinishNoCost {
  partnerFinishId: string
  finishSlug: string
  finishName: string
  category: string
}

/**
 * A ship-to as the recipient may see it. `redacted:true` means this partner is
 * an intermediate hop — street lines, postal, and contact name are nulled and
 * only the region survives. The final shipper (and a WAREHOUSE receiving the
 * goods) sees the full address.
 */
export interface ScopedShipTo {
  type: ProductionManifest['shipTo']['type']
  redacted: boolean
  contactName: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string
  warehousePartnerServiceId: string | null
}

/**
 * A role-scoped work packet — the passport plus only the fields this role
 * executes on, after need-to-know redaction. Fields not relevant to the role are
 * emptied (recipe→null, finishes→[]), never merely hidden at the view layer.
 */
export interface RolePacket {
  role: PartnerRole
  passport: ProductPassport
  /** Formulation — MANUFACTURER only; null for every other role. */
  recipe: ProductionManifest['recipe']
  /** Per-flavor final recipes — MANUFACTURER only; [] otherwise. */
  perFlavorRecipes: ProductionManifest['perFlavorRecipes']
  /** Label stock — PRINTER only; null otherwise. */
  substrate: ProductionManifest['substrate']
  /** Container material — MANUFACTURER + COPACKER; null for PRINTER/WAREHOUSE. */
  packaging: ProductionManifest['packaging']
  /** Decoration finishes — PRINTER only, cost-stripped; [] otherwise. */
  finishes: FinishNoCost[]
  /** Die-line components — PRINTER (decorated) / COPACKER (assembly); [] otherwise. */
  components: ProductionManifest['components']
  /** Per-flavor production splits — MANUFACTURER + COPACKER need qty; [] for PRINTER/WAREHOUSE. */
  flavors: ProductionManifest['flavors']
  /** Ship destination, redacted for intermediate hops. */
  shipTo: ScopedShipTo
  partnerActionItems: string[]
}

/** Options controlling need-to-know redaction. */
export interface ScopeOptions {
  /**
   * True when THIS partner is the last hop that physically ships to the order's
   * ship-to (so it needs the full address). Default false → intermediate hops
   * get region-only. WAREHOUSE roles always receive the full address (they ARE
   * the destination), regardless of this flag.
   */
  isFinalShipper?: boolean
}

/**
 * PURE — the shared Product Passport for a manifest. Identical for every role;
 * carries no formulation, no finishes, no street address.
 */
export function buildProductPassport(m: ProductionManifest): ProductPassport {
  return {
    manifestVersion: m.manifestVersion,
    generatedAt: m.generatedAt,
    orderId: m.orderId,
    orderDispatchId: m.orderDispatchId,
    brandName: m.brandName,
    productName: m.productName,
    quantity: m.quantity,
    designVersionId: m.designVersionId,
    designVersion: m.designVersion,
    dieCut: m.dieCut,
    flavors: m.flavors.map((f) => ({
      flavorName: f.flavorName,
      qty: f.qty,
      statementOfIdentity: f.statementOfIdentity,
    })),
    pack: m.pack,
    production: m.production,
    shipRegion: {
      type: m.shipTo.type,
      city: m.shipTo.city,
      state: m.shipTo.state,
      country: m.shipTo.country,
    },
  }
}

/** PURE — strip every finish of its pricing fields. */
export function stripFinishCost(finishes: ProductionManifest['finishes']): FinishNoCost[] {
  return finishes.map((f) => ({
    partnerFinishId: f.partnerFinishId,
    finishSlug: f.finishSlug,
    finishName: f.finishName,
    category: f.category,
  }))
}

/**
 * PURE — scope the order's ship-to for a role. The final shipper and any
 * WAREHOUSE role see the full address; everyone else gets region-only with the
 * street, postal, and contact name nulled and `redacted:true`.
 */
export function scopeShipTo(
  shipTo: ProductionManifest['shipTo'],
  role: PartnerRole,
  isFinalShipper: boolean,
): ScopedShipTo {
  const full = role === 'WAREHOUSE' || isFinalShipper
  if (full) {
    return {
      type: shipTo.type,
      redacted: false,
      contactName: shipTo.contactName,
      addressLine1: shipTo.addressLine1,
      addressLine2: shipTo.addressLine2,
      city: shipTo.city,
      state: shipTo.state,
      postalCode: shipTo.postalCode,
      country: shipTo.country,
      warehousePartnerServiceId: shipTo.warehousePartnerServiceId,
    }
  }
  return {
    type: shipTo.type,
    redacted: true,
    contactName: null,
    addressLine1: null,
    addressLine2: null,
    city: shipTo.city,
    state: shipTo.state,
    postalCode: null,
    country: shipTo.country,
    warehousePartnerServiceId: shipTo.warehousePartnerServiceId,
  }
}

/**
 * PURE — scope a full ProductionManifest to a partner ROLE's need-to-know work
 * packet + the shared passport. This is the single redaction gate: fields a role
 * doesn't execute on are emptied, not just hidden. Deterministic and DB-free.
 *
 *  - MANUFACTURER: passport + recipe + per-flavor recipes + packaging + flavor
 *    splits. No finishes, no substrate, no components. Address redacted unless
 *    final shipper.
 *  - PRINTER: passport + substrate + cost-stripped finishes + die-line
 *    components + die-cut (via passport). No recipe. Address redacted unless
 *    final shipper.
 *  - COPACKER: passport + packaging + assembly components + flavor splits. No
 *    recipe, no finishes. Address redacted unless final shipper (often ships to
 *    the FC/creator, so frequently the final hop).
 *  - WAREHOUSE: passport (light) + full inbound address. No production content.
 *
 * NOTE: `components` is assumed to be ALREADY dispatch-scoped by
 * scopeDispatchComponents in manifest.ts (a LABEL dispatch's manifest carries
 * only that printer's decorated components; a COPACKING dispatch only its
 * assembly components). This function does not re-filter them.
 */
export function scopeManifestForRole(
  manifest: ProductionManifest,
  role: PartnerRole,
  opts: ScopeOptions = {},
): RolePacket {
  const isFinalShipper = opts.isFinalShipper ?? false
  const passport = buildProductPassport(manifest)
  const shipTo = scopeShipTo(manifest.shipTo, role, isFinalShipper)

  const base: Omit<
    RolePacket,
    'recipe' | 'perFlavorRecipes' | 'substrate' | 'packaging' | 'finishes' | 'components' | 'flavors'
  > = {
    role,
    passport,
    shipTo,
    partnerActionItems: manifest.partnerActionItems,
  }

  switch (role) {
    case 'MANUFACTURER':
      return {
        ...base,
        recipe: manifest.recipe,
        perFlavorRecipes: manifest.perFlavorRecipes,
        substrate: null,
        packaging: manifest.packaging,
        finishes: [],
        components: [],
        flavors: manifest.flavors,
      }
    case 'PRINTER':
      return {
        ...base,
        recipe: null,
        perFlavorRecipes: [],
        substrate: manifest.substrate,
        packaging: null,
        finishes: stripFinishCost(manifest.finishes),
        components: manifest.components,
        flavors: [],
      }
    case 'COPACKER':
      return {
        ...base,
        recipe: null,
        perFlavorRecipes: [],
        substrate: null,
        packaging: manifest.packaging,
        finishes: [],
        components: manifest.components,
        flavors: manifest.flavors,
      }
    case 'WAREHOUSE':
      return {
        ...base,
        recipe: null,
        perFlavorRecipes: [],
        substrate: null,
        packaging: null,
        finishes: [],
        components: [],
        flavors: manifest.flavors,
      }
  }
}

/**
 * PURE convenience — scope straight from an OrderDispatch.type string, resolving
 * the role for you. Mirrors how manifest.ts already branches on dispatch.type.
 */
export function scopeManifestForDispatchType(
  manifest: ProductionManifest,
  dispatchType: string,
  opts: ScopeOptions = {},
): RolePacket {
  return scopeManifestForRole(manifest, roleForDispatchType(dispatchType), opts)
}
