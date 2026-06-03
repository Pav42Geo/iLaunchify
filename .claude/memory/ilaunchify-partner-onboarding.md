---
name: ilaunchify-partner-onboarding
description: "Partner onboarding = system architecture, not signup UI. 5-layer model (Identity / Capability / Standards / Commercial / Integration) + 10-state activation FSM separating legal verification from operational readiness."
metadata: 
  node_type: memory
  type: project
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

In iLaunchify, partner onboarding is the foundation of the operational database — every downstream feature (matching, automation, quoting, AI recommendations, production routing, analytics) depends on data structured here. Treat it as system architecture, not a signup form.

**The 5-layer model:**

1. **Identity & Verification** (Phase A shipped) — who you are, are you legit (legal entity, tax, facility, insurance, certs, contact structure)
2. **Operational Capability** (V1 enhanced from Phase A checkboxes) — structured product types + packaging formats + production specs + MOQ + lead time + specialties (subset of capabilities; drives marketplace ranking boost beyond raw capability match)
3. **Operational Standards** (NEW V1, partner-wide) — response time SLA, comm channel, escalation contact, revision policy, production confirmation mode. PLATFORM_DEFAULT accepts-all-in-30-seconds; customization V1.5+ for premium tiers. Per-product overrides land V1.5+ via additive ProductOperationalStandards model — schema hook NOT in V1.
4. **Financial & Commercial** (V1 = fixed standard contract for all partners) — STANDARD_V1.0 ContractTerms row everyone signs; failureResponsibility matrix locked (failed-production-partner-error / damaged-packaging-iLaunchify-mediated / etc.); per-partner contract OVERRIDES land V1.5+ via PartnerCommercialTerms.contractOverrideId nullable FK (hook IS in V1 schema, NULL by default).
5. **System Integration** (NEW V1, dashboard-only baseline) — 80%+ of partners are dashboard-only forever. Schema has hooks for CSV (V1.5), webhook/API (V2). NOT required for activation; opt-in enhancement that transitions ACTIVE → INTEGRATION_ENHANCED.

**Activation FSM (10 states):**
LEAD → IDENTITY_PENDING_REVIEW → IDENTITY_VERIFIED → OPS_PENDING_REVIEW → OPERATIONALLY_CONFIGURED → ACTIVE → (optionally INTEGRATION_ENHANCED) + side states PAUSED / SUSPENDED / TERMINATED. All transitions write AuditLog entries.

Key principle: **approval ≠ activation**. A partner can be legally verified (IDENTITY_VERIFIED) but not yet operationally ready (waiting on Stripe Connect or capability data). Activation is an explicit admin action separate from approval.

**Role-separated auth:**
/signup is a "what brings you here?" router. /signup/creator (brand panel) vs /signup/partner (network panel) — distinct visual identity, distinct value props, distinct fields. Admin = invite-only, no public signup. Magic link via Auth.js + Resend is primary; Google OAuth for everyone, LinkedIn for partners (pulls company name pre-fill). Role-scoped /login enforcement: creator login validates role=creator; partner login rejectRoles:["creator"].

**Why:** Pavel pushed back 2026-05-24 that the admin/onboarding side was undersized in spec. He shared research framing onboarding as system architecture, and chose fixed-contract + partner-wide-standards for V1 simplicity with extensibility hooks for V1.5+. Audited his FOD partner signup (1,211 lines, over-built with SMS verification at signup, mock 6-digit codes, 8-16 char password rules) and kept what worked (role separation, distinct visual identity, vendor→partner redirect, role-scoped login) while replacing the verification with Auth.js magic links + Google/LinkedIn OAuth.

**How to apply:** When designing or building anything that touches partner profiles, marketplace matching, contract terms, or onboarding flows, treat the 5-layer model as the canonical structure. Never collapse Layers 3 or 5 into Identity or Commercial — they're independent for reasons that pay off downstream. Never gate ACTIVE on Layer 5. Always write FSM transitions to AuditLog. The contractOverrideId FK is the V1.5+ extensibility hook that lets per-partner side agreements land additively without migration; same pattern (nullable FK to more-specific entity) is the standard extensibility pattern for V1 → V1.5 work.

Related: [[ilaunchify-business-model]] (the marketplace this onboarding feeds), [[ilaunchify-markets-and-regions]] (partner cert + market scoping that lives in PartnerMarketCert layer alongside Layer 1).

Canonical spec: `docs/PARTNER_ONBOARDING.md`.
