# Self-design on the maker's die-line — build spec

**Status (2026-07-13):** backend + contract + composer SHIPPED (slices 1–2). Slice 3 (creator design surface) SPECCED, not built. Owner zone: Code (Studio/die-line). Cross-refs: `CO_CREATION_MARKETPLACE_SPEC.md` §7 (label proofing / "self-design on the maker's dieline via the Design Studio bridge, V1.5").

## What this feature is

A creator in a Collaboration Room designs their own label artwork on the **maker's** die-line, inside a Studio surface, and submits it as a `LABEL` `BuildObjectVersion` for the maker to review. The platform artifact is a **normalized SVG** (mm units): the maker's immutable die-line **substrate** + the creator's **brand layer** + deterministic **regulated** panels. The partner's original file (`PackagingDieline.partnerFile`) stays immutable; the proof is a new artifact.

## Locked decisions (Pavel, 2026-07-13)

- **D1 — Trigger: always-on for the LABEL object.** No new brief "door", no `ProductBrief`/`FormulationMode` change. Any creator in a room can self-design the LABEL. (The two brief doors are formulation-only — `BriefOrigin` `HAVE_RECIPE`/`HAVE_IDEA` — and never reach the room.)
- **D2 — Gate: PACKAGING must be APPROVED first.** The approved PACKAGING build object is the signal that the packaging concept is settled; self-design unlocks only then. Enforced server-side (see shipped `creatorSubmitLabelProof`).
- **D3 — Die-line source: creator picks from the maker's verified library.** The room's PACKAGING object does **not** pin a specific `PackagingDieline` (the brief pins only a product `category`). So the creator picks from the maker's `ADMIN_VERIFIED`/`ACTIVE` `PackagingDieline` rows (`partnerService.partnerId === room.partnerId`). Server provenance gate validates the choice.
- **D4 — Ownership split.** Code owns: Studio/die-line, the `LabelProof` contract, the composer, `rooms/[roomId]/actions.ts` (handed off single-writer 2026-07-13). Cowork owns: `CoCreationRoomShell` (LABEL viewer + the "Design the label" entry affordance) and `MessagesShell`.
- **D5 — Slice 3 approach: new lightweight room label editor** (not an adaptation of the product Studio). MVP = proof-only (no draft autosave); regulated frames shown as reserved zones (regulated content depends on the approved RECIPE — a follow-up).

## Already shipped — the seam Slice 3 plugs into

**`@ilaunchify/orders` — payload contract** (`packages/orders/src/room-label-proof.ts`):
- `labelProofPayloadSchema` (Zod), `LabelProofPayload`, `isLabelProofPayload`, `LABEL_PROOF_KIND = 'SELF_DESIGN'`.
- Payload shape: `{ proofKind:'SELF_DESIGN', svgKey, dielineId, widthMm, heightMm, designId?, designVersion?, sha256?, regulatedFrames[], note? }`.

**`@ilaunchify/ui` — pure composer** (`packages/ui/src/canvas/labelProofSvg.ts`, tested):
- `composeLabelProofSvg({ substrate, brand, regulated? }, { widthMm, heightMm }): string` — stacks layers back→front (substrate → brand → **regulated painted last**, so brand art can never obscure regulated content). Every layer is INNER SVG markup already resolved to the shared mm space.
- `extractSvgInner(svgDoc): string` — unwraps a full `<svg>` document (e.g. the stored `normalizedSvg`) into a substrate fragment.

**`@ilaunchify/storage`** (`packages/storage/src/keys.ts`): `labelProofKey({ roomId, objectId })` → `rooms/{roomId}/labels/{objectId}/proof/{cuid}.svg`.

