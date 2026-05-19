# User Roles & Partner Onboarding — Decisions

**Status:** Draft for Pavel + Simona approval. Once accepted, this becomes the V1 source of truth and the schema port follows.

**The two decisions in this doc:**
1. **Role taxonomy** — how we model admin, creator, manufacturer, co-packer, print provider, and whatever else the supply side becomes.
2. **Onboarding model** — self-serve vs. admin-controlled vs. hybrid.

Both are cheap to get right now and expensive to change after we have real users.

---

## Decision 1 — Role taxonomy

### Recommendation

**Three top-level user roles: `ADMIN`, `CREATOR`, `PARTNER`. Plus a separate `Service` entity that a Partner can have one-to-many of.**

A Partner is a *company*. A Service is a *capability that company offers* — manufacturing, co-packing, label printing, fulfillment, etc. One Partner can offer one service or many. The order engine routes to Services, not to Partners.

### Why this is better than the obvious alternatives

**Alternative A — Distinct top-level roles per service type:**
```
UserRole = ADMIN | CREATOR | MANUFACTURER | COPACKER | PRINT_PROVIDER
```
The trap: a real-world co-packer that *also* prints labels has to maintain two logins, two profiles, two Stripe Connect accounts, and you have to reconcile them when sending payouts. Adding "fulfillment partner" later means an auth refactor, new middleware, new route guards. **Don't do this.**

**Alternative B — One flat "Partner" role with no sub-structure:**
```
UserRole = ADMIN | CREATOR | PARTNER
Partner.capabilities = { manufacturing: true, copacking: true, ... }  // a bag of booleans
```
The trap: capabilities don't have meaning by themselves. Each service has *different* MOQs, lead times, categories, certifications, disclosure preferences. Cramming them into one shape forces you to either over-fill (every Partner has irrelevant fields) or write conditional UI/validation everywhere. **Don't do this either.**

**Alternative C (recommended) — Partner + many Services:**
```
UserRole = ADMIN | CREATOR | PARTNER

Partner (one company, one Stripe Connect account, one set of contacts, one trust profile)
  └── Services[]
        ├── Service { type: MANUFACTURING, capabilities: { categories, moqMin, moqMax, leadTimeDays, certifications } }
        ├── Service { type: COPACKING,     capabilities: { containerFormats, fillTypes, moqMin, leadTimeDays } }
        ├── Service { type: LABEL_PRINTING, capabilities: { materials, dimensions, leadTimeDays } }
        └── ... future types added by data, not code
```

**The wins:**
- One business = one login, one Stripe Connect, one profile, one tax form.
- Each service has its own MOQ / lead time / category list / certification list — no over-stuffing.
- Each service has its own `isActive` flag — partner can pause label-printing service while manufacturing stays live.
- Each service has its own `disclosureLevel` — a partner might be transparent about manufacturing but anonymous about co-packing.
- Order routing routes to *services*: every Order has 1..N OrderDispatches, each dispatch targets a Service of a specific type.
- New service types ("FULFILLMENT", "FORMULATION", "REGULATORY_CONSULTING") are a new enum value + a Zod schema for that type's capabilities — no auth/route/middleware change.

### What about "co-packer"?

In CPG vocabulary:
- **Contract manufacturer** = makes the product from raw ingredients
- **Co-packer** = packages bulk product into retail containers (bottling, sealing, kitting)
- **Print provider** = produces labels and printed packaging

In reality these overlap. A small manufacturer often co-packs in-house. A co-packer often handles labels via a relationship with a print shop. With the Partner-and-Services model, you don't have to decide *which one a partner is* — they declare which services they offer, and you route accordingly.

The Service enum at V1:

```
enum ServiceType {
  MANUFACTURING    // makes the product
  COPACKING        // packages/bottles/seals product
  LABEL_PRINTING   // prints labels and printed packaging
  // V1.5 candidates: FULFILLMENT, FORMULATION, REGULATORY_CONSULTING
}
```

### Vocabulary in the UI

Internal data model uses "Partner" + "Service." But user-facing screens stay role-specific where it matters:

- Marketing pages: "Become a Manufacturing Partner" / "Become a Print Partner" — talk to each audience in their language.
- Creator-side flows: "Choose a manufacturer for this product" — never "Choose a Partner with ServiceType=MANUFACTURING."
- Partner-side flows: "Add a service to your profile" — exposes the abstraction only on the partner's own settings.
- Admin: "Partners" as a top-level nav item, filterable by service type.

This is a soft rule, not a hard schema constraint — the schema and the UI vocabulary don't have to match.

### Admin sub-roles

V1: **one ADMIN role**, full access.

V1.5 candidate: split into `ADMIN_PLATFORM` (you), `ADMIN_OPS` (handles partner onboarding, support), `ADMIN_VIEWER` (advisors, accountants). Add when there are more than 2 admins.

### Schema sketch (Prisma)

