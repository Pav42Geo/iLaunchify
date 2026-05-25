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
  Weight,
  MessageSquare,
  FileText,
} from 'lucide-react'
import type { ProductTemplateStatus, IngredientSource } from '@prisma/client'
import { saveProductFields, submitProductForReview, archiveDraft } from '../../actions'

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
}

interface Counts {
  ingredients: number
  packaging: number
  variants: number
  certificates: number
}

interface IngredientSlot {
  id: string
  name: string
  weightG: number
  source: IngredientSource | null
  allergens: string[]
}

interface PackagingLink {
  packagingSystemId: string
  name: string
  topology: string
  unitCount: number
  basePriceCents: number
  leadTimeDays: number
}

interface VariantRow {
  id: string
  containerFormat: string
  servingsPerContainer: number
  servingSizeG: number
}

interface EditorShellProps {
  template: TemplateSnapshot
  counts: Counts
  ingredientSlots: IngredientSlot[]
  packagingLinks: PackagingLink[]
  variants: VariantRow[]
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function EditorShell({
  template,
  counts,
  ingredientSlots,
  packagingLinks,
  variants,
}: EditorShellProps) {
  const router = useRouter()

  // Local mirror of editable fields. Server is source of truth — local state
  // exists for snappy typing + the autosave debounce loop.
  const [name, setName] = useState(template.name)
  const [description, setDescription] = useState(template.description ?? '')
  const [priceFloorDollars, setPriceFloorDollars] = useState(
    (template.priceFloorCents / 100).toFixed(2),
  )
  const [allergenCrossContamination, setAllergenCrossContamination] = useState(
    template.allergenCrossContamination ?? '',
  )
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Open-card map — cards are open by default; user collapses what they don't need.
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({
    basics: true,
    ingredients: true,
    allergens: true,
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
        allergenCrossContamination: allergenCrossContamination || null,
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
  }, [name, description, priceFloorDollars, allergenCrossContamination])

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
  const canSubmit = isDraft

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,320px]">
      {/* Main editor cards */}
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
          </div>
        </EditorCard>

        {/* ② Ingredients */}
        <EditorCard
          id="ingredients"
          icon={Beaker}
          title="Ingredients (slots)"
          subtitle={`${counts.ingredients} base ingredient${counts.ingredients === 1 ? '' : 's'} · creator can swap in alternatives`}
          open={!!openCards.ingredients}
          onToggle={() => toggleCard('ingredients')}
          reapprovalRequired
        >
          <div className="space-y-2">
            <ul className="space-y-1.5">
              {ingredientSlots.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2"
                >
                  <div>
                    <div className="font-medium text-zinc-900">{s.name}</div>
                    <div className="text-xs text-zinc-500">
                      {s.weightG}g · {sourceLabel(s.source)}
                    </div>
                  </div>
                  {s.allergens.length > 0 && (
                    <span className="text-xs text-amber-700">{s.allergens.join(', ')}</span>
                  )}
                </li>
              ))}
            </ul>
            <Stub note="Slot replacements + per-slot lock + USDA picker land in #131 (W2 editor cards)." />
          </div>
        </EditorCard>

        {/* ③ Allergens */}
        <EditorCard
          id="allergens"
          icon={ShieldAlert}
          title="Allergens"
          subtitle="Auto-derived from ingredients + cross-contamination statement"
          open={!!openCards.allergens}
          onToggle={() => toggleCard('allergens')}
          reapprovalRequired
        >
          <Field label="Cross-contamination statement" hint="Prints on the label">
            <textarea
              value={allergenCrossContamination}
              onChange={(e) => setAllergenCrossContamination(e.target.value)}
              rows={2}
              placeholder='e.g. "Manufactured in a facility that also processes peanuts and tree nuts."'
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
              disabled={!isDraft}
            />
          </Field>
          <Stub note="Auto-derived Big-9 contains-list + manual overrides land in #131." />
        </EditorCard>

        {/* ④ Packaging */}
        <EditorCard
          id="packaging"
          icon={Box}
          title="Packaging"
          subtitle={`${counts.packaging} system${counts.packaging === 1 ? '' : 's'} linked · per-size pricing in #132`}
          open={!!openCards.packaging}
          onToggle={() => toggleCard('packaging')}
          reapprovalRequired
        >
          <ul className="space-y-1.5">
            {packagingLinks.map((p) => (
              <li
                key={p.packagingSystemId}
                className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2"
              >
                <div>
                  <div className="font-medium text-zinc-900">{p.name}</div>
                  <div className="text-xs text-zinc-500">
                    {humanizeTopology(p.topology)} · ${(p.basePriceCents / 100).toFixed(2)} ·{' '}
                    {p.leadTimeDays}d lead
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <Stub note="Add/remove packaging links + per-size pricing tiers land in #132 (W3 editor cards)." />
        </EditorCard>

        {/* ⑤ Pricing */}
        <EditorCard
          id="pricing"
          icon={DollarSign}
          title="Pricing"
          subtitle={`${counts.variants} variant${counts.variants === 1 ? '' : 's'} · base price + per-tier discounts`}
          open={!!openCards.pricing}
          onToggle={() => toggleCard('pricing')}
          reapprovalRequired
        >
          <ul className="space-y-1.5">
            {variants.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2"
              >
                <div>
                  <div className="font-medium text-zinc-900">{v.containerFormat}</div>
                  <div className="text-xs text-zinc-500">
                    {v.servingsPerContainer} × {v.servingSizeG}g servings
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <Stub note="Variant CRUD + volume-tier pricing land in #131 (W2 editor cards)." />
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
          <Stub note="Per-size cert scope picker lands in #132 (W3 editor cards)." />
        </EditorCard>

        {/* ⑦ Media + description */}
        <EditorCard
          id="media"
          icon={ImageIcon}
          title="Media + description"
          subtitle="Photos + long-form copy for the creator marketplace card"
          open={!!openCards.media}
          onToggle={() => toggleCard('media')}
        >
          <Stub note="Photo gallery upload lands in #132." />
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
          <Stub note="Key/value editor lands in #132." />
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
          subtitle="Persistent thread for clarifications, requested photos, etc."
          open={!!openCards.notes}
          onToggle={() => toggleCard('notes')}
        >
          <Stub note="Threaded chat UI lands in #132/#133 alongside the admin product queue." />
        </EditorCard>
      </div>

      {/* Sticky sidebar — actions + live label preview placeholder */}
      <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Actions</CardTitle>
            <CardDescription>
              {isDraft
                ? 'Submit for admin review when the draft is ready.'
                : 'This template is in admin review. Edits are blocked until decision.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              onClick={handleSubmitForReview}
              disabled={!canSubmit || isSubmitting}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              <Send className="mr-1.5 h-4 w-4" /> {isSubmitting ? 'Submitting…' : 'Submit for review'}
            </Button>
            {isDraft && (
              <Button
                variant="outline"
                onClick={handleArchive}
                disabled={isSubmitting}
                className="w-full text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="mr-1.5 h-4 w-4" /> Archive draft
              </Button>
            )}
            {submitError && (
              <p className="rounded bg-red-50 px-2 py-1.5 text-xs text-red-700">{submitError}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Live label preview</CardTitle>
            <CardDescription>FDA nutrition panel as it will print</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-xs text-zinc-500">
              <FileText className="h-8 w-8 text-zinc-400" />
              <span>Renders here once #131 wires up the recipe → compliance → label pipeline.</span>
            </div>
          </CardContent>
        </Card>
      </aside>
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
    <Card>
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
