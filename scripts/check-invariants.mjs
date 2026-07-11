#!/usr/bin/env node
// =============================================================================
// Platform invariant guard — the deterministic floor of the "monitor every
// build" system (scaffolded 2026-07-06).
// =============================================================================
//
// Companion to scripts/check-no-raw-tailwind-colors.mjs. That script guards the
// design palette; this one guards the *architecture* — the invariants that
// currently live only in CLAUDE.md + .claude/memory and are enforced by human
// vigilance. Every rule here is something a reviewer would otherwise have to
// remember. Encoding them makes new builds wire themselves in correctly instead
// of drifting.
//
// Philosophy: don't ask an agent to check what a script can PROVE. This catches
// the mechanical invariants cheaply and always. The `connection-review`
// subagent handles the judgment calls (natural wiring, input/output contracts,
// "what did this build forget") that a linter can't.
//
// Two severities:
//   • ERROR — a hard, zero-false-positive invariant. Fails the build (exit 1).
//   • WARN  — a high-signal heuristic that MIGHT be a legitimate exception.
//             Reported, never blocks — unless you pass --strict (then warns
//             fail too, for a clean-tree gate once the baseline is burned down).
//
// Run:  pnpm check:invariants           (errors fail, warns report)
//       pnpm check:invariants --strict  (warns fail too)
//
// Each check is a small function in CHECKS[]. Add a new invariant = add one
// entry. This is meant to grow as the platform grows — it is the living
// enforcement half of the flow-manifest idea.
// =============================================================================

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const STRICT = process.argv.includes('--strict')
const PRUNE = new Set(['node_modules', '.next', 'dist', '.turbo', '.git', 'FOD-reference'])

// ── file walker (mirrors check-no-raw-tailwind-colors.mjs) ───────────────────
function walk(dir, out, exts) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    if (PRUNE.has(name)) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out, exts)
    else if (exts.some((e) => p.endsWith(e))) out.push(p)
  }
}
function collect(roots, exts) {
  const files = []
  for (const r of roots) walk(r, files, exts)
  return files
}
const read = (f) => readFileSync(f, 'utf8')
const APPS = ['apps/admin', 'apps/creator', 'apps/partner', 'apps/marketing']
const CODE = [...APPS.map((a) => `${a}/src`), 'packages']

// =============================================================================
// CHECK 1 — CockroachDB rejects @db.Text  (ERROR)
// prisma generate fails P1012. STRING is already unbounded; use @db.String(N)
// for caps. Memory: ilaunchify-cockroachdb-no-db-text.
// =============================================================================
function checkNoDbText() {
  const hits = []
  for (const f of collect(['packages/db/prisma'], ['.prisma'])) {
    read(f).split('\n').forEach((line, i) => {
      const code = line.split('//')[0] // ignore comments (they often say "no @db.Text")
      if (/@db\.Text\b/.test(code)) hits.push(`${f}:${i + 1}  @db.Text — use bare String or @db.String(N)`)
    })
  }
  return { name: 'no-@db.Text (CockroachDB P1012)', level: 'error', hits }
}