```prisma
enum UserRole {
  ADMIN
  CREATOR
  PARTNER
}

enum ServiceType {
  MANUFACTURING
  COPACKING
  LABEL_PRINTING
}

enum DisclosureLevel {
  FULL          // "Manufactured by Acme Foods, San Jose, CA"
  CITY_STATE    // "Manufactured for [Creator] in San Jose, CA"
  ANONYMOUS     // "Manufactured for [Creator] in the USA"
}

enum PartnerStatus {
  DRAFT          // admin-created stub, not yet invited
  INVITED        // invitation sent, partner hasn't completed signup
  UNDER_REVIEW   // partner submitted profile, awaiting admin activation
  ACTIVE         // can receive orders
  SUSPENDED      // temporarily off-platform
}

enum ServiceStatus {
  DRAFT          // partner is filling it out
  ACTIVE         // accepting orders
  PAUSED         // temporarily not accepting orders
}

model User {
  id              String           @id @default(cuid())
  email           String           @unique
  role            UserRole
  // ... auth fields (passwordHash | OAuth, MFA, etc.)
  creatorProfile  CreatorProfile?
  partner         Partner?         // null unless role = PARTNER
  // Admins have no extra profile row in V1
}

model CreatorProfile {
  id              String   @id @default(cuid())
  userId          String   @unique
  handle          String   @unique   // public URL slug
  displayName     String
  // ... bio, socials, audience size, payout setup
  user            User     @relation(fields: [userId], references: [id])
}

model Partner {
  id                String           @id @default(cuid())
  userId            String           @unique
  companyName       String
  legalName         String
  status            PartnerStatus    @default(DRAFT)
  stripeConnectId   String?          @unique  // Stripe Connect account
  // ... contacts, tax form, insurance docs, certifications at the company level
  services          PartnerService[]
  user              User             @relation(fields: [userId], references: [id])
}

model PartnerService {
  id                String           @id @default(cuid())
  partnerId         String
  type              ServiceType
  status            ServiceStatus    @default(DRAFT)
  capabilities      Json             // shape varies by type; validated by Zod per-type
  disclosureLevel   DisclosureLevel  @default(ANONYMOUS)
  partner           Partner          @relation(fields: [partnerId], references: [id])
  @@unique([partnerId, type])        // one service per type per partner
}
```

Notes:
- `PartnerService.capabilities` is `Json` because the shape differs per service type. Validation happens at the application layer via Zod schemas keyed by `type`. This is deliberate flexibility, not laziness — adding a new service type doesn't require a migration.
- `@@unique([partnerId, type])` enforces "at most one of each service type per partner." A partner that offers two distinct manufacturing capabilities (e.g., powder + liquid) handles that within the capabilities JSON, not as two service rows.

### Migration cost if we change later

| Change | Cost if made in V1 | Cost if made post-V1 |
|---|---|---|
| Add a new ServiceType | trivial (one enum value) | trivial |
| Add a sub-role of ADMIN | small refactor | medium (RBAC sprinkled everywhere) |
| Split Partner into multiple top-level role types | n/a (recommended starting model) | **expensive** (auth, routes, payouts, RBAC) |
| Merge ServiceType into one flat thing | medium | expensive |

The recommended model has the lowest expected total cost across the likely directions of future change. Locking it in now is the right call.

---

## Decision 2 — Onboarding model

### Recommendation

