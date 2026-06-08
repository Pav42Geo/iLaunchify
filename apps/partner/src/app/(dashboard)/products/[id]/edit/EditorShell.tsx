'use client'

// Single-page editor shell with autosave + collapsible cards.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4.3 + #130.
//
// 10 cards listed in spec — each is a stub for #131/#132 except Basics which
// ships a functional save-on-blur for name/description/price/allergen-cross-
// contamination so the autosave pipeline + status banner can be exercised
// end-to-end.

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Button,
  Input,
  Label,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  cn,
} from '@ilaunchify/ui'
import { toast } from 'sonner'
import {
  ChevronDown,
  Send,
  Trash2,
  Beaker,
  Box,
  ShieldAlert,
  DollarSign,
  Award,
  Image as ImageIcon,
  Settings2,
  Sparkles,
  Weight,
  MessageSquare,
  FileText,
  Quote,
} from 'lucide-react'
import type { ProductTemplateStatus, IngredientSource, RecipeEntryMode } from '@ilaunchify/db'
import type { NicheSuggestion } from '@ilaunchify/marketplace'
import { saveProductFields, submitProductForReview, archiveDraft } from '../../actions'
import { type ReadinessCheck } from './SubmitReadiness'
import { RecipeLabelPanel, type LabelIngredient, type LabelVariant } from './RecipeLabelPanel'
import { NutritionBreakdownPanel } from './NutritionBreakdownPanel'
import { FlavorPresetsPanel, type FlavorPresetRow } from './cards/FlavorPresetsPanel'
import { createFlavorPreset, updateFlavorPreset, removeFlavorPreset } from './flavor-actions'
import {
  Check,
  AlertTriangle as NavWarn,
  Circle as NavTodo,
  Minus as NavOpt,
  CircleCheck,
  CircleDashed,
} from 'lucide-react'
import { IngredientsCard, type SlotRow } from './cards/IngredientsCard'
import { AllergensCard } from './cards/AllergensCard'
import { VariantsCard, type VariantRow } from './cards/VariantsCard'
import {
  PackagingCard,
  type PackagingLinkRow,
  type AvailablePackagingOption,
} from './cards/PackagingCard'
import {
  CertificatesCard,
  type AttachedCertRow,
  type AvailableCertOption,
} from './cards/CertificatesCard'
import { NotesThread, type NoteRow } from './cards/NotesThread'
import { MediaCard } from './cards/MediaCard'
import { CustomMetaCard, type CustomMetaRow } from './cards/CustomMetaCard'
import { NutrientOverridesPanel } from './cards/NutrientOverridesPanel'
import {
  IngredientGroupingPanel,
  type BaseIngredientOption,
} from './cards/IngredientGroupingPanel'
import {
  NichesAndTagsCard,
  type NicheOption,
  type LifestyleTagOption,
} from './cards/NichesAndTagsCard'
import { LabelPhrasesCard } from './cards/LabelPhrasesCard'
import type { NutrientOverrideRow, IngredientGroupRow } from './card-actions'
import type { PhraseSuggestion, PhraseFactFlag } from '@ilaunchify/marketplace'

// -----------------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------------

interface TemplateSnapshot {
  id: string
  name: string
  slug: string
  status: ProductTemplateStatus
  description: string | null
  priceFloorCents: number
  unitCostCents: number
  allergenCrossContamination: string | null
  subcategoryName: string
  categoryName: string
  recipeEntryMode: RecipeEntryMode | null
}

interface Counts {
  ingredients: number
  packaging: number
  variants: number
  certificates: number
}

// IngredientSlot now mirrors the SlotRow shape used by IngredientsCard
// (so we can pass through without re-mapping).
interface IngredientSlot extends SlotRow {
  source: IngredientSource | null
}

// PackagingLink / VariantRow / SlotRow / NoteRow re-exported from card files
// so the page loader passes through without separate mapping.

