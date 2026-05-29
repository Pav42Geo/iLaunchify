# Compliance auto-recognition — three-layer plan

**Status:** V1.5 ships Layer 1 (DS-72). Layers 2 + 3 land when the use case justifies the dependency / cost.

Pavel asked the right question: if the compliance scan can recognize required elements on its own, the at-your-own-risk warning never needs to fire for designs that are actually fine. The user just typed the content and the system found it.

The answer is: yes, three increasingly powerful layers.

---

## Layer 1 — Text pattern matching (V1.5, shipped DS-72)

**What it recognizes:** Any editable text object on the canvas whose content matches a known FDA-section pattern.

**Patterns recognized:**

| Section | Pattern | Confidence |
|---|---|---|
| Ingredient statement | `/^INGREDIENTS:/i` | 0.99 |
| Allergen statement | `/^CONTAINS:/i` | 0.99 |
| Net quantity (weight) | `/^NET WT/i` | 0.99 |
| Net quantity (fluid) | `/^NET \d.*(fl oz|ml|pt|qt|gal)/i` | 0.97 |
| Net quantity (count) | `/^\d+ (CAPSULES?|TABLETS?|GUMMIES|...)/i` | 0.93 |
| Manufacturer info | `/Manufactured (for|by)\|Distributed by/i` | 0.95 |
| Statement of identity | productCtx.productName match | 0.7–0.85 |

**How it works:**
1. `autoDetectLabelSections(canvas, ctx)` walks every text object
2. Each text gets pattern-matched
3. On a match, the text object gets `customRole` stamped — the rest of the system treats it identically to a Label-drawer-dropped section
4. The compliance scan ran auto-detect BEFORE the missing-section rule, so auto-detected sections never trigger BLOCKING findings
5. Auto-detected sections appear as INFO findings in the CompliancePanel with a 🟢 sparkle "Auto-detected" badge

**Cost:** ~10ms client-side, no new dependencies, regex only.

**Coverage:** Catches the ~80% case where a creator types the required content as free editable text instead of using the Label drawer's pre-tagged buttons.

**What it can't do:**
- Read text baked into an uploaded PDF or image (no text objects to walk).
- Distinguish a tagline that contains the product name from the actual Statement of Identity (low-confidence case).
- Catch regional conventions outside the US-FDA pattern catalog. EU / Canada land when those rule packs do.

---

## Layer 2 — Tesseract.js OCR (V1.5 / V2)

**What it adds:** Recognition of text baked into uploaded artwork (PDFs flattened to images, JPG/PNG uploads, etc).

**How it works:**
1. When the user uploads a PDF / image to the canvas, snapshot the visible region
2. Run Tesseract.js (~10MB WASM lib, fully client-side) over the snapshot
3. Extract text + bounding boxes
4. Run the same pattern catalog from Layer 1 on the extracted text
5. For each match, attach a "virtual" customRole pointing to the bounding region rather than a text object — the compliance scan recognizes both

**Cost:**
- ~10MB WASM (lazy-loaded only when an uploaded image is on the canvas)
- 1–5 seconds per scan
- Higher memory during processing

**When to ship:**
When ≥20% of creators upload finished PDFs instead of designing in-Studio. Currently most use the canvas tools directly so Layer 1 covers them.

**Implementation sketch:**

```typescript
// packages/ui/src/canvas/autoDetectOcr.ts
import { createWorker } from 'tesseract.js'

export async function autoDetectByOcr(
  canvas: FabricCanvas,
  ctx: AutoDetectContext,
): Promise<AutoDetection[]> {
  const detections: AutoDetection[] = []
  for (const obj of canvas.getObjects()) {
    if (obj.type !== 'image') continue
    const snapshot = obj.toDataURL({ format: 'png' })
    const worker = await createWorker('eng')
    const { data } = await worker.recognize(snapshot)
    await worker.terminate()
    // Apply Layer-1 patterns to data.words / data.text
    // For each match: attach a virtual ROI to the image object
  }
  return detections
}
```

The auto-detect dispatcher would call Layer 1 first (cheap, fast), then fall through to Layer 2 only when Layer 1 found nothing and there are uploaded images on the canvas.

---

## Layer 3 — AI vision model (V2)

**What it adds:** Recognition of stylized, handwritten, or visually-encoded label sections that pattern matching and OCR can't reliably extract.

**How it works:**
1. Canvas → high-res PNG snapshot
2. Upload to a vision LLM (Claude Vision / GPT-4V) with a structured prompt:
   > "Identify the FDA-required label sections in this image. Return JSON: { statementOfIdentity: {text, region}, netQuantity: {text, region, kind: 'solid'|'liquid'|'count'}, ingredients: {...}, allergens: {...}, manufacturerInfo: {...}, nutritionFacts: {region} }"
3. Parse the response, validate, attach to the canvas

**Cost:**
- ~$0.01–$0.03 per scan (depends on image size + model)
- 2–5 seconds latency
- Requires an API key (can't run fully client-side)
- Subject to vendor uptime / rate limits

**When to ship:**
- Gated behind an explicit "🤖 AI scan" button in the CompliancePanel — not auto-runs
- Premium tier feature (creator pays the LLM cost or it's bundled with Builder/Agency plans)
- Useful for creators who hand off pro-designed artwork they didn't author

**Implementation sketch:**

```typescript
// services/compliance/app/routers/ai_scan.py
POST /v1/compliance/ai-scan
{
  "imageDataUrl": "data:image/png;base64,...",
  "productCtx": { "productName": "...", "allergens": [...] }
}
→ {
  "detections": [
    { "role": "statement-of-identity", "confidence": 0.94, "text": "...", "region": {x, y, w, h} },
    ...
  ],
  "modelUsed": "claude-3-5-sonnet",
  "costCents": 2
}
```

The detections flow back into the same `AutoDetection[]` shape Layer 1 uses, so the rest of the compliance UI doesn't care which layer found what — it just renders the badge.

---

## Layer composition

The three layers stack naturally:

```
Layer 1 (regex)  → cheap, instant, covers ~80%
   └─ fallthrough to →
      Layer 2 (OCR) → for uploaded images, covers ~10% more
         └─ fallthrough to →
            Layer 3 (AI) → manual trigger, covers the rest
```

The compliance scan in the CompliancePanel auto-runs Layer 1 every time it opens (essentially free). Layer 2 runs lazily when an uploaded image is present and Layer 1 came up empty. Layer 3 is creator-triggered.

---

## What ships in DS-72 (today)

- Layer 1 implementation in `packages/ui/src/canvas/autoDetect.ts`
- Integration in `scanLabelCompliance` so auto-detected sections drop the BLOCKING and become INFO with an "Auto-detected ✨" badge
- `ScanFinding.autoDetected` flag for downstream UIs
- Compliance panel surfaces auto-detected findings with an emerald accent + Sparkles icon
- Export modal's at-your-own-risk warning only fires for REAL blockings now — auto-recognized sections never trigger the gate

Layers 2 + 3 are scoped above for the right time.

---

## Wording note — Export vs. Proceed

When the user is in the Design Studio Export modal, "Export at my risk" is the right verb — they're generating a file.

When the user enters the **production-order checkout flow** (Phase G — post-canvas stepper), the same ack pattern fires but the verb changes to **"Proceed at my risk"** because they're committing to print, not just exporting. The `ExportModal`'s ack section is built around a generic `ExportAck` payload that can drop into the order-checkout step unchanged — only the button copy + the `onExported` callback name need to change. Mark the ExportModal source with a forward-pointer comment so the order-step author finds the pattern.
