'use client'

// First gate of the turnkey builder — pick the product/packing type before
// anything else. Reads the admin-curated PackingProfile catalog; the chosen
// profile's flags (flavorMode, packStructure, labelColumns) structurally shape
// the recipe + label downstream. Locks once a recipe is authored (handled by
// the parent — this screen is the initial choice).
//
// Rendered inside GuidedBuilder's `.gb` style scope.

import type { StructuralPackType } from './structuralPackType'

export interface PackingProfileOption {
  id: string
  name: string
  group: string
  example: string | null
  flavorMode: 'SINGLE' | 'MULTI'
  packStructure: string
  labelColumns: number
  isSubscription: boolean
  isCustomizable: boolean
  /** 6-value structural bucket the engine branches on (consolidation); null
   *  until seeded → callers fall back to flavorMode + packStructure. */
  structuralType: StructuralPackType | null
}

// All 15 merchandising presets are kept, but they're organized under the 6
// STRUCTURAL families the engine actually branches on (StructuralPackType). The
// section a preset lands in = its `structuralType`; this makes the structural
// meaning scannable without collapsing the recognizable preset names.
const SECTIONS: Array<{
  st: StructuralPackType
  title: string
  desc: string
}> = [
  { st: 'SINGLE_UNIT', title: 'Single unit', desc: 'One saleable unit, one recipe, one label. A bottle-in-a-box lives here — the carton is a second packaging component you add in the Packaging step.' },
  { st: 'MULTI_UNIT_SAME', title: 'Multipack — same flavor', desc: 'Many identical units, one recipe, one label.' },
  { st: 'MULTI_FLAVOR_MIXED', title: 'Multiple flavors — mixed', desc: 'Flavors mixed together in one pack; one aggregate label.' },
  { st: 'MULTI_FLAVOR_COMPARTMENT', title: 'Multiple flavors — compartments', desc: 'Flavors kept separate in compartments; multi-column label.' },
  { st: 'PER_FLAVOR_IN_OUTER', title: 'Each flavor its own pack, one outer', desc: 'Variety / gift / sampler / retail — a label & die-line per flavor inside an outer.' },
  { st: 'CUSTOMIZABLE_PICK_N', title: 'Customizable — build-your-own', desc: 'Buyer picks N from a set of flavors.' },
]

// Fallback for any profile not yet carrying a structuralType (un-seeded rows):
// derive the structural bucket from the legacy packStructure so it still sorts.
function structuralBucket(p: PackingProfileOption): StructuralPackType {
  if (p.structuralType) return p.structuralType
  switch (p.packStructure) {
    case 'SINGLE':
      return 'SINGLE_UNIT'
    case 'MULTI_SAME':
      return 'MULTI_UNIT_SAME'
    case 'COMBINED':
      return 'MULTI_FLAVOR_MIXED'
    case 'COMPARTMENT':
      return 'MULTI_FLAVOR_COMPARTMENT'
    case 'CUSTOMIZABLE':
      return 'CUSTOMIZABLE_PICK_N'
    default:
      return 'PER_FLAVOR_IN_OUTER'
  }
}

export function ProductTypeGate({
  profiles,
  selectedId,
  onChoose,
}: {
  profiles: PackingProfileOption[]
  selectedId: string | null
  onChoose: (p: PackingProfileOption) => void
}) {
  return (
    <div>
      <div className="hero">
        <div className="eyebrow">Manufacturing · New product</div>
        <h1 className="display" style={{ fontSize: 26, marginTop: 4 }}>What kind of product is this?</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          The structural choice — it shapes the recipe, the label, and how the pack is composed. Locks once you start the recipe.
        </p>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))' }}>
        {SECTIONS.map((b) => {
          const items = profiles.filter((p) => structuralBucket(p) === b.st)
          if (items.length === 0) return null
          return (
            <div key={b.st}>
              <div className="eyebrow" style={{ marginBottom: 2 }}>{b.title}</div>
              <div className="tiny muted" style={{ marginBottom: 8, lineHeight: 1.35 }}>{b.desc}</div>
              <div className="grid" style={{ gap: 8 }}>
                {items.map((p) => {
                  const on = selectedId === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onChoose(p)}
                      className="ptcard"
                      data-on={on ? 'on' : undefined}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <b>{p.name}</b>
                        {on && <span className="pill pink" style={{ padding: '1px 8px' }}>✓ selected</span>}
                      </div>
                      {p.example && <div className="tiny muted" style={{ marginTop: 3 }}>{p.example}</div>}
                      <div className="row" style={{ gap: 6, marginTop: 7 }}>
                        <span className="pill" style={{ padding: '1px 8px', fontSize: 10 }}>
                          {p.flavorMode === 'MULTI' ? 'base + flavor presets' : 'one recipe'}
                        </span>
                        {p.labelColumns > 1 && <span className="pill" style={{ padding: '1px 8px', fontSize: 10 }}>{p.labelColumns}-col label</span>}
                        {p.isSubscription && <span className="pill" style={{ padding: '1px 8px', fontSize: 10 }}>subscription</span>}
                        {p.isCustomizable && <span className="pill" style={{ padding: '1px 8px', fontSize: 10 }}>pick-N</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <style>{`
        .gb .ptcard{border:1px solid var(--ink-200);border-radius:14px;background:#fff;padding:12px 14px;text-align:left;cursor:pointer;font:inherit;color:var(--ink-900);transition:.12s;width:100%}
        .gb .ptcard:hover{border-color:var(--pink-100);box-shadow:0 4px 16px -10px rgba(0,0,0,.2)}
        .gb .ptcard[data-on=on]{border-color:var(--pink);background:var(--pink-50)}
      `}</style>
    </div>
  )
}
