# HANDOFF-TO-CODE — 3 brand-hex classes in hot zones

**From:** Cowork · **Date:** 2026-07-10 · **Effort:** ~5 min · **Blocking:** no (allowlisted, CI is green)

Cowork tokenized all brand-hex Tailwind classes across the repo (`bg-[#B5FF3D]`→`bg-neon-500`, etc.) and added a lint rule for them in `scripts/check-no-raw-tailwind-colors.mjs` (`pnpm check:colors`). Three files were **left for Code** because they're single-writer hot zones (Design Studio canvas + partner New-Product builder — see `.claude/memory/ilaunchify-two-agent-hot-file-collisions.md`). They're temporarily exempted via `HEX_CLASS_ALLOW` in that script.

**Your task:** apply the swaps below, then delete the matching `HEX_CLASS_ALLOW` entries and confirm `pnpm check:colors` stays green.

## 1. `apps/creator/src/app/(studio)/products/[productId]/design/canvas/drawers/FlavorLabelSections.tsx` — lines 54 & 77

Both lines, same string:

```
- rounded-full bg-[#B5FF3D]/30 px-2 py-0.5 text-[10.5px] font-semibold text-ink-900
+ rounded-full bg-neon-500/30 px-2 py-0.5 text-[10.5px] font-semibold text-ink-900
```

## 2. `apps/partner/src/app/(dashboard)/products/new/TurnkeyProductFlow.tsx` — line 575

```
- ...items-center justify-center rounded-full bg-[#FF2E63] text-white
+ ...items-center justify-center rounded-full bg-pink-500 text-white
```

## 3. `apps/partner/src/app/(dashboard)/products/new/BasicsStep.tsx` — line 82

Two hexes on this line (`#FFE9F0` = pink-50, `#FFB3CC` = pink-200):

```
- current ? 'bg-[#FFE9F0] ring-1 ring-[#FFB3CC]' : ''
+ current ? 'bg-pink-50 ring-1 ring-pink-200' : ''
```

## Then clean up

Remove these three entries from `HEX_CLASS_ALLOW` in `scripts/check-no-raw-tailwind-colors.mjs`:

```
'design/canvas/drawers/FlavorLabelSections',
'products/new/TurnkeyProductFlow',
'products/new/BasicsStep',
```

Run `pnpm check:colors` — expect `✓ No raw off-palette Tailwind colors`. Commit.

## Token reference

`#FF2E63`→`pink-500` · `#FFE9F0`→`pink-50` · `#FFB3CC`→`pink-200` · `#C71350`→`pink-700` · `#B5FF3D`→`neon-500` (alpha ok: `neon-500/30`). Full map + rule: `docs/DESIGN_TOKEN_HYGIENE.md`. Component registry + UI laws: `AGENTS.md` + `packages/ui/registry.json`.

> Optional: the lint's `BRAND_HEX` list covers `#FFB3CC`? No — it currently lists 500/700/50 + darks. If you want the ring case caught automatically in future, add `ffb3cc|ff7fa8|ff5285` (pink-200/300/400) to `BRAND_HEX`.
