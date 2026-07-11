// Logistics L0 seed — LogisticsSetting gates + CarrierServiceRule starter matrix.
//
// Source of truth: docs/LOGISTICS_AND_FULFILLMENT.md (§6.2 eligibility matrix,
// §10 decisions L1–L9 LOCKED 2026-07-02). Everything ships "build-ready,
// admin-gated": all gates default OFF except ambient/protect-heat basics.
//
// IDEMPOTENT — safe to re-run. LogisticsSetting upserts by key (preserving any
// admin-set `enabled`); CarrierServiceRule upserts by (carrier, serviceLevel)
// natural key via findFirst+update.
//
// Run: pnpm --filter @ilaunchify/db seed:logistics

import { PrismaClient, ShipmentMode } from '@prisma/client'

const prisma = new PrismaClient()

// ---------------------------------------------------------------------------
// LogisticsSetting gates (L1/L2 lock — enable = ops decision, not a deploy)
// ---------------------------------------------------------------------------
const GATES: { key: string; enabled: boolean; note: string }[] = [
  { key: 'storage_class:CHILLED', enabled: false, note: 'L1: enable once a cold FC partner + reefer rail + insurance rider are live' },
  { key: 'storage_class:FROZEN', enabled: false, note: 'L1: enable with CHILLED (dry-ice parcel rules ship ready)' },
  { key: 'connector:shipbob', enabled: false, note: 'L2: enable when the ShipBob master agreement lands' },
  { key: 'carrier:easypost', enabled: false, note: 'L3: enable when EASYPOST_API_KEY is configured + tested (Phase L2)' },
  { key: 'carrier:shipengine_ltl', enabled: false, note: 'Phase L2 (flagged): dry LTL via ShipEngine' },
  { key: 'carrier:broker_reefer', enabled: false, note: 'V2: Loadsmart async reefer rail' },
  { key: 'insurance', enabled: false, note: 'L4: OFF until the shippers-interest verification checklist passes' },
  { key: 'channel_inbound:AMAZON_FBA', enabled: false, note: 'Phase L3 (P0 adapter)' },
  { key: 'channel_inbound:WALMART_WFS', enabled: false, note: 'Phase L4' },
  { key: 'channel_inbound:TIKTOK_FBT', enabled: false, note: 'Phase L4 (FBT mandate since 2026-02-25)' },
  { key: 'destination:HOLD_AT_MANUFACTURER', enabled: false, note: 'Phase L1: enable with the partner storage editor' },
  { key: 'destination:CHANNEL_INBOUND', enabled: false, note: 'Phase L3: enable with the first channel adapter' },
  // PS-7 freight bearer (Pavel DECIDED 2026-07-11, PRINT_PROVIDER_SELECTION §8.5):
  // OFF = CREATOR pays inter-partner hops (printer→applier, mfr→co-packer) inside
  // the single Shipping line — the default. ON = PLATFORM absorbs them. Billing
  // attribution only (each hop is its own ledger item); routing never changes.
  { key: 'billing:platform_pays_interpartner_freight', enabled: false, note: 'PS-7 2026-07-11: OFF = creator pays inter-partner hops (default). Flip = platform absorbs; attribution-only, no routing change.' },
  // PS-7 graph resolution / honey-problem gates (§8.2.4 / §8.4). Policy knobs
  // ship ON; the enforce MASTER ships OFF so the gate is advisory until admin flips it.
  { key: 'graph:enforce_publish_gate', enabled: false, note: 'PS-7: OFF = graph-completeness check is advisory at publish. Flip ON to BLOCK publishing a decorated template that cannot resolve an application point.' },
  { key: 'graph:publish_allow_copack_application', enabled: true, note: 'PS-7: ON = a template co-pack node (appliesLabels) is a valid application point at publish (Option 2). OFF = manufacturer self-apply only.' },
  { key: 'graph:checkout_allow_fc_relabel', enabled: true, note: 'PS-7 §8.1a: ON = a verified FC RELABEL VAS resolves the application point at checkout. OFF = block when only an FC could apply.' },
  { key: 'graph:enforce_assembly_resolution', enabled: true, note: 'PS-7: ON = carton/multipack templates need an assembler (manufacturer self-assembles or a co-packer).' },
]

// ---------------------------------------------------------------------------
// CarrierServiceRule starter matrix (§6.2 Stage 2). storageClasses/hazmatAllowed
// hold enum VALUES as strings (schema convention for enum lists).
// Priorities define the fallback chain: lower = tried first.
// ---------------------------------------------------------------------------
interface RuleSeed {
  carrier: string
  serviceLevel: string
  modes: ShipmentMode[]
  storageClasses: string[]
  hazmatAllowed: string[]
  maxWeightLb: number | null
  maxTransitDays: number | null
  groundOnly: boolean
  seasonalWindowJson: object | null
  priority: number
  active: boolean
}

const MELTABLE_PAUSE = { meltablePause: { from: '04-15', to: '10-15' } }
const FROZEN_DAYS = { frozenShipDays: [1, 2, 3] } // Mon–Wed