// =============================================================================
// CHECK 2 — cross-app <Link> to a foreign app's route  (WARN)
// `<Link href="/pricing">` from inside creator/partner/admin 404s — those are
// marketing-owned surfaces. Use marketingUrl()/creatorUrl()/partnerUrl() + a
// plain <a>. We only flag prefixes that are UNAMBIGUOUSLY marketing-owned per
// CLAUDE.md to keep false positives at zero. Memory:
// ilaunchify-cross-app-links-must-use-helper.
// =============================================================================
const MARKETING_ONLY_PREFIXES = ['/pricing', '/business', '/launch/']
function checkCrossAppLink() {
  const hits = []
  const roots = ['apps/creator/src', 'apps/partner/src', 'apps/admin/src']
  for (const f of collect(roots, ['.tsx'])) {
    const src = read(f)
    // Only files that actually import next/link can render a broken <Link>.
    if (!/from ['"]next\/link['"]/.test(src)) continue
    src.split('\n').forEach((line, i) => {
      const m = line.match(/href=["'](\/[^"']*)["']/)
      if (m && MARKETING_ONLY_PREFIXES.some((p) => m[1].startsWith(p))) {
        hits.push(`${f}:${i + 1}  <Link href="${m[1]}"> is cross-app — use marketingUrl() + <a>`)
      }
    })
  }
  return { name: 'cross-app <Link> → foreign route', level: 'warn', hits }
}

// =============================================================================
// CHECK 3 — server action mutates without an audit write  (WARN)
// CLAUDE.md: "Every mutating action writes an AuditLog row via packages/audit."
// Heuristic: a file that declares 'use server' AND runs a prisma write but never
// imports @ilaunchify/audit is suspicious. Warn (some actions legitimately
// delegate the write to a service/FSM that audits internally). Memory:
// ilaunchify-security-architecture-locked.
// =============================================================================
const PRISMA_WRITE = /\bprisma\.\w+\.(create|update|delete|upsert|createMany|updateMany|deleteMany)\b/
// Reviewed exceptions (triaged 2026-07-06) — ephemeral/scratch state, onboarding
// step-saves, version-tracked Studio canvas writes, or writes that delegate to a
// service/FSM that audits internally. Everything NOT here is the real backlog.
const AUDIT_ALLOWLIST = new Set([
  'apps/creator/src/app/(checkout)/products/[productId]/checkout/actions.ts', // CheckoutDraft scratch state
  'apps/creator/src/app/(dashboard)/_actions/checklist-actions.ts',           // onboardingProgress JSON
  'apps/creator/src/app/(studio)/products/[productId]/design/canvas/actions.ts',        // Design/DesignVersion (version-tracked)
  'apps/creator/src/app/(studio)/products/[productId]/design/canvas/flavor-actions.ts', // per-flavor Design rows
  'apps/creator/src/app/(studio)/products/[productId]/design/canvas/mockup-render-actions.ts', // derived render Assets
  'apps/partner/src/app/(dashboard)/dashboard/welcome-modal-actions.ts',      // dismiss welcome modal flag
  'apps/partner/src/app/(onboarding)/onboarding/company/actions.ts',          // company profile step-save
  'apps/marketing/src/app/feedback/actions.ts',                              // delegates to createTicket (audits internally)
  'apps/marketing/src/lib/guest-gate-actions.ts',                            // guest default-Brand bootstrap
])
function checkMutationHasAudit() {
  const hits = []
  for (const f of collect(APPS.map((a) => `${a}/src`), ['.ts', '.tsx'])) {
    if (AUDIT_ALLOWLIST.has(f)) continue
    const src = read(f)
    if (!/['"]use server['"]/.test(src)) continue
    if (!PRISMA_WRITE.test(src)) continue
    const audits = /@ilaunchify\/audit|logAudit|logAuditAs|logSystemAudit/.test(src)
    if (!audits) hits.push(`${f}  'use server' + prisma write, no @ilaunchify/audit import`)
  }
  return { name: "server-action mutation writes AuditLog", level: 'warn', hits }
}

// =============================================================================
// CHECK 4 — FSM-governed status changed by a raw prisma.update  (WARN)
// CLAUDE.md: "Every product/partner state change goes through an FSM helper,
// never inline prisma.update." The FSMs live in packages/orders (order-fsm,
// dispatch-fsm) + packages/academy/fsm + packages/support. Flag a direct
// prisma.<model>.update whose payload sets `status:` OUTSIDE those FSM homes.
// Memory: ilaunchify-partner-onboarding (activation FSM), routing-owner-pinned.
// =============================================================================
const FSM_HOMES = ['packages/orders/', 'packages/academy/', 'packages/support/', 'packages/db/prisma/seed']
const FSM_MODELS = ['order', 'dispatch', 'productTemplate', 'partner', 'partnerService', 'ticket']
// Reviewed exceptions (triaged 2026-07-06) — service-level toggles that audit
// inline, or non-lifecycle status columns. Keyed by file:line; if the line moves
// the entry goes stale and re-warns for re-review, which is the intended behavior.
const FSM_ALLOWLIST = new Set([
  'apps/admin/src/app/(dashboard)/partners/[partnerId]/actions.ts:270', // PartnerService ACTIVE/PAUSED toggle (audited)
  'apps/admin/src/app/(dashboard)/products/actions.ts:319',             // guarded PUBLISHED⇄PAUSED (audited; no PT FSM home) — re-reviewed 2026-07-11, line moved 295→319
  'apps/admin/src/lib/partner-ops-worker.ts:156',                       // cron PartnerService→PAUSED (logSystemAudit)
  'apps/admin/src/lib/print-coverage-worker.ts:78',                     // cron ProductTemplate auto-pause (logSystemAudit)
  'apps/admin/src/app/(dashboard)/partners/actions.ts:65',              // admin re-invite → INVITED: audited governed override from any non-ACTIVE state (2026-07-07)
])
// A file is "guarded" when it invokes a transition assert/allow helper — the
// established pattern (assertOrderTransition + inline update + audit). Presence
// of a guard call means status updates in that file route through the FSM, so
// they satisfy the invariant. File-level (not per-line) by design: a file that
// adopts the pattern is trusted for its status writes.
const FSM_GUARD_RX = /assert\w*Transition\s*\(|isAllowedTransition\s*\(|isPartnerTransitionAllowed\s*\(|isProductTemplateTransitionAllowed\s*\(/
function checkFsmBypass() {
  const hits = []
  const rx = new RegExp(`\\bprisma\\.(${FSM_MODELS.join('|')})\\.update(Many)?\\s*\\(`, 'g')
  for (const f of collect(CODE, ['.ts', '.tsx'])) {
    if (FSM_HOMES.some((h) => f.includes(h))) continue
    if (/\.test\.ts$/.test(f)) continue
    const src = read(f)
    if (FSM_GUARD_RX.test(src)) continue // routes status changes through an FSM guard
    const lines = src.split('\n')
    lines.forEach((line, i) => {
      if (!rx.test(line)) return
      // Look at the next ~6 lines for a status: assignment in the payload.
      const window = lines.slice(i, i + 6).join('\n')
      if (/\bstatus\s*:/.test(window) && !FSM_ALLOWLIST.has(`${f}:${i + 1}`)) {
        hits.push(`${f}:${i + 1}  raw prisma.update sets status — route through an FSM helper`)
      }
    })
  }
  return { name: 'FSM-governed status via raw prisma.update', level: 'warn', hits }
}

// =============================================================================
// CHECK 5 — schema pushed but Prisma client not regenerated  (WARN, local only)
// The 3-layer stale-client trap (memory, node_modules, .next). If schema.prisma
// is newer than the generated client, dev will hit "Property X does not exist".
// Local-only signal; skipped in CI where the client is always freshly generated.
// Memory: ilaunchify-dev-prisma-restart.
// =============================================================================
// Find the schema copy Prisma EMBEDS inside the generated client (verbatim at
// generate time). Comparing its CONTENT to the source schema catches a schema
// edited without `db:generate` even when mtimes lie — the exact miss that let a
// stale `Favorite.priceSnapshotCents` reach a failing typecheck (2026-07-07).
function findEmbeddedSchemas() {
  const out = []
  const top = 'node_modules/.prisma/client/schema.prisma'
  if (existsSync(top)) out.push(top)
  const pnpm = 'node_modules/.pnpm'
  if (existsSync(pnpm)) {
    for (const dir of readdirSync(pnpm)) {
      if (!/@prisma\+client@/.test(dir)) continue
      const p = join(pnpm, dir, 'node_modules/.prisma/client/schema.prisma')
      if (existsSync(p)) out.push(p)
    }
  }
  return out
}
// Identifier set (model/field/enum names). Prisma canonicalizes (reorders +
// reformats) the schema it embeds, so exact-text compare false-positives — but
// the SET of identifiers is invariant. A source identifier absent from the
// client's embedded schema = a field added without `db:generate` (stale client).
const schemaIdents = (s) => new Set(s.replace(/\/\/[^\n]*/g, ' ').match(/[A-Za-z_][A-Za-z0-9_]*/g) || [])
function checkPrismaClientFresh() {
  if (process.env.CI) return { name: 'prisma client freshness (skipped in CI)', level: 'warn', hits: [] }
  const schema = 'packages/db/prisma/schema.prisma'
  const hits = []
  if (existsSync(schema)) {
    const want = schemaIdents(read(schema))
    const embedded = findEmbeddedSchemas()
    if (embedded.length === 0) {
      hits.push('generated Prisma client not found — run: pnpm db:generate')
    } else {
      for (const e of embedded) {
        const have = schemaIdents(read(e))
        const missing = [...want].filter((t) => !have.has(t))
        if (missing.length > 0) {
          const sample = missing.slice(0, 6).join(', ')
          hits.push(`generated client is missing ${missing.length} schema identifier(s) (${sample}${missing.length > 6 ? '…' : ''}) — run: pnpm db:generate && rm -rf apps/*/.next`)
          break
        }
      }
    }
  }
  return { name: 'Prisma client freshness (stale-client trap)', level: 'warn', hits }
}

// =============================================================================
// CHECK 6 — hardcoded platform / creator fee constant outside the SSOT  (WARN)
// FEE_MODEL_RECONCILIATION_SPEC_2026-07-09: the creator platform fee is the
// subscription-tier rate (15/12/8%), resolved ONCE via @ilaunchify/plans
// (resolveCreatorFeeBps). No app/package may re-declare a platform-fee constant —
// that is exactly the drift the 2026-07-09 audit found (flat 5% charged while
// 15/12/8 advertised; two PLATFORM_FEE_BPS = 500 copies). Any NEW hardcoded fee
// constant re-warns. The known Phase-1 offenders are allowlisted so today's
// baseline is 0 (CI --strict stays green); remove an entry as Phase 1 fixes it.
// =============================================================================
const FEE_CONST_RX = /\bPLATFORM_FEE_BPS\s*=\s*\d+|\bfeePct:\s*0\.(?:15|12|08)\b/
// Reviewed exceptions (2026-07-09) — the exact call sites the fee-reconciliation
// spec migrates to resolveCreatorFeeBps. Delete the entry when the file is fixed.
const FEE_CONST_ALLOWLIST = new Set([
  // cart-actions.ts + route-actions.ts retired 2026-07-09 — both now resolve via
  // resolveCreatorFeeBps (FEE_CREATOR_CHECKOUT_PATCH); the guardrail enforces them now.
  'apps/creator/src/app/(dashboard)/subscriptions/page.tsx',                        // feePct display copy → read from plans (spec §3)
])
function checkNoHardcodedFee() {
  const hits = []
  for (const f of collect(CODE, ['.ts', '.tsx'])) {
    if (f.includes('packages/plans/')) continue // the SSOT home
    if (/\.test\.[tj]sx?$/.test(f)) continue
    if (FEE_CONST_ALLOWLIST.has(f)) continue
    read(f).split('\n').forEach((line, i) => {
      const code = line.split('//')[0]
      if (FEE_CONST_RX.test(code)) {
        hits.push(`${f}:${i + 1}  hardcoded platform-fee constant — resolve via @ilaunchify/plans resolveCreatorFeeBps`)
      }
    })
  }
  return { name: 'no hardcoded platform-fee constant (fee SSOT)', level: 'warn', hits }
}

// =============================================================================
// CHECK 7 — new model using @default(cuid()) instead of uuid()  (WARN)
// CLAUDE.md: "id is String @id @default(uuid()) not cuid() ... (no sequential
// hotspots)." cuid v1's monotonic prefix funnels inserts into one CockroachDB
// range = write hotspot. 136 legacy models predate the rule (frozen baseline
// below); this FREEZES growth so NEW models can't reintroduce the hotspot. When
// a legacy model is migrated cuid→uuid it simply stops matching — harmless.
// Audit finding H3 (AUDIT_2026-07-09_CONSISTENCY.md). Model-name keyed = never
// goes stale on line shifts.
// =============================================================================
const CUID_BASELINE = new Set([
  'Account','Asset','AuditLog','BannedIngredient','Brand','CancellationRequest','CarrierAccount','CarrierServiceRule','Category','CertificateAssetVariant','CertificateType','CertificateTypeRequest','Channel','ChannelConnection','ChannelInboundPlan','ChannelProductLink','Charge','CheckoutDraft','ComplianceCheck','ContractTerms','ControversialIngredient','CreatorOnboardingProgress','CreatorProfile','CreatorSavedAddress','Design','DesignFinishApplication','DesignLibraryItem','DesignVersion','DieCutTemplate','Dispute','DocumentAccessLog','FcAwardLog','FeeRule','FinishType','FlavorPreset','FlavorRecipeOptional','FlavorRecipeReplacement','FlavorRecipeSlot','InboundReceipt','InboundReceiptLine','Ingredient','IngredientUsage','LabelClaimConsent','LabelingSymbol','LabelingSymbolVariant','LifestyleTag','Market','MarketConfig','MarketLanguage','MockupTemplate','Niche','NicheAssignmentAudit','NicheRule','Notification','NotificationPreference','Order','OrderDispatch','OrderDispute','OrderItem','OrderItemFlavor','OrderSettingsOverride','PackagingMaterial','PackagingSurface','PackagingSymbol','PackagingSymbolVariant','PackagingSystem','PackagingType','Partner','PartnerBlackoutDate','PartnerCertificateInstance','PartnerClawback','PartnerCommercialTerms','PartnerDocument','PartnerFile','PartnerFinish','PartnerIntegrationCapability','PartnerInvite','PartnerMembership','PartnerOnboardingProgress','PartnerOperationalCapability','PartnerOperationalStandards','PartnerService','PartnerServiceMembership','PartnerServicePackagingMaterial','PartnerServiceSubstrate','PartnerStrike','PartnerVerificationSection','PlanFeature','PlatformFeeConfig','PlatformMandatedStandards','Product','ProductChangeApprovalRule','ProductNote','ProductOptionAxis','ProductOptionRule','ProductOptionValue','ProductReviewItem','ProductSampleOption','ProductSpecSheet','ProductTemplate','ProductTemplateFee','ProductTemplatePricingTier','ProductTemplateVariant','ProductionLot','ProductionSubscription','ProofRound','ReceivingDiscrepancy','Recipe','RecipeIngredient','Refund','Region','RulePack','RulePackVersion','SampleCredit','Session','ShipmentDocument','ShipmentLeg','SocialAccount','StorageAgreement','StorageReleaseOrder','Subcategory','SubscriptionPlan','Substrate','SupportCannedReply','Template','TemplateIngredientReplacement','TemplateIngredientSlot','TemplateOptionalIngredient','TemplateVersion','Ticket','TicketCategory','TicketEvent','TicketReply','Transfer','TypographyFont','User',
])
function checkNoNewCuid() {
  const hits = []
  const schema = 'packages/db/prisma/schema.prisma'
  if (!existsSync(schema)) return { name: 'no new cuid() id (uuid mandate)', level: 'warn', hits }
  let model = null
  read(schema).split('\n').forEach((line, i) => {
    const mm = line.match(/^model\s+(\w+)\s*\{/)
    if (mm) { model = mm[1]; return }
    if (/@default\(cuid\(\)\)/.test(line) && model && !CUID_BASELINE.has(model)) {
      hits.push(`${schema}:${i + 1}  model ${model} — new model on @default(cuid()); use @default(uuid()) (CockroachDB hotspot, H3)`)
    }
  })
  return { name: 'no new cuid() id (uuid mandate)', level: 'warn', hits }
}

// =============================================================================
// CHECK 8 — new Decimal money field  (WARN)
// Money is integer cents everywhere; the channel layer's Decimal-dollars fields
// are the isolated exception the audit flagged (M1) — a ×100/rounding seam. This
// FREEZES the set so no NEW money field lands as Decimal. Reviewed exceptions are
// keyed by Model.field (stable across line shifts). Audit finding M1.
// =============================================================================
const DECIMAL_MONEY_ALLOWLIST = new Set([
  'ChannelProductLink.price',   // channel-layer dollars (M1) — reconcile to cents later
  'ChannelVariantLink.price',
  'ChannelOrder.totalPrice',
  'ChannelOrderLine.unitPrice',
  'RoomMilestone.amount',       // co-creation escrow milestone
])
const MONEY_FIELD_RX = /^\s*(price|unitPrice|totalPrice|amount|subtotal)\s+.*@db\.Decimal/
function checkNoNewDecimalMoney() {
  const hits = []
  const schema = 'packages/db/prisma/schema.prisma'
  if (!existsSync(schema)) return { name: 'no new Decimal money field (cents SSOT)', level: 'warn', hits }
  let model = null
  read(schema).split('\n').forEach((line, i) => {
    const mm = line.match(/^model\s+(\w+)\s*\{/)
    if (mm) { model = mm[1]; return }
    const fm = line.match(MONEY_FIELD_RX)
    if (fm && model && !DECIMAL_MONEY_ALLOWLIST.has(`${model}.${fm[1]}`)) {
      hits.push(`${schema}:${i + 1}  ${model}.${fm[1]} is Decimal money — use Int cents (M1)`)
    }
  })
  return { name: 'no new Decimal money field (cents SSOT)', level: 'warn', hits }
}

// =============================================================================
// CHECK 9 — stray /api/dev/login reference  (ERROR)
// H5 (H5_AUTH_DEVLOGIN_RETIREMENT_SPEC_2026-07-11): /api/dev/login forges a
// session in one GET. It is now dead unless BOTH non-prod AND ENABLE_DEV_LOGIN
// (A0), and every client affordance was removed (A1/A2). Any NEW reference to it
// in app code is a security regression — a rehydrated bypass. The route file
// itself is excluded; the 3 admin studio bridges legitimately hop through it (each
// already gated behind ENABLE_DEV_LOGIN) and are allowlisted. Baseline is 0, so
// this is a hard ERROR (fails CI without needing --strict).
// =============================================================================
const DEV_LOGIN_ALLOWLIST = new Set([
  // Admin → creator-Studio session bridges. Reference /api/dev/login ONLY inside a
  // `useDevLogin = NODE_ENV!=='production' && ENABLE_DEV_LOGIN==='true'` branch;
  // otherwise they redirect straight to /studio on the real shared session (H5 A2).
  'apps/admin/src/app/go/design-studio/route.ts',
  'apps/admin/src/app/go/dieline-studio/route.ts',
  'apps/admin/src/app/go/packaging-studio/route.ts',
])
function checkNoStrayDevLogin() {
  const hits = []
  const roots = APPS.map((a) => `${a}/src`)
  for (const f of collect(roots, ['.ts', '.tsx'])) {
    const rel = f.replace(/\\/g, '/')
    if (rel.endsWith('api/dev/login/route.ts')) continue // the route's own home
    if (DEV_LOGIN_ALLOWLIST.has(rel)) continue
    read(f).split('\n').forEach((line, i) => {
      const code = line.split('//')[0] // a mention in a comment isn't a live bypass
      if (code.includes('/api/dev/login')) {
        hits.push(`${rel}:${i + 1}  references /api/dev/login — the dev-login bypass is retired (H5); use signIn('resend')/real /login`)
      }
    })
  }
  return { name: 'no stray /api/dev/login reference (H5 bypass retired)', level: 'error', hits }
}

// =============================================================================
const CHECKS = [
  checkNoDbText,
  checkCrossAppLink,
  checkMutationHasAudit,
  checkFsmBypass,
  checkPrismaClientFresh,
  checkNoHardcodedFee,
  checkNoNewCuid,
  checkNoNewDecimalMoney,
  checkNoStrayDevLogin,
]

let errorCount = 0
let warnCount = 0
const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', reset: '\x1b[0m' }

console.log(`\n${C.dim}iLaunchify platform invariants${STRICT ? ' (--strict)' : ''}${C.reset}\n`)

for (const check of CHECKS) {
  const { name, level, hits } = check()
  if (hits.length === 0) {
    console.log(`${C.green}✓${C.reset} ${name}`)
    continue
  }
  const isError = level === 'error' || STRICT
  const mark = isError ? `${C.red}✖${C.reset}` : `${C.yellow}⚠${C.reset}`
  console.log(`${mark} ${name}  ${C.dim}(${hits.length})${C.reset}`)
  for (const h of hits) console.log(`    ${h}`)
  if (level === 'error') errorCount += hits.length
  else warnCount += hits.length
}

console.log('')
if (errorCount > 0 || (STRICT && warnCount > 0)) {
  console.log(`${C.red}Invariant check failed${C.reset} — ${errorCount} error(s), ${warnCount} warning(s).\n`)
  process.exit(1)
}
if (warnCount > 0) {
  console.log(`${C.yellow}${warnCount} warning(s)${C.reset} — review, then run with --strict once the baseline is clean.\n`)
} else {
  console.log(`${C.green}All invariants hold.${C.reset}\n`)
}
process.exit(0)
