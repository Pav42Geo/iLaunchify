'use client'

// MaterialDrawer — F3b. The creator picks their LABEL STOCK (substrate) and
// PACKAGING MATERIAL here, in the Studio, beside the die-line they are designing.
//
// This is the picker the FinishesDrawer header promised and never got: "substrate
// isn't selected in the Studio yet ... ships in F3b." Until it existed, placeOrder
// hard-required these two fields while NOTHING wrote them, so every new order was
// refused and the DB held one seed order. See material-actions.ts.
//
// NOT a price control (Blocker 2/4): the manufacturer's band sets the price. These
// are production specs that flow into the printer's manifest, so the choice reads
// as "what your label + packaging are made of", never a cost.
//
// Selection persists to the shared CheckoutDraft via setDesignMaterials, which is
// exactly what checkout reads. Pick here -> checkout unblocks.

import * as React from 'react'
import { Layers, Check, Loader2, Leaf } from 'lucide-react'
import type { StudioMaterial } from '../page'
import { setDesignMaterials, getDesignMaterials } from '../material-actions'

const sectionLabel = 'text-[12px] font-bold uppercase tracking-wider text-ink-700'

// #30 — human label for the "no label stock needed" note.
const DECORATION_LABEL: Record<string, string> = {
  DIRECT_PRINT: 'Direct print',
  SHRINK_SLEEVE: 'A shrink sleeve',
  IN_MOLD_LABEL: 'An in-mold label',
  HEAT_TRANSFER: 'A heat transfer',
  FOIL_STAMP: 'Foil stamping',
  EMBOSS: 'Embossing',
  DEBOSS: 'Debossing',
  SPOT_UV: 'Spot UV',
  NONE: 'Your decoration',
}

function ecoLabel(tier: string): string | null {
  if (!tier || tier === 'STANDARD') return null
  return tier.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}

function OptionRow({
  opt,
  selected,
  onPick,
  disabled,
}: {
  opt: StudioMaterial
  selected: boolean
  onPick: () => void
  disabled: boolean
}) {
  const eco = ecoLabel(opt.sustainabilityTier)
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className={`flex w-full items-start gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
        selected
          ? 'border-pink-500 bg-pink-50/60 ring-1 ring-pink-500'
          : 'border-ink-200 bg-white hover:border-ink-300'
      }`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${
          selected ? 'border-pink-500 bg-pink-500 text-white' : 'border-ink-300 bg-white'
        }`}
      >
        {selected && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="text-[12.5px] font-semibold text-ink-900">{opt.name}</span>
          {eco && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-success-50 px-1.5 py-0.5 text-[10px] font-semibold text-success-700">
              <Leaf className="h-2.5 w-2.5" />
              {eco}
            </span>
          )}
        </span>
        {opt.description && (
          <span className="mt-0.5 block text-[11.5px] leading-[1.45] text-ink-600">{opt.description}</span>
        )}
      </span>
    </button>
  )
}

export function MaterialDrawer({
  productId,
  substrates,
}: {
  productId: string
  // #38 (2026-07-19): LABEL STOCK only. PACKAGING moved to the PDP (the container
  // offering IS the packaging), so the unscoped platform packaging-material list that
  // showed "Aluminum Bottle" on a sachet is gone (the packagingMaterials prop retired).
  substrates: StudioMaterial[]
}) {
  const [substrateSlug, setSubstrateSlug] = React.useState<string | null>(null)
  const [loaded, setLoaded] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [savedAt, setSavedAt] = React.useState<number | null>(null)
  // #30: label stock applies only for a pressure-sensitive label. Default true so we
  // don't flash "not needed" before the decoration loads; the method sets it straight.
  const [labelStockApplies, setLabelStockApplies] = React.useState(true)
  const [decorationMethod, setDecorationMethod] = React.useState<string>('NONE')

  // Hydrate the label-stock pin + whether label stock applies (from the PDP-picked
  // decoration) from the shared checkout draft + PRIMARY container on mount.
  React.useEffect(() => {
    let alive = true
    getDesignMaterials(productId).then((r) => {
      if (!alive) return
      if (r.ok) {
        setSubstrateSlug(r.substrateSlug ?? null)
        setLabelStockApplies(r.labelStockApplies ?? false)
        setDecorationMethod(r.decorationMethod ?? 'NONE')
      }
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [productId])

  // Persist on every change. Toggling a selected row OFF clears it (null). Packaging
  // material is retired here, so we always write it null: the PDP container is the
  // packaging now, and placeOrder no longer requires packagingMaterialSlug (#38).
  const pickSubstrate = React.useCallback(
    async (slug: string) => {
      const next = substrateSlug === slug ? null : slug
      setSubstrateSlug(next)
      setSaving(true)
      const r = await setDesignMaterials({ productId, substrateSlug: next, packagingMaterialSlug: null })
      setSaving(false)
      if (r.ok) setSavedAt(Date.now())
    },
    [productId, substrateSlug],
  )

  const picked = !!substrateSlug
  const decorationLabel = DECORATION_LABEL[decorationMethod] ?? 'Your decoration'

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-1.5">
          <Layers className="h-4 w-4 text-ink-700" />
          <h3 className="text-[13px] font-semibold text-ink-900">Label stock</h3>
        </div>
        <p className="mt-1 text-[11.5px] leading-[1.5] text-ink-600">
          What your label prints on. A production spec, not a cost: your price comes
          from the volume tier. Packaging is chosen on the product page.
        </p>
      </div>

      {loaded && !labelStockApplies ? (
        // #30: label stock applies ONLY for a pressure-sensitive label. Every other
        // decoration prints on the container directly, so there is no stock to choose
        // (and placeOrder does not require one).
        <div className="rounded-md border border-dashed border-ink-200 bg-ink-50/60 p-4">
          <div className="flex items-start gap-2.5">
            <Layers className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-500" />
            <div>
              <div className="text-[12.5px] font-bold text-ink-900">No label stock needed</div>
              <p className="mt-1 text-[11.5px] leading-[1.5] text-ink-600">
                {decorationLabel} prints on the container directly, so there is no
                separate label stock to choose. Your decoration is set on the product page.
              </p>
            </div>
          </div>
        </div>
      ) : substrates.length === 0 ? (
        <div className="rounded-md border border-dashed border-ink-200 bg-ink-50/60 p-4">
          <div className="flex items-start gap-2.5">
            <Layers className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-500" />
            <div>
              <div className="text-[12.5px] font-bold text-ink-900">No label stocks available</div>
              <p className="mt-1 text-[11.5px] leading-[1.5] text-ink-600">
                The label-stock catalog is empty. This is admin-seeded data, contact
                iLaunchify support if you expected options here.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <div className={sectionLabel}>Label stock</div>
            <div className="space-y-1.5">
              {substrates.map((s) => (
                <OptionRow
                  key={s.slug}
                  opt={s}
                  selected={substrateSlug === s.slug}
                  onPick={() => pickSubstrate(s.slug)}
                  disabled={!loaded || saving}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5 border-t border-ink-100 pt-3 text-[11.5px]">
            {saving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-ink-500" />
                <span className="text-ink-500">Saving&hellip;</span>
              </>
            ) : picked ? (
              <>
                <Check className="h-3.5 w-3.5 text-success-600" strokeWidth={3} />
                <span className="font-medium text-success-700">Label stock set.</span>
              </>
            ) : (
              <span className="font-medium text-ink-500">
                {savedAt ? 'Saved. ' : ''}Pick a label stock to continue to checkout.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
