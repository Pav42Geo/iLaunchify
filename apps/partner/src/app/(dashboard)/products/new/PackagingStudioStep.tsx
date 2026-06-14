'use client'

// =============================================================================
// Step 4 — Packaging Studio. A compact launch card in the builder opens an
// IMMERSIVE full-screen studio (like the Design Studio): a parametric three.js
// package (orbit / 3D↔die-line fold), click a decorable SURFACE → resolve it to
// a die-line of the attached packaging's type → open the real Die-line Studio.
// three.js loads from the CDN at runtime via ./packaging-3d (no npm dependency).
// The full-screen surface is portaled to <body> so it escapes the builder layout.
// =============================================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { PACKAGING_DEFS, createPackagingScene, type TopologyKey, type PackagingSceneHandle, type StudioSurfaceDef } from './packaging-3d'
import { loadPackagingStudio, type PackagingStudioData } from './packaging-studio-actions'

const TOPOLOGY_LABEL: Record<TopologyKey, string> = { can: 'Can / bottle', jar: 'Jar + lid', box: 'Carton' }

function toStudioTopology(enumValue: string | undefined): TopologyKey {
  if (enumValue === 'CAPSULE_JAR') return 'jar'
  if (enumValue === 'MULTI_CONTAINER_BOX' || enumValue === 'CASE') return 'box'
  return 'can'
}

function roleChip(sr: StudioSurfaceDef['surfaceRole']): { cls: string; label: string } {
  if (sr === 'pdp') return { cls: 'pdp', label: 'PDP' }
  if (sr === 'info') return { cls: 'info', label: 'Info panel' }
  return { cls: 'na', label: '—' }
}

