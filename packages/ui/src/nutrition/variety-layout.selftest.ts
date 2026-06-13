// Dependency-free self-check for the aggregate (multi-column) Nutrition Facts
// layout core. packages/ui has no test runner wired, so this is a plain module
// (no vitest import) — import and call runVarietyFactsSelfTest() from a node/tsx
// context. It asserts the REGULATED invariants of 21 CFR 101.9(d)(13): one
// Calories number per flavor column, %DV present per column, mandatory names +
// all %DV bold, monotonic non-overlapping columns, finite geometry within bounds.

import { layoutVarietyFacts, caloriesNum, type VarietyColumn, type LayoutText } from './variety-layout'
import type { PanelData, NutrientRow } from '@ilaunchify/types'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`variety-layout self-check failed: ${msg}`)
}

const CAL_NUM_SIZE = 30 // must match CAL_NUM_PX in variety-layout.ts
const TITLE_SIZE_MAX = 26

function row(id: string, label: string, amount: number | string, unit: string | undefined, pdv: number | undefined, indent = 0): NutrientRow {
  return { id, label, amount, unit, percentDailyValue: pdv, indent }
}

function flavor(label: string, calories: number, sugar: number, sugarPdv: number): VarietyColumn {
  const data: PanelData = {
    format: 'STANDARD',
    servingSize: '1 can (355mL)',
    servingsPerContainer: '12',
    requiredFooter: '* The % Daily Value tells you how much a nutrient in a serving contributes to a daily diet.',
    requiredWarnings: [],
    rows: [
      row('calories', 'Calories', calories, undefined, undefined),
      row('totalFat', 'Total Fat', 0, 'g', 0),
      row('sodium', 'Sodium', 25, 'mg', 1),
      row('totalCarbohydrate', 'Total Carbohydrate', sugar + 1, 'g', 1),
      row('totalSugars', 'Total Sugars', sugar, 'g', undefined, 1),
      row('addedSugars', 'Includes Added Sugars', sugar, 'g', sugarPdv, 2),
      row('protein', 'Protein', 0, 'g', undefined),
      row('vitaminD', 'Vitamin D', 0, 'mcg', 0),
    ],
  }
  return { label, data }
}

function texts(ops: ReturnType<typeof layoutVarietyFacts>['ops']): LayoutText[] {
  return ops.filter((o): o is LayoutText => o.kind === 'text')
}

function allFinite(ops: ReturnType<typeof layoutVarietyFacts>['ops']): boolean {
  for (const o of ops) {
    const nums = o.kind === 'rect' ? [o.x, o.y, o.w, o.h] : [o.x, o.y, o.size, o.weight]
    if (nums.some((n) => !Number.isFinite(n))) return false
  }
  return true
}

export function runVarietyFactsSelfTest(): void {
  // 1. Empty input → degenerate, no ops.
  const empty = layoutVarietyFacts([])
  assert(empty.ops.length === 0 && empty.W === 10, 'empty input must yield no ops')

  const cols = [flavor('Mango', 20, 1, 2), flavor('Strawberry', 25, 2, 4), flavor('Peach Bellini Splash', 15, 0, 0)]
  const out = layoutVarietyFacts(cols)
  const tx = texts(out.ops)

  // 2. Finite geometry, positive dims, ops within the box.
  assert(allFinite(out.ops), 'all op coordinates must be finite (no NaN)')
  assert(out.W > 0 && out.height > 0, 'dimensions must be positive')
  for (const o of out.ops) {
    const right = o.kind === 'rect' ? o.x + o.w : o.x
    assert(o.x >= 0 && right <= out.W + 0.5, `op exceeds panel width: ${JSON.stringify(o)}`)
    assert(o.y >= 0 && o.y <= out.height + 0.5, `op exceeds panel height: ${JSON.stringify(o)}`)
  }

  // 3. Title present exactly once, heavy weight, full-width.
  const titles = tx.filter((t) => t.text === 'Nutrition Facts')
  assert(titles.length === 1, 'exactly one title')
  assert(titles[0]!.weight >= 700 && titles[0]!.size <= TITLE_SIZE_MAX, 'title is bold and sized within cap')

  // 4. Exactly one Calories NUMBER per column, matching the input, left→right.
  const calNums = tx.filter((t) => t.size === CAL_NUM_SIZE && t.anchor === 'middle')
  assert(calNums.length === cols.length, `one Calories number per column (got ${calNums.length}, want ${cols.length})`)
  cols.forEach((c, i) => {
    const want = caloriesNum(c.data.rows.find((r) => r.id === 'calories'))
    assert(calNums[i]!.text === want, `column ${i} calories ${calNums[i]!.text} !== ${want}`)
  })
  // Column centers strictly increasing (no overlap / correct ordering).
  for (let i = 1; i < calNums.length; i++) {
    assert(calNums[i]!.x > calNums[i - 1]!.x, 'calorie columns must be left→right, non-overlapping')
  }

  // 5. Each column shows its %DV for a DV-bearing row (added sugars), all bold.
  const dvPercents = tx.filter((t) => t.text.endsWith('%') && t.weight >= 700 && t.anchor === 'end')
  assert(dvPercents.length >= cols.length, 'each column contributes bold %DV cells')
  // Added-sugars %DV values 2/4/0 → "2%","4%"; 0% is still emitted as "0%".
  assert(tx.some((t) => t.text === '2%' && t.weight >= 700), 'Mango added-sugars 2% present and bold')
  assert(tx.some((t) => t.text === '4%' && t.weight >= 700), 'Strawberry added-sugars 4% present and bold')

  // 6. Mandatory non-indented names are bold; an indented sub-nutrient is regular.
  const bold = (label: string) => tx.some((t) => t.text === label && t.weight >= 700 && t.anchor === 'start')
  const regular = (label: string) => tx.some((t) => t.text === label && t.weight < 700 && t.anchor === 'start')
  assert(bold('Total Fat') && bold('Sodium') && bold('Total Carbohydrate') && bold('Protein'), 'mandatory names bold')
  assert(regular('Total Sugars'), 'indented sub-nutrient stays regular weight')

  // 7. Footnote text laid out.
  assert(tx.some((t) => t.text.includes('% Daily Value')), 'footnote present')

  // 8. Width grows with column count (more flavors ⇒ wider aggregate panel).
  const two = layoutVarietyFacts(cols.slice(0, 2))
  assert(out.W > two.W, 'three-column panel is wider than two-column')
}
