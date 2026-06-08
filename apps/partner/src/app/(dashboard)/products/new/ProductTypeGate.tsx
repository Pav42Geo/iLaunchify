'use client'

// First gate of the turnkey builder — pick the product/packing type before
// anything else. Reads the admin-curated PackingProfile catalog; the chosen
// profile's flags (flavorMode, packStructure, labelColumns) structurally shape
// the recipe + label downstream. Locks once a recipe is authored (handled by
// the parent — this screen is the initial choice).
//
// Rendered inside GuidedBuilder's `.gb` style scope.

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
}

// Coarse buckets to organize the 15 profiles into scannable columns.
const BUCKETS: Array<{ title: string; groups: string[] }> = [
  { title: 'Single flavor', groups: ['SINGLE_FLAVOR_SINGLE_PACK', 'SINGLE_FLAVOR_MULTIPACK', 'VALUE_BULK_SINGLE'] },
  { title: 'Multiple flavors', groups: ['MULTI_FLAVOR_MIXED_PACK', 'MULTI_FLAVOR_COMPARTMENT_PACK', 'MULTI_FLAVOR_INDIVIDUAL_IN_OUTER', 'VALUE_BULK_VARIETY'] },
  { title: 'Curated & custom', groups: ['CUSTOMIZABLE_PICK_N', 'SAMPLER_MINI', 'GIFT_PREMIUM', 'SEASONAL_LIMITED', 'PAIRING_FUNCTIONAL', 'RETAIL_COUNTER_DISPLAY', 'REFILL_ECO'] },
  { title: 'Recurring', groups: ['SUBSCRIPTION_ROTATING'] },
]

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
          This is the structural choice — it shapes the recipe (one recipe vs a base + flavor
          presets), the label, and how the pack is composed. You can change it until you start the
          recipe, after which it locks.
        </p>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))' }}>
        {BUCKETS.map((b) => {
          const items = b.groups
            .map((g) => profiles.find((p) => p.group === g))
            .filter((p): p is PackingProfileOption => !!p)
          if (items.length === 0) return null
          return (
            <div key={b.title}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>{b.title}</div>
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