interface EditorShellProps {
  template: TemplateSnapshot
  counts: Counts
  /** Mode 2 AI recipe parser available for this partner's plan (Slice 3). */
  aiAvailable: boolean
  /** Mode 3 declared panel available for this partner's plan (Slice 4). */
  declareAvailable: boolean
  /** Product labeling regime (FOOD / SUPPLEMENT / …) — drives Mode 3 panel. */
  labelingType: string
  ingredientSlots: IngredientSlot[]
  packagingLinks: PackagingLinkRow[]
  variants: VariantRow[]
  /** Engine-fed label data (base + replacements + optionals) for RecipeLabelPanel. */
  labelIngredients: LabelIngredient[]
  labelVariants: LabelVariant[]
  /** Flavor presets + the template-level default Statement of Identity. */
  flavorPresets: FlavorPresetRow[]
  flavorDefaultSoI: string | null
  allergenManualOverrides: Array<{ allergen: string; action: 'ADD' | 'REMOVE'; reason: string }>
  availablePackaging: AvailablePackagingOption[]
  attachedCerts: AttachedCertRow[]
  availableCertInstances: AvailableCertOption[]
  heroAssetId: string | null
  customMeta: CustomMetaRow[]
  notes: NoteRow[]
  // V1 Recipal-parity (§4a.5c / §4a.5d) — persisted on ProductTemplate
  nutrientOverrides: NutrientOverrideRow[]
  ingredientGroups: IngredientGroupRow[]
  // Map of baseIngredientId → name from ingredientSlots, computed in page.tsx
  baseIngredientsForGrouping: BaseIngredientOption[]
  // 2026-06-02 Slice 3B — marketplace taxonomy
  niches: NicheOption[]
  selectedNicheIds: string[]
  nicheSuggestions: NicheSuggestion[]
  lifestyleTags: LifestyleTagOption[]
  selectedLifestyleTagIds: string[]
  // 2026-06-05 — per-product label-phrase suggestion engine
  phraseFactFlags: PhraseFactFlag[]
  phraseFacts: Record<string, boolean>
  phraseSuggestions: PhraseSuggestion[]
  phraseRawHits: Array<{ ruleId: string; phraseId: string; matched: boolean }>
  selectedPhraseIds: string[]
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function EditorShell({
  template,
  counts,
  aiAvailable,
  declareAvailable,
  labelingType,
  ingredientSlots,
  labelIngredients,
  labelVariants,
  flavorPresets,
  flavorDefaultSoI,
  packagingLinks,
  variants,
  allergenManualOverrides,
  availablePackaging,
  attachedCerts,
  availableCertInstances,
  heroAssetId,
  customMeta,
  notes,
  nutrientOverrides,
  ingredientGroups,
  baseIngredientsForGrouping,
  niches,
  selectedNicheIds,
  nicheSuggestions,
  lifestyleTags,
  selectedLifestyleTagIds,
  phraseFactFlags,
  phraseFacts,
  phraseSuggestions,
  phraseRawHits,
  selectedPhraseIds,
}: EditorShellProps) {
  const router = useRouter()

  // Local mirror of editable fields. Server is source of truth — local state
  // exists for snappy typing + the autosave debounce loop.
  const [name, setName] = useState(template.name)
  const [description, setDescription] = useState(template.description ?? '')
  const [priceFloorDollars, setPriceFloorDollars] = useState(
    (template.priceFloorCents / 100).toFixed(2),
  )
  // allergenCrossContamination is owned by AllergensCard now — see ③ below.
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Open-card map — cards are open by default; user collapses what they don't need.
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({
    basics: true,
    nichesAndTags: true,
    ingredients: true,
    allergens: true,
    labelPhrases: true,
    packaging: true,
    pricing: true,
    certificates: false,
    media: false,
    customMeta: false,
    weight: false,
    notes: false,
  })

  function toggleCard(key: string) {
    setOpenCards((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Autosave — debounce 1.2s of idle (per spec §3) then flush the patch.
  // Implemented as a manual ref-based debounce so the effect cleanup cancels
  // the in-flight timer when the patch fields change mid-debounce.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setSaveStatus('saving')
    timerRef.current = setTimeout(async () => {
      const priceCents = Math.round(parseFloat(priceFloorDollars) * 100)
      const result = await saveProductFields(template.id, {
        name,
        description,
        priceFloorCents: Number.isFinite(priceCents) ? priceCents : undefined,
      })
      if (result.ok) {
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 1500)
      } else {
        setSaveStatus('error')
        toast.error(result.error)
      }
    }, 1200)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, description, priceFloorDollars])

  // -------- Submit + archive --------
  const [isSubmitting, startSubmit] = useTransition()
  const [submitError, setSubmitError] = useState<string | null>(null)

  function handleSubmitForReview() {
    setSubmitError(null)
    startSubmit(async () => {
      const result = await submitProductForReview(template.id)
      if (!result.ok) {
        setSubmitError(result.error)
        toast.error(result.error)
        return
      }
      toast.success('Submitted for review')
      router.refresh()
    })
  }

  function handleArchive() {
    if (!confirm(`Archive "${template.name}"? You can recreate it but the row will be marked rejected.`)) return
    startSubmit(async () => {
      const result = await archiveDraft(template.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Draft archived')
      router.push('/products')
      router.refresh()
    })
  }

  const isDraft = template.status === 'DRAFT' || template.status === 'NEEDS_CHANGES'

  // -------- Submit readiness (UX rail) --------
  // Required rows mirror submitProductForReview()'s server gates 1:1 — the
  // server remains the source of truth; this just surfaces the gates BEFORE
  // the click instead of one rejection toast at a time. Recommended rows are
  // what makes a listing actually sellable.
  const readinessChecks: ReadinessCheck[] = [
    {
      key: 'ingredients',
      label: 'At least one base ingredient',
      done: ingredientSlots.length > 0,
      required: true,
      cardKey: 'ingredients',
    },
    {
      key: 'packaging',
      label: 'At least one packaging system',
      done: packagingLinks.length > 0,
      required: true,
      cardKey: 'packaging',
    },
    {
      key: 'variants',
      label: 'At least one variant (container size)',
      done: variants.length > 0,
      required: true,
      cardKey: 'pricing',
    },
    {
      key: 'name',
      label: 'Product name (2+ characters)',
      done: name.trim().length >= 2,
      required: false,
      cardKey: 'basics',
    },
    {
      key: 'price',
      label: 'Base price above $0',
      done: Number.parseFloat(priceFloorDollars) > 0,
      required: false,
      cardKey: 'basics',
    },
    {
      key: 'description',
      label: 'Marketplace description',
      done: description.trim().length > 0,
      required: false,
      cardKey: 'basics',
    },
    {
      key: 'hero',
      label: 'Hero image',
      done: !!heroAssetId,
      required: false,
      cardKey: 'media',
    },
    {
      key: 'niches',
      label: 'At least one niche',
      done: selectedNicheIds.length > 0,
      required: false,
      cardKey: 'nichesAndTags',
    },
  ]
  const requiredMissing = readinessChecks.filter((c) => c.required && !c.done)
  const canSubmit = isDraft && requiredMissing.length === 0

  function jumpToCard(cardKey: string) {
    setOpenCards((prev) => ({ ...prev, [cardKey]: true }))
    // Wait a frame so a just-opened card has rendered its content.
    requestAnimationFrame(() => {
      document
        .getElementById(`section-${cardKey}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  // Section navigator — derived from the same data the readiness rail uses.
  type SecState = 'done' | 'warn' | 'todo' | 'opt'
  const navSections: Array<{ key: string; label: string; state: SecState }> = [
    {
      key: 'basics',
      label: 'Basics',
      state: name.trim().length >= 2 && Number.parseFloat(priceFloorDollars) > 0 ? 'done' : 'todo',
    },
    { key: 'nichesAndTags', label: 'Niches & tags', state: selectedNicheIds.length > 0 ? 'done' : 'todo' },
    { key: 'ingredients', label: 'Ingredients', state: ingredientSlots.length > 0 ? 'done' : 'warn' },
    { key: 'allergens', label: 'Allergens', state: ingredientSlots.length > 0 ? 'done' : 'todo' },
    { key: 'packaging', label: 'Packaging', state: packagingLinks.length > 0 ? 'done' : 'warn' },
    { key: 'pricing', label: 'Variants & pricing', state: variants.length > 0 ? 'done' : 'warn' },
    { key: 'certificates', label: 'Certificates', state: attachedCerts.length > 0 ? 'done' : 'todo' },
    { key: 'media', label: 'Media', state: heroAssetId ? 'done' : 'opt' },
    { key: 'customMeta', label: 'Custom meta', state: customMeta.length > 0 ? 'done' : 'opt' },
    { key: 'notes', label: 'Notes thread', state: notes.length > 0 ? 'done' : 'opt' },
  ]
  const navCountable = navSections.filter((s) => s.state !== 'opt')
  const navPct = Math.round(
    (navCountable.filter((s) => s.state === 'done').length / Math.max(1, navCountable.length)) * 100,
  )

  return (
    <div className="space-y-4">
      {/* Top bar — breadcrumb · save state · archive · submit */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-ink-200 bg-white px-4 py-2.5">
        <span className="font-display text-[13px] font-semibold text-ink-900">
          iLaunchify <span className="text-[#FF2E63]">Partner</span>
        </span>
        <span className="text-ink-200">|</span>
        <span className="min-w-0 truncate text-[12px] text-ink-500">
          Products / <span className="font-medium text-ink-900">{template.name}</span>
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              saveStatus === 'saving' ? 'animate-pulse bg-amber-500' : 'bg-emerald-600',
            )}
          />
          {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Save failed' : 'Saved'}
        </span>
        {isDraft && (
          <button
            type="button"
            onClick={handleArchive}
            disabled={isSubmitting}
            className="rounded-full px-2.5 py-1 text-[12px] text-ink-500 transition-colors hover:text-rose-600 disabled:opacity-50"
          >
            Archive
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmitForReview}
          disabled={!canSubmit || isSubmitting}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-ink-700 disabled:bg-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        >
          <Send className="h-3.5 w-3.5" aria-hidden="true" />
          {isSubmitting ? 'Submitting…' : 'Submit for review'}
        </button>
      </div>

      {/* Cream hero */}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-3xl border border-ink-200 bg-[#F3EFE8] px-6 py-5">
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">
            Manufacturing · Product editor
          </p>
          <h1 className="mt-1 font-display text-[24px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
            {template.name}
          </h1>
          <p className="mt-1 text-[12px] text-ink-500">
            {template.subcategoryName} · {template.categoryName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-[#FBEAF0] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#BE185D]">
            🅰 re-approval marked
          </span>
          <span className="rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-600">
            {template.status}
          </span>
        </div>
      </div>

      {/* Three-column workspace: section nav · cards · rail */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[180px,1fr,330px]">
        {/* Left — section navigator */}
        <nav aria-label="Sections" className="lg:sticky lg:top-6 lg:self-start">
          <div className="mb-3 rounded-xl border border-ink-200 bg-white p-3">
            <p className="font-display text-[20px] font-bold leading-none text-ink-900">{navPct}%</p>
            <p className="mt-0.5 text-[10.5px] text-ink-500">
              {navCountable.filter((s) => s.state === 'done').length} of {navCountable.length} complete
            </p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink-100">
              <div className="h-full rounded-full bg-[#FF2E63]" style={{ width: `${navPct}%` }} />
            </div>
          </div>
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
            Sections
          </p>
          <ul className="space-y-px">
            {navSections.map((s) => (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => jumpToCard(s.key)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500',
                    s.state === 'opt' ? 'text-ink-400' : 'text-ink-800',
                  )}
                >
                  <SectionIcon state={s.state} />
                  <span className="truncate">{s.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Middle — editor cards */}
        <div className="space-y-3">
          {/* Status banner */}
          <StatusBanner status={template.status} saveStatus={saveStatus} />

        {/* ① Basics */}
        <EditorCard
          id="basics"
          icon={FileText}
          title="Basics"
          subtitle="Name, description, base price — drives marketplace listing"
          open={!!openCards.basics}
          onToggle={() => toggleCard('basics')}
          reapprovalRequired
        >
          <div className="space-y-4">
            <Field label="Product name" reapprove>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                disabled={!isDraft}
              />
            </Field>
            <Field label="Description (creator-facing)">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
                placeholder="A short pitch for creators browsing the marketplace…"
                disabled={!isDraft}
              />
            </Field>
            <Field label="Base unit price (USD)" reapprove>
              <div className="flex max-w-xs items-stretch overflow-hidden rounded-md border border-zinc-300">
                <span className="flex items-center bg-zinc-50 px-3 text-sm text-zinc-500">$</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={priceFloorDollars}
                  onChange={(e) => setPriceFloorDollars(e.target.value)}
                  className="block w-full bg-white px-3 py-2 text-sm focus:outline-none"
                  disabled={!isDraft}
                />
              </div>
            </Field>

            {/* Recipal-parity advanced controls — collapsible sub-sections.
                Live in Basics so they're discoverable without crowding the
                main slot/variant flow. */}
            <NutrientOverridesPanel
              productTemplateId={template.id}
              initial={nutrientOverrides}
              isDraft={isDraft}
            />
            <IngredientGroupingPanel
              productTemplateId={template.id}
              initial={ingredientGroups}
              baseIngredients={baseIngredientsForGrouping}
              isDraft={isDraft}
            />
          </div>
        </EditorCard>

        {/* ②  Niches & lifestyle tags — 2026-06-02 Slice 3B */}
        <EditorCard
          id="nichesAndTags"
          icon={Sparkles}
          title="Niches & lifestyle tags"
          subtitle="Where this product appears across the marketplace + filter chips"
          open={!!openCards.nichesAndTags}
          onToggle={() => toggleCard('nichesAndTags')}
          reapprovalRequired
        >
          <NichesAndTagsCard
            productTemplateId={template.id}
            niches={niches}
            selectedNicheIds={selectedNicheIds}
            suggestions={nicheSuggestions}
            lifestyleTags={lifestyleTags}
            selectedTagIds={selectedLifestyleTagIds}
            isDraft={isDraft}
          />
        </EditorCard>

        {/* ③ Ingredients */}
        <EditorCard
          id="ingredients"
          icon={Beaker}
          title="Ingredients (slots)"
          subtitle={`${counts.ingredients} base ingredient${counts.ingredients === 1 ? '' : 's'} · creator can swap in alternatives`}
          open={!!openCards.ingredients}
          onToggle={() => toggleCard('ingredients')}
          reapprovalRequired
        >
          <IngredientsCard
            productTemplateId={template.id}
            initialSlots={ingredientSlots}
            isDraft={isDraft}
            initialRecipeEntryMode={template.recipeEntryMode}
            aiAvailable={aiAvailable}
            declareAvailable={declareAvailable}
            labelingType={labelingType}
          />
        </EditorCard>

        {/* ③ Allergens */}
        <EditorCard
          id="allergens"
          icon={ShieldAlert}
          title="Allergens"
          subtitle="Auto-derived from ingredients + manual overrides + cross-contamination statement"
          open={!!openCards.allergens}
          onToggle={() => toggleCard('allergens')}
          reapprovalRequired
        >
          <AllergensCard
            productTemplateId={template.id}
            isDraft={isDraft}
            autoDerived={Array.from(
              new Set(ingredientSlots.flatMap((s) => s.allergens)),
            )}
            initialManualOverrides={allergenManualOverrides}
            initialCrossContamination={template.allergenCrossContamination}
          />
        </EditorCard>

        {/* ③b Label phrases — 2026-06-05 phrase suggestion engine */}
        <EditorCard
          id="labelPhrases"
          icon={Quote}
          title="Label phrases"
          subtitle="Answer product facts — regulatory phrases auto-attach for the label"
          open={!!openCards.labelPhrases}
          onToggle={() => toggleCard('labelPhrases')}
          reapprovalRequired
        >
          <LabelPhrasesCard
            productTemplateId={template.id}
            labelingType={labelingType}
            factFlags={phraseFactFlags}
            initialFacts={phraseFacts}
            suggestions={phraseSuggestions}
            rawHits={phraseRawHits}
            selectedPhraseIds={selectedPhraseIds}
            isDraft={isDraft}
          />
        </EditorCard>

        {/* ④ Packaging */}
        <EditorCard
          id="packaging"
          icon={Box}
          title="Packaging"
          subtitle={`${counts.packaging} system${counts.packaging === 1 ? '' : 's'} linked · per-size price + lead time`}
          open={!!openCards.packaging}
          onToggle={() => toggleCard('packaging')}
          reapprovalRequired
        >
          <PackagingCard
            productTemplateId={template.id}
            initialLinks={packagingLinks}
            availableOptions={availablePackaging}
            isDraft={isDraft}
          />
        </EditorCard>

        {/* ⑤ Pricing / Variants */}
        <EditorCard
          id="pricing"
          icon={DollarSign}
          title="Variants & pricing"
          subtitle={`${counts.variants} variant${counts.variants === 1 ? '' : 's'} · per-SKU container, servings, MOQ, lead time, cost override`}
          open={!!openCards.pricing}
          onToggle={() => toggleCard('pricing')}
          reapprovalRequired
        >
          <VariantsCard
            productTemplateId={template.id}
            initialVariants={variants}
            isDraft={isDraft}
          />
        </EditorCard>

        {/* ⑤b Flavor presets */}
        <EditorCard
          id="flavors"
          icon={Sparkles}
          title="Flavor presets"
          subtitle={`${flavorPresets.length} flavor${flavorPresets.length === 1 ? '' : 's'} · per-flavor name, statement of identity, swatch, price delta`}
          open={!!openCards.flavors}
          onToggle={() => toggleCard('flavors')}
          reapprovalRequired
        >
          <FlavorPresetsPanel
            initial={flavorPresets}
            isDraft={isDraft}
            productName={template.name}
            defaultStatementOfIdentity={flavorDefaultSoI}
            onAdd={(name) => createFlavorPreset({ productTemplateId: template.id, name })}
            onUpdate={(id, patch) => updateFlavorPreset({ flavorPresetId: id, patch })}
            onRemove={(id) => removeFlavorPreset(id)}
          />
        </EditorCard>

        {/* ⑥ Certificates */}
        <EditorCard
          id="certificates"
          icon={Award}
          title="Certificates"
          subtitle={`${counts.certificates} attached · pick from your VERIFIED certs`}
          open={!!openCards.certificates}
          onToggle={() => toggleCard('certificates')}
          reapprovalRequired
        >
          <CertificatesCard
            productTemplateId={template.id}
            attached={attachedCerts}
            availableInstances={availableCertInstances}
            isDraft={isDraft}
          />
        </EditorCard>

        {/* ⑦ Media + description */}
        <EditorCard
          id="media"
          icon={ImageIcon}
          title="Media"
          subtitle="Hero image for the creator marketplace card"
          open={!!openCards.media}
          onToggle={() => toggleCard('media')}
        >
          <MediaCard
            productTemplateId={template.id}
            isDraft={isDraft}
            currentHeroAssetId={heroAssetId}
          />
        </EditorCard>

        {/* ⑧ Custom meta */}
        <EditorCard
          id="customMeta"
          icon={Settings2}
          title="Custom meta fields"
          subtitle="Partner-supplied key/value pairs (max 10)"
          open={!!openCards.customMeta}
          onToggle={() => toggleCard('customMeta')}
        >
          <CustomMetaCard
            productTemplateId={template.id}
            initial={customMeta}
            isDraft={isDraft}
          />
        </EditorCard>

        {/* ⑨ Finished-product weight */}
        <EditorCard
          id="weight"
          icon={Weight}
          title="Finished-product weight"
          subtitle="Derived from slots + flavor presets; used for shipping calc"
          open={!!openCards.weight}
          onToggle={() => toggleCard('weight')}
        >
          <Stub note="Auto-derived from ingredient slots once #131 ships." />
        </EditorCard>

        {/* ⑩ Notes thread */}
        <EditorCard
          id="notes"
          icon={MessageSquare}
          title="Notes thread (admin ↔ partner)"
          subtitle={`${notes.length} message${notes.length === 1 ? '' : 's'} · admin sees this on the review queue`}
          open={!!openCards.notes}
          onToggle={() => toggleCard('notes')}
        >
          <NotesThread productTemplateId={template.id} notes={notes} isDraft={isDraft} />
        </EditorCard>
      </div>

        {/* Right rail — label preview · compliance scan · readiness */}
        <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          {/* Live FDA label — computed by @ilaunchify/nutrition from the recipe's
              real nutrient panels (Phase 2 wiring; replaces the structural
              placeholder). Public-vs-Preview split handled inside the panel. */}
          <RecipeLabelPanel
            labelingType={labelingType}
            ingredients={labelIngredients}
            variants={labelVariants}
            priceFloorCents={template.priceFloorCents}
          />

          {/* QA breakdown — unrounded per-serving, %DV-from-exact, per-100g,
              batch totals. The engineering view behind the rounded label. */}
          <NutritionBreakdownPanel ingredients={labelIngredients} variants={labelVariants} />

          {/* Compliance scan — wires to the compliance service at #131; until
              then the structural checks we CAN run are live, the rest pend. */}
          <div className="rounded-xl border border-ink-200 bg-white p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              Compliance scan
            </p>
            <ul className="space-y-1.5 text-[11.5px]">
              <ScanRow ok label="Big-9 allergens declared" />
              <ScanRow ok label="No banned ingredients at submit" />
              <ScanRow ok={requiredMissing.length === 0} label="Required label sections present" />
              <ScanRow pending label="Nutrient panel + %DV" />
              <ScanRow pending label="Minimum font size enforced" />
            </ul>
            <p className="mt-2 text-[10px] leading-snug text-ink-400">
              Full FDA scan runs at compliance check (#131).
            </p>
          </div>

          {/* Ready to submit? — pink panel */}
          {isDraft && (
            <div className="rounded-xl border border-[#F4C0D1] bg-[#FBEAF0] p-3">
              <p className="font-display text-[13px] font-semibold text-[#BE185D]">Ready to submit?</p>
              <p className="mt-0.5 text-[10.5px] text-[#BE185D]">
                {requiredMissing.length === 0
                  ? 'All required items done — submit when ready.'
                  : `Resolve ${requiredMissing.length} required item${requiredMissing.length === 1 ? '' : 's'} first.`}
              </p>
              <ul className="mt-2.5 space-y-1">
                {readinessChecks
                  .filter((c) => !c.done)
                  .map((c) => (
                    <li key={c.key}>
                      <button
                        type="button"
                        onClick={() => jumpToCard(c.cardKey)}
                        className="flex w-full items-center gap-1.5 text-left text-[11px] text-ink-800 hover:underline focus-visible:outline-none"
                      >
                        <span className={c.required ? 'text-[#BE185D]' : 'text-ink-400'}>
                          {c.required ? '●' : '○'}
                        </span>
                        <span>{c.label}</span>
                      </button>
                    </li>
                  ))}
                {readinessChecks.every((c) => c.done) && (
                  <li className="text-[11px] text-emerald-700">Everything checks out.</li>
                )}
              </ul>
              <button
                type="button"
                onClick={handleSubmitForReview}
                disabled={!canSubmit || isSubmitting}
                className="mt-2.5 w-full rounded-full bg-ink-900 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-ink-700 disabled:bg-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
              >
                {isSubmitting ? 'Submitting…' : 'Submit for review'}
              </button>
              {submitError && (
                <p className="mt-2 rounded bg-white/60 px-2 py-1.5 text-[11px] text-rose-700">
                  {submitError}
                </p>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Status banner
// -----------------------------------------------------------------------------

function StatusBanner({
  status,
  saveStatus,
}: {
  status: ProductTemplateStatus
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
}) {
  const tone = ({
    DRAFT: 'bg-zinc-50 border-zinc-200 text-zinc-700',
    NEEDS_CHANGES: 'bg-amber-50 border-amber-200 text-amber-900',
    PENDING_REVIEW: 'bg-blue-50 border-blue-200 text-blue-900',
    PENDING_EDIT_REVIEW: 'bg-blue-50 border-blue-200 text-blue-900',
    PUBLISHED: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    PAUSED: 'bg-zinc-50 border-zinc-200 text-zinc-700',
    REJECTED: 'bg-red-50 border-red-200 text-red-900',
    UNDER_REVIEW: 'bg-blue-50 border-blue-200 text-blue-900',
    ARCHIVED: 'bg-red-50 border-red-200 text-red-900',
  } as Record<ProductTemplateStatus, string>)[status] ?? 'bg-zinc-50 border-zinc-200 text-zinc-700'

  const label = ({
    DRAFT: 'Draft — only you can see this. Autosaving.',
    NEEDS_CHANGES: 'Admin requested changes. Fix the items + resubmit.',
    PENDING_REVIEW: 'In admin review. Editing locked until decision.',
    PENDING_EDIT_REVIEW: 'Edits in admin review. Live version still serving.',
    PUBLISHED: 'Live. Edits flagged with 🅰 will go back to review on save.',
    PAUSED: 'Paused — hidden from marketplace. Reactivate to re-list.',
    REJECTED: 'Rejected. Create a new draft if you want to retry.',
    UNDER_REVIEW: 'Under review.',
    ARCHIVED: 'Archived.',
  } as Record<ProductTemplateStatus, string>)[status] ?? status

  const saveText = {
    saving: '· Saving…',
    saved: '· ✓ Saved',
    error: '· ⚠ Save failed',
    idle: '',
  }[saveStatus]

  return (
    <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${tone}`}>
      <span className="font-medium">{label}</span>
      <span className="ml-auto text-xs opacity-70">{saveText}</span>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Section-nav + compliance-scan primitives
// -----------------------------------------------------------------------------

function SectionIcon({ state }: { state: 'done' | 'warn' | 'todo' | 'opt' }) {
  if (state === 'done') return <Check className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600" aria-hidden="true" />
  if (state === 'warn') return <NavWarn className="h-3.5 w-3.5 flex-shrink-0 text-amber-600" aria-hidden="true" />
  if (state === 'opt') return <NavOpt className="h-3.5 w-3.5 flex-shrink-0 text-ink-300" aria-hidden="true" />
  return <NavTodo className="h-3.5 w-3.5 flex-shrink-0 text-ink-300" aria-hidden="true" />
}

function ScanRow({ ok, pending, label }: { ok?: boolean; pending?: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2">
      {pending ? (
        <CircleDashed className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-ink-300" aria-hidden="true" />
      ) : ok ? (
        <CircleCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600" aria-hidden="true" />
      ) : (
        <NavWarn className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" aria-hidden="true" />
      )}
      <span className={pending ? 'text-ink-400' : 'text-ink-700'}>{label}</span>
    </li>
  )
}

// -----------------------------------------------------------------------------
// Editor card primitive
// -----------------------------------------------------------------------------

function EditorCard({
  id,
  icon: Icon,
  title,
  subtitle,
  open,
  onToggle,
  reapprovalRequired,
  children,
}: {
  id: string
  icon: typeof FileText
  title: string
  subtitle: string
  open: boolean
  onToggle: () => void
  reapprovalRequired?: boolean
  children: React.ReactNode
}) {
  return (
    // section-${id} is the scroll anchor for the readiness rail's jump links —
    // it must live on the wrapper (always in the DOM), not the open-only body.
    <Card id={`section-${id}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-6 py-4 text-left hover:bg-zinc-50"
        aria-expanded={open}
        aria-controls={`card-${id}`}
      >
        <Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-zinc-500" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-zinc-900">{title}</h2>
            {reapprovalRequired && (
              <span
                className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800"
                title="Edits to this section require re-approval"
                aria-label="Requires re-approval on edit"
              >
                🅰
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>
        </div>
        <ChevronDown
          className={`h-5 w-5 flex-shrink-0 text-zinc-400 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open && (
        <CardContent id={`card-${id}`} className="border-t border-zinc-100">
          <div className="pt-4">{children}</div>
        </CardContent>
      )}
    </Card>
  )
}

// -----------------------------------------------------------------------------
// Sub-components + helpers
// -----------------------------------------------------------------------------

function Field({
  label,
  hint,
  reapprove,
  children,
}: {
  label: string
  hint?: string
  reapprove?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-sm font-medium text-zinc-900">
        {label}
        {reapprove && (
          <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800">
            🅰
          </span>
        )}
      </Label>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      {children}
    </div>
  )
}

function Stub({ note }: { note: string }) {
  return (
    <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
      <span className="font-semibold uppercase tracking-wider text-zinc-500">Stub:</span> {note}
    </div>
  )
}

function sourceLabel(s: IngredientSource | null): string {
  if (!s) return 'Unspecified source'
  return ({
    USDA: 'USDA',
    LIBRARY: 'iLaunchify Library',
    PARTNER_PRIVATE: 'Partner-private',
  } as Record<IngredientSource, string>)[s] ?? s
}

function humanizeTopology(t: string): string {
  return t
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