export function PackagingStudioStep({ draftId, onNext, nextLabel = 'Next step →' }: { draftId: string | null; onNext?: () => void; nextLabel?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const handleRef = useRef<PackagingSceneHandle | null>(null)

  const [data, setData] = useState<PackagingStudioData | null>(null)
  const [open, setOpen] = useState(false)
  const [topology, setTopology] = useState<TopologyKey>('can')
  const [fold, setFold] = useState<'3d' | 'die'>('3d')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [sceneError, setSceneError] = useState<string | null>(null)

  // Load attached packaging + the partner's die-lines (for the launch summary + resolution).
  useEffect(() => {
    if (!draftId) return
    let alive = true
    void loadPackagingStudio(draftId).then((r) => {
      if (!alive) return
      if (r.ok) {
        setData(r.data)
        const firstTyped = r.data.attached.find((a) => a.packagingTypeId) ?? r.data.attached[0]
        if (firstTyped) setTopology(toStudioTopology(firstTyped.topology))
      }
    })
    return () => { alive = false }
  }, [draftId])

  // Spin up / tear down the three.js scene with the full-screen surface.
  useEffect(() => {
    if (!open) return
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    setSceneError(null)
    createPackagingScene(canvas, {
      topology,
      onSelect: (key) => { if (!cancelled) setSelectedKey(key) },
    })
      .then((h) => { if (cancelled) { h.dispose(); return } handleRef.current = h })
      .catch(() => { if (!cancelled) setSceneError('3D preview could not load. Check your connection and retry.') })
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { cancelled = true; handleRef.current?.dispose(); handleRef.current = null; document.body.style.overflow = prevOverflow }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => { if (open) handleRef.current?.setTopology(topology) }, [topology, open])
  useEffect(() => { if (open) handleRef.current?.setFold(fold === '3d') }, [fold, open])

  // Esc closes the studio.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const surfaces = PACKAGING_DEFS[topology].surfaces
  const selected = surfaces.find((s) => s.key === selectedKey) ?? null

  function selectSurface(key: string) {
    setSelectedKey(key)
    handleRef.current?.select(key)
  }

  const primary = useMemo(() => data?.attached.find((a) => a.packagingTypeId) ?? data?.attached[0] ?? null, [data])
  const matchedDielines = useMemo(
    () => (primary?.packagingTypeId ? (data?.dielines ?? []).filter((d) => d.packagingTypeId === primary.packagingTypeId) : []),
    [data, primary],
  )
  const resolvedDieline = matchedDielines[0] ?? null
  const attachedCount = data?.attached.length ?? 0
  const dielineCount = data?.dielines.length ?? 0

  // ---------------------------------------------------------------------------
  // Full-screen studio (portaled to <body> so it escapes the builder layout).
  // ---------------------------------------------------------------------------
  const overlay = open && typeof document !== 'undefined'
    ? createPortal(
      <div className="pkst-fs" role="dialog" aria-modal="true" aria-label="Packaging Studio">
        <header className="pkst-head">
          <div className="pkst-head-l">
            <button type="button" className="pkst-close" aria-label="Close Packaging Studio" onClick={() => setOpen(false)}>‹</button>
            <span className="pkst-logo">◳</span>
            <div>
              <div className="pkst-title">Packaging Studio</div>
              <div className="pkst-sub">{primary ? primary.name : 'No packaging attached'}{primary?.packagingTypeName ? ` · ${primary.packagingTypeName}` : ''}</div>
            </div>
          </div>
          <div className="pkst-head-c">
            <div className="pkst-seg" role="tablist" aria-label="Package shape">
              {(Object.keys(TOPOLOGY_LABEL) as TopologyKey[]).map((t) => (
                <button key={t} type="button" className={t === topology ? 'on' : ''} aria-pressed={t === topology} onClick={() => { setTopology(t); setSelectedKey(null) }}>{TOPOLOGY_LABEL[t]}</button>
              ))}
            </div>
            <div className="pkst-seg" role="tablist" aria-label="View">
              <button type="button" className={fold === '3d' ? 'on' : ''} aria-pressed={fold === '3d'} onClick={() => setFold('3d')}>3D</button>
              <button type="button" className={fold === 'die' ? 'on' : ''} aria-pressed={fold === 'die'} onClick={() => setFold('die')}>Die-line</button>
            </div>
          </div>
          <div className="pkst-head-r">
            {/* Same flow-Next button, same top-right slot as every other step. */}
            <button type="button" className="pkst-next" onClick={() => { setOpen(false); onNext?.() }}>{nextLabel}</button>
          </div>
        </header>

        <div className="pkst-body">
          <div className="pkst-stage">
            <canvas ref={canvasRef} className="pkst-canvas" />
            {sceneError
              ? <div className="pkst-hint err">{sceneError}</div>
              : <div className="pkst-hint">Drag to orbit · scroll to zoom · hover a pink surface · click to open its die-line</div>}
            <div className="pkst-legend">
              <span><i style={{ background: 'var(--pink)' }} /> Decorable</span>
              <span><i style={{ background: 'var(--ink-400)' }} /> Non-printed</span>
            </div>
          </div>

          <aside className="pkst-insp">
            <div className="pkst-eyebrow">Surface map</div>
            <div className="pkst-surfs">
              {surfaces.map((s) => {
                const rc = roleChip(s.surfaceRole)
                const on = s.key === selectedKey
                return (
                  <button key={s.key} type="button" className={'pkst-surf' + (on ? ' on' : '')} disabled={!s.decorable} onClick={() => s.decorable && selectSurface(s.key)}>
                    <span className="sw" style={{ background: s.decorable ? 'var(--pink)' : 'var(--ink-400)' }} />
                    <span className="grow">
                      <span className="nm">{s.label}</span>
                      <span className="rl">role: {s.role}{s.defaultBleedMm ? ` · bleed ${s.defaultBleedMm}mm` : ''}</span>
                    </span>
                    <span className={'pkst-chip ' + rc.cls}>{rc.label}</span>
                  </button>
                )
              })}
            </div>

            {selected ? (
              <div className="pkst-res">
                <div className="pkst-eyebrow" style={{ marginBottom: 6 }}>Resolved · surface → die-line</div>
                <div className="r"><span className="k">Surface</span><span className="v">{selected.label}</span></div>
                <div className="r"><span className="k">Component role</span><span className="v">{selected.role}</span></div>
                <div className="r">
                  <span className="k">Die-line</span>
                  <span className="v">{resolvedDieline ? <>{resolvedDieline.decorationMethod} · <span className="muted">{resolvedDieline.status.toLowerCase()}</span></> : <span className="muted">none of this type yet</span>}</span>
                </div>
                {resolvedDieline
                  ? <Link href={`/dielines/${resolvedDieline.id}`} className="pkst-btn">Open Die-line Studio →</Link>
                  : <Link href="/packaging/dielines/new" className="pkst-btn ghost">Upload / create a die-line →</Link>}
              </div>
            ) : (
              <div className="pkst-empty">Select a decorable surface to resolve its die-line.</div>
            )}

            <div className="pkst-note">
              The maker positions <b>frames</b> on the die-line, not final art. Each frame <b>auto-binds</b> to product data
              (Facts ← computed panel · Manufacturer ← facility · Net wt ← variant), saved as the JSON layout the Creator&apos;s Design Studio reads.
            </div>
          </aside>
        </div>
      </div>,
      document.body,
    )
    : null

  return (
    <div>
      <div className="banner">
        ℹ︎ <b>Platform library is the default.</b> Admin curates 3D mockups + normalized die-lines. Custom uploads route to an admin verification queue; the product can&apos;t go LIVE until die-lines are verified.
      </div>

      <div className="card pst-launch">
        <div className="pst-launch-l">
          <div className="section-title" style={{ fontSize: 15 }}>
            <span className="ic">◳</span> Packaging Studio <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· 3D · die-line frames</span>
          </div>
          <p className="tiny muted" style={{ marginTop: 6, maxWidth: 460 }}>
            Open the full-screen studio to rotate the package, click a decorable surface, and lay out its mandatory-element die-line frames.
          </p>
          <div className="pst-launch-meta">
            <span className="pill">{attachedCount} packaging attached</span>
            <span className="pill">{dielineCount} die-line{dielineCount === 1 ? '' : 's'}</span>
          </div>
        </div>
        <button type="button" className="pst-open" disabled={!draftId} onClick={() => setOpen(true)}>
          {draftId ? 'Open Packaging Studio →' : 'Save the draft first'}
        </button>
      </div>

      {overlay}

      <style>{`
        .gb .pst-launch{margin-top:14px;display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap}
        .gb .pst-launch-meta{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
        .gb .pst-launch .pill{font-size:11px;font-weight:600;color:var(--ink-600);background:var(--ink-50);border:1px solid var(--ink-200);border-radius:999px;padding:4px 11px}
        .gb .pst-open{flex:none;border-radius:999px;padding:11px 20px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;border:1px solid var(--pink);background:var(--pink);color:#fff;transition:.15s}
        .gb .pst-open:hover:not(:disabled){background:var(--pink-700);border-color:var(--pink-700)}
        .gb .pst-open:disabled{background:#fff;border-color:var(--ink-200);color:var(--ink-400);cursor:not-allowed}

        /* Full-screen studio — portaled outside .gb, so styles are unscoped. */
        .pkst-fs{position:fixed;inset:0;z-index:80;display:flex;flex-direction:column;background:var(--ink-50,#F8F8F9);font-family:Inter,system-ui,sans-serif;color:var(--ink-900,#18181A)}
        .pkst-head{display:flex;align-items:center;justify-content:space-between;gap:16px;height:60px;padding:0 16px;background:#fff;border-bottom:1px solid var(--ink-200,#E0E1E5);flex:none}
        .pkst-head-l{display:flex;align-items:center;gap:10px;min-width:0}
        .pkst-close{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;border:1px solid var(--ink-200,#E0E1E5);background:#fff;font-size:22px;line-height:1;color:var(--ink-700,#33343C);cursor:pointer}
        .pkst-close:hover{background:var(--ink-50,#F8F8F9)}
        .pkst-logo{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--pink,#FF2E63);color:#fff;font-size:15px}
        .pkst-title{font-size:14px;font-weight:700;letter-spacing:-.01em}
        .pkst-sub{font-size:11.5px;color:var(--ink-500,#6B6D78);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:42vw}
        .pkst-head-c{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
        .pkst-seg{display:inline-flex;border:1px solid var(--ink-200,#E0E1E5);border-radius:999px;padding:3px;background:#fff;gap:3px}
        .pkst-seg button{border:0;background:transparent;padding:6px 13px;border-radius:999px;font:inherit;font-size:12px;font-weight:600;color:var(--ink-600,#474954);cursor:pointer;transition:.12s}
        .pkst-seg button.on{background:var(--ink-900,#18181A);color:#fff}
        .pkst-next{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:8px 16px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;border:1px solid #FF2E63;background:#FF2E63;color:#fff;transition:.15s}
        .pkst-next:hover{background:#E11D54;border-color:#E11D54}
        .pkst-body{flex:1;min-height:0;display:grid;grid-template-columns:1fr 340px}
        @media(max-width:820px){.pkst-body{grid-template-columns:1fr}}
        .pkst-stage{position:relative;background:radial-gradient(120% 120% at 50% 0%,#fff,#eceef0 70%,#e2e4e7)}
        .pkst-canvas{display:block;width:100%;height:100%}
        .pkst-hint{position:absolute;left:16px;bottom:14px;font-size:11.5px;color:var(--ink-500,#6B6D78);background:rgba(255,255,255,.82);border:1px solid var(--ink-200,#E0E1E5);border-radius:10px;padding:6px 11px}
        .pkst-hint.err{color:var(--pink-700,#C71350);border-color:var(--pink-100,#F4C0D1);background:var(--pink-50,#FBEAF0)}
        .pkst-legend{position:absolute;right:16px;top:14px;display:flex;gap:14px;font-size:11px;color:var(--ink-500,#6B6D78);background:rgba(255,255,255,.82);border:1px solid var(--ink-200,#E0E1E5);border-radius:10px;padding:6px 10px}
        .pkst-legend span{display:inline-flex;align-items:center;gap:6px}
        .pkst-legend i{width:10px;height:10px;border-radius:3px;display:inline-block}
        .pkst-insp{border-left:1px solid var(--ink-200,#E0E1E5);background:#fff;padding:18px 16px;overflow:auto}
        .pkst-eyebrow{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.16em;color:var(--ink-500,#6B6D78)}
        .pkst-surfs{margin-top:10px;display:flex;flex-direction:column;gap:7px}
        .pkst-surf{display:flex;align-items:center;gap:10px;text-align:left;border:1px solid var(--ink-200,#E0E1E5);border-radius:11px;background:#fff;padding:9px 11px;cursor:pointer;font:inherit;transition:.12s}
        .pkst-surf:hover:not(:disabled){border-color:var(--pink-100,#F4C0D1);background:var(--pink-50,#FBEAF0)}
        .pkst-surf.on{border-color:var(--pink,#FF2E63);box-shadow:0 0 0 1px var(--pink,#FF2E63) inset;background:var(--pink-50,#FBEAF0)}
        .pkst-surf:disabled{opacity:.6;cursor:default}
        .pkst-surf .sw{width:12px;height:12px;border-radius:3px;flex:none;border:1px solid rgba(0,0,0,.15)}
        .pkst-surf .grow{flex:1;min-width:0;display:flex;flex-direction:column}
        .pkst-surf .nm{font-weight:600;font-size:12.5px}
        .pkst-surf .rl{font-size:10.5px;color:var(--ink-500,#6B6D78)}
        .pkst-chip{font-size:9.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;border-radius:999px;padding:2px 7px;border:1px solid var(--ink-200,#E0E1E5);color:var(--ink-600,#474954);background:#fff}
        .pkst-chip.pdp{color:#0C447C;background:#E6F1FB;border-color:#B5D4F4}
        .pkst-chip.info{color:#633806;background:#FAEEDA;border-color:#FAC775}
        .pkst-chip.na{color:var(--ink-400,#9A9CA6)}
        .pkst-res{margin-top:14px;border:1px solid var(--ink-200,#E0E1E5);border-radius:13px;background:var(--ink-50,#F8F8F9);padding:12px}
        .pkst-res .r{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid var(--ink-100,#EEEFF1);font-size:12px}
        .pkst-res .r:last-of-type{border-bottom:0}
        .pkst-res .k{color:var(--ink-500,#6B6D78)} .pkst-res .v{font-weight:600;text-align:right}
        .pkst-res .muted{color:var(--ink-500,#6B6D78);font-weight:400}
        .pkst-empty{margin-top:14px;color:var(--ink-400,#9A9CA6);font-size:12px;border:1px dashed var(--ink-300,#CBCCD3);border-radius:12px;padding:18px;text-align:center}
        .pkst-btn{display:flex;align-items:center;justify-content:center;width:100%;margin-top:12px;border-radius:999px;padding:10px 14px;font-size:12.5px;font-weight:600;text-decoration:none;border:1px solid var(--pink,#FF2E63);background:var(--pink,#FF2E63);color:#fff}
        .pkst-btn:hover{background:var(--pink-700,#C71350);border-color:var(--pink-700,#C71350)}
        .pkst-btn.ghost{background:#fff;color:var(--pink-700,#C71350);border-color:var(--pink-100,#F4C0D1)}
        .pkst-btn.ghost:hover{background:var(--pink-50,#FBEAF0)}
        .pkst-note{margin-top:16px;font-size:11.5px;line-height:1.55;color:var(--ink-500,#6B6D78);border-top:1px solid var(--ink-100,#EEEFF1);padding-top:12px}
      `}</style>
    </div>
  )
}
