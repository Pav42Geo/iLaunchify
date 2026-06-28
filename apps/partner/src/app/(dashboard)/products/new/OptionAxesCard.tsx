'use client'

// "Additional creator options" — configurable axes BEYOND flavor (sweetener,
// strength, caffeine, custom). Each axis is a curated dimension the manufacturer
// defines; the Creator picks one value per axis in the marketplace (if the axis
// is left Creator-editable) or it's locked to the default. Each value carries
// compositional economics (Δ lead time, Δ cost, MOQ override) per
// docs/PRODUCT_CONFIGURATOR_CONSTRAINTS.md. Distinct from optional INGREDIENTS
// (add-ons in the Recipe step) — an axis is a fixed-dimension choice.
//
// Rendered inside GuidedBuilder's `.gb` style scope. Autosaves to the draft.

import type { OptionAxisInput } from './build-actions'
import { SlidersHorizontal } from 'lucide-react'

export interface OptionValueUI {
  label: string
  isDefault: boolean
  leadDelta: number
  costDeltaCents: number
  moqOverride: number | null
  // §12b ingredient operation — bound in the Recipe step (Slice 3).
  overlayOp?: 'NONE' | 'SWAP' | 'ADD' | 'REMOVE'
  overlayIngId?: string
  overlayIngName?: string
  // UI-only preview data (not persisted — the engine refetches per100g by id at
  // order time). Lets the Recipe step show the recomputed panel live.
  overlayPer100g?: Record<string, number>
  overlayQty?: number // ADD quantity — also the per-swap quantity for SWAP rows
  overlayUnit?: string // ADD unit — also the per-swap unit for SWAP rows
  // UI-only editable fields for a SWAP alternative (preview/display; the engine
  // refetches by id at order time). Let the partner tune each replaceable.
  overlayWaste?: number
  overlayCostPerKgCents?: number | null
  overlayDensityGPerMl?: number | null
}
export interface OptionAxisUI {
  key: string // SWEETENER | STRENGTH | CAFFEINE | CUSTOM
  label: string
  editableByCreator: boolean
  affectsLabel: boolean // values change the recipe → Facts label recomputes
  boundSlotId?: string | null // SWAP/REMOVE bind to a base recipe slot (Recipe step)
  values: OptionValueUI[]
}

const PRESETS: Array<{ key: string; label: string }> = [
  { key: 'SWEETENER', label: 'Sweetener' },
  { key: 'STRENGTH', label: 'Strength' },
  { key: 'CAFFEINE', label: 'Caffeine' },
  { key: 'CUSTOM', label: 'Custom option' },
]

function emptyValue(): OptionValueUI {
  return { label: '', isDefault: false, leadDelta: 0, costDeltaCents: 0, moqOverride: null, overlayOp: 'NONE' }
}

/** Map the UI axis list → persistence payload. Used by GuidedBuilder's autosave
 *  (shared state) so axes persist from any step, including Recipe-step bindings. */
export function axesToInput(axes: OptionAxisUI[]): OptionAxisInput[] {
  return axes.map((a, i) => ({
    key: a.key,
    label: a.label,
    layer: 'RECIPE',
    editableByCreator: a.editableByCreator,
    affectsLabel: a.affectsLabel,
    boundSlotId: a.boundSlotId ?? null,
    required: true,
    sortOrder: i,
    values: a.values.map((v, j) => ({
      label: v.label,
      isDefault: v.isDefault,
      leadTimeDeltaDays: v.leadDelta,
      unitCostDeltaCents: v.costDeltaCents,
      moqOverride: v.moqOverride,
      priceDeltaCents: 0,
      overlayOp: v.overlayOp ?? 'NONE',
      recipeOverlay:
        v.overlayOp === 'SWAP' && v.overlayIngId ? { toIngredientId: v.overlayIngId }
        : v.overlayOp === 'ADD' && v.overlayIngId ? { addIngredientId: v.overlayIngId, qty: 0, unit: 'g' }
        : v.overlayOp === 'REMOVE' ? {}
        : null,
      sortOrder: j,
    })),
  }))
}

