'use client'

// Turnkey New-Product builder — faithful realization of
// docs/prototypes/new-product-flow.html. Six guided steps with a left rail +
// stepper beads, service-gated, mood-board styled. Step 1 (Basics) persists a
// DRAFT via createDraftShell; later steps are the rich builder UI (persistence
// wired slice-by-slice). Self-contained — the flow IS the builder, ending in
// Submit for review.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Menu, UtensilsCrossed, Pill, Sparkles, PawPrint, Boxes, ArrowLeft, type LucideIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { SavedIndicator, VersionHistoryDrawer, type SnapshotItem } from '@ilaunchify/ui'
import { createDraftShell, saveOptionAxes, hasRecipeRows, loadDraft, type InitialDraft } from './build-actions'
import { snapshotDraft, listDraftSnapshots } from './snapshot-actions'
import { archiveDraft, submitProductForReview } from '../actions'
import { RecipeBuilderStep } from './RecipeBuilderStep'
import { SupplementFormulationStep } from './SupplementFormulationStep'
import { CosmeticFormulationStep } from './CosmeticFormulationStep'
import { PetFormulationStep } from './PetFormulationStep'
import { ReviewSummary } from './ReviewSummary'
import { setDraftLabelingType, type LabelingTypeValue } from './domain-actions'

type Ltype = 'Recipe' | 'Supplement' | 'Cosmetic' | 'Pet'
const LT_TO_LTYPE: Record<string, Ltype> = { FOOD: 'Recipe', DIETARY_SUPPLEMENT: 'Supplement', COSMETIC: 'Cosmetic', PET_PRODUCT: 'Pet' }
const LTYPE_TO_LT: Record<Ltype, LabelingTypeValue> = { Recipe: 'FOOD', Supplement: 'DIETARY_SUPPLEMENT', Cosmetic: 'COSMETIC', Pet: 'PET_PRODUCT' }
const DOMAIN_OPTIONS: { v: Ltype; label: string; desc: string; artifact: string; Icon: LucideIcon }[] = [
  { v: 'Recipe', label: 'Food / Beverage', desc: 'Edible food or drink', artifact: 'Nutrition Facts', Icon: UtensilsCrossed },
  { v: 'Supplement', label: 'Supplement', desc: 'Vitamins, minerals, botanicals', artifact: 'Supplement Facts', Icon: Pill },
  { v: 'Cosmetic', label: 'Cosmetic', desc: 'Skincare, haircare, personal care', artifact: 'INCI declaration', Icon: Sparkles },
  { v: 'Pet', label: 'Pet', desc: 'Pet food, treats, supplements', artifact: 'Guaranteed Analysis', Icon: PawPrint },
]
import { BasicsScreen } from './BasicsScreen'
import { type PackingProfileOption } from './ProductTypeGate'
import { VariantsPacksStep, type Flavor } from './VariantsPacksStep'
import { axesToInput, type OptionAxisUI } from './OptionAxesCard'
import { PricingTiersCard } from './PricingTiersCard'
import { NotesCard } from './NotesCard'
import { LabelPhrasesCard } from './LabelPhrasesCard'
import { PackagingPicker } from './PackagingPicker'
import { PackagingStudioStep } from './PackagingStudioStep'
import { PerFlavorLabelsCard } from './PerFlavorLabelsCard'
import { packUiKindForProfile } from './structuralPackType'

