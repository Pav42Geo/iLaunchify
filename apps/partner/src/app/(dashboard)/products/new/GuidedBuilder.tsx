'use client'

// Turnkey New-Product builder — faithful realization of
// docs/prototypes/new-product-flow.html. Six guided steps with a left rail +
// stepper beads, service-gated, mood-board styled. Step 1 (Basics) persists a
// DRAFT via createDraftShell; later steps are the rich builder UI (persistence
// wired slice-by-slice). Self-contained — the flow IS the builder, ending in
// Submit for review.

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Menu, CheckCircle2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createDraftShell, saveOptionAxes, type InitialDraft } from './build-actions'
import { archiveDraft, submitProductForReview } from '../actions'
import { RecipeBuilderStep } from './RecipeBuilderStep'
import { BasicsScreen } from './BasicsScreen'
import { type PackingProfileOption } from './ProductTypeGate'
import { VariantsPacksStep } from './VariantsPacksStep'
import { axesToInput, type OptionAxisUI } from './OptionAxesCard'
import { PricingTiersCard } from './PricingTiersCard'
import { CertificatesCard } from './CertificatesCard'
import { NotesCard } from './NotesCard'
import { LabelPhrasesCard } from './LabelPhrasesCard'
import { ComplianceCard } from './ComplianceCard'
import { AllergensCard } from './AllergensCard'

interface CategoryOption { id: string; name: string; mainCategory: string }
interface SubcategoryOption { id: string; name: string; categoryId: string }
interface PackagingOption { id: string; partnerName: string; topology: string; unitCount: number; moq: number }
interface ChipOption { id: string; label: string }

interface GuidedBuilderProps {
  categories: CategoryOption[]
  subcategories: SubcategoryOption[]
  packagingSystems: PackagingOption[]
  niches: ChipOption[]
  lifestyleTags: ChipOption[]
  facilities: Array<{ id: string; name: string }>
  packingProfiles: PackingProfileOption[]
  /** Partner turnkey scope labels, e.g. ['Manufacturing','Packing','Printing']. */
  serviceScopes: string[]
  /** When resuming a draft (?draft=<id>) — seeds the builder state. */
  initial?: InitialDraft | null
}

const STEPS = [
  { t: 'Basics', d: 'Identity, media, type' },
  { t: 'Variants & packs', d: 'Net wt, MOQ, facility' },
  { t: 'Recipe / Formulation', d: 'Ingredients, allergens, cost' },
  { t: 'Packaging studio', d: '3D, die-lines, label frames' },
  { t: 'Cost & pricing', d: 'Volume tiers' },
  { t: 'Review & submit', d: 'Verify & send' },
] as const

type ProductType = 'single' | 'multi' | 'pack'

