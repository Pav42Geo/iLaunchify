import { requireCapability } from '@ilaunchify/auth'
import { prisma, LOGISTICS_GATE_KEYS } from '@ilaunchify/db'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { GateTogglesClient, type GateRow } from './GateTogglesClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Logistics gates — Admin' }

// Admin logistics gate console (Phase L1c). The "build-ready, admin-gated"
// backbone from docs/LOGISTICS_AND_FULFILLMENT.md §10 (L1/L2 lock): every
// logistics capability ships gated OFF behind a LogisticsSetting row
// (DomainSetting pattern, server-enforced). Flipping a gate is an ops
// decision — no code change at enable time. Rows are merged over the
// canonical LOGISTICS_GATE_KEYS list so a key renders even before its DB row
// exists (toggling creates it).

const GATE_META: Record<string, { label: string; group: string; description: string }> = {
  'storage_class:CHILLED': {
    label: 'Chilled storage class',
    group: 'Cold chain',
    description:
      'Refrigerated (32–40°F) products end-to-end. Enable once a cold FC partner, reefer rail and insurance rider are in place (L1 lock).',
  },
  'storage_class:FROZEN': {
    label: 'Frozen storage class',
    group: 'Cold chain',
    description:
      'Frozen (≤0°F) products end-to-end — Lineage-class FCs, dry-ice parcel, frozen reefer. Same readiness bar as chilled.',
  },
  'connector:shipbob': {
    label: 'ShipBob connector',
    group: 'Connector',
    description:
      'Anchor-3PL FulfillmentConnector (WRO inbound, inventory webhooks). Enable when the master commercial agreement lands (L2 lock).',
  },
  'carrier:easypost': {
    label: 'EasyPost parcel rail',
    group: 'Carrier',
    description:
      'Platform-provided parcel via EasyPost Forge child accounts + BYO attach. Until enabled, partners ship BYO with manual tracking entry.',
  },
  'carrier:shipengine_ltl': {
    label: 'ShipEngine dry LTL',
    group: 'Carrier',
    description: 'Platform-booked dry LTL freight (quote → pickup → auto-BOL → tracking).',
  },
  'carrier:broker_reefer': {
    label: 'Reefer freight broker',
    group: 'Carrier',
    description:
      'Async broker-booked reefer LTL/FTL (Loadsmart-first). Requires the FSMA written duty-assignment clause in partner contracts.',
  },
  insurance: {
    label: 'Shipping insurance',
    group: 'Insurance',
    description:
      'Opt-out shippers-interest insurance at checkout + claims workflow. OFF until the testmode-verification checklist passes (L4 lock — payments-readiness pattern).',
  },
  'channel_inbound:AMAZON_FBA': {
    label: 'Amazon FBA inbound',
    group: 'Channel',
    description:
      'Ship production runs straight into FBA (covers MCF → Shopify fulfillment too). First channel adapter (L7 lock: FBA → WFS → FBT).',
  },
  'channel_inbound:WALMART_WFS': {
    label: 'Walmart WFS inbound',
    group: 'Channel',
    description: 'Walmart Fulfillment Services inbound plans (GTIN-only labeling, no temp-controlled products).',
  },
  'channel_inbound:TIKTOK_FBT': {
    label: 'TikTok FBT inbound',
    group: 'Channel',
    description: 'Fulfilled-by-TikTok inbound requests (mandatory for TikTok Shop US self-ship since Feb 2026).',
  },
  'destination:HOLD_AT_MANUFACTURER': {
    label: 'Hold at manufacturer',
    group: 'Destination',
    description:
      'Checkout destination: goods stay at the producing partner (ship-on-demand / stock release) under a StorageAgreement with monthly billing.',
  },
  'destination:CHANNEL_INBOUND': {
    label: 'Channel inbound destination',
    group: 'Destination',
    description:
      'Checkout destination: ship directly into a connected sales-channel FC. Needs at least one enabled channel adapter above.',
  },
  // PS-7 graph resolution (the "honey problem", §8.2.4 / §8.4). The publish +
  // checkout validators consult these. The MASTER ships OFF (advisory); the
  // three policy knobs ship ON.
  'graph:enforce_publish_gate': {
    label: 'Enforce publish gate (master)',
    group: 'Graph resolution',
    description:
      'OFF = the graph-completeness check is advisory at publish. Flip ON to BLOCK publishing a decorated template that cannot resolve an application point (no self-apply manufacturer, no co-pack route).',
  },
  'graph:enforce_checkout_gate': {
    label: 'Enforce checkout gate (master)',
    group: 'Graph resolution',
    description:
      "OFF = advisory. Flip ON to BLOCK an order at Pay when its application point is unresolved (“temporarily unavailable”) — then broadcast a capability request, pause the template, and notify admin + manufacturer. The §8 hard backstop.",
  },
  'graph:publish_allow_copack_application': {
    label: 'Publish: co-pack node counts',
    group: 'Graph resolution',
    description:
      "ON = a template's co-pack node (a co-packer PartnerService with appliesLabels) is a valid application point at publish. OFF = the bound manufacturer must self-apply (strictest).",
  },
  'graph:checkout_allow_fc_relabel': {
    label: 'Checkout: FC relabel counts',
    group: 'Graph resolution',
    description:
      'ON (§8.1a) = a verified FC RELABEL value-added service resolves the application point at checkout when the graph would otherwise be unresolved. OFF = block the order instead.',
  },
  'graph:enforce_assembly_resolution': {
    label: 'Enforce assembly resolution',
    group: 'Graph resolution',
    description:
      'ON = carton / multipack templates need an assembler (the manufacturer self-assembles or a co-packer performs assembly). OFF = skip the assembly-point check.',
  },
  'pricing:copack_real_price': {
    label: 'Co-pack real price',
    group: 'Pricing',
    description:
      'ON = a co-pack leg charges + pays the REAL authored co-pack quote (CP-3/CP-6) instead of the 7% interim. OFF = interim estimate. Flip once co-pack quotes are trusted.',
  },
  'pricing:print_payout_shadow': {
    label: 'Print-payout shadow (log-only)',
    group: 'Pricing',
    description:
      'ON = log what a printer’s authored price bands WOULD pay each print leg vs today’s payout ([print payout shadow]), changing nothing. Observation step before wiring the print evaluator into payout (PP-1). Safe to leave on.',
  },
}

export default async function LogisticsSettingsPage() {
  await requireCapability('logistics:admin')

  const dbRows = await prisma.logisticsSetting.findMany()
  const byKey = new Map(dbRows.map((r) => [r.key, r]))

  const rows: GateRow[] = LOGISTICS_GATE_KEYS.map((key) => {
    const db = byKey.get(key)
    const meta = GATE_META[key] ?? { label: key, group: 'Other', description: '' }
    return {
      key,
      label: meta.label,
      group: meta.group,
      description: meta.description,
      enabled: db?.enabled ?? false,
      note: db?.note ?? null,
      updatedAtLabel: db
        ? db.updatedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
        : null,
    }
  })

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Logistics · Settings"
        title="Logistics gates"
        description="Every logistics capability ships build-ready but gated OFF (L1/L2 lock). Flip a gate when the ops prerequisites are met — the change is server-enforced immediately, no deploy needed. Use the note to track what each gate is waiting on."
      />

      <GateTogglesClient rows={rows} />
    </div>
  )
}
