# Design Studio Versioning — Per-Slot History, Named Versions & Alternates

**Status: PLANNED — decisions locked with Pavel 2026-07-05.**
Supersedes nothing; *extends* the shipped Version History system (`docs/VERSION_HISTORY.md`,
memory `ilaunchify-version-history.md`). Builds on the per-flavor-labels substrate
(`docs/HANDOFF-TO-CODE-per-flavor-labels.md`).

---

## 1. Problem

The shipped Version History (SavedIndicator + drawer + `EditSnapshot` ring buffer) is
**global to the product's working design**. But the Studio edits a *matrix*:

```
product × surface (label / wrap / box die-line) × flavor (base + per-flavor overrides)
```

A creator designing a multi-flavor product with an extra wrap/box die-line needs to:

1. Autosave + browse history **per slot** (this flavor, this surface) — not roll back
   vanilla because they experimented on chocolate.
2. **Name-save** a design moment they like, keep it forever, return to it any time.
3. Keep a design they like **while trying a second candidate for the same slot**,
   compare the two, and pick a winner — without duplicating the whole product.

The creator is in absolute control of what gets kept. Nothing is auto-deleted except
unpinned autosaves past the ring buffer.

## 2. Industry survey (what we borrow, what we reject)

| Platform | Model | Take |
|---|---|---|
| Canva | Linear auto-history (Pro-gated), preview-compare, Restore / Make-a-copy | Borrow: preview-before-restore, "restore = new version on top" (never destructive). Reject: whole-doc copies for experimentation (drift + clutter). |
| Figma | Linear history + **named versions** + **branching w/ merge** | Borrow: named versions as first-class checkpoints. Reject: branch/merge — merge semantics confuse users and packaging has nothing to merge; you pick a winner. |
| Adobe cloud docs | Auto-versions w/ retention window + user-marked kept forever | Borrow: the constant — **auto-saves are disposable, named saves are permanent**. |

**Our model = 3 layers, no branching:**

1. **Autosave ring buffer** per slot (exists — needs slot-scoping wired through).
2. **Named versions (pins)** per slot — explicit, labeled, permanent, restorable.
3. **Alternates** — sibling design candidates for the *same slot*. One is **Active**
   (feeds production/preview/export); others are drafts, each with its own autosave +
   history. Compare side-by-side → **Make Active**. No merge, ever.

## 3. Data model (all additive; CockroachDB-safe — no `@db.Text`, no drops)

### 3.1 What already exists (do not rebuild)

- `Design` — keyed per `(productId, flavorPresetId)`; `flavorPresetId = null` = shared
  BASE design; one Design per surface/die-cut (see `showsCertifications` comment).
- `DesignVersion` — live working row + order-locked export lineage. Rows referenced by
  `orderItems` are **never deletable** (Phase G8 rule — unchanged).
- `EditSnapshot` — polymorphic `(entityType, entityId)` history; `kind` AUTO/MANUAL/
  MILESTONE; `pinned` exempt from prune; ring buffer keep-last-10 + coalesce <2 min;
  `thumbnail` PNG data-URL; asset REFS only in `snapshot` (never embedded data-URLs).

Because `EditSnapshot.entityId = Design.id` and Design is already per-flavor-capable,
**per-slot history falls out of the existing engine** once callers stop collapsing
everything onto the base Design. No new history model needed.

### 3.2 New columns on `Design` (alternates)

```prisma
model Design {
  // ... existing ...
  // — Alternates (docs/DESIGN_STUDIO_VERSIONING.md §3.2). Sibling candidates for
  // the same slot (productId, surface, flavorPresetId). Exactly one sibling has
  // isActiveAlternate = true (app-logic enforced, same pattern as
  // showsCertifications); the Active one is what production/preview/export use.
  isActiveAlternate Boolean @default(true)
  alternateName     String? // creator label: "Bold v2", "Minimal test"
  alternateSort     Int     @default(0)
  // Soft self-reference: the Design.id this was forked FROM (lineage display
  // only; null for originals). No FK — same soft-FK convention as flavorPresetId.
  forkedFromId      String?
}
```

Existing rows: default `isActiveAlternate = true` → every current Design is its own
group's Active. **Zero backfill.**