interface CategoryOption { id: string; name: string; mainCategory: string; labelingType: string }
interface SubcategoryOption { id: string; name: string; categoryId: string }
interface PackagingOption { id: string; partnerName: string; topology: string; unitCount: number; moq: number; grossWeightG?: number | null; casesPerLayer?: number | null; layersPerPallet?: number | null }
interface ChipOption { id: string; label: string; group?: string }

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
  /** Recipe-builder Mode 2 (AI parser) enabled for this partner's plan (Trusted+). */
  aiAvailable?: boolean
  /** Recipe-builder Mode 3 (declared panel) enabled for this partner's plan. */
  declareAvailable?: boolean
  /** ISO currency codes of ACTIVE target markets (V1 ['USD']) — drives the
   *  recipe Cost column currency, one input per market currency. */
  currencies?: string[]
  /** Admin-enabled product domains (LabelingType keys). Only these appear in the
   *  Step-1 domain picker. Defaults to the four built domains; OTC ships off. */
  enabledDomains?: string[]
  /** ACTIVE markets (admin Markets & Regions). Drives the Basics → Marketplace
   *  "Markets" dropdown — new markets appear here automatically when activated.
   *  Defaults to US-only. */
  markets?: { value: string; label: string }[]
  /** App-topbar right cluster (notification bell + account menu). The fullscreen
   *  Packaging Studio covers the real topbar, so it re-renders this to match. */
  topbarRight?: ReactNode
  /** Resolved Packaging-Studio logo (admin-configurable: kind + sublabel). */
  studioLogo?: { kind: 'full' | 'mark'; src: string | null; sublabel: string | null }
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
  initial: initialProp,
  aiAvailable = false,
  declareAvailable = false,
  currencies = ['USD'],
  enabledDomains = ['FOOD', 'DIETARY_SUPPLEMENT', 'COSMETIC', 'PET_PRODUCT'],
  markets = [{ value: 'US', label: 'United States' }],
  topbarRight,
  studioLogo,
}: GuidedBuilderProps) {
  const router = useRouter()
  // Admin domain on/off — only show domain tiles the admin has enabled.
  const domainOptions = DOMAIN_OPTIONS.filter((o) => enabledDomains.includes(LTYPE_TO_LT[o.v]))

  // Hide the dashboard sidebar + go full-bleed ONLY while the builder is open.
  // Mount-scoped (not route-scoped in the layout) so it reliably reverts on
  // client navigation away from /products/new — the shared (dashboard) layout
  // does not re-run on nav, so a layout-level check would stick.
  useEffect(() => {
    document.body.classList.add('gb-active')
    // Reserve the scrollbar gutter for the whole builder mount. Steps 1–3 scroll
    // the document (gutter present), but the fullscreen Packaging Studio (Step 4,
    // fixed inset-0) removes the scrollbar — without a stable gutter the sticky
    // topbar's right edge jumps ~15px when crossing into Step 4. `stable` keeps
    // the gutter reserved in both states so the header never shifts.
    const html = document.documentElement
    const prevGutter = html.style.scrollbarGutter
    html.style.scrollbarGutter = 'stable'
    // Fold the partner sidebar to icons while building (body.gb-active CSS moves
    // it to the right). Remember the prior fold state and restore it on exit.
    let priorCollapsed = false
    try { priorCollapsed = window.localStorage.getItem('ilf-partner-sidebar-collapsed') === '1' } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('ilf:sidebar-collapse', { detail: true }))
    return () => {
      document.body.classList.remove('gb-active')
      html.style.scrollbarGutter = prevGutter
      window.dispatchEvent(new CustomEvent('ilf:sidebar-collapse', { detail: priorCollapsed }))
    }
  }, [])

  const [cur, setCur] = useState(0)
  // Live draft snapshot — reloaded from the DB on every step change so each step
  // rehydrates from the autosaved values when you navigate back and forth (fixes
  // fields appearing empty after going forward then back). Seeded from the server
  // prop (only set when resuming via ?draft=). `initial` below feeds all steps.
  const [draftData, setDraftData] = useState<InitialDraft | null>(initialProp ?? null)
  const initial = draftData
  // Flush registry — steps register a function that immediately flushes their
  // pending debounced autosave. We run these before navigating so reloading the
  // draft never misses last-second edits (instant "Next" after typing).
  const flushers = useRef(new Set<() => Promise<void> | void>())
  const registerFlush = useCallback((fn: () => Promise<void> | void) => {
    flushers.current.add(fn)
    return () => { flushers.current.delete(fn) }
  }, [])
  const [ptype, setPtype] = useState<ProductType>('single')
  const [ltype, setLtype] = useState<Ltype>(LT_TO_LTYPE[initial?.labelingType ?? 'FOOD'] ?? 'Recipe')
  // Persist the domain choice to the draft's labelingType (drives rule pack + panel).
  const chooseLtype = (v: Ltype) => {
    setLtype(v)
    if (draftId) void setDraftLabelingType(draftId, LTYPE_TO_LT[v])
  }
  const [isPending, startTransition] = useTransition()
  const [draftId, setDraftId] = useState<string | null>(initial?.id ?? null)
  const [profile, setProfile] = useState<PackingProfileOption | null>(
    initial?.packingProfileId ? (packingProfiles.find((p) => p.id === initial.packingProfileId) ?? null) : null,
  )
  // Lock-after-recipe (#38): the product type is the structural choice (one recipe
  // vs base + flavor presets, label columns, pack composition). Once a recipe is
  // authored, changing it would invalidate that recipe — so we lock the chooser.
  // Seeded from the resumed draft; re-checked against persisted recipe rows on
  // entering Step 2. Monotonic — only ever flips ON.
  const [recipeLocked, setRecipeLocked] = useState<boolean>((initial?.recipeSlots?.length ?? 0) > 0)
  useEffect(() => {
    if (recipeLocked || !draftId) return
    void hasRecipeRows(draftId).then((has) => { if (has) setRecipeLocked(true) })
  }, [draftId, cur, recipeLocked])
  // Shared flavor list — defined in Variants & packs, carried into Recipe so
  // each flavor becomes its own recipe column. One source of truth.
  const [flavors, setFlavors] = useState<Flavor[]>(
    initial?.flavors.map((f) => ({
      name: f.name, ingId: 'cane', soi: f.soi, priceCents: f.unitPriceCents ?? null,
      leadTimeDays: f.leadTimeDays ?? null,
      thumbnailUrl: f.thumbnailUrl ?? null,
      lines: (f.lines ?? []).map((l) => ({ ingId: l.ingredientId, name: l.name, qty: l.qty, unit: l.unit })),
    })) ?? [],
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

  async function go(i: number) {
    const next = Math.max(0, Math.min(STEPS.length - 1, i))
    // Pin a milestone version when moving forward to a new step.
    if (next > cur && draftId) snapshotMilestone(`Reached: ${STEPS[next]?.t ?? 'next step'}`)
    // Flush any pending debounced autosaves in the active step first (so an instant
    // "Next" right after typing doesn't lose the last keystrokes), then reload the
    // autosaved draft so the target step mounts with the latest values (steps
    // unmount when inactive — without this they'd remount empty).
    await Promise.allSettled([...flushers.current].map((f) => f()))
    if (draftId) {
      const d = await loadDraft(draftId)
      if (d) setDraftData(d)
    }
    setCur(next)
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

  // Back from Basics (the first step) leaves the builder to the previous page —
  // the products list when there's no browser history to pop.
  const exitBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push('/products')
  }


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

  // Version history (EditSnapshot, entityType PRODUCT_TEMPLATE_DRAFT). The draft
  // autosaves continuously; these are the browsable milestones. Restore is a
  // follow-up (multi-table writer) so the drawer is read-only on the builder.
  const [historyOpen, setHistoryOpen] = useState(false)
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([])
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  useEffect(() => { if (draftId) setLastSavedAt((p) => p ?? new Date()) }, [draftId])

  // Manual "save now" — clicking the top-bar status icon flushes every step's
  // pending debounced autosave immediately (no waiting on the debounce). Creates
  // the draft shell first if the maker hasn't advanced past Basics yet.
  const [manualSaving, setManualSaving] = useState(false)
  // Returns true only when a save actually happened — the SavedIndicator uses
  // this to decide whether to show the green "Saved" confirmation. Nothing to
  // save (no draft yet / invalid Basics / error) returns false → no false-positive.
  async function saveNow(): Promise<boolean> {
    if (manualSaving) return false
    let id = draftId
    if (!id) {
      if (!basicsValid) { toast.error('Add a product name and category first.'); return false }
      const res = await createDraftShell({ name: name.trim(), subcategoryId })
      if (!res || !res.ok) { toast.error(res?.error ?? 'Could not save.'); return false }
      id = res.data.id
      setDraftId(id)
    }
    setManualSaving(true)
    try {
      await Promise.allSettled([...flushers.current].map((f) => f()))
      // Pin a restorable MANUAL checkpoint so the click shows up in History.
      await snapshotDraft(id, 'MANUAL', `Saved ${new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`)
      setLastSavedAt(new Date())
      void loadHistory()
      return true
    } catch {
      toast.error('Could not save — try again.')
      return false
    } finally {
      setManualSaving(false)
    }
  }

  async function loadHistory() {
    if (!draftId) return
    const rows = await listDraftSnapshots(draftId)
    setSnapshots(rows.map((r) => ({ id: r.id, kind: r.kind, label: r.label, pinned: r.pinned, createdAt: new Date(r.createdAt) })))
  }
  // Pin a milestone snapshot when the maker advances to a new step.
  function snapshotMilestone(label: string) {
    if (!draftId) return
    setLastSavedAt(new Date())
    void snapshotDraft(draftId, 'MILESTONE', label)
  }

  return (
    <div className="gb">
      <style>{CSS}</style>
      {topSlots.left && createPortal(
        <span className="gb gb-topinject">
          <TopMenu />
          <SavedIndicator
            status={isPending || manualSaving ? 'saving' : draftId ? 'saved' : 'dirty'}
            savedAt={draftId ? lastSavedAt : null}
            onSave={saveNow}
            onOpenHistory={draftId ? () => { setHistoryOpen(true); void loadHistory() } : undefined}
          />
          {/* Back — sits next to the History icon, always visible in the top bar.
              On Basics (first step) it exits the builder; otherwise steps back. */}
          <button
            type="button"
            onClick={() => (cur > 0 ? go(cur - 1) : exitBack())}
            className="inline-flex items-center gap-1 rounded-md py-2 pl-1.5 pr-2.5 text-[13px] font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
            title={cur > 0 ? 'Back to previous step' : 'Exit builder'}
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" /> Back
          </button>
        </span>, topSlots.left)}
      {topSlots.right && createPortal(
        <span className="gb gb-topinject">
          <button className="gb-nextbtn" type="button" onClick={goNext} disabled={nextDisabled}>{nextLabel}</button>
        </span>, topSlots.right)}

      <VersionHistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        items={snapshots}
        onRestore={() => undefined}
        allowRestore={false}
        title="Draft version history"
        emptyHint="Versions are saved as you work — and pinned at each step you complete."
        footnote="Your draft autosaves continuously. Restoring a past version is coming soon."
      />

      <div className="gb-shell">
        {/* MAIN (left rail removed — the top stepper handles navigation) */}
        <main className="gb-main">
          {/* stepper beads */}
          <div className="stepper">
            {STEPS.map((s, i) => (
              <span key={s.t} style={{ display: 'inline-flex', alignItems: 'center' }}>
                <span
                  className={`sbead ${i === cur ? 'active' : ''} ${i < cur ? 'done' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => go(i)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(i) } }}
                >
                  <span className="b">{i < cur ? '✓' : i + 1}</span>
                  {s.t}
                </span>
                {i < STEPS.length - 1 && <span className="sline" />}
              </span>
            ))}
          </div>

          {/* Page title — defaults to "Add Product", becomes the product name
              once the manufacturer types it in Basics. Hidden on the Review step:
              the Passport cover already carries the product name (avoids a
              redundant title directly above the passport). */}
          {cur !== 5 && (
            <div className="gb-pagehead">
              <h1 className="display">{name.trim() || 'Add Product'}</h1>
              <div className="gb-head-meta">
                {/* Status + Archive only when resuming/editing an existing draft. */}
                {initial && <StatusChip status={status} />}
                {status === 'PENDING_EDIT_REVIEW' && <span className="pill amber">🅰 re-approval marked</span>}
                {initial && <button className="btn sm" type="button" onClick={archive} disabled={!draftId || isPending}>Archive</button>}
              </div>
            </div>
          )}

          {/* ===== STEP 1 — Basics (pure identity) ===== */}
          {cur === 0 && (
            <section>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-title"><span className="ic"><Boxes size={16} strokeWidth={2} /></span> Product domain</div>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12 }}>
                  {domainOptions.map((o) => (
                    <button key={o.v} type="button" onClick={() => chooseLtype(o.v)} className={`domcard ${ltype === o.v ? 'on' : ''}`}>
                      <span className="domcard-ic"><o.Icon size={22} strokeWidth={1.75} /></span>
                      <span className="domcard-label">{o.label}</span>
                    </button>
                  ))}
                </div>
                <style>{`.gb .domcard{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;border:1.5px solid var(--ink-200);border-radius:14px;background:#fff;padding:18px 12px;min-height:108px;cursor:pointer;transition:.14s}.gb .domcard:hover{border-color:var(--pink-200,#FFB3CC);background:var(--pink-50,#FFE9F0)}.gb .domcard.on{border-color:var(--pink-500,#FF2E63);background:var(--pink-50,#FFE9F0);box-shadow:0 0 0 1px var(--pink-500,#FF2E63) inset}.gb .domcard-ic{width:44px;height:44px;border-radius:12px;background:var(--ink-100);color:var(--ink-500);display:grid;place-items:center;transition:.14s}.gb .domcard:hover .domcard-ic{background:#fff;color:var(--pink-700,#C71350)}.gb .domcard.on .domcard-ic{background:var(--pink-500,#FF2E63);color:#fff}.gb .domcard-label{font-weight:650;font-size:16.5px;color:var(--ink-900);line-height:1.2}`}</style>
              </div>
              <BasicsScreen
                domain={LTYPE_TO_LT[ltype]}
                categories={categories}
                subcategories={subcategories}
                niches={niches}
                lifestyleTags={lifestyleTags}
                facilities={facilities}
                markets={markets}
                draftId={draftId}
                onDraftId={setDraftId}
                onName={setName}
                initial={initial}
                registerFlush={registerFlush}
              />
              <NavBtns onBack={exitBack} onNext={() => go(1)} onSaveDraft={saveDraft} saving={isPending} nextLabel="Next: Variants & packs →" nextDisabled={!draftId} />
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
                locked={recipeLocked}
                flavors={flavors}
                onFlavors={setFlavors}
                axes={axes}
                onAxes={setAxes}
                initial={initial}
                registerFlush={registerFlush}
              />
              <NavBtns onBack={() => go(0)} onNext={() => go(2)} onSaveDraft={saveDraft} saving={isPending} nextLabel="Next: Recipe →" nextDisabled={!profile} />
            </section>
          )}

          {/* ===== STEP 3 — RECIPE / FORMULATION ===== */}
          {cur === 2 && (
            <section>
              <div className="domchip" style={{ marginBottom: 14 }}>
                <span>Domain: <b>{DOMAIN_OPTIONS.find((o) => o.v === ltype)?.label}</b> · {DOMAIN_OPTIONS.find((o) => o.v === ltype)?.artifact}</span>
                <button type="button" onClick={() => go(0)}>Change in Basics</button>
                <style>{`.gb .domchip{display:inline-flex;align-items:center;gap:10px;border:1px solid var(--ink-200);border-radius:999px;background:#fff;padding:5px 6px 5px 14px;font-size:var(--fs-sm);color:var(--ink-700)}.gb .domchip button{border:0;background:var(--ink-100,#EEEFF1);border-radius:999px;padding:4px 11px;font:inherit;font-size:var(--fs-xs);font-weight:600;color:var(--ink-700);cursor:pointer}.gb .domchip button:hover{background:var(--pink-50,#FFE9F0);color:var(--pink-700,#C71350)}`}</style>
              </div>
              {ltype === 'Supplement' ? (
                <SupplementFormulationStep productName={name} draftId={draftId} registerFlush={registerFlush} flavorMode={profile?.flavorMode ?? 'SINGLE'} flavors={flavors} />
              ) : ltype === 'Cosmetic' ? (
                <CosmeticFormulationStep productName={name} draftId={draftId} registerFlush={registerFlush} />
              ) : ltype === 'Pet' ? (
                <PetFormulationStep productName={name} draftId={draftId} registerFlush={registerFlush} flavorMode={profile?.flavorMode ?? 'SINGLE'} flavors={flavors} />
              ) : (
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
                  aiAvailable={aiAvailable}
                  declareAvailable={declareAvailable}
                  domain="FOOD"
                  initialEntryMode={initial?.recipeEntryMode ?? null}
                  initialAgeGroup={initial?.intendedAgeGroup ?? 'GENERAL'}
                  unitsPerPack={Number((initial?.packing?.packingConfig as Record<string, unknown> | undefined)?.unitsPerPack) || 1}
                  currencies={currencies}
                  registerFlush={registerFlush}
                />
              )}
              <NavBtns onBack={() => go(1)} onNext={() => go(3)} onSaveDraft={saveDraft} saving={isPending} nextLabel="Next: Packaging studio →" />
            </section>
          )}

          {/* ===== STEP 4 — PACKAGING STUDIO ===== */}
          {cur === 3 && (
            <section>
              <PackagingPicker draftId={draftId} systems={packagingSystems} />
              <PackagingStudioStep draftId={draftId} systems={packagingSystems} onNext={goNext} onBack={() => go(2)} onSaveDraft={saveDraft} nextLabel={nextLabel} headerRight={topbarRight} studioLogo={studioLogo} />
              {profile && packUiKindForProfile(profile) === 'pack' && (
                <PerFlavorLabelsCard draftId={draftId} />
              )}
              <LabelPhrasesCard draftId={draftId} />
              <NavBtns onBack={() => go(2)} onNext={() => go(4)} onSaveDraft={saveDraft} saving={isPending} nextLabel="Next: Cost & pricing →" />
            </section>
          )}

          {/* ===== STEP 5 — COST & PRICING ===== */}
          {cur === 4 && (
            <section>
              <PricingTiersCard draftId={draftId} initialTiers={initial?.pricingTiers} registerFlush={registerFlush} />
              <NavBtns onBack={() => go(3)} onNext={() => go(5)} onSaveDraft={saveDraft} saving={isPending} nextLabel="Next: Review →" />
            </section>
          )}

          {/* ===== STEP 6 — REVIEW ===== */}
          {/* Compliance + Certificates now live INSIDE the Passport (rail + a
              dedicated section), so the step renders just the Passport + Notes. */}
          {cur === 5 && (
            <section>
              <ReviewSummary draftId={draftId} />

              <div style={{ marginTop: 16 }}>
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

// Bottom-of-step Back. The Next button lives in the sticky topbar (always
// visible), but the top Back sits in the scrolling content and slides out of
// view on long steps (Recipe, Cost & pricing). This renders a Back at the bottom
// of every step that has a previous one, so Back stays reachable throughout the
// whole stepper. Forward nav stays in the topbar to keep one source of truth for
// "Next / Submit".
function NavBtns({ onBack }: { onBack?: () => void; onNext?: () => void; onSaveDraft?: () => void; saving?: boolean; nextLabel?: string; nextDisabled?: boolean }) {
  if (!onBack) return null
  return (
    <div className="navbtns">
      <div className="navleft">
        <button type="button" className="btn" onClick={onBack}>← Back</button>
      </div>
    </div>
  )
}

// Scoped CSS ported from the prototype, on the locked mood-board tokens.
const CSS = `
.gb{--font-scale:1.15;--pink:#FF2E63;--pink-700:#C71350;--pink-50:#FFE9F0;--pink-100:#FFB3CC;--ink-900:#141519;--ink-800:#232327;--ink-700:#33343C;--ink-600:#474954;--ink-500:#6B6D78;--ink-400:#9A9CA6;--ink-300:#CBCCD3;--ink-200:#E0E1E5;--ink-100:#EEEFF1;--ink-50:#F8F8F9;--cream:#FFE9F0;--green:#1D9E75;--success-50:#E1F5EE;--warning-50:#FAEEDA;--info-50:#E6F1FB;color:var(--ink-900);font-size:var(--fs-base);line-height:1.5}
.gb .display{font-family:"Bricolage Grotesque",Inter,sans-serif;letter-spacing:-.02em}
.gb h1,.gb h2,.gb h3{margin:0}
.gb .eyebrow{font-size:var(--fs-2xs);font-weight:600;text-transform:uppercase;letter-spacing:.18em;color:var(--ink-500)}
.gb .muted{color:var(--ink-500)} .gb .small{font-size:var(--fs-sm)} .gb .tiny{font-size:var(--fs-xs)}
.gb .toggle-label{display:inline-flex;align-items:center;gap:7px;cursor:pointer;font-weight:600;font-size:var(--fs-sm);color:var(--ink-800)}
.gb .hint{font-size:var(--fs-sm);color:var(--ink-500);line-height:1.45;margin:0}
.gb .pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:3px 10px;font-size:var(--fs-xs);font-weight:600;border:1px solid var(--ink-200);background:#fff}
.gb .pill.green{background:var(--success-50);color:#085041;border-color:#9FE1CB}
.gb .pill.amber{background:var(--warning-50);color:#633806;border-color:#FAC775}
.gb .pill.sky{background:var(--info-50);color:#0C447C;border-color:#B5D4F4}
.gb .pill.pink{background:var(--pink-50);color:var(--pink-700);border-color:var(--pink-100)}
.gb .btn{display:inline-flex;align-items:center;gap:8px;border-radius:var(--button-radius);padding:9px 16px;font-size:var(--fs-base);font-weight:600;cursor:pointer;border:1px solid var(--ink-200);background:#fff;color:var(--ink-800);transition:.15s}
.gb .btn:hover{border-color:var(--ink-400)} .gb .btn:disabled{opacity:.5;cursor:not-allowed}
.gb .btn.primary{background:var(--ink-900);color:#fff;border-color:var(--ink-900)} .gb .btn.primary:hover{background:var(--ink-700)}
.gb .btn.pink{background:var(--pink);color:#fff;border-color:var(--pink)} .gb .btn.sm{padding:6px 12px;font-size:var(--fs-sm)}
.gb .rb-btn-add{background:#fff;color:var(--pink-700);border:1px solid var(--pink-100);border-radius:8px;padding:6px 12px;font:inherit;font-size:var(--fs-xs);font-weight:600;cursor:pointer;transition:.12s}
.gb .rb-btn-add:hover{background:var(--pink-50)} .gb .rb-btn-add:disabled{opacity:.5;cursor:not-allowed}
/* Per-flavor image control (task #203) */
.gb .rb-flavor-img{display:grid;place-items:center;width:38px;height:38px;border-radius:9px;overflow:hidden;cursor:pointer;background:#fff;color:var(--ink-400);transition:.12s}
.gb .rb-flavor-img[data-has-image=false]{border:1.5px dashed var(--border-soft)}
.gb .rb-flavor-img[data-has-image=true]{border:1px solid var(--ink-200)}
.gb .rb-flavor-img:hover:not(:disabled){border-color:var(--pink);color:var(--pink-700)}
.gb .rb-flavor-img:disabled{opacity:.45;cursor:not-allowed}
.gb .rb-flavor-img img{width:100%;height:100%;object-fit:cover}
.gb .rb-flavor-img-spin{animation:rb-spin 1s linear infinite}
@keyframes rb-spin{to{transform:rotate(360deg)}}
.gb .rb-flavor-img-pop{position:absolute;z-index:30;top:calc(100% + 6px);left:0;width:240px;background:#fff;border:1px solid var(--ink-200);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.12);padding:12px}
.gb .rb-flavor-img-pop-head{display:flex;align-items:center;justify-content:space-between;font-size:var(--fs-xs);font-weight:600;color:var(--ink-700);margin-bottom:8px}
.gb .rb-flavor-img-pop-head button{display:grid;place-items:center;width:20px;height:20px;border-radius:6px;color:var(--ink-400);cursor:pointer}
.gb .rb-flavor-img-pop-head button:hover{background:var(--ink-100);color:var(--ink-700)}
.gb .rb-flavor-img-drop{border:1.5px dashed var(--border-soft);border-radius:10px;padding:14px 10px;text-align:center;transition:.12s}
.gb .rb-flavor-img-drop[data-drag=true]{border-color:var(--pink);background:var(--pink-50)}
.gb .rb-flavor-img-drop-cta{display:flex;flex-direction:column;align-items:center;gap:4px;width:100%;color:var(--ink-700);cursor:pointer}
.gb .rb-flavor-img-drop-cta>span:nth-child(2){font-size:var(--fs-sm);font-weight:600}
.gb .rb-flavor-img-drop-hint{font-size:var(--fs-2xs,11px);color:var(--ink-500)}
.gb .rb-flavor-img-drop-busy{display:inline-flex;align-items:center;gap:6px;font-size:var(--fs-sm);color:var(--ink-600)}
.gb .rb-flavor-img-remove{margin-top:8px;width:100%;font-size:var(--fs-xs);font-weight:600;color:var(--pink-700);background:#fff;border:1px solid var(--pink-100);border-radius:8px;padding:6px;cursor:pointer}
.gb .rb-flavor-img-remove:hover{background:var(--pink-50)}
.gb .card{border:var(--card-border-width) solid var(--card-border-color);border-radius:var(--card-radius);background:#fff;padding:18px}
.gb .field label{display:block;font-size:var(--fs-base);font-weight:600;color:var(--ink-800);margin-bottom:7px;letter-spacing:-.005em}
.gb .input,.gb .sel,.gb textarea{width:100%;border:var(--border-width) solid var(--border-soft);border-radius:var(--input-radius);padding:9px 12px;font:inherit;font-size:var(--fs-base);color:var(--ink-900);background:#fff}
.gb .input:focus,.gb .sel:focus,.gb textarea:focus{outline:none;border-color:var(--pink);box-shadow:0 0 0 3px var(--pink-50)}
.gb input[type=checkbox],.gb input[type=radio]{accent-color:var(--control-accent);cursor:pointer}
.gb .row{display:flex;gap:14px;flex-wrap:wrap} .gb .grid{display:grid;gap:14px}
.gb .chip{display:inline-flex;align-items:center;gap:6px;border-radius:var(--chip-radius);border:var(--border-width) solid var(--border-soft);padding:5px 11px;font-size:var(--fs-sm);cursor:pointer;background:#fff;color:var(--ink-700)}
.gb .chip.on{background:var(--ink-900);color:#fff;border-color:var(--ink-900)}
.gb table{width:100%;border-collapse:collapse;font-size:var(--fs-sm)}
.gb th{text-align:left;font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.06em;color:var(--ink-500);font-weight:600;padding:8px 10px;border-bottom:1px solid var(--ink-100)}
.gb td{padding:9px 10px;border-bottom:1px solid var(--ink-50);vertical-align:middle}
.gb .note{font-size:var(--fs-xs);color:var(--pink-700);background:var(--pink-50);border:1px solid var(--pink-100);border-radius:10px;padding:7px 10px}
.gb .note.grey{color:var(--ink-600);background:var(--ink-50);border-color:var(--ink-200)}
.gb-top{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 0;background:#fff;border-bottom:1px solid var(--ink-200)}
.gb-scopes{display:flex;align-items:center;gap:10px;flex-wrap:wrap} .gb-actions{display:flex;gap:10px}
.gb-shell{display:block}
.gb .rail{border-right:1px solid var(--ink-200);padding:18px 14px;background:#fff}
.gb .rail h3{font-size:var(--fs-lg)}
.gb .progress-card{border:1px solid var(--ink-200);border-radius:14px;background:var(--ink-50);padding:12px;margin-bottom:14px}
.gb .pbar{height:6px;border-radius:999px;background:var(--ink-200);margin-top:8px;overflow:hidden}
.gb .pfill{height:100%;background:var(--pink);border-radius:999px;transition:width .25s ease}
.gb .step{display:flex;gap:11px;align-items:flex-start;padding:11px;border-radius:14px;cursor:pointer;border:1px solid transparent}
.gb .step.active{border-color:var(--pink-100);background:var(--pink-50)}
.gb .step .n{width:22px;height:22px;border-radius:50%;border:1.5px solid var(--ink-300);display:grid;place-items:center;font-size:var(--fs-xs);font-weight:700;color:var(--ink-500);flex:none}
.gb .step.active .n{background:var(--pink);border-color:var(--pink);color:#fff}
.gb .step.done .n{background:var(--green);border-color:var(--green);color:#fff}
.gb .step .t{font-weight:600;font-size:var(--fs-base)} .gb .step .d{font-size:var(--fs-xs);color:var(--ink-500)}
.gb-main{padding:24px 28px;max-width:1200px;margin:0 auto;width:100%}
.gb-pagehead{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:20px}
.gb-pagehead h1{font-size:var(--fs-ui-display,1.875rem)}
.gb-head-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.gb-topinject{display:inline-flex;align-items:center;gap:8px}
.gb-iconbtn{display:inline-grid;place-items:center;width:32px;height:32px;border-radius:9px;border:1px solid #E0E1E5;background:#fff;color:#33343C;cursor:pointer;transition:.12s}
.gb-iconbtn:hover{background:#F8F8F9;border-color:#CBCCD3}
.gb-menu{position:absolute;top:calc(100% + 8px);left:0;z-index:61;background:#fff;border:1px solid #E0E1E5;border-radius:12px;box-shadow:0 16px 40px -16px rgba(0,0,0,.3);padding:6px;min-width:200px}
.gb-menuitem{display:block;padding:8px 11px;border-radius:8px;font-size:var(--fs-base);color:var(--ink-900);text-decoration:none}
.gb-menuitem:hover{background:#FFE9F0;color:#C71350}
.gb-saveicon{display:inline-flex;align-items:center;color:#1D9E75}
.gb-nextbtn{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:8px 16px;font:inherit;font-size:var(--fs-base);font-weight:600;cursor:pointer;border:1px solid #FF2E63;background:#FF2E63;color:#fff;transition:.15s}
.gb-nextbtn:hover:not(:disabled){background:#E11D54;border-color:#E11D54}
.gb-nextbtn:disabled{background:#fff;border-color:#E0E1E5;color:#9A9CA6;cursor:not-allowed}
.gb .hero{border:1px solid var(--pink-100);background:var(--cream);border-radius:24px;padding:20px 22px;margin-bottom:18px}
.gb .stepper{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:center;margin-bottom:18px}
.gb .sbead{display:flex;align-items:center;gap:7px;font-size:var(--fs-sm);color:var(--ink-500);cursor:pointer}
.gb .sbead:hover{color:var(--ink-900)}
.gb .sbead .b{width:20px;height:20px;border-radius:50%;background:var(--ink-100);display:grid;place-items:center;font-size:var(--fs-2xs);font-weight:700;color:var(--ink-500)}
.gb .sbead.active{color:var(--ink-900);font-weight:600} .gb .sbead.active .b{background:var(--pink);color:#fff}
.gb .sbead.done .b{background:var(--green);color:#fff} .gb .sline{width:26px;height:1.5px;background:var(--ink-200);display:inline-block;margin:0 2px}
.gb .section-title{display:flex;align-items:center;gap:10px;font-family:"Bricolage Grotesque",Inter,sans-serif;font-size:var(--fs-ui-section,1.0625rem);font-weight:700;letter-spacing:-.015em;color:var(--ink-900)}
.gb .section-title .ic{width:30px;height:30px;border-radius:9px;background:var(--pink-50);color:var(--pink-700);display:grid;place-items:center;flex:none}
.gb .sec-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px}
.gb .info[data-tip]{position:relative;display:inline-grid;place-items:center;width:16px;height:16px;border-radius:50%;background:#fff;color:var(--ink-600);border:1px solid var(--ink-300);font-size:10px;font-weight:700;font-style:normal;line-height:1;cursor:help;flex:none}
.gb .info[data-tip]:hover,.gb .info[data-tip]:focus{background:var(--ink-50);color:var(--ink-900);border-color:var(--ink-400);outline:none}
.gb .info[data-tip]:hover::after,.gb .info[data-tip]:focus::after{content:attr(data-tip);position:absolute;left:50%;bottom:calc(100% + 8px);transform:translateX(-50%);width:max-content;max-width:280px;white-space:normal;text-align:left;background:#fff;color:var(--ink-900);border:1px solid var(--ink-200);font-size:11.5px;font-weight:400;line-height:1.45;font-style:normal;letter-spacing:0;padding:8px 10px;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.22);z-index:60;pointer-events:none}
.gb .info[data-tip]:hover::before,.gb .info[data-tip]:focus::before{content:"";position:absolute;left:50%;bottom:calc(100% + 2px);transform:translateX(-50%);border:6px solid transparent;border-top-color:#fff;z-index:60;pointer-events:none}
.gb .two{display:grid;grid-template-columns:1fr 340px;gap:18px;align-items:start}
.gb .msel{position:relative}
.gb .msel-btn{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;border:var(--border-width) solid var(--border-soft);border-radius:var(--input-radius);padding:9px 12px;background:#fff;font:inherit;font-size:var(--fs-base);color:var(--ink-900);cursor:pointer;text-align:left}
.gb .msel-btn:hover{border-color:var(--ink-400)} .gb .msel-btn:disabled{opacity:.55;cursor:default}
.gb .msel-btn.empty .msel-sum{color:var(--ink-400)}
.gb .msel-sum{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gb .msel-btn .chev{color:var(--ink-400);flex:none}
.gb .msel-panel{position:absolute;top:calc(100% + 6px);left:0;right:0;z-index:40;background:#fff;border:1px solid var(--ink-200);border-radius:12px;box-shadow:0 16px 40px -16px rgba(0,0,0,.28);padding:6px;max-height:264px;overflow:auto}
.gb .msel-opt{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;font-size:var(--fs-base);color:var(--ink-800);cursor:pointer}
.gb .msel-opt:hover{background:var(--ink-50)}
.gb .msel-opt .box{width:18px;height:18px;border-radius:5px;border:1.5px solid var(--ink-300);display:grid;place-items:center;flex:none;color:#fff;transition:.12s}
.gb .msel-opt.on .box{background:var(--pink);border-color:var(--pink)}
.gb .smart-foot{display:flex;justify-content:flex-end;margin-top:5px;font-size:var(--fs-2xs);color:var(--ink-400)} .gb .smart-foot.over{color:var(--pink-700)}
.gb .rte{border:var(--border-width) solid var(--border-soft);border-radius:var(--input-radius);background:#fff;overflow:hidden}
.gb .rte:focus-within{border-color:var(--pink);box-shadow:0 0 0 3px var(--pink-50)}
.gb .rte-bar{display:flex;align-items:center;gap:2px;padding:6px;border-bottom:1px solid var(--ink-100);background:var(--ink-50)}
.gb .rte-b{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:7px;border:0;background:transparent;color:var(--ink-600);cursor:pointer;transition:.12s}
.gb .rte-b:hover{background:#fff;color:var(--ink-900)} .gb .rte-b.on{background:var(--pink-50);color:var(--pink-700)}
.gb .rte-area{padding:10px 12px;min-height:96px;font:inherit;font-size:var(--fs-base);color:var(--ink-900);line-height:1.55;outline:none}
.gb .rte-area:empty:before{content:attr(data-ph);color:var(--ink-400)}
.gb .rte-area ul{margin:6px 0;padding-left:20px;list-style:disc} .gb .rte-area ol{margin:6px 0;padding-left:20px;list-style:decimal} .gb .rte-area li{margin:2px 0}
.gb .rte-foot{display:flex;justify-content:flex-end;padding:5px 10px 8px;font-size:var(--fs-2xs);color:var(--ink-400)} .gb .rte-foot.over{color:var(--pink-700)}
.gb .imgslot{border:1.5px dashed var(--ink-300);border-radius:12px;aspect-ratio:1;display:grid;place-items:center;color:var(--ink-400);font-size:var(--fs-xs);text-align:center}
.gb .imgslot.video{border-color:var(--pink-100);color:var(--pink-700)}
.gb .seg{display:inline-flex;border:1px solid var(--ink-200);border-radius:999px;padding:3px;background:#fff;gap:3px}
.gb .seg button{border:0;background:transparent;padding:6px 14px;border-radius:999px;font:inherit;font-size:var(--fs-sm);font-weight:600;color:var(--ink-600);cursor:pointer}
.gb .seg button.on{background:var(--ink-900);color:#fff}
.gb .navbtns{display:flex;align-items:center;justify-content:space-between;margin-top:22px;padding-top:16px;border-top:1px solid var(--ink-100)}
.gb .navleft{display:flex;gap:10px;align-items:center}
.gb .rail{position:sticky;top:0;align-self:start;height:100vh;overflow:auto;background:#fff}
.gb .facts{border:2px solid #000;border-radius:6px;padding:10px;font-family:Helvetica,Arial,sans-serif;color:#000;font-size:11px;background:#fff}
.gb .facts .big{font-size:24px;font-weight:800;border-bottom:6px solid #000;margin:0 0 2px}
.gb .facts .r{display:flex;justify-content:space-between;border-bottom:1px solid #000;padding:2px 0}
.gb .studio{display:grid;grid-template-columns:1fr 230px;border:1px solid var(--ink-200);border-radius:18px;overflow:hidden;min-height:480px}
.gb .studio .canvas{padding:18px;background:var(--studio-canvas-bg)} .gb .studio .drawer{border-left:1px solid var(--ink-200);background:var(--studio-panel-bg);padding:12px}
.gb .drawer .ditem{display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:11px;cursor:pointer;font-size:var(--fs-sm);font-weight:500;color:var(--ink-600)}
.gb .drawer .ditem.on{background:var(--pink-50);color:var(--pink-700)} .gb .drawer .ditem:hover{background:var(--ink-50)}
.gb .pacshell{display:grid;grid-template-columns:var(--studio-rail-width) 1fr var(--studio-inspector-width);border:1px solid var(--ink-200);border-radius:18px;overflow:hidden;min-height:520px}
.gb .pacshell .lib{border-right:1px solid var(--ink-200);padding:12px;background:var(--studio-panel-bg);overflow:auto;max-height:560px}
.gb .pacshell .stage{background:linear-gradient(180deg,#fafafa,#eee);display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative}
.gb .pacshell .insp{border-left:1px solid var(--ink-200);padding:12px;background:var(--studio-panel-bg)}
.gb .cat{font-size:var(--fs-xs);font-weight:700;color:var(--ink-700);margin:10px 0 4px;text-transform:uppercase;letter-spacing:.04em}
.gb .subcat{font-size:var(--fs-sm);color:var(--ink-600);padding:5px 8px;border-radius:8px;cursor:pointer}
.gb .subcat:hover{background:var(--ink-50)} .gb .subcat.on{background:var(--pink-50);color:var(--pink-700);font-weight:600}
.gb .can3d{width:150px;height:230px;border-radius:14px;background:linear-gradient(90deg,#CBCCD3,#F8F8F9 30%,#E0E1E5 55%,#c2c6c9);box-shadow:inset 0 0 0 1px #b9bdc0;display:grid;place-items:center;color:#9aa;text-align:center;font-size:var(--fs-sm)}
.gb .compbar{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.gb .compcard{border:1px solid var(--ink-200);border-radius:12px;padding:9px 11px;font-size:var(--fs-sm);min-width:150px}
.gb .frame{position:absolute;border:1.5px dashed var(--pink);border-radius:6px;background:rgba(255,46,99,.06);font-size:var(--fs-2xs);color:var(--pink-700);padding:2px 4px;font-weight:600}
.gb .die{position:relative;width:300px;height:380px;background:#fff;border:1.5px solid var(--ink-300);border-radius:8px;margin:0 auto}
.gb .palrow{display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid var(--ink-200);border-radius:10px;margin-bottom:7px;font-size:var(--fs-sm);cursor:grab}
.gb .palrow .b{width:8px;height:8px;border-radius:50%;background:var(--pink)}
.gb hr.div{border:0;border-top:1px solid var(--ink-100);margin:10px 0}
.gb .kpi{border:1px solid var(--ink-200);border-radius:14px;padding:11px 13px;background:#fff}
.gb .kpi .l{font-size:var(--fs-2xs);font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:var(--ink-500)}
.gb .kpi .v{font-family:"Bricolage Grotesque",Inter;font-weight:800;font-size:var(--fs-xl)}
.gb .banner{display:flex;gap:10px;align-items:center;border:1px solid #B5D4F4;background:var(--info-50);color:#0C447C;border-radius:14px;padding:10px 14px;font-size:var(--fs-sm);margin-bottom:16px}
@media(max-width:900px){.gb-shell{grid-template-columns:1fr}.gb .rail{border-right:0;border-bottom:1px solid var(--ink-200)}.gb .two,.gb .studio,.gb .pacshell{grid-template-columns:1fr}}
/* Builder-active chrome overrides (global, mount-scoped via body.gb-active). The
   dashboard sidebar hides and the shell padding/width are neutralized so the
   builder's own rail acts as the side menu. Reverts when the builder unmounts. */
/* Builder chrome: keep the partner sidebar on the LEFT but folded to icons (the
   builder dispatches the collapse on enter, restores on exit). Main goes
   full-bleed; the builder's own max-width centers it. */
body.gb-active [data-partner-shell-main]{padding:0!important}
body.gb-active [data-partner-shell-content]{max-width:none!important}
`
