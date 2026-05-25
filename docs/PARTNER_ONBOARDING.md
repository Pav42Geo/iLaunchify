# Partner Onboarding — Spec

**Status:** V1 architecture locked 2026-05-24 with Pavel.
**Supersedes:** Phase A scattered references in `FOD_RECOVERY_PLAN.md` (the Phase A *implementation* still stands; this doc reframes it conceptually + adds Layers 3 and 5).
**Related:** [PLATFORM_SPEC.md](./PLATFORM_SPEC.md) · [USER_ROLES.md](./USER_ROLES.md) · [MARKETS_AND_REGIONS.md](./MARKETS_AND_REGIONS.md) · [PAYMENTS.md](./PAYMENTS.md) · [FOD_RECOVERY_PLAN.md](./FOD_RECOVERY_PLAN.md)

## Why this exists

**Onboarding is not signup UI. It is system architecture.**

In a marketplace like Etsy, onboarding is a registration form. Failure modes are bounded — a bad listing, a refund, done. In a B2B food production marketplace like iLaunchify, onboarding failures cause operational chaos six weeks later: wrong specs, delayed lead times, unclear ownership, invoicing disputes, missing certifications, incompatible production capabilities. The fix isn't a better signup form; it's recognizing that **onboarding is the foundation of the operational database, and every downstream feature depends on the data structures established here**.

This spec establishes:

1. A **role‑separated signup architecture** so the audiences (creators vs partners vs admins) hit the right door from the first click.
2. A **5‑layer onboarding model** that converts ad‑hoc partner profile data into structured operational data the platform can reliably reason about.
3. An **activation FSM** that separates legal verification from operational readiness — a partner can be approved without being ready to take orders.
4. **Extensibility hooks** so V1.5+ can add per‑partner contract overrides and per‑product operational standards without migrations.

## 1. Role‑separated signup architecture

The single most common onboarding failure across marketplaces is "wrong door": creator hits the partner signup, partner hits the creator signup. The visual identity and the value proposition mismatch are visible from the first screen and create immediate disengagement.

### 1.1 The signup tree

```
/signup                          → "What brings you here?" router page
  ↓
  ├── I want to make products    → /signup/creator
  │   that get manufactured        (creator signup; brand-focused panel)
  │
  ├── I want to manufacture      → /signup/partner
  │   products for creators        (partner signup; network-focused panel)
  │
  └── I'm joining a team           → /login
                                     (no public admin signup — invite-only)

/login                            → catch-all (auto-detects role, redirects to dashboard)
/login/creator                    → role-scoped creator login (deep-linkable from creator marketing)
/login/partner                    → role-scoped partner login (deep-linkable from partner marketing)
```

### 1.2 Visual identity per role

Distinct branding from the first pixel. Same auth backend, totally different audience cues.

| Surface | Creator | Partner |
|---|---|---|
| Header color/voice | Warm prosumer "build your brand" | Industrial "operational network" |
| Marketing panel content | Tool highlights (Product Builder, Design Studio, Marketplace) | Trust signals (active partner count, regional coverage, fulfillment volume) |
| Form field order | Name → Email → Brand name (optional) | Name → Email → Company name → Role at company |
| Default CTA copy | "Start my creator account" | "Apply to join the partner network" |
| Post-signup landing | Onboarding lite (brand setup, target markets) | Onboarding wizard (5-layer model below) |

### 1.3 Auth mechanics

- **Magic link is the primary auth.** Auth.js v5 + Resend already wired. Reduces support burden and matches modern B2B SaaS expectations. No passwords for V1.
- **OAuth available**: Google for everyone, LinkedIn for partners (B2B trust signal + pulls company name for pre-fill).
- **Dev Credentials fallback** for local development (already in place).
- **Role-scoped login enforcement.** Creator login validates the user's role IS creator. Partner login `rejectRoles: ["creator"]` so a creator can't accidentally authenticate via the partner door. Admin login is invite-only — there is no public admin signup route.
- **Company info collected at signup for partners.** Partners ARE companies. Capturing company name + role-in-company on the signup form creates a `Partner` row (status=`LEAD`) immediately, so the dashboard has something to scaffold around. Skipping this leaves an orphan `User` with no `Partner` and creates downstream confusion.
- **Brand info collected lightly at signup for creators**; the substantive setup happens in the 5-step Creator Onboarding stepper that runs immediately after first signin. See [CREATOR_ONBOARDING.md](./CREATOR_ONBOARDING.md) for the full creator path. Creator signup itself stays brief (name + email + brand name optional) so the door is low-friction; the stepper handles target markets, payment, channel connection, brand identity, and first-product selection.

### 1.4 What's deliberately NOT in V1 signup

- **No SMS verification at signup.** FOD's partner signup forced both email AND SMS verification before account creation. That's friction overload. Phone verification is a later trust step ("Verify your phone to receive critical order alerts").
- **No 8–16 char password rules.** Magic link → no password at all. (When OAuth is used, the IDP handles it.)
- **No "company size / industry / location" questionnaire at signup.** Those belong in onboarding Layer 1, not the door.

## 2. The 5‑layer onboarding model

Onboarding is structured as five independent systems, not one linear flow. A partner can work on Layer 2 (Capabilities) while waiting on admin review of Layer 1 (Identity). Modular, non‑sequential, status‑tracked per layer.

### 2.1 The layers at a glance