Slot identity = `(productId, surfaceKey, flavorPresetId)`. ✅ **ANSWERED (Code,
2026-07-05):** surface disambiguation today is **positional and effectively unkeyed** —
`Design` has no surface/die-line column (the die-line resolves from the VARIANT side,
`variant.dieCutTemplateId`, never from the Design); no code path ever creates a second
Design for the same `(productId, flavorPresetId)` (both writers are findFirst +
create-if-missing on that pair); and the only multi-Design consumer
(`cert-badge-actions#ensureCertHostSurface`) orders by `createdAt asc` and calls
`designs[0]` "primary". → **Add nullable `Design.surfaceKey String?` in the Phase 2
migration** (null = the single default surface; matches every existing row, zero
backfill). ⚠ Phase 2/3 must also add `isActiveAlternate: true` to every existing
`findFirst` reader (loadDesignJson, checkout lockedDesign, mockup-render,
dieline-compliance) or they may resolve a draft alternate.

### 3.3 New enum values (additive)

- `SnapshotKind`: add `PROMOTION` — auto-pin written to the *outgoing* Active on
  promote (label: `Replaced by "<name>" — <date>`). Pinned, exempt from prune.
- `AuditLog` entity actions: `DESIGN_ALTERNATE_CREATED | RENAMED | PROMOTED | DELETED`,
  `DESIGN_VERSION_RESTORED_BY_ADMIN`.

### 3.4 Retention (unchanged + one addition)

- Autosaves: ring buffer 10 per entity, coalesce <2 min (existing engine, untouched).
- Pins/milestones/PROMOTION snaps: kept forever.
- Deleting an alternate Design: soft-guard — refuse if any of its `DesignVersion`s are
  order-locked; otherwise confirm-dialog delete, snapshots orphan harmlessly
  (existing TTL-prune covers them).

## 4. UX spec

### 4.1 Scope model — history follows the canvas

The Version History drawer is **always scoped to the slot currently on canvas**
(current flavor + current surface + current alternate). Header shows the scope
explicitly: `History — Chocolate · Front label · "Bold v2"`. Switching flavor or
surface in the existing switchers re-scopes the drawer. No global mega-timeline in V1
(a product-level "recent activity" list is a V2 nice-to-have, read-only).

### 4.2 Named versions

- `⌘/Ctrl+S` and a **Save version** button in the top bar → inline name field
  (default `Version N — <date>`), creates a pinned MANUAL snapshot with thumbnail.
- Drawer: pinned section on top (named, thumbnails, rename/unpin via kebab), autosaves
  below (timestamps, grouped by day). Hover = large preview. **Restore** puts the
  selected state on canvas *as a new autosave on top* (Canva semantics — never
  destroys newer history). Secondary action: **Open as new alternate** (§4.3).

### 4.3 Alternates

- **Alternates strip** in the Studio top bar (next to the flavor switcher): pill per
  alternate — Active gets a pink `#FF2E63` dot; drafts are neutral. `+ New alternate`
  → "Duplicate current" | "Start blank" | "Generate with AI" (feeds the existing
  AI try-on loop; an accepted `ai-concept` can land AS a new alternate).
