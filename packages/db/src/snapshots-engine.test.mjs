// Pure-engine tests for EditSnapshot retention.
// Run: node --experimental-strip-types packages/db/src/snapshots-engine.test.mjs
// (Node 22.6+ strips the TS types so we import the REAL ./snapshots-engine.ts —
//  no Prisma is pulled, so this needs no generated client.)
import assert from 'node:assert/strict'
import { snapshotsToPrune, coalesceTarget, isPinnedKind, SNAPSHOT_RING_SIZE } from './snapshots-engine.ts'

const t = (mins) => new Date(Date.UTC(2026, 5, 19, 12, 0, 0) + mins * 60_000)
const auto = (id, mins) => ({ id, kind: 'AUTO', pinned: false, createdAt: t(mins) })
const pin = (id, mins) => ({ id, kind: 'MILESTONE', pinned: true, createdAt: t(mins) })

assert.equal(SNAPSHOT_RING_SIZE, 10)
assert.equal(isPinnedKind('AUTO'), false)
assert.equal(isPinnedKind('MILESTONE'), true)
assert.equal(isPinnedKind('MANUAL'), true)

// 1) Empty / under-cap → nothing pruned.
assert.deepEqual(snapshotsToPrune([]), [])
assert.deepEqual(snapshotsToPrune([auto('a', 0), auto('b', 1)]), [])

// 2) Over-cap → the two OLDEST non-pinned pruned, newest 10 kept.
const twelve = Array.from({ length: 12 }, (_, i) => auto('n' + i, i))
assert.deepEqual(snapshotsToPrune(twelve).sort(), ['n0', 'n1'].sort())

// 3) Pinned milestones never pruned + never consume ring slots.
const mixed = [pin('m0', 0), pin('m1', 1), ...Array.from({ length: 11 }, (_, i) => auto('a' + i, i + 2))]
assert.deepEqual(snapshotsToPrune(mixed), ['a0'])

// 4) Coalesce: an AUTO within 2 min of the latest non-pinned → returns its id.
assert.equal(coalesceTarget([auto('r0', 0), auto('r1', 1.5)], t(2.5)), 'r1')

// 5) No coalesce once the window passed.
assert.equal(coalesceTarget([auto('r0', 0)], t(3)), null)

// 6) Coalesce never collapses a pinned milestone.
assert.equal(coalesceTarget([pin('m0', 2.4)], t(2.5)), null)

console.log('✓ snapshots-engine retention contract — all assertions passed')