const RULES: RuleSeed[] = [
  // ---- Ambient / protect-heat parcel (live at launch) ----
  { carrier: 'UPS', serviceLevel: 'GROUND', modes: ['PARCEL'], storageClasses: ['AMBIENT', 'PROTECT_HEAT'], hazmatAllowed: ['LQ_FLAMMABLE', 'AEROSOL_2_1'], maxWeightLb: 150, maxTransitDays: 5, groundOnly: true, seasonalWindowJson: MELTABLE_PAUSE, priority: 10, active: true },
  { carrier: 'FedEx', serviceLevel: 'GROUND', modes: ['PARCEL'], storageClasses: ['AMBIENT', 'PROTECT_HEAT'], hazmatAllowed: ['LQ_FLAMMABLE'], maxWeightLb: 150, maxTransitDays: 5, groundOnly: true, seasonalWindowJson: MELTABLE_PAUSE, priority: 20, active: true },
  { carrier: 'USPS', serviceLevel: 'GROUND_ADVANTAGE', modes: ['PARCEL'], storageClasses: ['AMBIENT'], hazmatAllowed: [], maxWeightLb: 70, maxTransitDays: 5, groundOnly: true, seasonalWindowJson: null, priority: 30, active: true },
  { carrier: 'UPS', serviceLevel: '2DAY', modes: ['PARCEL'], storageClasses: ['AMBIENT', 'PROTECT_HEAT'], hazmatAllowed: [], maxWeightLb: 150, maxTransitDays: 2, groundOnly: false, seasonalWindowJson: null, priority: 40, active: true },
  { carrier: 'FedEx', serviceLevel: '2DAY', modes: ['PARCEL'], storageClasses: ['AMBIENT', 'PROTECT_HEAT'], hazmatAllowed: [], maxWeightLb: 150, maxTransitDays: 2, groundOnly: false, seasonalWindowJson: null, priority: 50, active: true },
  // ---- Cold parcel (schema-ready; INACTIVE until storage_class gates flip — L1) ----
  { carrier: 'FedEx', serviceLevel: '2DAY', modes: ['PARCEL'], storageClasses: ['CHILLED', 'FROZEN'], hazmatAllowed: ['DRY_ICE_AIR'], maxWeightLb: 150, maxTransitDays: 2, groundOnly: false, seasonalWindowJson: FROZEN_DAYS, priority: 60, active: false },
  { carrier: 'UPS', serviceLevel: '2ND_DAY_AIR', modes: ['PARCEL'], storageClasses: ['CHILLED', 'FROZEN'], hazmatAllowed: ['DRY_ICE_AIR'], maxWeightLb: 150, maxTransitDays: 2, groundOnly: false, seasonalWindowJson: FROZEN_DAYS, priority: 70, active: false },
  { carrier: 'FedEx', serviceLevel: 'OVERNIGHT', modes: ['PARCEL'], storageClasses: ['CHILLED', 'FROZEN'], hazmatAllowed: ['DRY_ICE_AIR'], maxWeightLb: 150, maxTransitDays: 1, groundOnly: false, seasonalWindowJson: FROZEN_DAYS, priority: 80, active: false },
  // ---- Freight (dry LTL flagged Phase L2; reefer V2) ----
  { carrier: 'ShipEngineLTL', serviceLevel: 'LTL_DRY', modes: ['LTL'], storageClasses: ['AMBIENT', 'PROTECT_HEAT'], hazmatAllowed: ['LQ_FLAMMABLE', 'AEROSOL_2_1'], maxWeightLb: 15000, maxTransitDays: 7, groundOnly: true, seasonalWindowJson: null, priority: 10, active: false },
  { carrier: 'LoadsmartReefer', serviceLevel: 'REEFER_LTL', modes: ['LTL'], storageClasses: ['CHILLED', 'FROZEN'], hazmatAllowed: [], maxWeightLb: 15000, maxTransitDays: 7, groundOnly: true, seasonalWindowJson: null, priority: 20, active: false },
  { carrier: 'LoadsmartReefer', serviceLevel: 'REEFER_FTL', modes: ['FTL'], storageClasses: ['CHILLED', 'FROZEN'], hazmatAllowed: [], maxWeightLb: null, maxTransitDays: null, groundOnly: true, seasonalWindowJson: null, priority: 10, active: false },
  { carrier: 'Loadsmart', serviceLevel: 'DRY_FTL', modes: ['FTL'], storageClasses: ['AMBIENT', 'PROTECT_HEAT'], hazmatAllowed: ['LQ_FLAMMABLE', 'AEROSOL_2_1'], maxWeightLb: null, maxTransitDays: null, groundOnly: true, seasonalWindowJson: null, priority: 20, active: false },
]

export async function seedLogistics(db: PrismaClient = prisma) {
  let gates = 0
  for (const gate of GATES) {
    await db.logisticsSetting.upsert({
      where: { key: gate.key },
      // Never clobber an admin's enabled flag on re-run; refresh the note only.
      update: { note: gate.note },
      create: gate,
    })
    gates++
  }

  let created = 0
  let updated = 0
  for (const rule of RULES) {
    const existing = await db.carrierServiceRule.findFirst({
      where: { carrier: rule.carrier, serviceLevel: rule.serviceLevel, modes: { equals: rule.modes } },
    })
    if (existing) {
      await db.carrierServiceRule.update({
        where: { id: existing.id },
        data: { ...rule, active: existing.active }, // preserve admin on/off
      })
      updated++
    } else {
      await db.carrierServiceRule.create({ data: rule })
      created++
    }
  }

  console.log(`[seed-logistics] gates upserted: ${gates}; rules created: ${created}, updated: ${updated}`)
}

// Allow standalone execution: pnpm --filter @ilaunchify/db seed:logistics
const invokedDirectly = process.argv[1]?.endsWith('seed-logistics.ts')
if (invokedDirectly) {
  seedLogistics()
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
