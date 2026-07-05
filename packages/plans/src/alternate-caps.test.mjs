// Pure contract test for design-alternate caps (versioning v2 §4.4).
// Run: node --experimental-strip-types packages/plans/src/alternate-caps.test.mjs
// Same Prisma-free pattern as packages/db/src/snapshots-engine.test.mjs.
import assert from 'node:assert/strict'
import { DESIGN_ALTERNATE_CAPS, designAlternateCap } from './codes.ts'

// Locked 2026-07-05: gate COUNT only — Maker 2 / Builder 5 / Agency unlimited.
assert.deepEqual(DESIGN_ALTERNATE_CAPS, { maker: 2, builder: 5, agency: null })
assert.equal(designAlternateCap('maker'), 2)
assert.equal(designAlternateCap('builder'), 5)
assert.equal(designAlternateCap('agency'), null) // null = unlimited

// Unknown / legacy tier strings fall back to the most conservative cap.
assert.equal(designAlternateCap('master'), 2)
assert.equal(designAlternateCap(''), 2)

console.log('✓ design-alternate caps contract — all assertions passed')
