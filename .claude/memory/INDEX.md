# iLaunchify decision memory — index

Persistent decisions and project context. Each file is a single locked memory; touch sparingly. Read this index before working on an unfamiliar surface.

To migrate from Cowork auto-memory: copy the files from
`/Users/soundstation/Library/Application Support/Claude/local-agent-mode-sessions/<session>/spaces/<space>/memory/`
into this folder. They're already in the right markdown + frontmatter format.

## Active memory files (to copy in)

Run this once from the repo root to seed the folder:

```bash
SRC="$HOME/Library/Application Support/Claude/local-agent-mode-sessions"
# Find the most recent space folder (where the iLaunchify memory lives) and copy in
LATEST=$(ls -td "$SRC"/*/spaces/*/memory 2>/dev/null | head -1)
cp "$LATEST"/*.md .claude/memory/
```

## Categories

### Business model + scope

- `ilaunchify-business-model.md` — B2B production marketplace, NOT consumer
- `ilaunchify-orchestration-thesis.md` — multi-partner workflow graph platform
- `ilaunchify-storefront-deferred.md` — no public consumer surfaces
- `ilaunchify-earn-the-right-to-multi-tenant.md` — pre-PMF defaults

### Marketplace taxonomy

- `ilaunchify-marketplace-decisions-2026-06-01.md` — niches/Pet/price/tier/theme answers
- `ilaunchify-flavors-as-presets.md` — flavors are FlavorPreset rows, not products

### Partner system

- `ilaunchify-partner-onboarding.md` — 5-layer + 10-state FSM
- `ilaunchify-partner-team-model.md` — Membership + ServiceMembership
- `ilaunchify-leads-are-early-partners.md` — /admin/leads and /admin/partners share Partner table

### Creator system

- `ilaunchify-creator-onboarding.md` — 5-step stepper
- `ilaunchify-creator-team-model-v1.5.md` — V1.5+ deferred
- `ilaunchify-brand-assets-not-design-system.md` — Brand Identity = canvas asset library only
- `ilaunchify-subscription-tiers.md` — Maker/Builder/Agency
- `ilaunchify-tier-model-update-2026-05-28.md` — Master → Agency rename
- `ilaunchify-v15-tier-upgrade-shipped.md` — self-serve upgrade flow

### Compliance + sourcing

- `ilaunchify-ingredient-sourcing.md` — USDA + Library + Partner-private
- `ilaunchify-ingredient-governance.md` — sliding verification
- `ilaunchify-markets-and-regions.md` — US/CA/EU schema

### Identifiers

- `ilaunchify-gtin-model.md` — GTIN + Internal SKU escape hatch

### Design system

- `ilaunchify-design-system-v1.md` — pink/black/neon green LOCKED
- `ilaunchify-admin-surface-pattern.md` — cream hero + KPI + chip + table
- `ilaunchify-admin-sidebar-v3-locked.md` — sidebar tree LOCKED VERBATIM

### Phases

- `ilaunchify-g3-standardize-capabilities.md` — substrate/material/finish typed

### Engineering gotchas

- `ilaunchify-dev-prisma-restart.md` — restart Next after migrate
- `ilaunchify-migrate-dev-hangs-use-deploy.md` — `migrate dev` hangs locally; hand-author SQL + `migrate deploy`
- `ilaunchify-legacy-fod-frontend-squats-port-3000.md` — Docker container on 3000
- `ilaunchify-cross-app-links-must-use-helper.md` — marketingUrl/creatorUrl helpers
- `ilaunchify-cockroachdb-no-db-text.md` — no @db.Text
- `ilaunchify-rsc-boundary-config.md` — no Lucide icons across RSC boundary

### Collaboration

- `clarify-audience-before-building-customer-facing-flows.md` — confirm buyer/owner before checkout work
- `check-existing-work-before-building.md` — audit code+memory before new surfaces
- `ilaunchify-operational-philosophy-v1.md` — operational trust > margin