export function GuidedBuilder({
  categories,
  subcategories,
  packagingSystems,
  niches,
  lifestyleTags,
  facilities,
  packingProfiles,
  initial,
}: GuidedBuilderProps) {
  const router = useRouter()

  // Hide the dashboard sidebar + go full-bleed ONLY while the builder is open.
  // Mount-scoped (not route-scoped in the layout) so it reliably reverts on
  // client navigation away from /products/new — the shared (dashboard) layout
  // does not re-run on nav, so a layout-level check would stick.
  useEffect(() => {
    document.body.classList.add('gb-active')
    return () => document.body.classList.remove('gb-active')
  }, [])

  const [cur, setCur] = useState(0)
  const [ptype, setPtype] = useState<ProductType>('single')
  const [ltype, setLtype] = useState<'Recipe' | 'Formulation'>('Recipe')
  const [isPending, startTransition] = useTransition()
  const [draftId, setDraftId] = useState<string | null>(initial?.id ?? null)
  const [profile, setProfile] = useState<PackingProfileOption | null>(
    initial?.packingProfileId ? (packingProfiles.find((p) => p.id === initial.packingProfileId) ?? null) : null,
  )
  // Shared flavor list — defined in Variants & packs, carried into Recipe so
  // each flavor becomes its own recipe column. One source of truth.
  const [flavors, setFlavors] = useState<Array<{ name: string; ingId: string; soi: string }>>(
    initial?.flavors.map((f) => ({ name: f.name, ingId: 'cane', soi: f.soi })) ?? [],
  )
  // Configurable option axes (sweetener/strength/caffeine/custom). Shared so the
  // Variants step edits them and the Recipe step binds their label overlays.
  const [axes, setAxes] = useState<OptionAxisUI[]>((initial?.axes as OptionAxisUI[] | undefined) ?? [])

  // Debounced autosave for axes — lives here (not in the card) so it persists
  // from any step, including Recipe-step overlay bindings.
  const axesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!draftId) return
    if (axesTimer.current) clearTimeout(axesTimer.current)
    axesTimer.current = setTimeout(() => { void saveOptionAxes(draftId, axesToInput(axes)) }, 900)
    return () => { if (axesTimer.current) clearTimeout(axesTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [axes, draftId])

  // Basics state (name seeded from the draft so the title shows on resume;
  // BasicsScreen also receives `initial` to repopulate its form fields).
  const [name, setName] = useState(initial?.name ?? '')
  const [sku, setSku] = useState('')
  const [gtin, setGtin] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [subcategoryId, setSubcategoryId] = useState('')
  const [shortDesc, setShortDesc] = useState('')
  const [longDesc, setLongDesc] = useState('')
  const [selNiches, setSelNiches] = useState<string[]>([])
  const [selTags, setSelTags] = useState<string[]>([])

  const filteredSubs = useMemo(
    () => subcategories.filter((s) => s.categoryId === categoryId),
    [categoryId, subcategories],
  )
  const basicsValid = name.trim().length >= 2 && !!subcategoryId

  function toggle(list: string[], set: (v: string[]) => void, id: string, max?: number) {
    if (list.includes(id)) set(list.filter((x) => x !== id))
    else if (!max || list.length < max) set([...list, id])
    else toast.error(`Up to ${max} allowed.`)
  }

  function go(i: number) {
    setCur(Math.max(0, Math.min(STEPS.length - 1, i)))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Step 1 → create the draft shell so later steps have a real row to autosave to.
  function advanceFromBasics() {
    if (!basicsValid) return
    if (draftId) return go(1)
    startTransition(async () => {
      const res = await createDraftShell({ name: name.trim(), subcategoryId })
      if (!res || !res.ok) {
        toast.error(res?.error ?? 'Could not create the draft. Please try again.')
        return
      }
      setDraftId(res.data.id)
      toast.success('Draft saved')
      go(1)
    })
  }

  // Product lifecycle status (DRAFT for new; the real status when resuming).
  const status = initial?.status ?? 'DRAFT'

  function archive() {
    if (!draftId) return
    if (!window.confirm('Archive this product? It’s removed from your active list (reversible by admin).')) return
    startTransition(async () => {
      const res = await archiveDraft(draftId)
      if (!res || !res.ok) { toast.error(res?.error ?? 'Could not archive.'); return }
      toast.success('Product archived')
      router.push('/products')
    })
  }

  // Save draft — ensures a draft row exists (later steps already autosave into
  // it). Lives in the bottom nav now, not a top bar.
  function saveDraft() {
    if (draftId) { toast.success('Draft saved'); return }
    if (!basicsValid) { toast.error('Add a product name and category first.'); return }
    startTransition(async () => {
      const res = await createDraftShell({ name: name.trim(), subcategoryId })
      if (!res || !res.ok) { toast.error(res?.error ?? 'Could not save draft.'); return }
      setDraftId(res.data.id)
      toast.success('Draft saved')
    })
  }

  // Completion % for the rail (like the editor's readiness). A step counts done
  // once passed, or when its key data is present (Basics name+draft, type chosen).
  const stepDone = STEPS.map((_, i) =>
    i < cur ||
    (i === 0 && name.trim().length >= 2 && !!draftId) ||
    (i === 1 && !!profile),
  )
  const pct = Math.round((stepDone.filter(Boolean).length / STEPS.length) * 100)

  // Unified Next (the per-step nav now lives in the app topbar).
  const nextDisabled = (cur === 0 && !draftId) || (cur === 1 && !profile)
  const lastStep = cur >= STEPS.length - 1
  const nextLabel = lastStep ? 'Submit for review →' : `Next: ${STEPS[cur + 1]?.t} →`
  function goNext() {
    if (lastStep) {
      if (!draftId) { toast.error('Complete Basics first.'); return }
      startTransition(async () => {
        const res = await submitProductForReview(draftId)
        if (!res || !res.ok) { toast.error(res?.error ?? 'Could not submit.'); return }
        toast.success('Submitted for review')
        router.push('/products')
      })
      return
    }
    go(cur + 1)
  }

  // Portal Saved + Save Draft (next to the logo) and Next (next to the bell) into
  // the app topbar — only while the builder is mounted (/products/new).
  const [topSlots, setTopSlots] = useState<{ left: HTMLElement | null; right: HTMLElement | null }>({ left: null, right: null })
  useEffect(() => {
    setTopSlots({ left: document.getElementById('gb-topbar-center'), right: document.getElementById('gb-topbar-right') })
  }, [])

  return (
    <div className="gb">
      <style>{CSS}</style>
      {topSlots.left && createPortal(
        <span className="gb gb-topinject">
          <TopMenu />
          {draftId && <span className="gb-saveicon" title="All changes save automatically — your draft is up to date"><CheckCircle2 size={18} /></span>}
          <button className="btn sm" type="button" onClick={saveDraft} disabled={isPending}>Save draft</button>
        </span>, topSlots.left)}
      {topSlots.right && createPortal(
        <span className="gb gb-topinject">
          <button className="gb-nextbtn" type="button" onClick={goNext} disabled={nextDisabled}>{nextLabel}</button>
        </span>, topSlots.right)}

      <div className="gb-shell">
        {/* LEFT RAIL */}
        <aside className="rail">
          <div className="progress-card">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', margin: 0 }}>
              <span className="eyebrow">Completion</span>
              <b className="display" style={{ fontSize: 20 }}>{pct}%</b>
            </div>
            <div className="pbar"><div className="pfill" style={{ width: `${pct}%` }} /></div>
          </div>
          <div>
            {STEPS.map((s, i) => (
              <div
                key={s.t}
                className={`step ${i === cur ? 'active' : ''} ${i < cur ? 'done' : ''}`}
                onClick={() => go(i)}
                role="button"
                tabIndex={0}
              >
                <div className="n">{i < cur ? '✓' : i + 1}</div>
                <div>
                  <div className="t">{s.t}</div>
                  <div className="d">{s.d}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="note grey" style={{ marginTop: 16 }}>
            Modules shown depend on your services. A <b>Manufacturing-only</b> partner skips Packaging
            & Printing; a <b>Packing/Printing-only</b> partner gets a different flow.
          </div>
        </aside>

        {/* MAIN */}
        <main className="gb-main">
          {/* stepper beads */}
          <div className="stepper">
            {STEPS.map((s, i) => (
              <span key={s.t} style={{ display: 'inline-flex', alignItems: 'center' }}>
                <span className={`sbead ${i === cur ? 'active' : ''} ${i < cur ? 'done' : ''}`}>
                  <span className="b">{i < cur ? '✓' : i + 1}</span>
                  {s.t}
                </span>
                {i < STEPS.length - 1 && <span className="sline" />}
              </span>
            ))}
          </div>

          {/* Back — between the stepper and the title (top of the flow). */}
          {cur > 0 && (
            <button className="btn sm" type="button" onClick={() => go(cur - 1)} style={{ marginBottom: 12 }}>← Back</button>
          )}

          {/* Page title — defaults to "Add Product", becomes the product name
              once the manufacturer types it in Basics. */}
          <div className="gb-pagehead">
            <h1 className="display">{name.trim() || 'Add Product'}</h1>
            <div className="gb-head-meta">
              {/* Status + Archive only when resuming/editing an existing draft. */}
              {initial && <StatusChip status={status} />}
              {status === 'PENDING_EDIT_REVIEW' && <span className="pill amber">🅰 re-approval marked</span>}
              {initial && <button className="btn sm" type="button" onClick={archive} disabled={!draftId || isPending}>Archive</button>}
            </div>
          </div>

          {/* ===== STEP 1 — Basics (pure identity) ===== */}
          {cur === 0 && (
            <section>
              <BasicsScreen
                categories={categories}
                subcategories={subcategories}
                niches={niches}
                lifestyleTags={lifestyleTags}
                facilities={facilities}
                draftId={draftId}
                onDraftId={setDraftId}
                onName={setName}
                initial={initial}
              />
              <NavBtns onNext={() => go(1)} onSaveDraft={saveDraft} saving={isPending} nextLabel="Next: Variants & packs →" nextDisabled={!draftId} />
            </section>
          )}

          {/* ===== STEP 2 — Variants & packs (product type + config) ===== */}
          {cur === 1 && (
            <section>
              <VariantsPacksStep
                packingProfiles={packingProfiles}
                facilities={facilities}
                baseSku={name}
                draftId={draftId}
                selected={profile}
                onSelect={setProfile}
                flavors={flavors}
                onFlavors={setFlavors}
                axes={axes}
                onAxes={setAxes}
                initial={initial}
              />
              <NavBtns onBack={() => go(0)} onNext={() => go(2)} onSaveDraft={saveDraft} saving={isPending} nextLabel="Next: Recipe →" nextDisabled={!profile} />
            </section>
          )}

          {/* ===== STEP 3 — RECIPE / FORMULATION ===== */}
          {cur === 2 && (
            <section>
              <div className="seg" style={{ marginBottom: 14 }}>
                <button className={ltype === 'Recipe' ? 'on' : ''} onClick={() => setLtype('Recipe')}>Food / Beverage</button>
                <button className={ltype === 'Formulation' ? 'on' : ''} onClick={() => setLtype('Formulation')}>Supplement</button>
                <button className={ltype === 'Formulation' ? 'on' : ''} onClick={() => setLtype('Formulation')}>Cosmetic</button>
              </div>
              <RecipeBuilderStep
                productName={name}
                flavorMode={profile?.flavorMode ?? 'SINGLE'}
                maxColumns={profile?.labelColumns ?? 1}
                flavors={flavors}
                onFlavors={setFlavors}
                draftId={draftId}
                axes={axes}
                onAxes={setAxes}
                initialRows={initial?.recipeSlots}
              />
              <AllergensCard draftId={draftId} />
              <NavBtns onBack={() => go(1)} onNext={() => go(3)} onSaveDraft={saveDraft} saving={isPending} nextLabel="Next: Packaging studio →" />
            </section>
          )}

          {/* ===== STEP 4 — PACKAGING STUDIO ===== */}
          {cur === 3 && (
            <section>
              <div className="banner">ℹ︎ <b>Platform library is the default.</b> Admin curates 3D mockups + normalized die-lines. Custom uploads route to an admin verification queue; the product can&apos;t go LIVE until die-lines are verified.</div>
              <div className="pacshell">
                <div className="lib">
                  <div className="row" style={{ gap: 6, marginBottom: 8 }}><span className="chip on" style={{ fontSize: 11 }}>Library</span><span className="chip" style={{ fontSize: 11 }}>My uploads</span></div>
                  <input className="input" placeholder="Search packaging…" style={{ fontSize: 12, padding: '7px 10px' }} />
                  <div className="cat">Cans</div><div className="subcat on">Drink can ✓</div><div className="subcat">Food can</div><div className="subcat">Coffee can</div>
                  <div className="cat">Boxes</div><div className="subcat">Food box</div><div className="subcat">Tuck-end box</div><div className="subcat">Box w/ window</div>
                  <div className="cat">Bottles</div><div className="subcat">Drink bottle</div><div className="subcat">Supplement bottle</div>
                  <div className="cat">Pouches & bags</div><div className="subcat">Stand-up pouch</div><div className="subcat">Sachet</div>
                  <div className="cat">Jars · Tubes</div><div className="subcat">Glass jar</div><div className="subcat">Cosmetic tube</div>
                </div>
                <div className="stage">
                  <div className="can3d">12 oz<br />slim can<br /><span className="tiny">3D mockup</span></div>
                  <div className="row" style={{ marginTop: 14 }}><button className="btn sm">3D</button><button className="btn sm">2D flat</button><button className="btn sm">⤓ Upload die-line</button><button className="btn pink sm">✎ Open label editor</button></div>
                </div>
                <div className="insp">
                  <div className="eyebrow">Components & die-lines</div>
                  <div className="compcard" style={{ marginTop: 10 }}><b>Can — body wrap</b><div className="muted small">1 surface · die-line ✓</div></div>
                  <div className="compcard" style={{ marginTop: 8 }}><b>Carton — 6 panels</b><div className="muted small">die-line ✓ · 1 of 6 laid out</div></div>
                  <button className="btn sm" style={{ marginTop: 10, width: '100%' }}>+ Add component</button>
                </div>
              </div>
              <div className="card" style={{ marginTop: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="section-title" style={{ fontSize: 15 }}><span className="ic">▭</span> Label editor — mandatory-element frames <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· Fabric.js · JSON layout</span></div>
                  <span className="pill amber">Compliance: 1 required frame empty</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: 16, marginTop: 14 }}>
                  <div style={{ background: 'var(--ink-50)', borderRadius: 14, padding: 18, display: 'grid', placeItems: 'center' }}>
                    <div className="die">
                      <div className="frame" style={{ left: 30, top: 20, width: 150, height: 30 }}>Statement of Identity</div>
                      <div className="frame" style={{ left: 30, top: 60, width: 120, height: 90 }}>Nutrition Facts</div>
                      <div className="frame" style={{ left: 170, top: 60, width: 110, height: 60 }}>Ingredients</div>
                      <div className="frame" style={{ left: 170, top: 135, width: 110, height: 40 }}>Allergens</div>
                      <div className="frame" style={{ left: 30, top: 300, width: 150, height: 30 }}>Manufacturer + address</div>
                      <div className="frame" style={{ left: 195, top: 300, width: 85, height: 50, borderStyle: 'dotted', opacity: .6 }}>Net quantity (empty)</div>
                    </div>
                  </div>
                  <div>
                    <div className="eyebrow">Element palette</div>
                    <div style={{ marginTop: 10 }}>
                      {['Statement of Identity', 'Net Quantity', 'Nutrition / Supplement Facts', 'Ingredients', 'Allergens', 'Manufacturer + address', 'Certificates'].map((p) => (
                        <div key={p} className="palrow"><span className="b" /> {p}</div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="note" style={{ marginTop: 14 }}>The maker positions <b>frames</b>, not final art. Each frame <b>auto-binds</b> to product data (Facts ← computed panel · Manufacturer ← facility · Net wt ← variant). Saved as JSON the Creator&apos;s Design Studio reads.</div>
              </div>
              <LabelPhrasesCard draftId={draftId} />
              <NavBtns onBack={() => go(2)} onNext={() => go(4)} onSaveDraft={saveDraft} saving={isPending} nextLabel="Next: Cost & pricing →" />
            </section>
          )}

          {/* ===== STEP 5 — COST & PRICING ===== */}
          {cur === 4 && (
            <section>
              <PricingTiersCard draftId={draftId} initialTiers={initial?.pricingTiers} />
              <NavBtns onBack={() => go(3)} onNext={() => go(5)} onSaveDraft={saveDraft} saving={isPending} nextLabel="Next: Review →" />
            </section>
          )}

          {/* ===== STEP 6 — REVIEW ===== */}
          {cur === 5 && (
            <section>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-title"><span className="ic">✓</span> Ready to submit <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>· {stepDone.filter(Boolean).length}/{STEPS.length} steps complete</span></div>
                <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
                  {STEPS.map((s, i) => (
                    <button key={s.t} type="button" className="rcheck" onClick={() => go(i)}>
                      <span className={`rdot ${stepDone[i] ? 'on' : ''}`}>{stepDone[i] ? '✓' : i + 1}</span>
                      <span style={{ fontWeight: 600 }}>{s.t}</span>
                      <span className="tiny muted" style={{ marginLeft: 'auto' }}>{stepDone[i] ? 'done' : 'review'}</span>
                    </button>
                  ))}
                </div>
                <style>{`.gb .rcheck{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:1px solid var(--ink-200);border-radius:10px;background:#fff;padding:8px 11px;font:inherit;font-size:13px;color:var(--ink-900);cursor:pointer;transition:.12s}.gb .rcheck:hover{border-color:var(--pink-100);background:var(--pink-50)}.gb .rdot{width:20px;height:20px;border-radius:50%;border:1.5px solid var(--ink-300);display:grid;place-items:center;font-size:10px;font-weight:700;color:var(--ink-500);flex:none}.gb .rdot.on{background:var(--green);border-color:var(--green);color:#fff}`}</style>
              </div>

              <div style={{ marginBottom: 16 }}><ComplianceCard draftId={draftId} /></div>

              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="card"><div className="eyebrow">Basics</div><h3 className="display" style={{ fontSize: 18, margin: '6px 0' }}>{name || 'Untitled product'}</h3><p className="muted small">{selNiches.length} niches · {selTags.length} tags</p><span className="pill green">✓ complete</span></div>
                <div className="card"><div className="eyebrow">Recipe / formulation</div><h3 style={{ margin: '6px 0' }}>Base + flavor presets</h3><span className="pill amber">1 preset in progress</span></div>
                <div className="card"><div className="eyebrow">Packaging</div><h3 style={{ margin: '6px 0' }}>Can + carton</h3><span className="pill amber">Carton: 1 of 6 panels laid out</span></div>
                <div className="card"><div className="eyebrow">Compliance</div><h3 style={{ margin: '6px 0' }}>FDA scan</h3><span className="pill amber">Net-quantity format · review</span></div>
                <div className="card"><div className="eyebrow">Pricing</div><h3 style={{ margin: '6px 0' }}>3 tiers · from $0.86</h3><span className="pill green">✓ set</span></div>
                <div className="card"><div className="eyebrow">Marketplace facets</div><p className="muted small" style={{ marginTop: 6 }}>Category, niche, tags, packaging type, format, allergens, certs, MOQ, lead time, fulfillment mode.</p></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
                <CertificatesCard draftId={draftId} preview />
                <NotesCard draftId={draftId} />
              </div>

              <NavBtns onBack={() => go(4)} onSaveDraft={saveDraft} saving={isPending}
                onNext={() => { draftId ? router.push(`/products/${draftId}/edit`) : toast.error('Complete Basics first.') }}
                nextLabel="Submit for review →" />
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

// Hamburger menu next to the logo (Pacdora-style), injected into the topbar.
function TopMenu() {
  const [o, setO] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button className="gb-iconbtn" type="button" aria-label="Menu" onClick={() => setO((v) => !v)}><Menu size={18} /></button>
      {o && (
        <>
          <div onClick={() => setO(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
          <div className="gb-menu" onClick={() => setO(false)}>
            <a className="gb-menuitem" href="/products/new">New product</a>
            <a className="gb-menuitem" href="/products">My products</a>
            <a className="gb-menuitem" href="/dashboard">Dashboard</a>
          </div>
        </>
      )}
    </span>
  )
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    DRAFT: { label: 'Draft', cls: '' },
    NEEDS_CHANGES: { label: 'Needs changes', cls: 'amber' },
    PENDING_REVIEW: { label: 'In review', cls: 'sky' },
    UNDER_REVIEW: { label: 'In review', cls: 'sky' },
    PENDING_EDIT_REVIEW: { label: 'Edit in review', cls: 'sky' },
    PUBLISHED: { label: 'Live', cls: 'green' },
    PAUSED: { label: 'Paused', cls: 'amber' },
    REJECTED: { label: 'Rejected', cls: 'amber' },
    ARCHIVED: { label: 'Archived', cls: 'amber' },
  }
  const s = map[status] ?? { label: status, cls: '' }
  return <span className={`pill ${s.cls}`}>{s.label}</span>
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className="field" style={full ? { gridColumn: '1/3' } : undefined}>
      <label>{label}</label>
      {children}
    </div>
  )
}

// All nav now lives at the top: Back (between stepper + title) and Save draft /
// Next (app topbar). This bottom component renders nothing — kept so the 6 call
// sites compile unchanged.
function NavBtns(_props: { onBack?: () => void; onNext?: () => void; onSaveDraft?: () => void; saving?: boolean; nextLabel?: string; nextDisabled?: boolean }) {
  return null
}

// Scoped CSS ported from the prototype, on the locked mood-board tokens.
const CSS = `
.gb{--pink:#FF2E63;--pink-700:#C71350;--pink-50:#FBEAF0;--pink-100:#F4C0D1;--ink-900:#18181A;--ink-800:#232327;--ink-700:#33343C;--ink-600:#474954;--ink-500:#6B6D78;--ink-400:#9A9CA6;--ink-300:#CBCCD3;--ink-200:#E0E1E5;--ink-100:#EEEFF1;--ink-50:#F8F8F9;--cream:#FCEEF3;--green:#1D9E75;--green-50:#E1F5EE;--amber-50:#FAEEDA;--sky-50:#E6F1FB;color:var(--ink-900);font-size:13px;line-height:1.5}
.gb .display{font-family:"Bricolage Grotesque",Inter,sans-serif;letter-spacing:-.02em}
.gb h1,.gb h2,.gb h3{margin:0}
.gb .eyebrow{font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.18em;color:var(--ink-500)}
.gb .muted{color:var(--ink-500)} .gb .small{font-size:11.5px} .gb .tiny{font-size:10.5px}
.gb .pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:600;border:1px solid var(--ink-200);background:#fff}
.gb .pill.green{background:var(--green-50);color:#085041;border-color:#9FE1CB}
.gb .pill.amber{background:var(--amber-50);color:#633806;border-color:#FAC775}
.gb .pill.sky{background:var(--sky-50);color:#0C447C;border-color:#B5D4F4}
.gb .pill.pink{background:var(--pink-50);color:var(--pink-700);border-color:var(--pink-100)}
.gb .btn{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid var(--ink-200);background:#fff;color:var(--ink-800);transition:.15s}
.gb .btn:hover{border-color:var(--ink-400)} .gb .btn:disabled{opacity:.5;cursor:not-allowed}
.gb .btn.primary{background:var(--ink-900);color:#fff;border-color:var(--ink-900)} .gb .btn.primary:hover{background:var(--ink-700)}
.gb .btn.pink{background:var(--pink);color:#fff;border-color:var(--pink)} .gb .btn.sm{padding:6px 12px;font-size:12px}
.gb .card{border:1px solid var(--ink-200);border-radius:18px;background:#fff;padding:18px}
.gb .field label{display:block;font-size:11px;font-weight:600;color:var(--ink-600);margin-bottom:5px}
.gb .input,.gb .sel,.gb textarea{width:100%;border:1px solid var(--ink-200);border-radius:12px;padding:9px 12px;font:inherit;font-size:13px;color:var(--ink-900);background:#fff}
.gb .input:focus,.gb .sel:focus,.gb textarea:focus{outline:none;border-color:var(--pink);box-shadow:0 0 0 3px var(--pink-50)}
.gb .row{display:flex;gap:14px;flex-wrap:wrap} .gb .grid{display:grid;gap:14px}
.gb .chip{display:inline-flex;align-items:center;gap:6px;border-radius:999px;border:1px solid var(--ink-200);padding:5px 11px;font-size:12px;cursor:pointer;background:#fff;color:var(--ink-700)}
.gb .chip.on{background:var(--ink-900);color:#fff;border-color:var(--ink-900)}
.gb table{width:100%;border-collapse:collapse;font-size:12.5px}
.gb th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-500);font-weight:600;padding:8px 10px;border-bottom:1px solid var(--ink-100)}
.gb td{padding:9px 10px;border-bottom:1px solid var(--ink-50);vertical-align:middle}
.gb .note{font-size:11px;color:var(--pink-700);background:var(--pink-50);border:1px solid var(--pink-100);border-radius:10px;padding:7px 10px}
.gb .note.grey{color:var(--ink-600);background:var(--ink-50);border-color:var(--ink-200)}
.gb-top{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 0;background:#fff;border-bottom:1px solid var(--ink-200)}
.gb-scopes{display:flex;align-items:center;gap:10px;flex-wrap:wrap} .gb-actions{display:flex;gap:10px}
.gb-shell{display:grid;grid-template-columns:248px 1fr;gap:0}
.gb .rail{border-right:1px solid var(--ink-200);padding:18px 14px;background:#fff}
.gb .rail h3{font-size:15px}
.gb .progress-card{border:1px solid var(--ink-200);border-radius:14px;background:var(--ink-50);padding:12px;margin-bottom:14px}
.gb .pbar{height:6px;border-radius:999px;background:var(--ink-200);margin-top:8px;overflow:hidden}
.gb .pfill{height:100%;background:var(--pink);border-radius:999px;transition:width .25s ease}
.gb .step{display:flex;gap:11px;align-items:flex-start;padding:11px;border-radius:14px;cursor:pointer;border:1px solid transparent}
.gb .step.active{border-color:var(--pink-100);background:var(--pink-50)}
.gb .step .n{width:22px;height:22px;border-radius:50%;border:1.5px solid var(--ink-300);display:grid;place-items:center;font-size:11px;font-weight:700;color:var(--ink-500);flex:none}
.gb .step.active .n{background:var(--pink);border-color:var(--pink);color:#fff}
.gb .step.done .n{background:var(--green);border-color:var(--green);color:#fff}
.gb .step .t{font-weight:600;font-size:13px} .gb .step .d{font-size:11px;color:var(--ink-500)}
.gb-main{padding:24px 28px;max-width:1200px;margin:0 auto;width:100%}
.gb-pagehead{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:20px}
.gb-pagehead h1{font-size:30px}
.gb-head-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.gb-topinject{display:inline-flex;align-items:center;gap:8px}
.gb-iconbtn{display:inline-grid;place-items:center;width:32px;height:32px;border-radius:9px;border:1px solid #E0E1E5;background:#fff;color:#33343C;cursor:pointer;transition:.12s}
.gb-iconbtn:hover{background:#F8F8F9;border-color:#CBCCD3}
.gb-menu{position:absolute;top:calc(100% + 8px);left:0;z-index:61;background:#fff;border:1px solid #E0E1E5;border-radius:12px;box-shadow:0 16px 40px -16px rgba(0,0,0,.3);padding:6px;min-width:200px}
.gb-menuitem{display:block;padding:8px 11px;border-radius:8px;font-size:13px;color:#18181A;text-decoration:none}
.gb-menuitem:hover{background:#FBEAF0;color:#C71350}
.gb-saveicon{display:inline-flex;align-items:center;color:#1D9E75}
.gb-nextbtn{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:8px 16px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;border:1px solid #FF2E63;background:#FF2E63;color:#fff;transition:.15s}
.gb-nextbtn:hover:not(:disabled){background:#E11D54;border-color:#E11D54}
.gb-nextbtn:disabled{background:#fff;border-color:#E0E1E5;color:#9A9CA6;cursor:not-allowed}
.gb .hero{border:1px solid var(--pink-100);background:var(--cream);border-radius:24px;padding:20px 22px;margin-bottom:18px}
.gb .stepper{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:center;margin-bottom:18px}
.gb .sbead{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--ink-500)}
.gb .sbead .b{width:20px;height:20px;border-radius:50%;background:var(--ink-100);display:grid;place-items:center;font-size:10px;font-weight:700;color:var(--ink-500)}
.gb .sbead.active{color:var(--ink-900);font-weight:600} .gb .sbead.active .b{background:var(--pink);color:#fff}
.gb .sbead.done .b{background:var(--green);color:#fff} .gb .sline{width:26px;height:1.5px;background:var(--ink-200);display:inline-block;margin:0 2px}
.gb .section-title{display:flex;align-items:center;gap:9px;font-size:16px;font-weight:600}
.gb .section-title .ic{width:28px;height:28px;border-radius:9px;background:var(--pink-50);color:var(--pink-700);display:grid;place-items:center}
.gb .two{display:grid;grid-template-columns:1fr 320px;gap:18px}
.gb .imgslot{border:1.5px dashed var(--ink-300);border-radius:12px;aspect-ratio:1;display:grid;place-items:center;color:var(--ink-400);font-size:11px;text-align:center}
.gb .imgslot.video{border-color:var(--pink-100);color:var(--pink-700)}
.gb .seg{display:inline-flex;border:1px solid var(--ink-200);border-radius:999px;padding:3px;background:#fff;gap:3px}
.gb .seg button{border:0;background:transparent;padding:6px 14px;border-radius:999px;font:inherit;font-size:12px;font-weight:600;color:var(--ink-600);cursor:pointer}
.gb .seg button.on{background:var(--ink-900);color:#fff}
.gb .navbtns{display:flex;align-items:center;justify-content:space-between;margin-top:22px;padding-top:16px;border-top:1px solid var(--ink-100)}
.gb .navleft{display:flex;gap:10px;align-items:center}
.gb .rail{position:sticky;top:0;align-self:start;height:100vh;overflow:auto;background:#fff}
.gb .facts{border:2px solid #000;border-radius:6px;padding:10px;font-family:Helvetica,Arial,sans-serif;color:#000;font-size:11px;background:#fff}
.gb .facts .big{font-size:24px;font-weight:800;border-bottom:6px solid #000;margin:0 0 2px}
.gb .facts .r{display:flex;justify-content:space-between;border-bottom:1px solid #000;padding:2px 0}
.gb .studio{display:grid;grid-template-columns:1fr 230px;border:1px solid var(--ink-200);border-radius:18px;overflow:hidden;min-height:480px}
.gb .studio .canvas{padding:18px;background:var(--ink-50)} .gb .studio .drawer{border-left:1px solid var(--ink-200);background:#fff;padding:12px}
.gb .drawer .ditem{display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:11px;cursor:pointer;font-size:12.5px;font-weight:500;color:var(--ink-600)}
.gb .drawer .ditem.on{background:var(--pink-50);color:var(--pink-700)} .gb .drawer .ditem:hover{background:var(--ink-50)}
.gb .pacshell{display:grid;grid-template-columns:240px 1fr 250px;border:1px solid var(--ink-200);border-radius:18px;overflow:hidden;min-height:520px}
.gb .pacshell .lib{border-right:1px solid var(--ink-200);padding:12px;background:#fff;overflow:auto;max-height:560px}
.gb .pacshell .stage{background:linear-gradient(180deg,#fafafa,#eee);display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative}
.gb .pacshell .insp{border-left:1px solid var(--ink-200);padding:12px;background:#fff}
.gb .cat{font-size:11px;font-weight:700;color:var(--ink-700);margin:10px 0 4px;text-transform:uppercase;letter-spacing:.04em}
.gb .subcat{font-size:12px;color:var(--ink-600);padding:5px 8px;border-radius:8px;cursor:pointer}
.gb .subcat:hover{background:var(--ink-50)} .gb .subcat.on{background:var(--pink-50);color:var(--pink-700);font-weight:600}
.gb .can3d{width:150px;height:230px;border-radius:14px;background:linear-gradient(90deg,#cfd3d6,#f4f6f7 30%,#e6e9eb 55%,#c2c6c9);box-shadow:inset 0 0 0 1px #b9bdc0;display:grid;place-items:center;color:#9aa;text-align:center;font-size:12px}
.gb .compbar{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.gb .compcard{border:1px solid var(--ink-200);border-radius:12px;padding:9px 11px;font-size:12px;min-width:150px}
.gb .frame{position:absolute;border:1.5px dashed var(--pink);border-radius:6px;background:rgba(255,46,99,.06);font-size:9px;color:var(--pink-700);padding:2px 4px;font-weight:600}
.gb .die{position:relative;width:300px;height:380px;background:#fff;border:1.5px solid var(--ink-300);border-radius:8px;margin:0 auto}
.gb .palrow{display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid var(--ink-200);border-radius:10px;margin-bottom:7px;font-size:12px;cursor:grab}
.gb .palrow .b{width:8px;height:8px;border-radius:50%;background:var(--pink)}
.gb hr.div{border:0;border-top:1px solid var(--ink-100);margin:10px 0}
.gb .kpi{border:1px solid var(--ink-200);border-radius:14px;padding:11px 13px;background:#fff}
.gb .kpi .l{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:var(--ink-500)}
.gb .kpi .v{font-family:"Bricolage Grotesque",Inter;font-weight:800;font-size:20px}
.gb .banner{display:flex;gap:10px;align-items:center;border:1px solid #B5D4F4;background:var(--sky-50);color:#0C447C;border-radius:14px;padding:10px 14px;font-size:12.5px;margin-bottom:16px}
@media(max-width:900px){.gb-shell{grid-template-columns:1fr}.gb .rail{border-right:0;border-bottom:1px solid var(--ink-200)}.gb .two,.gb .studio,.gb .pacshell{grid-template-columns:1fr}}
/* Builder-active chrome overrides (global, mount-scoped via body.gb-active). The
   dashboard sidebar hides and the shell padding/width are neutralized so the
   builder's own rail acts as the side menu. Reverts when the builder unmounts. */
body.gb-active [data-partner-sidebar]{display:none!important}
body.gb-active [data-partner-shell-main]{padding:0!important}
body.gb-active [data-partner-shell-content]{max-width:none!important}
`
