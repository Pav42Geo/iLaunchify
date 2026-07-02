# Shipping Insurance — Go-Live Verification Checklist

**Gate:** LogisticsSetting `insurance` (OFF until every box below is checked).
**Decision anchor:** docs/LOGISTICS_AND_FULFILLMENT.md §10 L4 (LOCKED 2026-07-02):
FOB Origin in ToS + opt-out shippers-interest insurance at checkout; claims run
through the platform. Pattern mirrors STRIPE_TESTMODE_VERIFICATION.md — money-adjacent
features ship dark and flip on only after a written verification pass.

## Why this exists (the facts the feature encodes)

- Carrier "declared value" is a LIABILITY CAP, not insurance; FedEx/UPS say so explicitly.
- Perishable spoilage without carrier fault is NOT covered by carriers at all —
  cold-chain orders need a spoilage rider (V2, with the cold gates).
- LTL released-value rates can be pennies per pound; real coverage = third-party
  shippers-interest (EasyPost Insurance API is the V1 rail — already in the gateway seam).

## Legal / commercial prerequisites

- [ ] ToS updated: FOB Origin risk transfer at manufacturer's dock, stated plainly
- [ ] Partner contract: UCC 7-301 indemnity (partner warrants weight/dims/contents),
      packaging adequacy incl. dry-ice quantity + marking, re-bill terms for carrier adjustments
- [ ] Insurance provider terms reviewed (EasyPost Insurance underwriter): covered perils,
      EXCLUSIONS (perishables? used goods? DG?), per-shipment + aggregate limits, claim windows
- [ ] Claims SOP written: who files (platform), evidence set (ShipmentDocument rows:
      QC photos, logger file, seal record), payout flow to the creator, timeline copy
- [ ] Pricing decision: premium pass-through vs margin; opt-out UX copy approved by Pavel

## Technical verification (testmode / low-value live)

- [ ] `OrderSettings.autoInsureThresholdCents` set; below-threshold orders skip insurance cleanly
- [ ] Checkout shows premium as a separate line; opt-out toggle persists to the order
- [ ] EasyPost insurance purchase on a real low-value shipment: insured flag + cert
      stored (ShipmentDocument type INSURANCE_CERT), declaredValueCents recorded on the leg
- [ ] Webhook events for insurance status handled (purchase confirm / cancel)
- [ ] One end-to-end TEST CLAIM filed and adjudicated on a sacrificial shipment —
      do not skip; this is where providers surprise you
- [ ] Refund/credit path: claim payout reaches the creator via existing Stripe rails, audited
- [ ] AuditLog rows on every insurance mutation; admin /logistics/shipments shows insured state

## Flip procedure

1. All boxes above checked, dated, initialed (this file, committed).
2. Admin → Logistics → Gates → `insurance` ON (note field: link to the verification commit).
3. First week: manual review of every insured shipment ≥ $500 declared value.