| # | Layer | Purpose | V1 status | Required to activate? |
|---|---|---|---|---|
| 1 | **Identity & Verification** | Confirm legitimacy, reduce platform risk | Phase A shipped (4-section model: Legal, Compliance Docs, Capabilities, Payment) | **Yes** |
| 2 | **Operational Capability** | Structured operational data: what they actually do (**multi‑select partner types** — schema supports many `PartnerService` rows per partner; one per type max via `@@unique([partnerId, type])`) | Partial (capability checkboxes shipped via #98); deepening to structured fields (MOQ, lead time, production specs) is V1 work | **Yes** |
| 3 | **Operational Standards** | How communication, revisions, escalation, file standards work | **New layer (V1)** — partner-wide defaults accepted; customization V1.5+ for premium tiers | **Defaults required (no opt-out)** |
| 4 | **Financial & Commercial** | Payment, pricing model, failure responsibility matrix | Partial (Stripe Connect shipped); fixed standard contract layer is V1 work | **Yes** |
| 5 | **System Integration** | Digital capability: dashboard-only / CSV / webhook / API | **New layer; V1 default is "dashboard-only" for everyone** | **No** (opt-in enhancement) |

### 2.2 Layer 1 — Identity & Verification (Phase A shipped)

**Purpose:** answer "who are you and are you legitimate?" — nothing more.

Already shipped via Phase A (tasks #91–#100). The model:

- Legal entity (business name, EIN/tax ID, jurisdiction)
- Facility location(s) with address + capacity profile
- Insurance certificate (uploaded as `PartnerFile` to R2)
- Industry certifications (separately handled in §7 of `MANUFACTURER_PRODUCT_BUILDER.md` as the certificate library — partner instances + admin verification)
- Ownership / primary contact structure
- W-9 / W-8 / tax forms (uploaded as `PartnerFile`)

What's enforced:
- All four PartnerVerificationSection rows (Legal / Compliance Docs / Capabilities / Payment) must reach `APPROVED` state before status can transition to `IDENTITY_VERIFIED`.
- Admin verification happens in the existing Vendor Verification queue (#94), which is being extended to a 5-section model that adds Operational Standards (Layer 3).
- AuditLog (#92) records every state change with who-changed-what.

### 2.3 Layer 2 — Operational Capability (deepen V1)

**Purpose:** structured operational data that downstream features (matching, quoting, AI suggestions, production routing) all depend on.

The pain in FOD: capability data was free-text or simple checkboxes. "We produce beverages" doesn't help the matching algorithm rank a partner for a specific cold-fill PET-bottle hot-sauce job.

V1 schema replaces the checkbox model with structured fields:

```
PartnerOperationalCapability (one-per-partner row)
├── productTypes[]            // ["carbonated_beverage", "supplement_powder", "hot_sauce", "gummy"]
├── packagingFormats[]        // ["12oz_slim_can", "16oz_pet_bottle", "5lb_kraft_pouch"]
├── productionSpecs[]         // ["hot_fill", "cold_fill", "pasteurization", "HPP", "carbonation"]
├── moqUnitsMin               // typical minimum order qty floor
├── moqUnitsTypical           // most common MOQ
├── leadTimeDaysMin / Max     // typical lead time window
├── specialties[]             // SUBSET of productTypes — what they're best at (drives ranking boost)
├── monthlyCapacityUnits      // production ceiling per month (nullable for V1)
└── notes                     // partner-supplied free-text caveats
```

`specialties` is the most important addition. A partner might be *capable* of three things but *specialized* in one. The marketplace ranker (see `MARKETS_AND_REGIONS.md` §matching algorithm) gives specialty matches an extra weight beyond raw capability match.

`productTypes`, `packagingFormats`, `productionSpecs` are **controlled vocabularies** maintained by admin (extends existing seed). No free-text per-partner — otherwise data normalization breaks.

### 2.4 Layer 3 — Operational Standards (NEW in V1, partner-wide)

**Purpose:** establish how communication, revisions, and coordination work, so the platform isn't constantly negotiating coordination terms downstream.

> Most operational problems are coordination problems. — Pavel, 2026-05-24

**V1 scope (locked):** **partner-wide** standards. One set of standards per partner that applies to every product. Per-product overrides deferred to V1.5+ for premium/high-tier products.

The schema splits cleanly into **platform-mandated** vs **partner-declared**:

```
PartnerOperationalStandards (one per partner)
├── responseTimeHours          // partner commits to respond to new orders within X hours
│                              //   V1 default: 24h; partner can lower to 4h/8h/12h for "fast partner" badge
├── preferredCommChannel       // EMAIL | IN_APP | PHONE
├── escalationContact          // { name, email, phone, role }
├── revisionPolicy             // PLATFORM_DEFAULT (V1) | CUSTOM_NEGOTIATED (V1.5+, admin-mediated)
├── customRevisionTerms        // only set when revisionPolicy=CUSTOM_NEGOTIATED
└── productionConfirmationMode // SLOW_CONFIRM (24h email loop) | FAST_CONFIRM (in-app, immediate)

PlatformMandatedStandards (singleton; admin-managed, applies to ALL partners)
├── acceptedArtworkFormats[]   // ["AI", "PDF", "SVG", "PSD"] — partners can't upload others
├── auditLogRequiredEvents[]   // which lifecycle events always write to AuditLog
├── versioningRule             // "every label change creates a new version" — non-negotiable
├── disputeResolutionWindow    // default 14 days post-delivery
└── escalationPath             // tier 1 admin → tier 2 admin → legal — invariant per platform
```

**The partner-side standards:** captured during onboarding via a single page in the wizard. Defaults are reasonable so a partner can accept-all-defaults in 30 seconds. Customization is optional.

**The platform-side standards:** edited only by admin via `/admin/platform-settings/operational-standards`. Single row, versioned for audit. Partners can't see this directly; they see the *effects* (which file formats they're allowed to upload, etc.).

**Extensibility for V1.5 per-product standards:** see §8.2 below.

### 2.5 Layer 4 — Financial & Commercial (fixed contract V1)

**Purpose:** establish payment structure, pricing model, and — critically — **failure responsibility**: who pays when things go wrong?

**V1 scope (locked):** **fixed standard contract** for all partners. Partners agree to the same baseline responsibility structure during onboarding. Per-partner overrides deferred — but architected for V1.5+ via the `ContractTerms` model.

```
ContractTerms (admin-managed library; partners reference a row, never edit it directly)
├── id, version            // "STANDARD_V1.0", "STANDARD_V1.1", "ACME_CUSTOM_V1" (V1.5+)
├── name, description
├── status                  // DRAFT | ACTIVE | DEPRECATED
├── failureResponsibility   // structured matrix (see below)
├── paymentTerms            // standard payment timing + methods
├── pricingModelOptions[]   // which models a partner under this contract can offer
├── disputePolicy           // SLA + escalation references
├── effectiveFrom, effectiveTo
└── pdfFileId               // R2 reference to the human-signable PDF version

PartnerCommercialTerms (per partner, references ContractTerms)
├── partnerId
├── contractTermsId         // FK — defaults to current STANDARD_V1 ACTIVE row
├── contractOverrideId      // FK; nullable. NULL = use standard contract.
│                           // Set in V1.5+ when admin approves a side agreement.
├── paymentMethod           // ACH | WIRE | STRIPE_CONNECT  (Stripe Connect is V1 default)
├── payoutTimingDays        // partner-selectable within bounds set by contract
├── pricingModel            // FIXED | QUOTE_BASED | VOLUME_TIERED — chosen from contract's options
├── invoiceCycle            // PER_ORDER | WEEKLY | MONTHLY — chosen from contract's options
├── signedAt, signedById
└── stripeConnectAccountId  // already shipped via #54
```

**The standard failure responsibility matrix** (lives in `ContractTerms.failureResponsibility` as JSON, baked into STANDARD_V1):

| Scenario | V1 standard contract default |
|---|---|
| Failed production batch (partner error: wrong recipe, missed spec) | Partner pays — re-run at partner cost, no creator charge for the failed run |
| Failed production batch (creator error: wrong spec provided) | Creator pays — partner is reimbursed for materials + labor at standard rate |
| Damaged packaging in transit | iLaunchify-mediated — claim filed with carrier; creator made whole; partner not penalized |
| Post-delivery quality issue (within 14d dispute window) | Investigated — if partner fault, partner pays remake; if material fault, iLaunchify mediates with supplier; if creator misuse, creator absorbs |
| Reformulation request (creator-initiated post-order) | Creator pays full re-run cost + restock fee on retired ingredients |
| Expired ingredient liability | Partner pays — partner is responsible for inventory dating |
| Cancelled order (creator-initiated post-acceptance) | Creator pays for materials already procured + 50% of labor allocation |
| Cancelled order (partner-initiated post-acceptance) | Partner pays creator's reasonable replacement-sourcing premium |

This is the matrix all partners agree to in V1. Per-partner side agreements in V1.5+ are layered on top via the `contractOverrideId` field — when set, the override matrix applies to that partner's orders.

**Why fixed contract for V1 (Pavel's decision):**
- Simpler legal review (one contract to vet, not 50)
- Easier onboarding (partner signs once, done)
- Easier dispute resolution (one rulebook, not 50 variations)
- Cleaner automation logic (automation can assume standard terms)
- More predictable pricing and risk modeling (no contract variance)

### 2.6 Layer 5 — System Integration (NEW, V1 = dashboard-only baseline)

**Purpose:** capture digital capability so the platform knows when it can automate vs when it needs human coordination.

**V1 reality:** 80%+ of small co-packers will only ever use the dashboard. Don't gate activation on integration. Schema is in place so V1.5+ can light up CSV/webhook/API for capable partners progressively.

```
PartnerIntegrationCapability (one per partner)
├── hasDashboardOnly       Boolean   default=true   (everyone has this in V1)
├── canUseCSVImport        Boolean   default=false  (V1.5: bulk price lists, capacity calendars)
├── canUseCSVExport        Boolean   default=false  (V1.5: order export, fulfillment reports)
├── hasWebhookEndpoint     Boolean   default=false  (V2: receive order events)
├── webhookUrl             String?                  (V2)
├── webhookSigningSecret   String?                  (V2; rotated by admin)
├── hasAPIIntegration      Boolean   default=false  (V2: programmatic order updates, inventory sync)
├── apiKeyId               String?                  (V2; FK to APIKey rotation system)
└── inventorySyncMode      enum (NONE | MANUAL | CSV_BATCH | WEBHOOK | API)  default=NONE
```

Partners check these as they unlock new tiers. Admin can promote a partner to `INTEGRATION_ENHANCED` once Layer 5 has at least one non-default flag set. Layer 5 is **opt-in**, not gated.

## 3. The activation FSM

```
                ┌──────────────────────┐
                │ LEAD                 │ (signup completed; no verification submitted yet)
                └──────────┬───────────┘
                           │ partner submits Identity (Layer 1)
                           ▼
                ┌──────────────────────┐
                │ IDENTITY_PENDING_    │ (admin queue; under review)
                │ REVIEW               │
                └──────────┬───────────┘
                           │ admin approves all 4 Phase A sections
                           ▼
                ┌──────────────────────┐
                │ IDENTITY_VERIFIED    │ (Layer 1 complete; can fill Layers 2-4 in parallel)
                └──────────┬───────────┘
                           │ partner submits Capability (L2) + Standards (L3 defaults) + Commercial (L4)
                           ▼
                ┌──────────────────────┐
                │ OPS_PENDING_REVIEW   │ (admin reviews capability completeness + Stripe Connect verified + contract signed)
                └──────────┬───────────┘
                           │ admin approves
                           ▼
                ┌──────────────────────┐
                │ OPERATIONALLY_       │ (ready to be activated; just needs admin's "go live" toggle)
                │ CONFIGURED           │
                └──────────┬───────────┘
                           │ admin activates
                           ▼
                ┌──────────────────────┐
                │ ACTIVE               │ (visible in marketplace, taking orders)
                └──────┬───────────────┘
                       │
       ┌───────────────┼───────────────────┐
       ▼               ▼                   ▼
┌──────────────┐ ┌──────────────────┐  ┌──────────────────────┐
│ PAUSED       │ │ INTEGRATION_     │  │ SUSPENDED             │
│ (partner or  │ │ ENHANCED         │  │ (admin action: cert   │
│ admin)       │ │ (Layer 5 added;  │  │ lapsed, fraud,        │
│              │ │ superset of      │  │ dispute, performance) │
│              │ │ ACTIVE)          │  │                       │
└──────┬───────┘ └────────┬─────────┘  └──────────┬───────────┘
       │ resume action     │ admin downgrades       │ admin reinstates or terminates
       ▼                   ▼                        ▼
   (back to ACTIVE)    (back to ACTIVE)        ACTIVE  or  TERMINATED (terminal)
```

**Key transition rules:**

- `LEAD → IDENTITY_PENDING_REVIEW`: triggered when partner submits all 4 Phase A sections. Automatic.
- `IDENTITY_PENDING_REVIEW → IDENTITY_VERIFIED`: requires admin approval on all 4 sections + AuditLog entry. Admin can also request changes (state stays in PENDING with `needsChanges` flag).
- `IDENTITY_VERIFIED → OPS_PENDING_REVIEW`: triggered when partner has submitted L2 + L3 (or accepted defaults) + L4 (contract signed + Stripe Connect onboarded). Automatic when those three things become true.
- `OPS_PENDING_REVIEW → OPERATIONALLY_CONFIGURED`: requires admin approval. Admin can also request changes.
- `OPERATIONALLY_CONFIGURED → ACTIVE`: admin manual action ("Activate partner"). Sends welcome notification, partner appears in marketplace.
- `ACTIVE → PAUSED`: partner or admin can pause. Partner-initiated pause hides them from marketplace; admin-initiated pause includes a reason logged to AuditLog.
- `ACTIVE → INTEGRATION_ENHANCED`: partner unlocks integration features and submits Layer 5 details; admin approves. Strict superset — partner still has all ACTIVE capabilities + integration features.
- `ACTIVE → SUSPENDED`: admin manual action. Reasons: certificate lapsed (auto-triggered when cert expires), fraud signal, dispute pattern, performance score below threshold.
- `SUSPENDED → ACTIVE`: admin reinstates after issue resolved.
- `SUSPENDED → TERMINATED`: admin terminal action — partner cannot be re-activated. Existing in-flight orders complete; new orders blocked permanently.

All transitions write to AuditLog with: actor (user ID), from-state, to-state, reason text, timestamp.

## 4. Schema (full V1)

```prisma
// =============================================================================
// PARTNER STATUS — replaces existing Partner.status enum
// =============================================================================

enum PartnerStatus {
  LEAD
  IDENTITY_PENDING_REVIEW
  IDENTITY_VERIFIED
  OPS_PENDING_REVIEW
  OPERATIONALLY_CONFIGURED
  ACTIVE
  INTEGRATION_ENHANCED
  PAUSED
  SUSPENDED
  TERMINATED
}

model Partner {
  // ... existing fields (id, name, companyType, addresses, etc.) ...
  status                  PartnerStatus  @default(LEAD)
  statusChangedAt         DateTime?
  statusChangedById       String?
  statusChangeReason      String?
  // L2 / L3 / L4 / L5 relations (1:1):
  operationalCapability   PartnerOperationalCapability?
  operationalStandards    PartnerOperationalStandards?
  commercialTerms         PartnerCommercialTerms?
  integrationCapability   PartnerIntegrationCapability?
}

// =============================================================================
// LAYER 2 — Operational Capability (structured)
// =============================================================================

model PartnerOperationalCapability {
  id                    String   @id @default(cuid())
  partnerId             String   @unique
  productTypes          String[]                       // controlled vocab (admin-managed)
  packagingFormats      String[]                       // controlled vocab
  productionSpecs       String[]                       // controlled vocab
  moqUnitsMin           Int
  moqUnitsTypical       Int
  leadTimeDaysMin       Int
  leadTimeDaysMax       Int
  specialties           String[]                       // subset of productTypes
  monthlyCapacityUnits  Int?
  notes                 String?
  updatedAt             DateTime @updatedAt
  partner               Partner @relation(fields: [partnerId], references: [id])
}

// =============================================================================
// LAYER 3 — Operational Standards (partner-wide V1, extensible to per-product V1.5+)
// =============================================================================

enum CommChannel { EMAIL IN_APP PHONE }
enum RevisionPolicy { PLATFORM_DEFAULT CUSTOM_NEGOTIATED }
enum ProductionConfirmationMode { SLOW_CONFIRM FAST_CONFIRM }

model PartnerOperationalStandards {
  id                        String   @id @default(cuid())
  partnerId                 String   @unique
  responseTimeHours         Int      @default(24)
  preferredCommChannel      CommChannel @default(IN_APP)
  escalationContact         Json                          // { name, email, phone, role }
  revisionPolicy            RevisionPolicy @default(PLATFORM_DEFAULT)
  customRevisionTerms       String?
  productionConfirmationMode ProductionConfirmationMode @default(SLOW_CONFIRM)
  acceptedDefaults          Boolean @default(true)        // tracking convenience for "accepted all defaults"
  updatedAt                 DateTime @updatedAt
  partner                   Partner @relation(fields: [partnerId], references: [id])
}

// Singleton — admin-managed platform-wide standards (one row, versioned for audit):
model PlatformMandatedStandards {
  id                          String   @id @default(cuid())
  version                     String   @unique          // "v1.0", "v1.1"
  acceptedArtworkFormats      String[] @default(["AI","PDF","SVG","PSD"])
  versioningRule              String   @default("every_change_new_version")
  disputeResolutionWindowDays Int      @default(14)
  escalationPath              Json                       // tier sequence
  effectiveFrom               DateTime
  effectiveTo                 DateTime?
  createdAt                   DateTime @default(now())
}

// =============================================================================
// LAYER 4 — Financial & Commercial (fixed standard contract V1, extensible)
// =============================================================================

enum ContractStatus { DRAFT ACTIVE DEPRECATED }
enum PaymentMethod { ACH WIRE STRIPE_CONNECT }
enum PricingModel { FIXED QUOTE_BASED VOLUME_TIERED }
enum InvoiceCycle { PER_ORDER WEEKLY MONTHLY }

model ContractTerms {
  // Admin-managed library of contract versions. Partners reference, never edit.
  // V1 seed: one row, "STANDARD_V1.0".
  // V1.5+: additional rows can be created for per-partner overrides.
  id                       String   @id @default(cuid())
  version                  String   @unique          // "STANDARD_V1.0", "ACME_CUSTOM_V1" (V1.5+)
  name                     String
  description              String
  status                   ContractStatus
  failureResponsibility    Json                       // matrix detailed in §2.5
  paymentTerms             Json                       // standard payment timing + methods supported
  pricingModelOptions      PricingModel[]            // which models partners under this contract can offer
  invoiceCycleOptions      InvoiceCycle[]
  disputePolicy            Json
  effectiveFrom            DateTime
  effectiveTo              DateTime?
  pdfFileId                String?                    // R2 reference; human-signable PDF
  createdAt                DateTime @default(now())
  partnersReferencing      PartnerCommercialTerms[]   @relation("StandardContract")
  partnersOverriding       PartnerCommercialTerms[]   @relation("OverrideContract")
}

model PartnerCommercialTerms {
  id                       String   @id @default(cuid())
  partnerId                String   @unique
  contractTermsId          String                     // FK — defaults to current STANDARD_V1 ACTIVE row
  contractOverrideId       String?                    // FK; nullable. V1.5+ per-partner override hook.
  paymentMethod            PaymentMethod @default(STRIPE_CONNECT)
  payoutTimingDays         Int @default(7)
  pricingModel             PricingModel @default(FIXED)
  invoiceCycle             InvoiceCycle @default(PER_ORDER)
  signedAt                 DateTime
  signedById               String
  stripeConnectAccountId   String?
  updatedAt                DateTime @updatedAt
  partner                  Partner @relation(fields: [partnerId], references: [id])
  contractTerms            ContractTerms @relation("StandardContract", fields: [contractTermsId], references: [id])
  contractOverride         ContractTerms? @relation("OverrideContract", fields: [contractOverrideId], references: [id])
}

// =============================================================================
// LAYER 5 — System Integration (V1 = dashboard-only baseline)
// =============================================================================

enum InventorySyncMode { NONE MANUAL CSV_BATCH WEBHOOK API }

model PartnerIntegrationCapability {
  id                  String   @id @default(cuid())
  partnerId           String   @unique
  hasDashboardOnly    Boolean  @default(true)
  canUseCSVImport     Boolean  @default(false)
  canUseCSVExport     Boolean  @default(false)
  hasWebhookEndpoint  Boolean  @default(false)
  webhookUrl          String?
  webhookSigningSecret String?
  hasAPIIntegration   Boolean  @default(false)
  apiKeyId            String?
  inventorySyncMode   InventorySyncMode @default(NONE)
  updatedAt           DateTime @updatedAt
  partner             Partner @relation(fields: [partnerId], references: [id])
}

// =============================================================================
// ONBOARDING PROGRESS — per-layer completion tracking
// =============================================================================
// Existing OnboardingProgress model (from Phase A) gains explicit per-layer status:

enum LayerStatus { NOT_STARTED IN_PROGRESS SUBMITTED APPROVED CHANGES_REQUESTED }

model OnboardingProgress {
  id                   String   @id @default(cuid())
  partnerId            String   @unique
  layer1Identity       LayerStatus @default(NOT_STARTED)
  layer2Capability     LayerStatus @default(NOT_STARTED)
  layer3Standards      LayerStatus @default(NOT_STARTED)
  layer4Commercial     LayerStatus @default(NOT_STARTED)
  layer5Integration    LayerStatus @default(NOT_STARTED)
  layer1ChangeRequests Json?                          // array of admin feedback items
  layer2ChangeRequests Json?
  layer3ChangeRequests Json?
  layer4ChangeRequests Json?
  layer5ChangeRequests Json?
  lastActivityAt       DateTime?
  partner              Partner @relation(fields: [partnerId], references: [id])
}
```

## 5. Admin review workflow

Extends the existing Vendor Verification queue (#94, Phase A — 4-section model) to a **5-section model** that adds Operational Standards (Layer 3):

```
/admin/partners/[id]/verification
├── Section 1: Legal Entity        (Phase A)
├── Section 2: Compliance Documents (Phase A)
├── Section 3: Capabilities        (Phase A → enhanced with Layer 2 structured fields)
├── Section 4: Operational Standards (NEW — Layer 3; partner's chosen standards + defaults)
├── Section 5: Financial & Contract (Phase A → enhanced with Layer 4 ContractTerms sign-off)
└── (Section 6: Integration         (NEW; optional, only shown if partner submitted L5))
```

**Per-section actions** (same model as Phase A's bidirectional sync):
- **Approve**: marks section APPROVED; if all required sections are APPROVED, partner status auto-transitions to next FSM state.
- **Request Changes**: writes admin feedback items to `layerNChangeRequests`. Partner sees feedback inline on `/partner/my-application`. State stays in `*_PENDING_REVIEW` with red callouts on the offending sections.
- **Reject**: terminal-ish — sends partner back to fix major issues; status reverts to LEAD or one step back depending on which section.

**Activation action** (separate from approval):
After all required sections are APPROVED and status is `OPERATIONALLY_CONFIGURED`, admin clicks **"Activate partner"** which:
1. Transitions status to ACTIVE.
2. Sends welcome notification with marketplace appearance confirmation.
3. Triggers a one-time "you're live" email with partner dashboard link.
4. Writes AuditLog entry: actor + timestamp + welcome-message-id.

**Suspension / pause / termination actions** all live on the same admin view, each with required-reason text and AuditLog entry.

## 6. Partner verification lifecycle (timeline view)

```
Day 0  — Partner signup. User row + Partner row (LEAD) created.
         User lands on /partner/onboarding/identity (Layer 1 wizard).

Day 0-7 — Partner fills Layer 1 (Phase A 4-section model: Legal, Docs, Capabilities, Payment).
         File uploads to R2 via PartnerFile model.
         When all 4 submitted → automatic transition to IDENTITY_PENDING_REVIEW.
         Admin receives notification in Vendor Verification queue.

Day 7-14 — Admin reviews Layer 1. Approves all 4 → partner transitions to IDENTITY_VERIFIED.
          Partner notified: "Identity verified! Continue setup."
          Partner can now access Layer 2, 3, 4 setup wizards in parallel.

Day 14-21 — Partner fills:
          - Layer 2 (Capability): structured product types, MOQ, lead time, specialties
          - Layer 3 (Standards): can accept all defaults in <30 seconds, or customize
          - Layer 4 (Commercial): selects payment + pricing model + signs STANDARD_V1 contract
                                 + completes Stripe Connect onboarding (#54 already shipped)
          When L2 + L3 + L4 all submitted → automatic transition to OPS_PENDING_REVIEW.

Day 21-28 — Admin reviews Layers 2-4. Verifies Stripe Connect active, contract signed,
          capability data complete + plausible. Approves → OPERATIONALLY_CONFIGURED.

Day 28+ — Admin clicks "Activate partner" when ready (may schedule batch with welcome
         emails, training session, etc.) → ACTIVE.
         Partner appears in marketplace.

Optional — Partner enables Layer 5 (Integration) features at any later point → admin
          approves → INTEGRATION_ENHANCED.

Lifecycle events that may occur post-ACTIVE:
- Cert expiry auto-detected → admin notified → may SUSPEND if not renewed within grace window
- Performance drop (high dispute rate, slow response time) → admin reviews → may PAUSE or SUSPEND
- Partner-initiated pause (vacation, capacity issue) → ACTIVE → PAUSED → ACTIVE
- Egregious issue (fraud, severe quality breach) → SUSPENDED → admin investigates → ACTIVE or TERMINATED
```

**SLA targets (V1):**
- Identity review: ≤ 5 business days
- Operational review: ≤ 3 business days
- Activation decision: ≤ 1 business day after OPERATIONALLY_CONFIGURED
- Total signup-to-active: typically 14–28 days for well-prepared partners; 6 weeks for slower

## 7. Onboarding UX — 4‑section accordion + Welcome screen (locked 2026‑05‑25 with Pavel)

V1 onboarding UX departs from a linear wizard in favor of a **modern accordion on one scrollable page**, preceded by a Welcome screen on first login. Schema stays the 5‑layer model from §2 (data architecture unchanged); what follows is the *user experience* sitting on top of that data.

### 7.1 Post‑login routing — what does `/dashboard` show?

When a partner lands on `/dashboard`, conditional rendering based on `Partner.status` decides what they see:

| Partner.status | Has opened onboarding? | `/dashboard` shows |
|---|---|---|
| LEAD | No (first visit) | **Welcome screen** (§7.2) with packing list + Continue setup CTA |
| LEAD or IDENTITY_PENDING_REVIEW | Yes (returned later) | **Application Status** page — read‑only summary of progress + "Resume setup" button |
| IDENTITY_PENDING_REVIEW / OPS_PENDING_REVIEW (in admin queue) | n/a | **Application Status** — status pill, "Typically 3–5 business days," ProductNote thread |
| IDENTITY_VERIFIED+ | n/a | Real partner dashboard (orders, marketplace listing, payouts) |
| PAUSED / SUSPENDED | n/a | Status notice + admin contact link |

The Welcome is a **moment in time** shown once. Subsequent visits land on Application Status (read‑only summary) until activation. This avoids re‑showing the introductory copy every time.

### 7.2 The Welcome screen (first visit only)

The partner has just signed up — gentler psychological onramp than landing directly on a form. Sets expectations, lists what they'll need to gather, and provides multiple paths.

```
┌──────────────────────────────────────────────────────────────────────┐
│ ☰ iLaunchify Partner                                  Jane @ Acme ▾  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                       Welcome, Acme Co‑Pack 👋                       │
│                                                                      │
│             You're a few steps away from being an active             │
│                       iLaunchify partner.                            │
│                                                                      │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━     │
│                                                                      │
│   📋 Here's what to expect                                           │
│   The form takes 10–15 minutes if you have everything ready.         │
│   Our verification team typically reviews within 3–5 business        │
│   days. You can save your progress and return any time.              │
│                                                                      │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━     │
│                                                                      │
│   📎 Have these ready before you start                               │
│   • Business license / certificate of incorporation                  │
│   • EIN or other tax ID                                              │
│   • Certificate of liability insurance                               │
│   • W‑9 or W‑8 form                                                  │
│   • Facility address + production capacity                           │
│   • Industry certifications (NSF, USDA Organic, cGMP, …) — optional  │
│   • Bank account for production payouts                              │
│                                                                      │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━     │
│                                                                      │
│         [Continue setup →]      [I'll come back later]               │
│                                                                      │
│              How does verification work?   ·   Talk to our team      │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Why the packing list is the highest‑leverage element:** partners who try the form unprepared get stuck mid‑section and abandon. The packing list lets them gather everything FIRST → one clean pass through the form. Massive completion‑rate lift in B2B onboarding contexts (Stripe Atlas, Notion enterprise onboarding follow this pattern).

**"I'll come back later"** logs them out gracefully — they can return any time via the magic link or password‑less re‑auth. Doesn't lose progress (form is empty at this point anyway).

### 7.3 The Application Status page (subsequent visits before activation)

After the partner clicks "Continue setup" once, `/dashboard` lands them on `/dashboard` (which conditionally renders Application Status instead of Welcome):

```
┌──────────────────────────────────────────────────────────────────────┐
│ Your application — Acme Co‑Pack                       Status: DRAFT  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Progress  ████████░░░░░░░░░  45%                                   │
│                                                                      │
│   ✓ Your business              Complete                              │
│   ◐ Your company               In progress (3 of 6 fields)           │
│   ○ What you can do            Not started                           │
│   ○ Payment & contract         Not started                           │
│                                                                      │
│                       [Resume setup →]                               │
│                                                                      │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━     │
│                                                                      │
│   📋 Messages from our team   (2 unread)                             │
│   Admin asked for an updated insurance certificate — see Your        │
│   company section.                                                   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

When `Partner.status = OPS_PENDING_REVIEW` or `IDENTITY_PENDING_REVIEW` (with admin), this page also shows the queue ETA and a non‑dismissable "In review" banner.

### 7.4 The accordion form (`/partner/onboarding`)

Single scrollable page with **4 accordion sections** (Layer 5 / integrations is NOT shown in V1 — nothing partner‑configurable there yet; schema scaffolding only). Each section has a status pill in its header.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Welcome, Acme Co‑Pack                              Progress: 45%     │
│ Complete these sections so we can verify your account.               │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ ▾ Your business              ●●●● COMPLETE  ← EXPANDED by default     │
│   • What you make (food / beverage / supplement / sauce / …)         │
│   • What markets you sell into (US auto‑selected V1)                 │
│   • Where you operate from (state)                                   │
│   • What you do  (multi‑select checkboxes):                          │
│       ☑ Manufacturing    ☑ Label printing                            │
│       ☐ Co‑packing       ☐ Warehouse                                 │
│                                                                      │
│ ▸ Your company               ●●○○ IN PROGRESS                        │
│ ▸ What you can do            ○○○○ NOT STARTED                        │
│ ▸ Payment & contract         ○○○○ NOT STARTED                        │
│                                                                      │
│            [Save draft]              [Submit for review →]           │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

The 4 sections map to the data architecture as follows (no schema change needed):

| Accordion section | Maps to Layer | Data writes |
|---|---|---|
| Your business | Layer 2 seed + Layer 1 context | PartnerOperationalCapability.productTypes/specialties; PartnerService rows (one per checked partner type); BrandTargetMarket; Partner.primaryRegionId |
| Your company | Layer 1 (Identity & Verification) | Phase A PartnerVerificationSection rows (BUSINESS, DOCUMENTS, PUBLIC_PROFILE); PartnerFile uploads to R2 |
| What you can do | Layer 2 (Operational Capability) + certificates | PartnerOperationalCapability fields (MOQ, lead time, monthly capacity); PartnerCertificateInstance picks |
| Payment & contract | Layer 4 (Commercial) + Layer 3 (Standards defaults) | PartnerCommercialTerms (Stripe Connect, payment method, STANDARD_V1.0 contract sign‑off); PartnerOperationalStandards (defaults accepted) |

### 7.5 Multi‑select partner types

Per Pavel decision 2026‑05‑25: a partner is rarely one thing. A real food company often does manufacturing AND label printing, or co‑packing AND warehouse fulfillment. The schema already supports this via `PartnerService[]` (one row per type with `@@unique([partnerId, type])` meaning "one of each type max" — not "one type total").

**UI surfaces this as checkboxes inside "Your business"** rather than a radio button. Each checked type creates a `PartnerService` row when the section saves.

V1 ServiceType values stay at 4 (per Pavel 2026‑05‑25 — packaging suppliers are upstream of our model, not a partner type):
- `MANUFACTURING`
- `COPACKING`
- `LABEL_PRINTING`
- `WAREHOUSE`

### 7.6 Conditional fields by partner type

To avoid form fatigue, fields inside "What you can do" and "Payment & contract" conditionally appear based on which partner types are checked. Pattern lifted from FOD's `partnerOnboardingFlow.ts`:

| Visible only if | Field |
|---|---|
| MANUFACTURING checked | "Monthly production capacity (units)", "Production specs you support (hot‑fill, cold‑fill, HPP, pasteurization, …)" |
| LABEL_PRINTING checked | "Print substrates you handle", "Color modes (CMYK/RGB)", "Max print width" |
| COPACKING checked | "Receiving capabilities (refrigerated / ambient / frozen)", "Co‑packing minimum batch size" |
| WAREHOUSE checked | "Storage temperature ranges", "SKU capacity", "Pick‑and‑pack vs bulk only" |
| MANUFACTURING or COPACKING checked | "Industry certifications" picker (NSF, USDA Organic, cGMP, …) becomes prominent |

A pure WAREHOUSE partner doesn't see manufacturing capacity questions. A pure LABEL_PRINTING partner doesn't see USDA Organic certification options. Field count scales DOWN with specificity, not up.

### 7.7 Other UX behaviors

1. **Save on blur** — every field auto‑saves to server when the user tabs/clicks away. No "lost work" anxiety. `Partner.onboardingProgress` Json or per‑layer rows update silently.

2. **Section status pills in accordion headers** — COMPLETE / IN PROGRESS / NOT STARTED / NEEDS CHANGES. NEEDS CHANGES turns the section header red and shows admin's structured feedback (ProductReviewItem rows scoped to that section) when partner expands it.

3. **Submit for review** button activates only when minimum sections complete: Your business + Your company + What you can do + Payment & contract. Sections can be partially complete — the button is greyed with a hover tooltip listing what's still required.

4. **Partner can see admin progress.** When status is *_PENDING_REVIEW, the page header shows "Your application is being reviewed — typically 3–5 business days." Not a black box.

5. **Change requests are structured, not free‑text.** When admin needs more info, they create `layer*ChangeRequests` items with category + description. Partner sees these inline on the affected section + as a "Messages from our team" callout on Application Status.

6. **Re‑onboarding for major changes.** A partner who edits Layer 1 fields (facility address, legal entity) on a published partner goes back to `IDENTITY_PENDING_REVIEW` for that section only. Other layers stay APPROVED. Partial re‑verification, not full restart.

7. **Welcome flow at ACTIVE** — when a partner is activated by admin, the next `/dashboard` visit shows a one‑time celebration modal explaining what's now possible: appearing in marketplace, receiving order notifications, accessing partner support channel. After dismissal, `/dashboard` becomes the real partner dashboard.

## 8. Future extensibility (designed in V1, implemented V1.5+)

### 8.1 Per-partner contract overrides

The hook is already in the schema: `PartnerCommercialTerms.contractOverrideId` (nullable FK to `ContractTerms`).

**V1 behavior:** `contractOverrideId` is always NULL. Every partner inherits the active `STANDARD_V1.x` ContractTerms row.

**V1.5+ implementation:**
1. Admin negotiates side agreement with a partner (Acme Co-Pack, large volume).
2. Admin creates a new ContractTerms row, version "ACME_CUSTOM_V1", with the negotiated failure responsibility matrix + pricing options.
3. Admin sets ContractTerms.status = ACTIVE.
4. Admin sets the partner's `contractOverrideId = <ACME_CUSTOM_V1 id>`.
5. From that moment, the partner's orders are governed by the override contract. The standard contract reference (`contractTermsId`) remains as historical context.
6. UI changes are minimal: admin gets a "Use custom contract" option on the partner detail page; partner sees their contract reference shift in `/partner/legal`.

**No migration needed.** The hook exists from V1 day one.

### 8.2 Per-product operational standards

The hook is the same pattern, anticipated but not yet in the V1 schema:

**V1.5+ schema addition:**
```prisma
model ProductOperationalStandards {
  // Per-product override of partner-wide standards (Layer 3).
  // Set only for premium/high-tier products that need different SLAs.
  id                        String  @id @default(cuid())
  productTemplateId         String  @unique
  responseTimeHours         Int?                          // null = use partner's default
  productionConfirmationMode ProductionConfirmationMode?  // null = use partner's default
  revisionPolicy            RevisionPolicy?
  customRevisionTerms       String?
  reason                    String                         // why this product needs custom standards
  approvedById              String                         // admin who approved the override
  approvedAt                DateTime
  productTemplate           ProductTemplate @relation(fields: [productTemplateId], references: [id])
}

// ProductTemplate gains:
//   operationalStandardsOverrideId String? @unique
//   operationalStandardsOverride   ProductOperationalStandards? @relation(...)
```

**V1.5+ resolution logic:** when a product order is placed, the platform resolves operational standards by:
1. Check `productTemplate.operationalStandardsOverride` — if present, use those fields.
2. For any field that's null in the override, fall back to `partner.operationalStandards`.
3. Apply.

**V1 doesn't need this code path** — every order uses partner-wide standards directly. Adding it later is additive: a new model + an optional FK + a 5-line resolver function.

### 8.3 Why these extensibility patterns are migration-free

Both override patterns share the same shape: **a nullable FK to a more-specific entity that, when set, supersedes the partner-wide default**. This is the cleanest extensibility pattern in relational schemas because:
- The default behavior (override is NULL → use partner-wide) requires no migration when the override entity is added.
- The override entity is additive — a new table, doesn't change existing tables beyond a nullable FK.
- Reading code uses the same fall-through pattern: `override ?? partnerDefault`.
- No data backfill needed when V1.5+ ships.

## 9. Roadmap

### V1 (current build)
- Schema: PartnerStatus enum (10 states), PartnerOperationalCapability, PartnerOperationalStandards, PlatformMandatedStandards, ContractTerms, PartnerCommercialTerms (with `contractOverrideId` hook NULL), PartnerIntegrationCapability, OnboardingProgress per-layer tracking
- Seed: 1 ContractTerms row "STANDARD_V1.0" ACTIVE + PlatformMandatedStandards v1.0
- Auth: `/signup` router + `/signup/creator` + `/signup/partner` + `/login` + `/login/creator` + `/login/partner`; magic link via Auth.js; Google OAuth for everyone; LinkedIn OAuth for partners
- Partner onboarding wizard at `/partner/onboarding` with 5-layer modular cards
- Vendor Verification queue extended to 5 sections (#94 extension)
- Welcome flow at ACTIVE transition
- AuditLog entries on every FSM transition

### V1.1
- LinkedIn OAuth refinement (auto-pull company name + role for partners)
- "Verify phone" step as post-activation trust signal (not signup)
- Re-onboarding flow for partial re-verification when partner edits Layer 1 fields
- Performance scoring dashboard for admins (drives auto-suspension thresholds)
- Cert expiry auto-detection → SUSPENDED with grace window

### V1.5
- Per-partner contract overrides (light up `contractOverrideId` hook + admin UI)
- Per-product operational standards (`ProductOperationalStandards` model + override resolver)
- CSV import/export for capable partners (Layer 5 partial activation)
- INTEGRATION_ENHANCED tier with feature gating

### V2
- Public REST API + webhook endpoints (Layer 5 full activation)
- Inventory sync via webhook or API
- Order status updates via API
- API key rotation system + rate limiting per partner

## 10. Open items going into build

1. **LinkedIn OAuth scope.** Pull just company name + title, or also pull list of employees? V1 default: minimum scope (company + title). Revisit when partner conversion data is in.
2. **Layer 1 re-onboarding granularity.** When partner edits facility address, does the whole Layer 1 go back to PENDING or just the affected section? V1 default: section-level (Phase A's existing 4-section model supports this).
3. **STANDARD_V1.0 contract PDF.** Needs legal review before V1 ships. Pavel to engage lawyer to produce the human-signable PDF that matches the failureResponsibility matrix in §2.5.
4. **Partner onboarding completion email cadence.** When should partner get nudges if they stall mid-onboarding? V1 default: at 24h, 72h, 7d after last activity per layer.
5. **Welcome modal content.** What does the ACTIVE celebration look like? V1 default: simple modal + "Take a tour" CTA. Marketing input would help.

## 11. Changelog

- **2026-05-24** Spec written. Synthesizes Pavel's onboarding research ("onboarding as system architecture, not signup UI"), the 5-layer model, FOD's role-separated signup auth audit, and the activation FSM. Pavel locked V1 decisions: fixed standard contract (Layer 4); partner-wide standards (Layer 3); both with extensibility hooks for V1.5+ overrides. Extends Phase A (shipped) without invalidating its model — adds Layer 3 + Layer 5 as new layers, deepens Layer 2 with structured fields, formalizes Layer 4 via ContractTerms model. Role-separated signup architecture replaces FOD's overbuilt 1,211-line partner signup with magic-link auth + OAuth + company-info-at-signup. Activation FSM has 10 states with clear transitions and SLA targets.
- **2026-05-25** §7 UX rewrite. Pavel-locked decisions after FOD onboarding audit: (a) replace 5-layer linear wizard with 4-section accordion on one scrollable page; (b) add Welcome screen + packing list as first-visit gate before form; (c) Application Status page for subsequent visits before activation; (d) drop Layer 5 / integrations from V1 partner-facing UI (nothing actionable; schema scaffolding only — re-introduce in V1.5 when CSV/webhook/API features ship); (e) multi-select partner types (checkboxes inside "Your business") — schema already supports via PartnerService[]; (f) conditional fields by selected partner type (warehouse-only partners don't see manufacturing capacity questions, etc.). V1 ServiceType vocabulary stays at 4 values (MANUFACTURING, COPACKING, LABEL_PRINTING, WAREHOUSE); packaging suppliers are upstream of the iLaunchify model, not partners. Section names use modern user-friendly wording (Your business / Your company / What you can do / Payment & contract). Wizard step labels from earlier draft superseded.
