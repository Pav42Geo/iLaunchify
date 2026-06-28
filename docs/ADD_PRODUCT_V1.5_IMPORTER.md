# Add Product — V1.5 Smart Importer (structured) + Phase B (AI/PDF) seam

**Prepared:** 2026-06-28 · Implements the V1.5 slice from `docs/MANUFACTURER_WORKFLOW_AND_ADD_PRODUCT_RESEARCH.md` §7 (decision 4).
**Thesis (from the research):** manufacturers already have their product data structured in a spec sheet / ERP / Excel and resist re-keying ("double data entry" → portal abandonment). The single biggest adoption unlock is turning **Add Product from authoring into reviewing**: ingest what they already have → pre-fill a draft → they confirm. This doc records the structured (no-AI) phase that shipped and the clean seam left for AI/PDF extraction.

---

## Status — SHIPPED 2026-06-28 (structured / Phase A)

Built and verified (partner `tsc` 0 errors + `check:colors` clean). **No external dependency** — it reuses the existing CSV/xlsx parser and the guided-builder draft path. No schema change.

| Piece | What it does | File |
|---|---|---|
| `mode='single'` on the importer | Same drag-drop modal + auto-mapping, but creates **one** DRAFT from the first row and redirects to the builder for review instead of bulk-creating | `products/import/ProductImportButton.tsx` |
| "Fill from spec sheet" trigger | Entry point on the products list header (next to bulk "Import CSV" + "New product") | `products/page.tsx` |
| Builder review banner | When the builder opens with `?imported=1`, shows "Pre-filled from your spec sheet — review each step and complete the rest. Nothing publishes until you submit." | `products/new/page.tsx` |
| Per-field value preview | The mapping step shows each field's RESOLVED value from the first row (using the real toInt/toNum/COO coercion), flagging required-but-missing fields and values that didn't parse cleanly (e.g. a numeric column holding "box of 12" → 12, "X to check"). Turns "map columns blind" into "review what will be saved" — the structured analogue of Phase B's per-field confidence highlighting. | `products/import/ProductImportButton.tsx` |

---

## The flow

```
Partner clicks "Fill from spec sheet"
  → drops a .csv / .xlsx spec sheet (≤ 4 MB)
    → parse (CSV client-side · xlsx via guarded server `parseSpreadsheet`)
      → auto-map columns by header alias (ERP / Shopify / NetSuite / Akeneo / GS1 GDM)
        → partner confirms the mapping + picks a category   ← the "review flagged fields" step
          → create ONE draft (createDraftShell → updateBasics → saveProduction)
            → redirect to /products/new?draft=<id>&imported=1
              → builder opens PRE-FILLED with a review banner; partner finishes
                 the parts a spec sheet can't carry (recipe, packaging, pricing)
                  → submit (nothing publishes until then)
```

The mapping-confirm step + the builder banner together approximate the research's "partner confirms only the flagged/low-confidence fields": for **structured** input the partner confirms the column→field mapping; for fields a CSV can't carry, the builder is where they complete + review in context.

## Reuse — what we did NOT rebuild

Net-new code is only a `mode` branch + a redirect + a banner. Everything load-bearing is shared with the bulk importer and the guided builder:

- **Parsing:** `parseCsv` (client) + `parseSpreadsheet` (server, guarded dynamic `xlsx` import).
- **Auto-mapping:** the `FIELDS` alias table + `rowToImport` (COO normalization, int/num coercion).
- **Persistence:** `bulkImportProducts([row])` → `createDraftShell → updateBasics → saveProduction` — so every draft gets the partner's default seeding (PartnerProductDefaults), domain validation, and audit for free.
- **Resume:** the builder's existing `/products/new?draft=<id>` load-back (`loadDraft`).

## Importable fields today (structured)

`name` (required) · `category` · `familyCode` (Base SKU) · `description` · `countryOfOrigin` · `moqMin` · `orderIncrement` · `leadTimeRepeatDays` · `leadTimeFirstRunDays` · `monthlyCapacity` · `shelfLifeDays` · `netContentValue` · `netContentUnit`. (Recipe, packaging system, pricing, and flavors are completed in the builder — they aren't single-row CSV concerns.)

---

## Phase B — AI / PDF extraction (NOT built; the seam is clean)

Phase B adds extraction from **unstructured** spec sheets (PDF, scanned docs, free-form Excel) via document-AI / OCR. The research flags it as high-upside but **accuracy-must-be-validated, human-in-the-loop** — and it needs a provider (keys). Crucially, **the rest of the flow does not change.**

**The seam:** extraction lives entirely at the *parse* step. Everything downstream consumes a normalized shape:

```
extract(file) ─►  { headers: string[]; rows: string[][] }   // OR directly an ImportRow + per-field confidence
            └────► auto-map ► rowToImport ► createDraftShell→… ► /products/new?draft=…&imported=1 ► review
```

To wire Phase B, implement one interface and feed the existing pipeline — no rework of mapping, draft creation, or review:

```ts
interface ProductExtractor {
  // structured (today): deterministic CSV/xlsx → headers + rows
  // ai (phase B):        PDF/image/free-form → fields + per-field confidence
  extract(file: { name: string; bytes: ArrayBuffer }): Promise<{
    rows: Array<Partial<ImportRow>>
    confidence?: Record<string, number>   // 0..1 per field; drives "flagged for review"
    warnings?: string[]
  }>
}
```

Then the only UI delta is **promoting low-confidence fields** (`confidence < threshold`) into explicit "please confirm" highlights — in the mapping step and/or as highlighted fields in the builder. The structured extractor already satisfies this interface with `confidence` omitted (everything treated as confirmed-by-mapping).

**Provider candidates** (from the research, decision 4 / §4a): Mistral Document AI, Reducto, or a Databricks "agentic document extraction" pipeline. Whichever is chosen, gate it behind env keys, log every extraction for an accuracy audit on our own funnel, and **concierge the first import** for pilot partners before trusting it.

**Do NOT** in Phase B: auto-publish from extraction (always land a DRAFT for human review); charge a fee between the manufacturer and the core transaction; or make import the *only* path — manual entry, structured import, and AI import all stay available (connection-menu-by-sophistication).

---

## Where this sits on the roadmap

`docs/MANUFACTURER_WORKFLOW_AND_ADD_PRODUCT_RESEARCH.md` §7 roadmap status:

- **V1 — presets / inheritance / clone + net-content / Ti-Hi / COO** · ✅ shipped (`ADD_PRODUCT_V1_PRESETS_IMPLEMENTATION.md`).
- **V1.5 — Smart Importer** · ✅ **structured (this doc)** · ⏳ AI/PDF = Phase B (seam ready, needs a provider).
- **V2 — bulk CSV** ✅ (shipped) · **partner Product API** ⏳ ("bulk to seed, API to maintain", Amazon SP-API pattern).
- **Never:** one mandatory entry path; a fee between the manufacturer and the order; a parallel system-of-record they must hand-sync.

## Verification

Partner app → **Products → "Fill from spec sheet"** → drop `docs/products-import-sample.csv` → confirm the mapping + pick a category → the builder opens pre-filled with the review banner. `pnpm typecheck` (partner) + `node scripts/check-no-raw-tailwind-colors.mjs` both clean.
