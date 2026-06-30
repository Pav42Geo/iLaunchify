'use client'

// Basics — Screen 1 of the turnkey builder, built to the locked data model
// (2026-06-08). Identity + base SKU · niches/tags dropdown→chips · short/long
// description · custom meta · hero+thumbnail media · dynamic Product-Type card
// (Single → production fields · Multi-flavor → flavors+facility · Multi-pack →
// pack composition). Rendered inside GuidedBuilder's `.gb` style scope.
//
// Persistence: creates the DRAFT once name+subcategory are valid, then autosaves
// scalar fields via updateBasics. Niches + lifestyle tags persist via
// saveProductNiches / saveProductLifestyleTags and round-trip through loadDraft
// (nicheIds / lifestyleTagIds).

import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { createDraftShell, updateBasics, type InitialDraft } from './build-actions'
import { saveProductNiches, saveProductLifestyleTags } from '../[id]/edit/card-actions'
import { CertificatesCard } from './CertificatesCard'
import { MarketplaceAttributesCard } from './MarketplaceAttributesCard'
import { MediaUpload } from './MediaUpload'
import { Tag, Filter, FileText, ListPlus, Hash } from 'lucide-react'
import { Section, Field, RichTextField, SmartTextInput } from './_ui'
import { COUNTRY_OPTIONS } from './_countries'

interface Opt { id: string; label: string; group?: string }
interface CategoryOption { id: string; name: string; mainCategory: string; labelingType: string }
interface SubcategoryOption { id: string; name: string; categoryId: string }
interface FacilityOption { id: string; name: string }

export type ProductType = 'SINGLE' | 'MULTI_FLAVOR' | 'MULTI_PACK'

interface BasicsScreenProps {
  /** Product domain (LabelingType) chosen in the domain selector. Categories are
   *  filtered to this domain — a product can only be filed under a matching one. */
  domain: string
  categories: CategoryOption[]
  subcategories: SubcategoryOption[]
  niches: Opt[]
  lifestyleTags: Opt[]
  facilities: FacilityOption[]
  /** ACTIVE markets from admin Markets & Regions (default US-only). */
  markets?: { value: string; label: string }[]
  draftId: string | null
  onDraftId: (id: string) => void
  onName: (name: string) => void
  /** Resume — seeds the form fields when reopening an existing draft. */
  initial?: InitialDraft | null
  /** Register an immediate flush of the debounced autosave; called before nav. */
  registerFlush?: (fn: () => Promise<void> | void) => () => void
}

interface Meta { key: string; value: string }

