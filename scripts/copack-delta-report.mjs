#!/usr/bin/env node
// =============================================================================
// COPACK DELTA REPORT: what flipping `pricing:copack_real_price` actually changes.
//
// WHY THIS EXISTS (same reasoning as pp0-delta-report.mjs). iLaunchify is
// pre-revenue: zero live orders, Stripe behind verification. A classic shadow
// logs a delta per real order and would log nothing forever. So instead of
// sampling carts that do not exist, this enumerates cart shapes and runs the
// co-pack engine over them, printing exactly what the co-pack line adds to the
// creator's bill per tier. Real data would be a sample; this is concrete.
//
// The co-pack maths below is reproduced from packages/orders/src/copack-quote.ts
// and SELF-CHECKED against the CP-2 pins (copack-quote.test.ts) before it runs,
// so if it ever drifts from the engine this report refuses rather than lies.
//
// Run:  node scripts/copack-delta-report.mjs
// =============================================================================

const round = Math.round
const f = (c) => '$' + (c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const f0 = (c) => '$' + Math.round(c / 100).toLocaleString()

// ── co-pack engine maths (copack-quote.ts), reproduced ───────────────────────
// changeover stored as Int minutes ⇒ /60 for hours; cost = (changeoverH + qty/speed) × rate.
function lineCost(L, q) {
  if (q < L.minRun || (L.maxRun != null && q > L.maxRun)) return null
  return round((L.co / 60 + q / L.sp) * L.rt)
}
function selectCost(lines, q) {
  let best = null
  for (const L of lines) {
    const c = lineCost(L, q)
    if (c == null) continue
    if (best == null || c < best) best = c
  }
  return best
}
function opsCents(ops, q, upp, upc) {
  let c = 0
  for (const o of ops) {
    if (o.unit === 'PER_UNIT') c += o.price * q
    else if (o.unit === 'PER_PACK') c += o.price * Math.ceil(q / Math.max(1, upp))
    else if (o.unit === 'PER_CASE') c += o.price * Math.ceil(q / Math.max(1, upc))
    else if (o.unit === 'PER_RUN') c += o.price
  }
  return c
}
function quote(cfg, q, upp, upc) {
  const run = selectCost(cfg.lines, q)
  if (run == null) return null
  const raw = run + opsCents(cfg.ops, q, upp, upc)
  return Math.max(raw, cfg.minRun || 0)
}

// The spec's two real-shaped lines + a fill op (copack-quote.test.ts).
const CFG = {
  lines: [
    { sp: 3600, co: 240, rt: 16500, minRun: 1500, maxRun: null }, // auger
    { sp: 900, co: 60, rt: 12000, minRun: 0, maxRun: 25000 }, // hand
  ],
  ops: [{ unit: 'PER_UNIT', price: 12 }],
  minRun: 0,
}

// ── self-check against CP-2 pins ─────────────────────────────────────────────
const check = (g, w, m) => {
  if (g !== w) {
    console.error(`SELF-CHECK FAIL ${m}: got ${g} want ${w} — report drifted from the engine, refusing.`)
    process.exit(1)
  }
}
check(quote(CFG, 2400, 12, 24), 72800, 'quote@2400 (hand $440 + fill $288)')
check(lineCost(CFG.lines[0], 90000), 478500, 'auger line @90,000')
console.log('self-check OK: reproduced maths matches the CP-2 engine pins\n')

// ── the bill delta ───────────────────────────────────────────────────────────
// creatorFeeCents mirror (round, no bounds) — matches @ilaunchify/plans.
const feeCents = (base, bps) => round((base * bps) / 10000)
const TIERS = [
  ['Maker', 1500],
  ['Builder', 1200],
  ['Agency', 800],
]
// Illustrative goods + print base per unit (pp0-report style). The POINT is the
// RULE: co-pack is partner-set + creator-paid, so it raises the fee base and the
// tier fee applies. Shipping stays outside the base (untouched here).
console.log('What ON adds to the creator bill (co-pack line + the tier fee on it):')
for (const q of [300, 2400, 20000, 90000]) {
  const cp = quote(CFG, q, 12, 24)
  const goods = round(q * 0.62 * 100)
  const print = round(q * 0.09 * 100)
  const baseNo = goods + print
  const baseYes = baseNo + (cp || 0)
  console.log(`\nqty ${q.toLocaleString().padStart(6)}   co-pack ${cp == null ? '(no line runs)' : f(cp)}`)
  for (const [name, bps] of TIERS) {
    const feeDelta = feeCents(baseYes, bps) - feeCents(baseNo, bps)
    const totalDelta = (cp || 0) + feeDelta
    console.log(`   ${name.padEnd(8)} feeBase +${f0(cp || 0).padStart(9)}   fee +${f(feeDelta).padStart(10)}   total +${f(totalDelta)}`)
  }
}
console.log(
  '\nFlag OFF today (pricing:copack_real_price): every "+" above is INERT. Flip only after\n' +
    'this report is reviewed AND every PP-0 surface is wired (charge + estimate done; PDP pending).',
)
