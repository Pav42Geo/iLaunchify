// All-in price PRESENTATION (docs/PLATFORM_FEE_PRESENTATION_BRIEF_2026-07-21.md,
// Pavel decision 2026-07-21: Option C).
//
// Decision surfaces (checkout rail, sample checkout, PDP) show line items with
// the administrative fee FOLDED INTO the goods lines, Printify/Faire style; the
// partner-subtotal + fee breakdown stays one click away (expandable detail) and
// on the order-detail/invoice surfaces. This module is DISPLAY ONLY:
// computeOrderPricing, the fee snapshot (Order.platformFeeBps/Cents) and the
// charge are untouched. "All-in shown == all-in charged" holds because the sum
// of the returned lines equals subtotal + fee BY CONSTRUCTION (largest-remainder
// distribution, the ONE rounding rule — never re-derive per surface).
//
// Pure module: no prisma, no I/O — lives on the '@ilaunchify/plans/math'
// client-safe subpath so 'use client' components can import it.

export interface AllInLine {
  kind: string
  label: string
  /** The partner-priced cents (unchanged, for the expandable detail). */
  cents: number
  /** cents + this line's proportional share of the administrative fee. */
  allInCents: number
}

export interface AllInDisplay {
  lines: AllInLine[]
  /** Sum of allInCents — equals subtotal + feeCents exactly. */
  allInSubtotalCents: number
}

/**
 * Distribute `feeCents` across `lines` proportionally to their cents, using
 * largest-remainder rounding so the all-in lines sum EXACTLY to
 * subtotal + feeCents (a summary that adds up wrong is how nobody notices
 * when it adds up wrong for a real reason).
 *
 * Edge cases: zero/no-line subtotal puts the whole fee on the first line if
 * one exists; with no lines at all the fee is surfaced as its own line so
 * cents are never silently dropped.
 */
export function composeAllInLines(
  lines: ReadonlyArray<{ kind: string; label: string; cents: number }>,
  feeCents: number,
): AllInDisplay {
  const subtotal = lines.reduce((s, l) => s + l.cents, 0)

  if (lines.length === 0) {
    return feeCents > 0
      ? {
          lines: [
            {
              kind: 'FEE_REMAINDER',
              label: 'Service charge',
              cents: 0,
              allInCents: feeCents,
            },
          ],
          allInSubtotalCents: feeCents,
        }
      : { lines: [], allInSubtotalCents: 0 }
  }

  if (subtotal <= 0) {
    // Degenerate (e.g. min-fee bound on a zero-cost line): first line carries it.
    const out = lines.map((l, i) => ({
      ...l,
      allInCents: l.cents + (i === 0 ? feeCents : 0),
    }))
    return { lines: out, allInSubtotalCents: subtotal + feeCents }
  }

  // Exact shares, floored; remainder cents go to the largest fractional parts
  // (ties: earlier line wins, deterministic).
  const exact = lines.map((l) => (feeCents * l.cents) / subtotal)
  const floors = exact.map(Math.floor)
  let remainder = feeCents - floors.reduce((s, f) => s + f, 0)
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  const shares = [...floors]
  for (const { i } of order) {
    if (remainder <= 0) break
    shares[i] = (shares[i] ?? 0) + 1
    remainder -= 1
  }

  const out = lines.map((l, i) => ({ ...l, allInCents: l.cents + (shares[i] ?? 0) }))
  return { lines: out, allInSubtotalCents: subtotal + feeCents }
}