export function BasicsScreen({
  domain, categories, subcategories, niches, lifestyleTags, facilities,
  markets = [{ value: 'US', label: 'United States' }],
  draftId, onDraftId, onName, initial, registerFlush,
}: BasicsScreenProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [baseSku, setBaseSku] = useState(initial?.familyCode ?? '')
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '')
  const [subcategoryId, setSubcategoryId] = useState(initial?.subcategoryId ?? '')
  const [shortDesc, setShortDesc] = useState(initial?.description ?? '')
  const [longDesc, setLongDesc] = useState(initial?.longDescription ?? '')
  const [coo, setCoo] = useState(initial?.countryOfOrigin ?? '')
  const [meta, setMeta] = useState<Meta[]>([])
  // Partner-private external references (ERP id, warehouse code, …). Reference-only.
  const [refs, setRefs] = useState<{ label: string; value: string }[]>(initial?.manufacturerRefs ?? [])
  const [selNiches, setSelNiches] = useState<string[]>(initial?.nicheIds ?? [])
  const [selTags, setSelTags] = useState<string[]>(initial?.lifestyleTagIds ?? [])
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [, startSave] = useTransition()

  // Only categories belonging to the chosen product domain are selectable —
  // a Supplement can't be filed under Snacks, a Cosmetic can't be filed under
  // Pet, etc. (server-enforced too, in build-actions).
  const visibleCategories = categories.filter((c) => c.labelingType === domain)

  // Keep the selection coherent with the domain. If the domain changes (or a
  // resumed draft's category doesn't match), drop an invalid category; when the
  // domain has exactly one category (Supplement / Cosmetic / Pet), auto-pick it
  // so the manufacturer only has to choose a subcategory.
  useEffect(() => {
    const valid = visibleCategories.some((c) => c.id === categoryId)
    if (!valid) {
      if (visibleCategories.length === 1) {
        setCategoryId(visibleCategories[0]!.id)
      } else if (categoryId) {
        setCategoryId('')
      }
      setSubcategoryId('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain])

  const subs = subcategories.filter((s) => s.categoryId === categoryId)
  const ready = name.trim().length >= 2 && !!subcategoryId

  // Auto-suggest a base SKU from the name once.
  useEffect(() => {
    if (!baseSku && name.trim()) {
      setBaseSku(name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 18))
    }
    onName(name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])

  // Debounced autosave: create the draft once valid, then patch scalars.
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!ready) return
    if (t.current) clearTimeout(t.current)
    setSaving('saving')
    t.current = setTimeout(() => {
      startSave(async () => {
        let id = draftId
        if (!id) {
          const res = await createDraftShell({ name: name.trim(), subcategoryId, labelingType: domain })
          if (!res || !res.ok) { toast.error(res?.error ?? 'Save failed'); setSaving('idle'); return }
          id = res.data.id
          onDraftId(id)
        }
        const res = await updateBasics(id, {
          name, subcategoryId, familyCode: baseSku, description: shortDesc, longDescription: longDesc,
          countryOfOrigin: coo || null,
          customMeta: meta.filter((m) => m.key.trim()),
          manufacturerRefs: refs.filter((r) => r.value.trim()),
        })
        setSaving(res.ok ? 'saved' : 'idle')
        if (!res.ok) toast.error(res.error)
        else setTimeout(() => setSaving('idle'), 1200)
      })
    }, 900)
    return () => { if (t.current) clearTimeout(t.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, baseSku, subcategoryId, shortDesc, longDesc, coo, meta, refs])

  // Persist niches (1 primary + ≤2 secondary; first = primary) — debounced.
  const nTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!draftId) return
    if (nTimer.current) clearTimeout(nTimer.current)
    nTimer.current = setTimeout(() => { void saveProductNiches(draftId, selNiches) }, 700)
    return () => { if (nTimer.current) clearTimeout(nTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selNiches, draftId])

  // Persist lifestyle tags — debounced.
  const tagTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!draftId) return
    if (tagTimer.current) clearTimeout(tagTimer.current)
    tagTimer.current = setTimeout(() => { void saveProductLifestyleTags(draftId, selTags) }, 700)
    return () => { if (tagTimer.current) clearTimeout(tagTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selTags, draftId])

  // Immediate flush of all three debounced autosaves — registered with the parent
  // so navigation can persist last-second edits before reloading the draft. A ref
  // keeps the closure reading the latest field values on each render.
  const flushRef = useRef<() => Promise<void>>(async () => {})
  flushRef.current = async () => {
    if (t.current) clearTimeout(t.current)
    if (nTimer.current) clearTimeout(nTimer.current)
    if (tagTimer.current) clearTimeout(tagTimer.current)
    let id = draftId
    if (ready) {
      if (!id) {
        const res = await createDraftShell({ name: name.trim(), subcategoryId, labelingType: domain })
        if (res?.ok) { id = res.data.id; onDraftId(id) }
      }
      if (id) {
        await updateBasics(id, { name, subcategoryId, familyCode: baseSku, description: shortDesc, longDescription: longDesc, countryOfOrigin: coo || null, customMeta: meta.filter((m) => m.key.trim()), manufacturerRefs: refs.filter((r) => r.value.trim()) })
        setSaving('saved')
      }
    }
    if (id) {
      await saveProductNiches(id, selNiches)
      await saveProductLifestyleTags(id, selTags)
    }
  }
  useEffect(() => {
    if (!registerFlush) return
    return registerFlush(() => flushRef.current())
  }, [registerFlush])

  function toggleChip(list: string[], set: (v: string[]) => void, id: string, max?: number) {
    if (list.includes(id)) set(list.filter((x) => x !== id))
    else if (!max || list.length < max) set([...list, id])
    else toast.error(`Up to ${max}.`)
  }

  return (
    <div>
      {ready && (
        <div className="muted small" style={{ textAlign: 'right', marginBottom: 10 }}>
          {saving === 'saving' ? 'Saving…' : saving === 'saved' ? '✓ Saved' : 'Draft ready'}
        </div>
      )}

      <div className="two">
        {/* LEFT — identity · marketplace · descriptions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Section icon={Tag} title="Product identity">
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <Field full label="Product name">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sparkling Yuzu Soda" />
              </Field>
              <Field full label="Base SKU">
                <input className="input" value={baseSku} onChange={(e) => setBaseSku(e.target.value)} placeholder="SODA-YUZU" />
              </Field>
              <Field label="Category">
                <select
                  className="sel"
                  value={categoryId}
                  disabled={visibleCategories.length <= 1}
                  onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId('') }}
                >
                  <option value="">{visibleCategories.length ? 'Select…' : 'No category for this domain'}</option>
                  {visibleCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Subcategory">
                <select className="sel" value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)} disabled={!categoryId}>
                  <option value="">{categoryId ? 'Select…' : 'Pick a category first'}</option>
                  {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Country of origin">
                <select className="sel" value={coo} onChange={(e) => setCoo(e.target.value)}>
                  <option value="">—</option>
                  {COUNTRY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Field>
              <Field full label="Niches">
                <ChipSelect options={niches} selected={selNiches} onToggle={(id) => toggleChip(selNiches, setSelNiches, id, 3)} placeholder="Add a niche…" />
              </Field>
            </div>
          </Section>

          <Section icon={Filter} title="Marketplace filters">
            <MarketplaceAttributesCard
              draftId={draftId}
              domain={domain}
              marketOptions={markets}
              initial={{
                format: initial?.manufacturingFormat ?? null,
                processes: initial?.manufacturingProcesses ?? [],
                allergenFree: initial?.allergenFreeClaims ?? [],
                markets: initial?.marketCodes ?? [],
              }}
              lifestyle={{
                diet: lifestyleTags.filter((t) => t.group === 'LIFESTYLE').map((t) => ({ value: t.id, label: t.label })),
                audience: lifestyleTags.filter((t) => t.group === 'AUDIENCE').map((t) => ({ value: t.id, label: t.label })),
                trend: lifestyleTags.filter((t) => t.group === 'TREND').map((t) => ({ value: t.id, label: t.label })),
                selected: selTags,
                onChange: setSelTags,
              }}
            />
          </Section>

          <Section icon={FileText} title="Descriptions">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Field label="Short description">
                <SmartTextInput value={shortDesc} onChange={setShortDesc} placeholder="Crisp Japanese yuzu, lightly sparkling, zero sugar." maxLength={140} />
              </Field>
              <Field label="Detailed description">
                <RichTextField value={longDesc} onChange={setLongDesc} placeholder="A bright, citrus-forward sparkling soda…" maxLength={800} />
              </Field>
            </div>
          </Section>
        </div>

        {/* RIGHT — media · custom meta · certificates */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <MediaUpload draftId={draftId} />

          <Section icon={ListPlus} title="Custom meta fields">
            <div>
              {meta.map((m, i) => (
                <div key={i} className="row" style={{ gap: 8, marginBottom: 6 }}>
                  <input className="input" style={{ width: '38%' }} value={m.key} placeholder="Key" onChange={(e) => setMeta(meta.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} />
                  <input className="input" style={{ flex: 1 }} value={m.value} placeholder="Value" onChange={(e) => setMeta(meta.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
                  <button className="btn sm" onClick={() => setMeta(meta.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              {meta.length < 10 && <button className="btn sm" style={{ marginTop: 2 }} onClick={() => setMeta([...meta, { key: '', value: '' }])}>+ Add field</button>}
            </div>
          </Section>

          <Section icon={Hash} title="Your references">
            <div>
              <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--ink-500, #6b7280)' }}>
                Track this product by your own codes (ERP id, warehouse code, legacy SKU). Reference-only — searchable in your products list.
              </div>
              {refs.map((r, i) => (
                <div key={i} className="row" style={{ gap: 8, marginBottom: 6 }}>
                  <input className="input" style={{ width: '38%' }} value={r.label} placeholder="Label (e.g. ERP ID)" onChange={(e) => setRefs(refs.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                  <input className="input" style={{ flex: 1 }} value={r.value} placeholder="Value" onChange={(e) => setRefs(refs.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
                  <button className="btn sm" onClick={() => setRefs(refs.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              {refs.length < 8 && <button className="btn sm" style={{ marginTop: 2 }} onClick={() => setRefs([...refs, { label: '', value: '' }])}>+ Add reference</button>}
            </div>
          </Section>

          <CertificatesCard draftId={draftId} />
        </div>
      </div>
    </div>
  )
}

// --- helpers ---------------------------------------------------------------

function ChipSelect({ options, selected, onToggle, placeholder }: { options: Opt[]; selected: string[]; onToggle: (id: string) => void; placeholder: string }) {
  const remaining = options.filter((o) => !selected.includes(o.id))
  return (
    <div>
      {selected.length > 0 && (
        <div className="row" style={{ gap: 7, marginBottom: 8 }}>
          {selected.map((id) => {
            const o = options.find((x) => x.id === id)
            return <span key={id} className="chip on" onClick={() => onToggle(id)}>{o?.label} ✕</span>
          })}
        </div>
      )}
      <select className="sel" value="" onChange={(e) => { if (e.target.value) onToggle(e.target.value) }}>
        <option value="">{placeholder}</option>
        {remaining.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  )
}

// Field, Section + smart inputs now live in ./_ui (shared builder chrome).
