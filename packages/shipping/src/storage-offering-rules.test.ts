// FC-1 pins. Throw-based (no vitest import), runs under scripts/run-vitest-suites.mjs.
//
// These exist because all four guards were lost when settings/storage was superseded
// on 2026-07-13 and nothing noticed: the old file still compiled, still read
// correctly, and was simply never called again. A pin is the only thing that would
// have caught it, because the failure mode was DELETION OF A CALLER, not a bad edit.

import {
  validateStorageOffering,
  STORAGE_RATE_BANDS,
  ALWAYS_SELF_SERVE_CLASSES,
  DEFAULT_FREE_GRACE_DAYS,
} from './storage-offering-rules'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`)
}
const ok = (r: { ok: boolean }) => r.ok === true
const err = (r: { ok: boolean; error?: string }) => (r.ok ? '' : (r.error ?? ''))

/** A valid ambient offering. */
const base = {
  offersStorage: true,
  storageClasses: ['AMBIENT'],
  storageBillingUnit: 'PALLET_MONTH',
  storageRateCents: 1_800, // $18/pallet/mo, inside the L9 anchor
  canShipParcel: true,
  onDemandEnabled: true,
}

// ── happy path ───────────────────────────────────────────────────────────────
{
  assert(ok(validateStorageOffering(base)), 'a sane ambient offering passes')
  assert(ok(validateStorageOffering({})), 'an empty draft passes (nothing asserted yet)')
}

// ── GUARD 1: rate bands (L9). The $500/pallet bug. ───────────────────────────
{
  const fat = validateStorageOffering({ ...base, storageRateCents: 50_000 }) // $500
  assert(!ok(fat), '$500/pallet/mo is REJECTED (this is the bug FC-1 fixes)')
  assert(err(fat).includes('admin-approved band'), 'and says why, pointing at ops')

  assert(!ok(validateStorageOffering({ ...base, storageRateCents: 499 })), 'below the pallet floor')
  assert(ok(validateStorageOffering({ ...base, storageRateCents: 500 })), 'the floor itself is allowed')
  assert(ok(validateStorageOffering({ ...base, storageRateCents: 15_000 })), 'the ceiling itself is allowed')
  assert(!ok(validateStorageOffering({ ...base, storageRateCents: 15_001 })), 'above the pallet ceiling')

  // The band is PER UNIT: $18 is fine per pallet, absurd per cubic foot.
  const cuft = { ...base, storageBillingUnit: 'CUFT_MONTH' }
  assert(!ok(validateStorageOffering({ ...cuft, storageRateCents: 1_800 })), '$18/cu ft is rejected')
  assert(ok(validateStorageOffering({ ...cuft, storageRateCents: 70 })), '$0.70/cu ft (Printful anchor) passes')

  assert(!ok(validateStorageOffering({ ...base, storageRateCents: 0 })), 'zero is not a rate')
  assert(!ok(validateStorageOffering({ ...base, storageRateCents: -100 })), 'negative is not a rate')
  assert(
    !ok(validateStorageOffering({ ...base, storageBillingUnit: null, storageRateCents: 1_800 })),
    'a rate with no billing unit is meaningless',
  )
  assert(!ok(validateStorageOffering({ ...base, storageBillingUnit: 'PER_HUG' })), 'unknown billing unit')
}

// ── GUARD 2: the cold-chain gate. The one that is not about money. ───────────
{
  for (const cold of ['CHILLED', 'FROZEN']) {
    const r = validateStorageOffering({ ...base, storageClasses: ['AMBIENT', cold] })
    assert(!ok(r), `${cold} is REJECTED without an admin gate`)
    assert(err(r).toLowerCase().includes('coming soon'), `${cold} explains it is ops-enabled`)
  }
  // Storage class is a HARD filter in destination selection, so a self-declared
  // FROZEN would make this partner an eligible hold destination for frozen goods.
  assert(
    !ok(validateStorageOffering({ ...base, storageClasses: ['FROZEN'] })),
    'a partner cannot make themselves frozen-eligible by typing it',
  )
  // ...but the admin CAN open it, per class, which is what the gates are for.
  assert(
    ok(validateStorageOffering({ ...base, storageClasses: ['AMBIENT', 'CHILLED'] }, { enabledColdClasses: ['CHILLED'] })),
    'CHILLED passes once the admin gate is on',
  )
  assert(
    !ok(validateStorageOffering({ ...base, storageClasses: ['FROZEN'] }, { enabledColdClasses: ['CHILLED'] })),
    'the gate is PER CLASS: CHILLED on does not imply FROZEN on',
  )
  assert(
    ok(validateStorageOffering({ ...base, storageClasses: ['FROZEN'] }, { enabledColdClasses: ['CHILLED', 'FROZEN'] })),
    'both gates on, both classes allowed',
  )
  assert(!ok(validateStorageOffering({ ...base, storageClasses: ['LUNAR'] })), 'unknown class rejected')
  for (const c of ALWAYS_SELF_SERVE_CLASSES) {
    assert(ok(validateStorageOffering({ ...base, storageClasses: [c] })), `${c} needs no gate`)
  }
}

// ── GUARD 3: offering coherence ──────────────────────────────────────────────
{
  assert(
    !ok(validateStorageOffering({ ...base, storageClasses: [] })),
    'offering storage while holding nothing',
  )
  assert(
    !ok(validateStorageOffering({ ...base, storageRateCents: null })),
    'offering storage with no rate would bill $0 forever',
  )
  assert(
    !ok(validateStorageOffering({ ...base, storageBillingUnit: null, storageRateCents: null })),
    'offering storage with no billing unit',
  )
  // Not offering storage? Then none of it is asserted.
  assert(
    ok(validateStorageOffering({ offersStorage: false, storageClasses: [], storageRateCents: null })),
    'an empty offering is fine when you are not offering',
  )
}

// ── GUARD 4: on-demand needs parcel ──────────────────────────────────────────
{
  const r = validateStorageOffering({ ...base, onDemandEnabled: true, canShipParcel: false })
  assert(!ok(r), 'ship-on-demand without parcel capability is rejected')
  assert(err(r).includes('parcel'), 'and names the missing capability')
  assert(
    ok(validateStorageOffering({ ...base, onDemandEnabled: false, canShipParcel: false })),
    'freight-only is legitimate: just not on-demand',
  )
}

// ── numeric sanity ───────────────────────────────────────────────────────────
{
  assert(!ok(validateStorageOffering({ ...base, pickFeeCents: -1 })), 'negative pick fee')
  assert(!ok(validateStorageOffering({ ...base, packFeeCents: -1 })), 'negative pack fee')
  assert(!ok(validateStorageOffering({ ...base, storageFreeGraceDays: -1 })), 'negative grace')
  assert(!ok(validateStorageOffering({ ...base, maxDwellDays: -1 })), 'negative dwell')
  assert(!ok(validateStorageOffering({ ...base, storageMinMonthlyCents: -1 })), 'negative minimum')
  assert(ok(validateStorageOffering({ ...base, pickFeeCents: 0, packFeeCents: 0 })), 'zero fees are legal')
  assert(ok(validateStorageOffering({ ...base, storageFreeGraceDays: null })), 'null grace is legal (defaults later)')
}

// ── the constants the rest of the system leans on ────────────────────────────
{
  assert(STORAGE_RATE_BANDS.PALLET_MONTH.minCents === 500, 'pallet floor $5.00')
  assert(STORAGE_RATE_BANDS.PALLET_MONTH.maxCents === 15_000, 'pallet ceiling $150.00')
  assert(STORAGE_RATE_BANDS.CUFT_MONTH.minCents === 30, 'cu ft floor $0.30')
  assert(STORAGE_RATE_BANDS.CUFT_MONTH.maxCents === 300, 'cu ft ceiling $3.00')
  assert(DEFAULT_FREE_GRACE_DAYS === 10, 'industry-norm grace stays 10 business days')
  assert(!ALWAYS_SELF_SERVE_CLASSES.includes('CHILLED'), 'cold is NEVER self-serve by default')
  assert(!ALWAYS_SELF_SERVE_CLASSES.includes('FROZEN'), 'frozen is NEVER self-serve by default')
}

// eslint-disable-next-line no-console
console.log('storage-offering-rules: all pins passed')