export function OptionAxesCard({ axes, onAxes }: { axes: OptionAxisUI[]; onAxes: (a: OptionAxisUI[]) => void }) {
  function addAxis(preset: { key: string; label: string }) {
    // Allow multiple CUSTOM axes; cap one of each named preset.
    if (preset.key !== 'CUSTOM' && axes.some((a) => a.key === preset.key)) return
    // Sweetener & Caffeine change the recipe → default affectsLabel on.
    const labelByDefault = preset.key === 'SWEETENER' || preset.key === 'CAFFEINE'
    onAxes([...axes, { key: preset.key, label: preset.label === 'Custom option' ? '' : preset.label, editableByCreator: true, affectsLabel: labelByDefault, values: [{ ...emptyValue(), isDefault: true }] }])
  }
  function patchAxis(i: number, p: Partial<OptionAxisUI>) {
    onAxes(axes.map((a, j) => (j === i ? { ...a, ...p } : a)))
  }
  function patchValue(ai: number, vi: number, p: Partial<OptionValueUI>) {
    onAxes(axes.map((a, j) => (j !== ai ? a : { ...a, values: a.values.map((v, k) => (k === vi ? { ...v, ...p } : v)) })))
  }
  function setDefault(ai: number, vi: number) {
    onAxes(axes.map((a, j) => (j !== ai ? a : { ...a, values: a.values.map((v, k) => ({ ...v, isDefault: k === vi })) })))
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <div className="section-title"><span className="ic"><SlidersHorizontal size={16} strokeWidth={2} /></span> Additional creator options <i className="info" data-tip="Curated choices beyond flavor — e.g. sweetener, roast strength, caffeine. You define every allowed value; the Creator picks one per option in the marketplace, or you lock it to the default. Each value can add lead time, cost, or raise the MOQ. (Different from optional ingredients — those are add-ons, these are fixed-dimension choices.)" tabIndex={0} role="img" aria-label="About creator options">i</i></div>
        </div>
      </div>

      {axes.length === 0 && (
        <p className="tiny muted" style={{ marginTop: 12 }}>No extra options — flavor only. Add one below.</p>
      )}

      {axes.map((axis, ai) => (
        <div key={ai} className="axis" style={{ marginTop: 14 }}>
          <div className="row" style={{ gap: 12, alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div className="field" style={{ minWidth: 200, margin: 0 }}>
              <label>Option name</label>
              <input className="input" value={axis.label} placeholder="e.g. Sweetener" onChange={(e) => patchAxis(ai, { label: e.target.value })} />
            </div>
            <div className="row" style={{ gap: 12, alignItems: 'center' }}>
              <label className="tiny muted" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={axis.editableByCreator} onChange={(e) => patchAxis(ai, { editableByCreator: e.target.checked })} />
                {axis.editableByCreator ? 'Creator can choose' : 'Locked to default'}
              </label>
              <label className="tiny muted" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={axis.affectsLabel} onChange={(e) => patchAxis(ai, { affectsLabel: e.target.checked })} />
                Changes recipe / Facts label
              </label>
              <button className="del" onClick={() => onAxes(axes.filter((_, j) => j !== ai))}>remove option</button>
            </div>
          </div>
          {axis.affectsLabel && (
            <p className="tiny" style={{ marginTop: 6, color: 'var(--pink-700)' }}>
              ⓘ Facts label recomputes per combination — bind each value to its ingredient swap in the Recipe step.
            </p>
          )}

          <table style={{ marginTop: 10 }}>
            <thead>
              <tr><th>Default</th><th>Value</th><th>Δ lead (days)</th><th>Δ cost (¢/unit)</th><th>MOQ override</th><th /></tr>
            </thead>
            <tbody>
              {axis.values.map((v, vi) => (
                <tr key={vi}>
                  <td><input type="radio" name={`def-${ai}`} checked={v.isDefault} onChange={() => setDefault(ai, vi)} /></td>
                  <td><input className="input" value={v.label} placeholder={`Value ${vi + 1}`} onChange={(e) => patchValue(ai, vi, { label: e.target.value })} /></td>
                  <td><input className="input" type="number" min={0} value={v.leadDelta} onChange={(e) => patchValue(ai, vi, { leadDelta: Math.max(0, parseInt(e.target.value, 10) || 0) })} style={{ width: 80 }} /></td>
                  <td><input className="input" type="number" value={v.costDeltaCents} onChange={(e) => patchValue(ai, vi, { costDeltaCents: parseInt(e.target.value, 10) || 0 })} style={{ width: 90 }} /></td>
                  <td><input className="input" type="number" min={1} value={v.moqOverride ?? ''} placeholder="—" onChange={(e) => patchValue(ai, vi, { moqOverride: e.target.value ? Math.max(1, parseInt(e.target.value, 10)) : null })} style={{ width: 100 }} /></td>
                  <td>{axis.values.length > 1 && <button className="del" onClick={() => patchAxis(ai, { values: axis.values.filter((_, k) => k !== vi) })}>🗑</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="rb-btn-add" style={{ marginTop: 8 }} onClick={() => patchAxis(ai, { values: [...axis.values, emptyValue()] })}>+ Add value</button>
        </div>
      ))}

      <div className="row" style={{ gap: 8, marginTop: 16 }}>
        {PRESETS.map((p) => {
          const taken = p.key !== 'CUSTOM' && axes.some((a) => a.key === p.key)
          return (
            <button key={p.key} className="rb-btn-add" disabled={taken} onClick={() => addAxis(p)} style={taken ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}>
              + {p.label}
            </button>
          )
        })}
      </div>

      <style>{`
        .gb .axis{border:1px solid var(--ink-200);border-radius:14px;padding:14px;background:var(--ink-50)}
        .gb .field{margin-bottom:0}
      `}</style>
    </div>
  )
}
