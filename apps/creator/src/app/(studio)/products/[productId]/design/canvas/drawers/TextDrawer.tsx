'use client'

// TextDrawer — left-rail Text tool drawer.
// Per docs/DESIGN_STUDIO_REBUILD.md §3.3 tool #3:
//   - New text field input + "Add to canvas"
//   - Font Combinations cards (click to add heading + subheading pair)
//   - Ready-to-Use chip library, categorized (Storage & Handling, Health &
//     Safety, Nutrition Claims, Sustainability, Usage & Serving, etc.).
//     Click a chip → adds an IText object at canvas center.
//
// Brand fonts (when present) pin to the top of the font combinations row.

import * as React from 'react'
import { Plus, ChevronLeft } from 'lucide-react'
import {
  addText,
  addTextCombo,
  loadBrandFont,
  ElementRail,
  type BrandCanvasAssets,
  type BrandTextStyleSpec,
  type FabricCanvas,
} from '@ilaunchify/ui'

interface Props {
  canvas: FabricCanvas | null
  brandAssets: BrandCanvasAssets
}

export function TextDrawer({ canvas, brandAssets }: Props) {
  const [value, setValue] = React.useState('')
  // Canva-style rails: overview shows every group as a slide rail; "See all"
  // drills into one group's full grid. (Pavel 2026-06-23)
  const [seeAll, setSeeAll] = React.useState<'combos' | ChipCategoryKey | null>(null)

  // Text-style roles win when assigned (Slice 2c font + Slice 4 size/weight/case/color);
  // otherwise fall back to the first/second brand fonts + primary color.
  const headingSpec = brandAssets.textStyles?.heading
  const bodySpec = brandAssets.textStyles?.body
  const brandHeadingFont = headingSpec?.fontFamily ?? brandAssets.fonts[0]?.family ?? 'Bricolage Grotesque'
  const brandBodyFont = bodySpec?.fontFamily ?? brandAssets.fonts[1]?.family ?? 'Inter'
  const brandFill =
    brandAssets.colorPrimary ?? brandAssets.extraSwatches[0] ?? '#0F1116'

  // Ensure brand fonts (incl. uploaded custom fonts via @font-face) are loaded before
  // they're applied, so the canvas renders the real face. (Slice 2b)
  React.useEffect(() => {
    for (const f of brandAssets.fonts) void loadBrandFont(f.family, f.webfontUrl)
  }, [brandAssets.fonts])

  function handleAdd() {
    if (!canvas || !value.trim()) return
    addText(canvas, applyCase(value.trim(), bodySpec?.textCase), bodyOpts(bodySpec, brandBodyFont, brandFill))
    setValue('')
  }

  function handleAddChip(text: string) {
    if (!canvas) return
    addText(canvas, applyCase(text, bodySpec?.textCase), bodyOpts(bodySpec, brandBodyFont, brandFill, 18))
  }

  function handleAddCombo(combo: { heading: string; sub: string }) {
    if (!canvas) return
    addTextCombo(canvas, combo.heading, combo.sub, {
      headingFont: brandHeadingFont,
      bodyFont: brandBodyFont,
      fill: brandFill,
    })
  }

  return (
    <div className="space-y-6">
      {/* New Text Field */}
      <section>
        <div className="text-[12px] font-bold uppercase tracking-wider text-ink-700 mb-2">
          Add custom text
        </div>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAdd()
              }
            }}
            placeholder="Type your text…"
            className="flex-1 h-9 px-3 text-sm border border-ink-300 rounded-md focus:outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-500/15 transition-colors"
            disabled={!canvas}
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!canvas || !value.trim()}
            className="h-9 px-3 inline-flex items-center gap-1 text-sm font-semibold bg-ink-900 text-white rounded-md hover:bg-black disabled:opacity-40 disabled:hover:bg-ink-900 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-ink-500">
          Lands at canvas center · double-click to edit
        </p>
      </section>

      {seeAll ? (
        // ---- Drill-in: one group's full grid ----
        <div className="overflow-x-clip">
          <button
            type="button"
            onClick={() => setSeeAll(null)}
            className="mb-3 inline-flex items-center gap-1 text-[12px] font-semibold text-ink-600 hover:text-ink-900"
          >
            <ChevronLeft className="h-4 w-4" /> All text
          </button>
          <div className="mb-3 text-[15px] font-semibold text-ink-900">
            {seeAll === 'combos' ? 'Font combinations' : CHIP_LIBRARY[seeAll].label}
          </div>
          {seeAll === 'combos' ? (
            <div className="grid grid-cols-2 gap-2">
              {FONT_COMBOS.map((combo) => (
                <ComboCard
                  key={combo.heading}
                  combo={combo}
                  headingFont={brandHeadingFont}
                  bodyFont={brandBodyFont}
                  disabled={!canvas}
                  onClick={() => handleAddCombo(combo)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {CHIP_LIBRARY[seeAll].items.map((item) => (
                <ChipButton
                  key={item}
                  item={item}
                  disabled={!canvas}
                  onClick={() => handleAddChip(item)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        // ---- Overview: every group as a slide rail ----
        <div className="overflow-x-clip">
          <ElementRail label="Font combinations" onSeeAll={() => setSeeAll('combos')}>
            {FONT_COMBOS.map((combo) => (
              <ComboCard
                key={combo.heading}
                combo={combo}
                headingFont={brandHeadingFont}
                bodyFont={brandBodyFont}
                disabled={!canvas}
                onClick={() => handleAddCombo(combo)}
                rail
              />
            ))}
          </ElementRail>

          {(Object.keys(CHIP_LIBRARY) as ChipCategoryKey[]).map((key) => (
            <ElementRail
              key={key}
              label={CHIP_LIBRARY[key].label}
              onSeeAll={() => setSeeAll(key)}
            >
              {CHIP_LIBRARY[key].items.map((item) => (
                <ChipButton
                  key={item}
                  item={item}
                  disabled={!canvas}
                  onClick={() => handleAddChip(item)}
                  rail
                />
              ))}
            </ElementRail>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Tiles
// ============================================================================

function ComboCard({
  combo,
  headingFont,
  bodyFont,
  disabled,
  onClick,
  rail,
}: {
  combo: { heading: string; sub: string }
  headingFont: string
  bodyFont: string
  disabled?: boolean
  onClick: () => void
  rail?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        'text-left rounded-md border border-ink-200 bg-white p-3 transition-all hover:border-pink-300 hover:shadow-sm disabled:opacity-50 ' +
        (rail ? 'w-44 shrink-0 snap-start' : '')
      }
    >
      <div className="font-bold text-[15px] leading-tight text-ink-900" style={{ fontFamily: headingFont }}>
        {combo.heading}
      </div>
      <div className="mt-0.5 text-[11px] text-ink-500" style={{ fontFamily: bodyFont }}>
        {combo.sub}
      </div>
    </button>
  )
}

function ChipButton({
  item,
  disabled,
  onClick,
  rail,
}: {
  item: string
  disabled?: boolean
  onClick: () => void
  rail?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        'rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] text-ink-700 transition-colors hover:border-pink-300 hover:bg-pink-50 hover:text-pink-700 disabled:opacity-50 ' +
        (rail ? 'shrink-0 snap-start whitespace-nowrap' : '')
      }
    >
      {item}
    </button>
  )
}

// ============================================================================
// Brand text-style application (Slice 4)
// ============================================================================

/** Map a brand fontWeight label (or numeric string) to a fabric-friendly value. */
function cssWeight(w?: string | null): number | string | undefined {
  if (!w) return undefined
  if (/^\d+$/.test(w)) return Number(w)
  const map: Record<string, number | string> = {
    Regular: 'normal',
    Medium: 500,
    SemiBold: 600,
    Bold: 'bold',
  }
  return map[w]
}

/** Transform text per a style's textCase (applied at add time — fabric has no CSS case). */
function applyCase(text: string, c?: string | null): string {
  switch (c) {
    case 'uppercase':
      return text.toUpperCase()
    case 'lowercase':
      return text.toLowerCase()
    case 'capitalize':
      return text.replace(/\b\w/g, (ch) => ch.toUpperCase())
    default:
      return text
  }
}

/** Build addText opts from a body/role spec, falling back to brand font + fill. */
function bodyOpts(
  spec: BrandTextStyleSpec | undefined,
  fallbackFont: string,
  fallbackFill: string,
  fallbackSize?: number,
): { fontFamily: string; fill: string; fontSize?: number; fontWeight?: number | string } {
  const weight = cssWeight(spec?.fontWeight)
  const size = spec?.fontSize ?? fallbackSize
  return {
    fontFamily: spec?.fontFamily ?? fallbackFont,
    fill: spec?.color ?? fallbackFill,
    ...(size != null ? { fontSize: size } : {}),
    ...(weight !== undefined ? { fontWeight: weight } : {}),
  }
}

// ============================================================================
// Data — font combinations + ready-to-use chip catalog
// ============================================================================

const FONT_COMBOS: Array<{ heading: string; sub: string }> = [
  { heading: 'Product name', sub: 'Tagline goes here' },
  { heading: 'Energy Boost', sub: '20g protein · vanilla' },
  { heading: 'Hydrate', sub: 'Electrolytes for daily life' },
  { heading: 'Daily Greens', sub: 'Organic superfoods · 30 servings' },
]

type ChipCategoryKey =
  | 'storage'
  | 'health'
  | 'claims'
  | 'sustainability'
  | 'usage'
  | 'alcohol'
  | 'baby'

const CHIP_LIBRARY: Record<
  ChipCategoryKey,
  { label: string; items: string[] }
> = {
  storage: {
    label: 'Storage & Handling',
    items: [
      'Refrigerate after opening',
      'Keep in a cool, dry place',
      'Do not freeze',
      'Store below 25°C / 77°F',
      'Use within 14 days of opening',
      'Shake well before use',
      'Best when consumed within 30 days',
      'Avoid direct sunlight',
    ],
  },
  health: {
    label: 'Health & Safety',
    items: [
      'Contains: milk, soy',
      'May contain traces of tree nuts',
      'Not intended for children under 18',
      'Consult your doctor if pregnant or nursing',
      'Discontinue use if irritation occurs',
      'Keep out of reach of children',
      'Do not use if seal is broken',
      'Allergen-free facility',
    ],
  },
  claims: {
    label: 'Nutrition Claims',
    items: [
      'High in protein',
      'Excellent source of fiber',
      'Low sugar',
      'No added sugar',
      'Sugar-free',
      'Zero calories',
      '0g trans fat',
      'Naturally sweetened',
      'High in vitamin C',
      'Caffeine-free',
    ],
  },
  sustainability: {
    label: 'Sustainability',
    items: [
      'Made with recycled materials',
      'Recyclable packaging',
      'Carbon-neutral shipping',
      'Plant-based ingredients',
      'Sustainably sourced',
      'Cruelty-free',
      'BPA-free',
      'Fair Trade certified',
    ],
  },
  usage: {
    label: 'Usage & Serving',
    items: [
      'Mix one scoop with 8 fl oz water',
      'Take 2 capsules daily with food',
      'Best enjoyed cold',
      'Serves 2',
      'Heat for 30 seconds',
      'Ready to drink',
      'Add to smoothies, yogurt, or oats',
    ],
  },
  alcohol: {
    label: 'Alcohol',
    items: [
      'Government Warning',
      'Drink responsibly',
      '21+ ID required',
      'Contains sulfites',
      'Please recycle',
      'Surgeon General warning',
      'ABV 5.2%',
    ],
  },
  baby: {
    label: 'Baby & Specialty',
    items: [
      'For ages 6+ months',
      'Pediatrician recommended',
      'No artificial colors or flavors',
      'Organic',
      'Made with love',
      'First foods',
      'Sensitive skin',
    ],
  },
}
