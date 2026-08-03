'use client'

// Step 4 "Packaging & die-lines" (P4a): the regular v2 form step that replaces
// the always-mounted fullscreen Packaging Studio.
// Spec: docs/STEP4_PACKAGING_DIELINES_2026-07-28.md · prototype:
// design/step4-packaging-dielines-prototype.html
//
// - Containers: the existing PackagingPicker, unchanged.
// - Die-lines: ZERO-CLICK (D1). loadOrResolveStep4Dielines reuses the partner's
//   existing die-line per packaging type or instantiates the type's house
//   template; the manufacturer is never asked to upload in the happy path.
// - Decoration methods (D3): per-container capability chips, ONE source with
//   the service builders (PartnerPackagingOffering).
// - "Open in Packaging Studio" mounts the EXISTING PackagingStudioStep, which
//   is fullscreen while mounted (locks body scroll, restores on unmount): that
//   IS the modal. Its nav is wired to save-and-exit back to this step.
//   Replacing the template with an own prepress file also happens inside the
//   studio (manage files), as does the custom die-line editor (D2).

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Eye, Ruler, Wand2 } from 'lucide-react'
import { PackagingPicker } from './PackagingPicker'
import { PackagingStudioStep } from './PackagingStudioStep'
import {
  loadOrResolveStep4Dielines,
  loadDecorationMethods,
  toggleDecorationMethod,
  updateDielineSpec,
  type Step4DielineRow,
  type Step4DecorationRow,
  type Step4DecorationMethod,
} from './step4-actions'

interface PackagingOption { id: string; partnerName: string; topology: string; unitCount: number; moq: number; grossWeightG?: number | null; casesPerLayer?: number | null; layersPerPallet?: number | null }

const METHOD_LABELS: Record<Step4DecorationMethod, string> = {
  DIRECT_PRINT: 'Direct print',
  PRESSURE_SENSITIVE_LABEL: 'Pressure-sensitive label',
  SHRINK_SLEEVE: 'Shrink sleeve',
  IN_MOLD_LABEL: 'In-mold label',
  HEAT_TRANSFER: 'Heat transfer',
  FOIL_STAMP: 'Foil stamp',
  EMBOSS: 'Emboss',
  DEBOSS: 'Deboss',
  SPOT_UV: 'Spot UV',
}

/** DielineStatus + source → pill copy/class for the row. */
function dielinePill(row: Step4DielineRow): { text: string; cls: string } {
  const d = row.dieline
  if (!d) {
    return row.packagingTypeId
      ? { text: 'Needs a die-line', cls: 'amber' }
      : { text: 'Custom · draw it in the studio', cls: 'amber' }
  }
  if (d.source === 'template') return { text: 'Template attached ✓', cls: 'green' }
  if (d.status === 'ADMIN_VERIFIED' || d.status === 'ACTIVE') return { text: 'Verified ✓', cls: 'green' }
  if (d.status === 'PARTNER_CONFIRMED') return { text: 'Confirmed ✓', cls: 'green' }
  return { text: 'Normalizing', cls: 'sky' }
}

