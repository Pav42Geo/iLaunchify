/**
 * @ilaunchify/packaging-3d — in-house 3D packaging generator core (G1+).
 *
 * PURE, Prisma-free, dependency-injected (same discipline as `packages/shipping`):
 * geometry, PBR material presets, and render-budget logic live here as pure
 * functions with no DB/DOM/three.js imports, so the suites run network- and
 * install-free under scripts/run-vitest-suites.mjs. UI packages consume these
 * outputs to drive three.js; this package never touches three.js itself.
 *
 * Locked architecture (docs/STUDIO_ARCHITECTURE_3D_2D.md):
 *   die-line = print master · 3D = derived preview · FDA marks deterministic vector.
 *
 * Roadmap: docs/PACKAGING_3D_GENERATOR_CHECKLIST.md (G1 realism → G5 scenes).
 */

export * from './types'
export * from './pbr-presets'
