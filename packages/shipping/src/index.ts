/**
 * @ilaunchify/shipping — logistics substrate (L0).
 * Spec: docs/LOGISTICS_AND_FULFILLMENT.md · decisions L1–L9 LOCKED 2026-07-02.
 *
 * L0 ships the pure logic layer: classification (Stage 1), carrier eligibility +
 * fallback ordering (Stage 2), required-document rules, cold-pack computation,
 * and the LogisticsSetting key registry. Carrier gateways (EasyPost/ShipEngine/
 * broker) arrive in Phase L2 behind LogisticsSetting gates.
 */

export * from './types'
export * from './classifier'
export * from './required-docs'
export * from './eligibility'
export * from './cold-pack'
export * from './dispatch-doc-gate'
export * from './receiving-checklist'
