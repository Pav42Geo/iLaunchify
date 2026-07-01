# AI Generator — how to turn it on

Everything for the AI Create generator is built and typecheck-clean. It runs **today**
on the deterministic stub (no keys). This is the short runbook to switch it to real
models + real persistence. Three steps, all on the Mac. Full status: `AI_GENERATOR_STATE.md`.

---

## 1. Apply the schema (makes the AI tables real)

The AI models are additive but not yet pushed. From the repo root:

```bash
pnpm db:push          # applies AiDesignGeneration, AiGenerationUsage, AiGenerationCredit,
                      # GenerationStorageUsage, AiOutputPreset, AiGeneratorSettings + the
                      # expanded DieCutCategory enum. (This repo uses db:push, NOT migrate.)
pnpm db:generate      # regenerate the Prisma client
rm -rf apps/*/.next   # the old client gets bundled into .next (transpilePackages)
pnpm dev              # restart
```

Skipping the last two = stale-client errors ("Property X does not exist" / `prisma.aiDesignGeneration is undefined`). See CLAUDE.md §Database.

**Until this runs:** every AI read/write is cast-guarded and degrades to defaults, so
nothing breaks — usage just isn't persisted and the saved-templates grid stays empty.

---

## 2. Set the provider keys (switches stub → fal + Recraft)

Add to `.env.local` (repo root):

```
FAL_KEY=...            # fal.ai — FLUX.1 raster + ControlNet-on-mask + upscale
RECRAFT_API_KEY=...    # Recraft — vector type pass
```

Then restart `pnpm dev`. No code change — `resolveImageGenProvider(env)` composes
fal + Recraft when the keys are present and falls back to the stub per-capability
otherwise. Confirm status at **Admin → Developer** (`localhost:3003/developer`) — the
fal.ai + Recraft rows read straight from the env (configured / missing).

**Partial keys are fine:** set only `FAL_KEY` and raster is real while vector type stays
stubbed; the Developer page shows exactly what's live.

---

## 3. (Optional now) R2 persistence of variation images

Draft/finalized images are returned **inline** today (`variationKeys` stays `[]`). Wiring
R2 upload of the variations + storing the keys lights up two things automatically:

- **Saved-templates grid thumbnails** (`loadSavedConcepts` already reads `variationKeys`;
  it just needs a resolvable URL).
- **True print-raster export** (finalize currently downloads the composite SVG).

Not required to demo or to generate — do it when you want persisted galleries + raster
downloads. Everything else works without it.

---

## Verify it's live

1. `localhost:3003/developer` → fal.ai + Recraft show **configured**.
2. Open a real product's Design Studio → **AI Templator** rail tool → describe + chips →
   **Generate** → concepts appear → **Use this** drops one under the truth layer.
3. Full page (`/studio/ai-create?productId=…`) → **Generate** debits a draft cycle
   (watch the meter tick) → **Export** downloads → **Edit in Studio** hands off to the canvas.
4. Admin → **AI Generator** (`/ai-generator`) → tier limits / domain vocab / output caps.

## Tuning (no redeploy)

Admin **AI Generator** settings are a singleton (like Order Settings). Per-tier limits,
per-domain chip vocab, and output policies/caps are all editable there and merge over the
engine defaults live. Pricing/add-on columns are intentionally **not** wired (parked).

## What's gated / decisions still open

- Tier **price points + allotments** — seeds live in `DEFAULT_TIER_LIMITS` /
  `DEFAULT_OUTPUT_POLICIES`; final numbers are yours to set.
- **Add-on subscription** model — parked (no wiring), per your call.