- Clicking a pill swaps the canvas to that alternate (its own autosave + history).
- **Compare** (decision locked: side-by-side renders): from strip or drawer, pick 2 →
  modal with two static high-res flat renders (+ 3D thumbnail toggle where the
  packaging-3d preview exists), synced zoom on the static images, names + last-edited
  underneath, `Make this Active` under each. Live dual-canvas explicitly deferred
  (double Fabric instance = Code's canvas hot zone).
- **Promote (Make Active)** — decision locked: *confirm + snapshot*. Always allowed;
  confirm dialog states consequences ("becomes the production design for
  Chocolate · Front label"); outgoing Active gets an auto-pinned PROMOTION snapshot;
  AuditLog row written; in-flight orders keep their locked `DesignVersion` regardless.
  If the product is published, dialog adds a warning line — but no re-approval gate
  in V1 (revisit if partner complaints appear).

### 4.4 Tier gating — decision locked: gate COUNT only

History + named versions: **all tiers, uncapped** (safety is never paywalled).
Alternates per slot: **Maker 2 · Builder 5 · Agency unlimited** — consistent with the
Brand Kit precedent (gate counts, not capability). Hitting the cap shows the standard
upgrade nudge → `/settings/plan`. Limits live in `packages/plans` (single lookup,
no scattered constants).

### 4.5 Empty/edge states

- One alternate only → strip collapses to the `+` button (zero clutter for the 90%).
- PER_FLAVOR topology with no per-flavor design yet → flavor inherits BASE; first edit
  forks per the shared-base+overrides mechanics already locked (unchanged here).
- Deleting the Active alternate is blocked ("Make another design Active first").

## 5. Permissions matrix (careful — admin ≠ creator)

| Capability | Creator (own product) | Admin (template-author mode) | Admin (viewing creator product) | Partner/Builder |
|---|---|---|---|---|
| Autosave + browse history | ✔ | ✔ (on templates, own scope) | 👁 read-only | record-only (locked 2026) |
| Save/rename/unpin named version | ✔ | ✔ | ✖ | ✖ |
| Restore | ✔ | ✔ (templates) | ⚠ support-only: allowed but writes `DESIGN_VERSION_RESTORED_BY_ADMIN` AuditLog AND appears labeled "Restored by iLaunchify support" in the creator's drawer — never silent | ✖ |
| Create/delete/compare alternates | ✔ (tier-capped) | ✔ on templates (uncapped) | ✖ | ✖ |
| Promote Active | ✔ (confirm + snapshot) | ✔ on templates | ✖ | ✖ |

Server side: every action goes through the centralized ownership guards in
`packages/auth` (SECURITY_ARCHITECTURE — tenant isolation is threat #1; no ad-hoc
checks) and admin paths through `requireCapability`. Every mutation writes AuditLog.

## 6. Ownership map (two-agent rule — single writer per file)

| Zone | Owner |
|---|---|
| Canvas internals, Fabric serialization, `useAutoSave`/`useCanvasHistory`, the 2 uncommitted flavor-scoping lines already in Code's tree | **Code** — hand off §3.2 schema + §4.1 scoping as a spec; do not touch until Code commits its pending lines |
| Prisma schema migration, `packages/plans` limits, server actions (alternates CRUD, promote, admin restore), AuditLog wiring | Either — announce before starting; schema via `prisma-migrator` conventions (`pnpm db:push` → `db:generate` → `rm -rf apps/*/.next`) |
| Drawer scope header, alternates strip, compare modal, admin read-only drawer | Cowork (presentational, outside canvas core) — but the strip mounts in Studio top-bar chrome: announce, single-writer |

## 7. Phases + checklist

Check items off as they land. One phase = one commit train; commit immediately.

### Phase 0 — Slot-scoped history ✅ (Code, 2026-07-05)
- [x] Code commits the 2 uncommitted base-design-scoping lines — turned out already
      committed in `78f111a9` (per-flavor Phase 1); tree was clean, nothing blocked
- [x] Snapshot actions accept the on-canvas scope: `DesignScope { designId?, flavorPresetId? }`
      threaded through snapshot/list/restore. `designId` (ownership-re-checked) is the
      alternates-proof key for Phase 3; the shell passes `flavorPresetId` today since
      pre-alternates the flavor slot resolves deterministically
- [x] History panel re-scopes on flavor switch (full-reload switcher → scope fixed per
      mount) + scope header line (`Version history — Chocolate`) via a new optional
      `scopeLabel` prop on `VersionHistoryPanel` (canvas-internals file — announced;
      Cowork's drawer polish can restyle freely)
- [x] Regression: single-flavor products pass `flavorPresetId: null` → identical
      where-clause to the old hard-coded base scoping; no scope line rendered

### Phase 1 — Named versions polish ✅ (Cowork, 2026-07-05)
- [x] `⌘S` + Save-version button → named pinned snapshot w/ thumbnail (SaveVersionDialog; top-bar BookmarkPlus; suggested "Version N — <date>")
- [x] Drawer: pinned "Named versions" section w/ rename/unpin kebab; autosaves grouped by day; AUTO rows get "Keep & name…" (pin + label in one gesture)
- [x] Restore = non-destructive — verified: restore pins a "Before restore" MILESTONE, copies JSON into the working row, newer history untouched
- [x] Hover large-preview in drawer (transient — reverts to selection on leave)
- [x] Engine hardening: `coalesceTarget` now filters kind === 'AUTO' so an UNPINNED named version is prunable but never coalesce-overwritten (+ test case 7)

### Phase 2 — Schema: alternates substrate
- [ ] Confirm surface-keying question (§3.2 ⚠) with Code
- [ ] Migration: `isActiveAlternate` / `alternateName` / `alternateSort` / `forkedFromId` (+ `surfaceKey` if needed); `SnapshotKind.PROMOTION`; AuditLog actions
- [ ] `pnpm db:push` → `db:generate` → `rm -rf apps/*/.next` → restart (3-layer stale-client rule)
- [ ] Server actions: createAlternate (duplicate/blank), rename, delete (order-lock guard), promote (confirm token + PROMOTION snapshot + AuditLog)
- [ ] Ownership guards via `packages/auth` on every action; typecheck green

### Phase 3 — Alternates UI ✅ (Cowork, 2026-07-05 — two follow-ups noted)
- [x] Alternates strip (AlternatesStrip.tsx: collapse-when-single, pink Active dot, cap nudge → /settings/plan; caps as pure data `designAlternateCap()` in packages/plans/codes.ts — client-safe, DB-backed PlanFeature wiring stays Phase 5)
- [x] New-alternate menu: Duplicate current / Start blank · ⚠ "Generate with AI" entry deferred to the AI try-on hookup (accepted ai-concept lands as a new alternate — wire in ai-create loop)
- [x] Canvas swap between alternates — full-reload nav `?alt=<designId>` (same pattern as `?flavor=`); page loads by exact designId; historyScope.designId keeps each sibling's autosave + history stream separate
- [x] Compare modal (CompareAlternatesModal.tsx): side-by-side static renders (offscreen fabric StaticCanvas @1.5×; live canvas gets a fresh grab), synced zoom + scroll, Make-Active per side · ⚠ 3D thumb toggle deferred until packaging-3d renders from JSON (G-phases)
- [x] Promote confirm dialog (PromoteAlternateDialog.tsx) + PUBLISHED warning line (Product.status threaded through page → shell)
- [x] "Open as new alternate" from history drawer (createAlternateFromSnapshot — forks any snapshot into a draft sibling)

### Phase 4 — Admin + permissions (Cowork, 2026-07-05 — template part re-scoped)
- [ ] ⚠ Template-author mode alternates RE-SCOPED: admin template authoring is product-less (no Design rows — history/alternates hang off Design). Needs a decision: either author templates against a scratch Design or add template-side versioning to the library substrate. Parked — don't build until Pavel picks.
- [x] Admin read-only creator history view + support-restore: `/admin/design-history` (lookup by product id / GTIN / SKU → slots + alternates → snapshot list). Restore mirrors creator semantics (pin-before-restore), writes `DESIGN_VERSION_RESTORED_BY_ADMIN` AuditLog AND pins "Restored by iLaunchify support" in the creator's drawer — never silent. NOT in sidebar (sidebar v3 LOCKED — propose entry separately).
- [x] `requireCapability` on all admin paths: view = `creators:read`, restore = `tickets:admin` (support lead)

### Phase 5 — Gating + hardening (Cowork, 2026-07-05)
- [x] Alternate caps in `packages/plans` (pure `designAlternateCap`, Maker 2 / Builder 5 / Agency ∞) — client nudge (strip) AND server enforcement in createAlternate + createAlternateFromSnapshot
- [x] Pure-logic tests: snapshots-engine (unpin/coalesce contract) + alternate-caps (node --experimental-strip-types pattern; caught a real `??`-swallows-null bug where agency fell back to the maker cap)
- [x] Verify: delete-guard on order-locked versions (deleteAlternate counts orderItems) ✓ · exactly-one-Active enforced transactionally in promote ✓ · snapshot payloads asset-refs-only unchanged ✓
- [x] Memory file + INDEX updated; CLAUDE.md untouched (doc is the source)

### Post-push follow-ups (Code)
- [ ] De-cast alternates-actions + admin design-history reads after `db:push` + `db:generate`
- [ ] `isActiveAlternate` filters on the four legacy findFirst readers (loadDesignJson, checkout lockedDesign, mockup-render, dieline-compliance) — §3.2 note

## 8. Explicitly out of scope (V1)

Live dual-canvas compare · branch/merge · cross-product version copy · global
product timeline · re-approval gate on promote · version comments/annotations.

## Sources (research)

- Figma: [Branching in Figma](https://www.figma.com/best-practices/branching-in-figma/) · [Best Practices for Branching](https://www.figma.com/scaling-design/best-practices-for-branching-in-figma/) · [LogRocket on branching pitfalls](https://blog.logrocket.com/ux-design/how-to-use-figma-branching-properly/) · [Supernova: branching for libraries](https://www.supernova.io/blog/how-to-use-figma-branching-versioning-for-your-component-library)
- Canva: [Version history help](https://www.canva.com/help/version-history/) · [Restore flows walkthrough](https://graphicdesignresource.com/how-to-review-and-restore-older-versions-of-canva-designs-solution/)
- Compare-UX patterns: [Baymard comparison tools](https://baymard.com/ecommerce-design-examples/39-comparison-tool) · [UX Collective on side-by-side comparison](https://uxdesign.cc/design-to-win-how-i-use-the-power-of-comparison-to-unlock-better-design-e0e3cdac40f8)