export function PackagingDielinesStep({
  draftId, systems, topbarRight, studioLogo, onSaveDraft,
}: {
  draftId: string | null
  systems: PackagingOption[]
  topbarRight?: ReactNode
  studioLogo?: { kind: 'full' | 'mark'; src: string | null; sublabel: string | null }
  onSaveDraft?: () => void
}) {
  const [rows, setRows] = useState<Step4DielineRow[]>([])
  const [deco, setDeco] = useState<Step4DecorationRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [studioOpen, setStudioOpen] = useState(false)
  // P4c scoping: which die-line row opened the studio (null = generic browse).
  const [studioFor, setStudioFor] = useState<string | null>(null)
  // Bumped when the studio modal closes so the picker re-fetches its attached
  // links (catalog attaches happen inside the studio; no page navigation).
  const [reloadToken, setReloadToken] = useState(0)
  const openStudio = useCallback((systemId: string | null) => { setStudioFor(systemId); setStudioOpen(true) }, [])

  const refresh = useCallback(() => {
    if (!draftId) return
    void loadOrResolveStep4Dielines(draftId).then((r) => {
      if (r.ok) setRows(r.data)
      setLoaded(true)
    })
    void loadDecorationMethods(draftId).then((r) => { if (r.ok) setDeco(r.data) })
  }, [draftId])
  useEffect(() => { refresh() }, [refresh])

  // Save-and-exit: the studio autosaves while open; closing returns to the form
  // and re-resolves so status pills + attached links reflect any edits immediately.
  const closeStudio = useCallback(() => { setStudioOpen(false); setReloadToken((t) => t + 1); refresh() }, [refresh])

  // P4b measurement fix-up (inline edit on the preview rail).
  const [specEdit, setSpecEdit] = useState<string | null>(null)
  const [specVals, setSpecVals] = useState<{ w: string; h: string; b: string }>({ w: '', h: '', b: '' })
  const [specBusy, setSpecBusy] = useState(false)
  function saveSpec(dielineId: string) {
    if (!draftId) return
    const parse = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) && n > 0 ? n : null }
    setSpecBusy(true)
    void updateDielineSpec(draftId, dielineId, { widthMm: parse(specVals.w), heightMm: parse(specVals.h), bleedMm: parse(specVals.b) }).then((r) => {
      setSpecBusy(false)
      if (!r.ok) { toast.error(r.error ?? 'Could not save'); return }
      setSpecEdit(null)
      refresh()
    })
  }

  function toggleMethod(typeId: string, method: Step4DecorationMethod, on: boolean) {
    if (!draftId) return
    // Optimistic flip; revert on failure.
    setDeco((d) => d.map((t) => (t.packagingTypeId === typeId
      ? { ...t, methods: t.methods.map((m) => (m.method === method ? { ...m, on } : m)) }
      : t)))
    void toggleDecorationMethod(draftId, typeId, method, on).then((r) => {
      if (!r.ok) { toast.error(r.error ?? 'Could not update'); refresh() }
    })
  }

  return (
    <div className="s4cols">
      <div>
      {/* 1 · Containers. Browsing/adding packaging opens the studio MODAL
          (Library tab) so the manufacturer never leaves the builder flow. */}
      <PackagingPicker draftId={draftId} systems={systems} onBrowse={() => openStudio(null)} reloadToken={reloadToken} />

      {/* 2 · Die-lines: zero-click resolution */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">
          <span className="ic"><Ruler size={15} strokeWidth={2} /></span> Die-lines
          <span className="domain-tag">exact vector = the print master</span>
        </div>
        <p className="hint" style={{ marginTop: 6 }}>
          Nothing to upload: each attached container resolves its die-line automatically
          (your existing die-line for that container, or the platform&apos;s house template).
          Open the studio to arrange your mandatory and recommended elements, or to replace
          the die-line with your own prepress file.
        </p>

        {!draftId && <p className="tiny muted" style={{ marginTop: 10 }}>Save the draft first (name + category) to resolve die-lines.</p>}
        {draftId && loaded && rows.length === 0 && (
          <p className="tiny muted" style={{ marginTop: 10 }}>Attach a container above: its die-line resolves the moment it lands here.</p>
        )}

        {rows.map((r) => {
          const pill = dielinePill(r)
          return (
            <div key={r.systemId} className="s4row">
              <div style={{ minWidth: 0 }}>
                <div className="s4name">{r.name}</div>
                <div className="s4meta">
                  {r.dieline?.source === 'template' && r.dieline.templateName && (
                    <span>House template &quot;{r.dieline.templateName}&quot; · attached automatically</span>
                  )}
                  {r.dieline?.source === 'own' && <span>Your die-line · {METHOD_LABELS[r.dieline.decorationMethod as Step4DecorationMethod] ?? r.dieline.decorationMethod}</span>}
                  {!r.dieline && r.packagingTypeId && <span>No house template for this type yet: open the studio to add one, or ask the platform</span>}
                  {!r.dieline && !r.packagingTypeId && <span>Custom packaging: its die-line lives in the studio&apos;s custom editor</span>}
                  {r.dieline?.widthMm != null && r.dieline?.heightMm != null && (
                    <span> · W {r.dieline.widthMm} mm · H {r.dieline.heightMm} mm{r.dieline.bleedMm != null ? ` · bleed ${r.dieline.bleedMm} mm` : ''}</span>
                  )}
                </div>
              </div>
              <div className="s4rt">
                <span className={`pill ${pill.cls}`}>{pill.text}</span>
                <button type="button" className="btn primary sm" onClick={() => openStudio(r.systemId)}>Open in Packaging Studio</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* 3 · Decoration methods (D3): per-container capability, one source with
          the service builders (PartnerPackagingOffering). */}
      {deco.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title">
            <span className="ic"><Wand2 size={15} strokeWidth={2} /></span> Decoration methods
            <span className="domain-tag">per container</span>
          </div>
          <p className="hint" style={{ marginTop: 6 }}>
            Which decoration you can provide for each packaging. Feeds the PDP decoration
            choice and made-to-order fulfillment; one source with your service builders.
          </p>
          {deco.map((t) => (
            <div key={t.packagingTypeId} className="s4deco">
              <div className="s4name" style={{ marginBottom: 7 }}>{t.typeName}</div>
              <div className="row" style={{ gap: 6 }}>
                {t.methods.map((m) => (
                  <button
                    key={m.method}
                    type="button"
                    className={`chip${m.on ? ' on' : ''}`}
                    aria-pressed={m.on}
                    onClick={() => toggleMethod(t.packagingTypeId, m.method, !m.on)}
                  >
                    {METHOD_LABELS[m.method]}{m.on ? ' ✓' : ''}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>

      {/* P4b · PREVIEW RAIL: sticky, read-only, derived from the die-line.
          Flat preview only: the thumbnail render when one exists, else the
          canonical shape's cut outline. The 3D preview lives INSIDE the studio
          as a docked read-only pane (P4d), per the locked Step 4 shape. */}
      <aside className="s4rail">
        <div className="card">
          <div className="section-title">
            <span className="ic"><Eye size={15} strokeWidth={2} /></span> Preview
            <span className="pill green" style={{ marginLeft: 'auto' }}>derived from die-line</span>
          </div>
          {rows.filter((r) => r.dieline).length === 0 && (
            <p className="tiny muted" style={{ marginTop: 10 }}>Previews appear as containers resolve their die-lines.</p>
          )}
          {rows.filter((r) => r.dieline).map((r) => {
            const d = r.dieline!
            const editing = specEdit === d.id
            return (
              <div key={r.systemId} className="s4pv">
                <div className="s4pv-stage">
                  {d.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.thumbUrl} alt={`${r.name} die-line`} />
                  ) : d.outlineSvg && !d.outlineSvg.trim().startsWith('<') && d.widthMm && d.heightMm ? (
                    <svg viewBox={`0 0 ${d.widthMm} ${d.heightMm}`} preserveAspectRatio="xMidYMid meet" aria-label={`${r.name} cut outline`}>
                      <path d={d.outlineSvg} fill="none" stroke="var(--pink, #FF2E63)" strokeWidth={Math.max(d.widthMm, d.heightMm) / 160} strokeDasharray={`${Math.max(d.widthMm, d.heightMm) / 60}`} />
                    </svg>
                  ) : (
                    <span className="tiny muted">Flat preview arrives with the normalized shape.</span>
                  )}
                </div>
                <div className="s4pv-meta">
                  <b>{r.name}</b>
                  {!editing && (
                    <span className="tiny muted">
                      {d.widthMm != null && d.heightMm != null ? `W ${d.widthMm} mm · H ${d.heightMm} mm · bleed ${d.bleedMm ?? 3} mm` : 'measurements pending'}
                      {' · '}
                      <button type="button" className="pk-link" onClick={() => { setSpecEdit(d.id); setSpecVals({ w: d.widthMm != null ? String(d.widthMm) : '', h: d.heightMm != null ? String(d.heightMm) : '', b: d.bleedMm != null ? String(d.bleedMm) : '3' }) }}>Fix measurements</button>
                    </span>
                  )}
                  {editing && (
                    <span className="s4spec">
                      <input className="input" inputMode="decimal" value={specVals.w} placeholder="W mm" onChange={(e) => setSpecVals((v) => ({ ...v, w: e.target.value }))} />
                      <input className="input" inputMode="decimal" value={specVals.h} placeholder="H mm" onChange={(e) => setSpecVals((v) => ({ ...v, h: e.target.value }))} />
                      <input className="input" inputMode="decimal" value={specVals.b} placeholder="bleed" onChange={(e) => setSpecVals((v) => ({ ...v, b: e.target.value }))} />
                      <button type="button" className="btn primary sm" disabled={specBusy} onClick={() => saveSpec(d.id)}>{specBusy ? '…' : 'Save'}</button>
                      <button type="button" className="btn sm" disabled={specBusy} onClick={() => setSpecEdit(null)}>Cancel</button>
                    </span>
                  )}
                </div>
              </div>
            )
          })}
          <p className="hint" style={{ marginTop: 10 }}>
            Read-only and never the print file: print always exports from the vector
            die-line. The 3D preview rides along inside the studio when the
            container&apos;s model exists.
          </p>
        </div>
      </aside>

      {/* The EXISTING studio: fullscreen while mounted; mount = open modal.
          Nav is wired to save-and-exit (it autosaves while open). */}
      {studioOpen && (
        <PackagingStudioStep
          draftId={draftId}
          systems={systems}
          onNext={closeStudio}
          onBack={closeStudio}
          onSaveDraft={onSaveDraft}
          nextLabel="Save & exit ✓"
          headerRight={topbarRight}
          studioLogo={studioLogo}
          asModal
          initialSystemId={studioFor}
        />
      )}

      <style>{`
        .gb .s4cols{display:grid;grid-template-columns:1.35fr 1fr;gap:18px;align-items:start}
        .gb .s4rail{position:sticky;top:90px;min-width:0}
        @media(max-width:900px){.gb .s4cols{grid-template-columns:1fr}.gb .s4rail{position:static}}
        .gb .s4row{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--ink-200);border-radius:12px;padding:12px 14px;margin-top:10px;flex-wrap:wrap}
        .gb .s4name{font-weight:700;font-size:var(--fs-base)}
        .gb .s4meta{font-size:var(--fs-xs);color:var(--ink-500);margin-top:2px}
        .gb .s4rt{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-left:auto}
        .gb .s4deco{border-top:1px dashed var(--ink-200);padding-top:12px;margin-top:12px}
        .gb .s4deco:first-of-type{border-top:0;padding-top:0;margin-top:12px}
        .gb .s4pv{border:1px solid var(--ink-200);border-radius:12px;padding:10px;margin-top:10px}
        .gb .s4pv-stage{height:150px;border-radius:9px;background:radial-gradient(circle at 50% 42%,var(--ink-100),var(--ink-50));display:grid;place-items:center;overflow:hidden;border:1px solid var(--ink-100);padding:8px}
        .gb .s4pv-stage img{max-width:100%;max-height:100%;object-fit:contain}
        .gb .s4pv-stage svg{max-width:100%;max-height:100%}
        .gb .s4pv-meta{margin-top:8px;font-size:var(--fs-sm)}
        .gb .s4pv-meta b{display:block;font-size:var(--fs-base)}
        .gb .s4spec{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:6px}
        .gb .s4spec .input{width:76px;padding:6px 8px;font-size:var(--fs-sm)}
      `}</style>
    </div>
  )
}