**Submit action — DONE** (`apps/creator/src/app/(dashboard)/rooms/[roomId]/actions.ts`):
```ts
creatorSubmitLabelProof(roomId, objectId, input): Promise<{ ok; error? }>
// input (Zod-validated server-side): { svg, dielineId, widthMm, heightMm, designId?, designVersion?, regulatedFrames?, note? }
```
It: guards creator-owns-room+ACTIVE → asserts objectId is this room's LABEL object → **D2** PACKAGING APPROVED gate → **D3** die-line provenance gate (belongs to this room's maker) → uploads the SVG (`labelProofKey`, sha-256'd) → `submitObjectVersion(ctx, objectId, payload)` (FSM DRAFT/CHANGES_REQUESTED→IN_REVIEW + audit + `RoomEvent` OBJECT_SUBMITTED + notification, all in `@ilaunchify/orders` room-service).

**Slice 3 only needs to produce the `svg` + `dielineId` + `widthMm`/`heightMm` and call this action.** No further backend work.

## Slice 3 — to build

### 1. Route (Code zone)
A room-scoped Studio surface, e.g. `apps/creator/src/app/(studio)/rooms/[roomId]/label/page.tsx` (parallel to the product Studio at `(studio)/products/[productId]/design/canvas/`). Do **not** reuse the product `page.tsx`/`CanvasLayoutShell` (product-coupled: variant, brand assets, `Design`/`DesignVersion` autosave, `DieCutTemplate`→geometry).

Server loader responsibilities:
- Guard: `requireUser()` + room belongs to creator + `ACTIVE` + PACKAGING object `APPROVED` (mirror `creatorRoomCtx` + the D2 gate; else `notFound()`/redirect back to the room).
- List the maker's die-line library: `prisma.packagingDieline.findMany({ where: { partnerService: { partnerId: room.partnerId }, status: { in: ['ADMIN_VERIFIED','ACTIVE'] } }, ... })`.
- For the chosen die-line (`?dieline=` param, else the picker), resolve the **substrate**:
  - Prefer `normalizedSvgKey` → read from R2 (`getSignedReadUrl` / fetch bytes) → `extractSvgInner()`.
  - **Fallback (important):** `normalizedSvgKey` is often null (only the admin Die-line Curator populates it). When absent, generate on the fly from the structured spec: `dielineSvgFromSpec({ widthMm, heightMm, bleedMm, trimBox, safeAreaBox, foldLines, surfaces })` (all on `PackagingDieline`), then `extractSvgInner()`. Dims for the payload = `widthMm + 2·bleedMm` × `heightMm + 2·bleedMm` (the full-bleed canvas, matching the composer/`dielineSvgFromSpec` viewBox).
- Hand substrate SVG fragment + dims + `dielineId` + the die-line list to the client editor.

### 2. Client editor (Code zone)
- Fabric.js canvas (reuse `packages/ui/src/canvas` primitives: `Stage`, `objects.ts` factories `addText`/`addImageFromUrl`(brand-logo)/`addTextCombo`) sized from the mm dims × a `pxPerMm` (Studio default 3.0).
- Substrate rendered as a **fixed, non-selectable** background (the maker's geometry — immutable).
- **Brand layer only:** restrict the creator to `CREATIVE`-scope frames (`FrameScope` in `packages/ui/src/canvas/frames.ts` — `LOGO`/`IMAGERY`/`CUSTOM`). Regulated frames (`RECIPE`/`IDENTITY`/`MATERIAL`/`PRODUCT`) render as **reserved-zone guides** (MVP: not fillable by the creator).
- Die-line picker: from the maker's verified list (D3).

### 3. Compose + submit (Code zone)
On "Submit to room":
- Brand layer SVG: `canvas.toSVG()` scoped to the creator's objects, wrapped so it's in mm space (e.g. `<g transform="scale(${1/pxPerMm})">…</g>` since Fabric coords are px). Strip the substrate from the export (it's supplied separately).
- `composeLabelProofSvg({ substrate, brand, regulated: null }, { widthMm, heightMm })`.
- `creatorSubmitLabelProof(roomId, labelObjectId, { svg, dielineId, widthMm, heightMm, regulatedFrames: <reserved regulated frame kinds>, note })`.
- On `{ ok:true }`, route back to `/rooms/${roomId}?object=<labelObjectId>`.

### 4. Entry affordance (Cowork zone — CoCreationRoomShell)
On the LABEL object card: a **"Design the label"** button visible when PACKAGING is APPROVED (D1+D2), deep-linking to the editor route. Cowork also renders the submitted proof: the LABEL viewer fetches `payload.svgKey` (via signed URL), sized by `payload.widthMm`/`heightMm`. (Today `LabelPinBoard` ignores the payload — it should render the proof when `isLabelProofPayload(latestVersion.payload)`.)

## Open sub-decisions / follow-ups (not MVP)

- **Draft persistence.** MVP has no autosave — the creator designs and submits in one sitting. Follow-up: a room-scoped design draft (a provisional `Design` row keyed to the room, or a new light model) so work survives a reload.
- **Regulated layer from RECIPE.** MVP leaves regulated frames as reserved zones. Follow-up: compose deterministic FDA/nutrition/identity panels from the room's **approved RECIPE** into the `regulated` layer of `composeLabelProofSvg` — reuse `resolveRoomRecipeLabel` (`@ilaunchify/orders`) + the panel generators/SVG renderers in `packages/ui/src/canvas` + `packages/ui/src/nutrition`. This is the "FDA panels stay deterministic vector; creator designs the brand layer only" doctrine fully realized.
- **`normalizedSvgKey` backfill.** Consider generating + storing `normalizedSvgKey` for verified die-lines so the substrate load is a plain fetch (avoids the on-the-fly `dielineSvgFromSpec` fallback each open).

## Known adjacent issue (not this feature)

`packages/orders/src/messaging.ts` (Cowork's, lines ~373 & ~511) fails `tsc`: `ChatAttachment` lacks an index signature → not assignable to Prisma's `InputJsonValue` when writing `RoomMessage.attachment`/`DirectMessage.attachment`. One-line fix (`attachment as Prisma.InputJsonValue` or add `[k:string]:unknown`). Left to Cowork — it's their file. Blocks a clean `@ilaunchify/orders` / creator-app typecheck until fixed.

## DECISIONS LOCKED (Pavel, 2026-07-13 — recorded by Cowork)

- **D-S1 — Window mode:** Studio opens in a NEW TAB (route `/rooms/[roomId]/label`, full-screen; the room stays alive behind it).
- **D-S2 — Substrate:** the PACKAGING-pinned die-line's `normalizedSvg`, always. DIY honestly blocked ("the maker's die-line is being prepared") when no curated normalized artifact exists.
- **D-S3 — Review inversion:** whoever did NOT submit the current LABEL version reviews it — a self-designed proof is approved by the MAKER (printability), a maker-submitted label by the creator.
- **D-S4 — Serial candidates:** the room sees ONE proof at a time; exploration lives in Studio Alternates (tier caps Maker 2 / Builder 5 / Agency ∞). Side-by-side candidate review = additive V1.5.
- **D-S5 — Scope:** V1 = label-on-dieline only. Structural packaging design stays the maker's domain.
- **D-S6 — Maker design service:** a future DESIGN milestone kind priced via the existing terms flow; NOT built now.

Status updates same day: Cowork's LABEL viewer + "Design the label" affordance BUILT (proof renders from `payload.svgKey` with pins overlaid, both apps; affordance gated on PACKAGING APPROVED, creator mode, links `/rooms/[roomId]/label`). The messaging.ts `InputJsonValue` blocker below is FIXED. Shared-workspace layer (invited designer): docs/SHARED_DESIGN_WORKSPACE_SPEC.md — D-W1…D-W6 locked, W0 substrate built (`DesignCollaborator`, `Design.roomId` soft FK, `UserRole.DESIGNER`, seat caps, pure access + edit-lock engine). Slice 3 note for Code: `Design.roomId` exists; relaxing `Design.productId` to optional remains YOUR call in the room adapter.
