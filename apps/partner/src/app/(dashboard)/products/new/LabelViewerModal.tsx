'use client'

// Multipack Nutrition Facts label viewer. Two views over the same set of
// per-flavor panels:
//   • Compare — the FDA aggregate multi-column panel (21 CFR 101.9(d)(13)),
//     with one column per SELECTED flavor, so the manufacturer compares them.
//   • Individual — a grid of each selected flavor's own single-column label.
// Flavor chips toggle which flavors are included in both views. Purely driven
// by VarietyColumn[] (label + PanelData); no engine/recipe coupling.

import { useEffect, useState } from 'react'
import { NutritionFactsSvg, VarietyFactsSvg, type VarietyColumn } from '@ilaunchify/ui'

export function LabelViewerModal({
  columns,
  productName,
  netContents,
  onClose,
}: {
  columns: VarietyColumn[]
  productName?: string
  /** Multiunit net-contents statement for the outer box (21 CFR 101.7(q)). */
  netContents?: string
  onClose: () => void
}): JSX.Element {
  const [view, setView] = useState<'compare' | 'individual'>('compare')
  // Which flavors are included (by index). Default: all.
  const [included, setIncluded] = useState<Set<number>>(() => new Set(columns.map((_, i) => i)))

  // Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const selected = columns.filter((_, i) => included.has(i))
  const toggle = (i: number) =>
    setIncluded((prev) => {
      const next = new Set(prev)
      if (next.has(i)) { if (next.size > 1) next.delete(i) } // keep ≥1
      else next.add(i)
      return next
    })

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nutrition Facts label viewer"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(17,17,19,0.55)',
        backdropFilter: 'blur(2px)', display: 'grid', placeItems: 'center', padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(1040px, 96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          background: '#fff', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.35)', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid #E0E1E5' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#18181A', lineHeight: 1.2 }}>Nutrition Facts — labels</div>
            <div style={{ fontSize: 12.5, color: '#6B6D78', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {productName ? `${productName} · ` : ''}{columns.length} flavor{columns.length === 1 ? '' : 's'}
            </div>
          </div>
          {/* View toggle */}
          <div style={{ marginLeft: 'auto', display: 'inline-flex', border: '1px solid #E0E1E5', borderRadius: 999, padding: 2, background: '#F7F6F3' }}>
            {(['compare', 'individual'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                style={{
                  border: 0, cursor: 'pointer', borderRadius: 999, padding: '6px 14px', fontSize: 12.5, fontWeight: 600,
                  background: view === v ? '#18181A' : 'transparent', color: view === v ? '#fff' : '#33343C',
                }}
              >
                {v === 'compare' ? 'Compare columns' : 'Individual labels'}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 22, lineHeight: 1, color: '#6B6D78', padding: '2px 6px' }}>×</button>
        </div>

        {/* Flavor chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 20px', borderBottom: '1px solid #F1F1F3', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: '#6B6D78', marginRight: 2 }}>
            {view === 'compare' ? 'Columns' : 'Show'}
          </span>
          {columns.map((c, i) => {
            const on = included.has(i)
            return (
              <button
                key={i}
                type="button"
                onClick={() => toggle(i)}
                aria-pressed={on}
                style={{
                  cursor: 'pointer', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, fontWeight: 600,
                  border: on ? '1.5px solid #FF2E63' : '1px solid #CBCCD3',
                  background: on ? '#FFE9F0' : '#fff', color: on ? '#C71350' : '#6B6D78',
                }}
              >
                {c.label || `Flavor ${i + 1}`}
              </button>
            )
          })}
          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#6B6D78' }}>{selected.length} selected</span>
        </div>

        {/* Body */}
        <div style={{ overflow: 'auto', padding: 20, background: '#F8F8F9' }}>
          {view === 'compare' ? (
            <div style={{ overflowX: 'auto', display: 'grid', placeItems: 'start center', gap: 12 }}>
              <VarietyFactsSvg columns={selected} widthPx={Math.min(880, 200 + selected.length * 96)} />
              {netContents && (
                <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: '0.01em', color: '#18181A', textAlign: 'center' }}>
                  {netContents}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16 }}>
              {selected.map((c, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#18181A' }}>{c.label || `Flavor ${i + 1}`}</div>
                  <NutritionFactsSvg data={c.data} contains={c.contains} widthPx={250} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer note */}
        <div style={{ padding: '10px 20px', borderTop: '1px solid #F1F1F3', fontSize: 11.5, color: '#6B6D78' }}>
          {view === 'compare'
            ? 'Aggregate multi-column panel for the outer carton (21 CFR 101.9(d)(13)). Each unit still carries its own single-flavor label.'
            : 'Each flavor’s own single-column Nutrition Facts — what prints on the individual unit.'}
        </div>
      </div>
    </div>
  )
}
