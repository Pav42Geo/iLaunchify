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
import { Plus } from 'lucide-react'
import {
  addText,
  addTextCombo,
  type BrandCanvasAssets,
  type FabricCanvas,
} from '@ilaunchify/ui'

interface Props {
  canvas: FabricCanvas | null
  brandAssets: BrandCanvasAssets
}

export function TextDrawer({ canvas, brandAssets }: Props) {
  const [value, setValue] = React.useState('')
  const [category, setCategory] = React.useState<ChipCategoryKey>('storage')

  const brandHeadingFont = brandAssets.fonts[0]?.family ?? 'Bricolage Grotesque'
  const brandBodyFont = brandAssets.fonts[1]?.family ?? 'Inter'
  const brandFill =
    brandAssets.colorPrimary ?? brandAssets.extraSwatches[0] ?? '#0F1116'

  function handleAdd() {
    if (!canvas || !value.trim()) return
    addText(canvas, value.trim(), { fontFamily: brandBodyFont, fill: brandFill })
    setValue('')
  }

  function handleAddChip(text: string) {
    if (!canvas) return
    addText(canvas, text, { fontFamily: brandBodyFont, fill: brandFill, fontSize: 18 })
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
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
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

      {/* Font Combinations */}
      <section>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
          Font Combinations
          {brandAssets.fonts.length > 0 && (
            <span className="ml-2 inline-block text-pink-700 normal-case font-normal tracking-normal">
              · using your brand fonts
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {FONT_COMBOS.map((combo) => (
            <button
              key={combo.heading}
              type="button"
              onClick={() => handleAddCombo(combo)}
              disabled={!canvas}
              className="text-left rounded-md border border-ink-200 hover:border-pink-300 hover:shadow-sm bg-white p-3 transition-all disabled:opacity-50"
            >
              <div
                className="font-bold text-[15px] text-ink-900 leading-tight"
                style={{ fontFamily: brandHeadingFont }}
              >
                {combo.heading}
              </div>
              <div
                className="text-[11px] text-ink-500 mt-0.5"
                style={{ fontFamily: brandBodyFont }}
              >
                {combo.sub}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Ready-to-Use chip library */}
      <section>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
          Ready-to-Use
        </div>
        <div className="flex gap-1 overflow-x-auto pb-2 mb-2.5 -mx-4 px-4">
          {(Object.keys(CHIP_LIBRARY) as ChipCategoryKey[]).map((key) => {
            const isActive = key === category
            return (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(key)}
                className={
                  'h-7 px-2.5 text-[11px] font-semibold rounded-full whitespace-nowrap transition-colors ' +
                  (isActive
                    ? 'bg-ink-900 text-white'
                    : 'bg-ink-100 text-ink-700 hover:bg-ink-200')
                }
              >
                {CHIP_LIBRARY[key].label}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {CHIP_LIBRARY[category].items.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => handleAddChip(item)}
              disabled={!canvas}
              className="text-[12px] px-2.5 py-1.5 rounded-md border border-ink-200 bg-white text-ink-700 hover:border-pink-300 hover:bg-pink-50 hover:text-pink-700 transition-colors disabled:opacity-50 disabled:hover:border-ink-200 disabled:hover:bg-white disabled:hover:text-ink-700"
            >
              {item}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-ink-500">
          Click any chip to drop it on the canvas. Edit in place by
          double-clicking the text.
        </p>
      </section>
    </div>
  )
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
