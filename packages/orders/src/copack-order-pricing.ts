// CP-3.2 — the ONE seam that turns a co-pack offering into a priced line
// (docs/COPACK_CP3_SHADOW_AND_CP6_PLAN §1.2/1.3). Every PP-0 surface (charge,
// estimate, PDP) calls resolveOrderCopackCents so the shown price and the charged
// price are the SAME expression, and CP-6 pays the SAME co-packer this prices.
//
// SHADOW: gated OFF by default (`pricing:copack_real_price`). Off ⇒ 0 ⇒ no
// co-pack line ⇒ the charge is byte-identical to today. Do NOT flip the flag
// until every surface is wired AND scripts/copack-delta-report.mjs is reviewed.

import { prisma, getLogisticsSettings } from '@ilaunchify/db'
import { loadCopackQuoteCents } from './copack-quote-loader'

const COPACK_FLAG = 'pricing:copack_real_price'

/** The co-pack real-price flag. OFF by default (getLogisticsSettings fails closed). */
export async function isCopackRealPriceEnabled(): Promise<boolean> {
  const gates = await getLogisticsSettings().catch(() => ({}) as Record<string, unknown>)
  return gates[COPACK_FLAG] === true
}

/**
 * The co-packer pinned for a template's packaging (CP-5), if unambiguous. Returns
 * the single distinct `coPackerServiceId` across the template's packaging configs,
 * or null when none is pinned or several different ones are (per-size selection is
 * future). N=1 auto-pins the SAME own service everywhere, so this is exactly one.
 * This is the SAME id CP-6 will route the assembly leg to, so charge === payout.
 */
export async function resolveOrderCoPackerServiceId(productTemplateId: string): Promise<string | null> {
  const rows = await prisma.productTemplatePackaging.findMany({
    where: { productTemplateId, coPackerServiceId: { not: null } },
    select: { coPackerServiceId: true },
  })
  const distinct = [...new Set(rows.map((r) => r.coPackerServiceId).filter((x): x is string => !!x))]
  return distinct.length === 1 ? distinct[0]! : null
}

/**
 * The co-pack cents for one order line, or 0. Zero unless ALL hold: the flag is ON,
 * the order is an assembly (a pack / variety run — the only shape that emits a
 * co-pack leg), and a co-packer is pinned with a quote that can run the job.
 *
 * `qty` is TOTAL physical units (packs × unitsPerPack), the unit the engine prices
 * the run on. `unitsPerPack` / `unitsPerCase` feed per-pack / per-case operations.
 */
export async function resolveOrderCopackCents(args: {
  productTemplateId: string | null
  isAssembly: boolean
  qty: number
  unitsPerPack?: number
  unitsPerCase?: number
}): Promise<number> {
  if (!args.productTemplateId || !args.isAssembly || args.qty <= 0) return 0
  if (!(await isCopackRealPriceEnabled())) return 0 // SHADOW
  const coPackerServiceId = await resolveOrderCoPackerServiceId(args.productTemplateId)
  if (!coPackerServiceId) return 0
  const quote = await loadCopackQuoteCents({
    coPackerServiceId,
    job: { qty: args.qty, unitsPerPack: args.unitsPerPack, unitsPerCase: args.unitsPerCase },
  })
  return quote?.ok ? quote.cents : 0
}