**Creator side:** self-serve, automatic approval (per Simona's research, this is the validated mechanic).

**Partner side:** **curated hybrid — public marketing + lead capture + admin qualification + invited onboarding + admin activation.** No fully self-serve partner onboarding in V1.

### Why curated for partners

Simona's research is explicit on what motivates a Tier 1 small contract manufacturer to join:

> *"We have to keep hitting. Always looking for new opportunities. Working on sales and marketing. Maintaining Google ranking etc. Obviously, current clients feed us. But the contracts can get canceled anytime. So we can't just wait and pray."*

This is a manufacturer who wants a **sales conversation about filling their capacity**, not a SaaS signup form. They want to know:
- Will I get real, recurring volume?
- Is the platform serious or vapor?
- Who else is on board (social proof)?
- What are the financial terms?

A self-serve signup answers none of these. A 20-minute call answers all of them.

Three more reasons curation wins at V1:

1. **FDA/GMP verification is high-stakes.** Onboarding a non-compliant manufacturer pollutes the marketplace and exposes the platform to liability. Document review + facility check is human work.

2. **Trust signal to creators.** "Every partner is vetted by iLaunchify" is a real differentiator from Alibaba. That signal only holds if curation is real.

3. **Stripe Connect KYB is non-trivial.** Manufacturers and print providers have business structures, tax forms, beneficial-owner disclosures, etc. A guided process with a human in the loop reduces drop-off.

The trade-off: you become a bottleneck. The hybrid flow below mitigates this by minimizing the *amount* of human work per partner (target: 30–60 minutes total).

### The curated hybrid flow

```
PUBLIC                            ADMIN                           PARTNER
──────                            ─────                           ───────

Marketing page
"Become a Manufacturing Partner"
  │
  └── Lead form (10 fields)
      └────────────────────────► Admin reviews lead
                                  ├── Disqualify (rejection email)
                                  └── Qualify → schedule call

                                 Sales call (~20 min)
                                  ├── Confirm fit
                                  └── If yes:
                                      Create Partner row (status: DRAFT)
                                      Send magic-link invitation ──────► Partner clicks link
                                                                          └── Sets password, accepts ToS
                                                                              Partner status: INVITED → IN_PROGRESS

                                                                          Completes structured onboarding:
                                                                            - Company details
                                                                            - Service(s) capability profile(s)
                                                                            - Document uploads (FDA, GMP, insurance)
                                                                            - Stripe Connect KYB
                                                                            - Disclosure preferences
                                                                          Partner submits → status: UNDER_REVIEW

                                 Admin reviews submission ◄───────────────
                                  ├── Approve → status: ACTIVE
                                  │   (partner receives "you're live" email + first-routing notification preferences)
                                  └── Request changes (with note)
```

### What lives in the platform (V1)

- **Public marketing routes**:
  - `/partners/manufacturers` — page for manufacturers
  - `/partners/print` — page for print providers
  - `/partners/copackers` — page for co-packers
  - Each ending in a lead-capture form (one shared backend; the form remembers which page submitted).
- **Admin views**:
  - Leads inbox
  - Partner CRM (status: LEAD → DRAFT → INVITED → IN_PROGRESS → UNDER_REVIEW → ACTIVE | SUSPENDED)
  - Service review screen — view documents, verify cert numbers, etc.
- **Partner self-serve portal** (only accessible via invitation link until status = ACTIVE):
  - Profile completion wizard (multi-step)
  - Document uploads
  - Stripe Connect onboarding embed
  - Service profile builder (one wizard per service type)
- **Email transactional flows**:
  - Lead acknowledgment
  - Invitation to onboard
  - "You're live" notification
  - Reminders if onboarding stalled

### What's out of V1

- **Fully public partner self-serve.** Add only when curation becomes the bottleneck (likely > 50 active partners or > 5 leads/week).
- **API for bulk partner import.** Manual data entry for the first ~20 partners is fine.
- **Partner-to-creator direct messaging.** Wait until there's a complaint that needs solving.

### When to move to public self-serve

Move from curated to public self-serve onboarding when **two of three** are true:
- > 50 active partners and curation is materially slowing growth
- The shape of "a good partner" is documented well enough to encode it in a form (a fully tested screening flow)
- Document verification can be at least 80% automated (or outsourced cheaply)

Until then, curation is a feature, not a constraint.

---

## How this affects the rebuild scaffold

The current scaffold needs three small changes once you confirm:

1. **Add Partner + PartnerService + enums** to the schema port (when we land the Prisma schema from FOD).
2. **Add `apps/partner`** is already in the scaffold — confirm the V1 routes (per `apps/creator/README.md` pattern):
   - `/invite/[token]` — invitation entrypoint (passwordless first touch)
   - `/onboarding` — multi-step profile completion (gated until ACTIVE)
   - `/services` — manage active services post-activation
   - `/orders` — incoming order dispatches
   - `/settings` — profile, payouts, disclosure, hours
3. **Add admin views** to `apps/admin`:
   - `/admin/leads` — public lead inbox
   - `/admin/partners` — partner CRM (list + detail + status transitions)
   - `/admin/partners/[id]/services/[serviceId]/review` — document and capability review

Otherwise the architecture in `ARCHITECTURE.md` is unchanged.

---

## Open questions before locking this in

1. **What's the "lead form" capture set?** Suggestion: name, company, role, primary service type, monthly capacity, current client size, certifications list (multi-select), website, "what would success on the platform look like" (open text). Aim for ≤10 fields. *Status: open.*

2. **Who handles partner sales conversations in V1 — Pavel, Simona, or both?** This sets the realistic throughput. If it's one of you part-time, the "≤50 active partners" curation ceiling is real. *Status: open.*

3. **Do you want a publicly visible partner directory pre-onboarding?** I.e., do creators see "Acme Foods is a partner" before they place an order, or only at order time when the routing algorithm presents options? Recommendation: **only at order time in V1**, gated by service-type filters chosen by the creator. *Status: open.*

4. **Disclosure default at the partner level vs. the service level?** Recommendation: **per-service default** (set during service onboarding) with optional per-order override at routing time. ✅ **DECIDED 2026-05-18: per-service.**

5. **Do you want partners to be able to *decline* specific routed orders (e.g., "I don't have capacity this month")?** Recommendation: **yes**, with a 24-hour timeout, after which the order auto-reroutes to the next-best partner. This affects the order FSM. ✅ **DECIDED 2026-05-18: yes — with 24-hour timeout + auto-reroute.**

---

## Decisions log

- **2026-05-18** — Disclosure level is per-`PartnerService`, not per-Partner. Partner sets it during service onboarding; can be overridden per-order at routing time.
- **2026-05-18** — Partners can decline routed orders. Decline window: 24 hours from dispatch creation. On timeout (no accept/decline) or on explicit decline, the dispatch auto-reroutes to the next-ranked partner from the routing algorithm. After 3 reroutes the order is flagged for manual handling. Order FSM in `packages/orders` needs an `ASSIGNED → PENDING_ACCEPT → (ACCEPTED | DECLINED | TIMEOUT)` substate before `PRODUCING`.
