'use client'

// Basics — Screen 1 of the turnkey builder, built to the locked data model
// (2026-06-08). Identity + base SKU · niches/tags dropdown→chips · short/long
// description · custom meta · hero+thumbnail media · dynamic Product-Type card
// (Single → production fields · Multi-flavor → flavors+facility · Multi-pack →
// pack composition). Rendered inside GuidedBuilder's `.gb` style scope.
//
// Persistence: creates the DRAFT once name+subcategory are valid, then autosaves
// scalar fields via updateBasics. Niches/tags/variant persistence is the next
// revision pass (local + functional in-session for now).

import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { createDraftShell, updateBasics, type InitialDraft } from './build-actions'
import { saveProductNiches, saveProductLifestyleTags } from '../[id]/edit/card-actions'
import { CertificatesCard } from './CertificatesCard'
import { MarketplaceAttributesCard } from './MarketplaceAttributesCard'
import { MediaUpload } from './MediaUpload'

interface Opt { id: string; label: string }
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
  draftId: string | null
  onDraftId: (id: string) => void
  onName: (name: string) => void
  /** Resume — seeds the form fields when reopening an existing draft. */
  initial?: InitialDraft | null
}

interface Meta { key: string; value: string }

export function BasicsScreen({
  domain, categories, subcategories, niches, lifestyleTags, facilities,
  draftId, onDraftId, onName, initial,
}: BasicsScreenProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [baseSku, setBaseSku] = useState(initial?.familyCode ?? '')
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '')
  const [subcategoryId, setSubcategoryId] = useState(initial?.subcategoryId ?? '')
  const [shortDesc, setShortDesc] = useState(initial?.description ?? '')
  const [longDesc, setLongDesc] = useState(initial?.longDescription ?? '')
  const [meta, setMeta] = useState<Meta[]>([])
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
          customMeta: meta.filter((m) => m.key.trim()),
        })
        setSaving(res.ok ? 'saved' : 'idle')
        if (!res.ok) toast.error(res.error)
        else setTimeout(() => setSaving('idle'), 1200)
      })
    }, 900)
    return () => { if (t.current) clearTimeout(t.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, baseSku, subcategoryId, shortDesc, longDesc, meta])

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
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Field full label="Product name · appears in the marketplace">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sparkling Yuzu Soda" />
          </Field>
          <Field full label="Base SKU · seeds variant SKUs (internal)">
            <input className="input" value={baseSku} onChange={(e) => setBaseSku(e.target.value)} placeholder="SODA-YUZU" />
          </Field>
          <Field label="Category · filtered to your product domain">
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
          <Field label="Subcategory · sets the FDA rule pack">
            <select className="sel" value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)} disabled={!categoryId}>
              <option value="">{categoryId ? 'Select…' : 'Pick a category first'}</option>
              {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>

          <Field full label="Niches · 1 primary + up to 2 secondary">
            <ChipSelect options={niches} selected={selNiches} onToggle={(id) => toggleChip(selNiches, setSelNiches, id, 3)} placeholder="Add a niche…" />
          </Field>
          <Field full label="Lifestyle tags · feed the marketplace filter">
            <ChipSelect options={lifestyleTags} selected={selTags} onToggle={(id) => toggleChip(selTags, setSelTags, id)} placeholder="Add a lifestyle tag…" />
          </Field>
          <MarketplaceAttributesCard
            draftId={draftId}
            initial={{
              format: initial?.manufacturingFormat ?? null,
              processes: initial?.manufacturingProcesses ?? [],
              allergenFree: initial?.allergenFreeClaims ?? [],
              markets: initial?.marketCodes ?? [],
            }}
          />

          <Field full label="Short description · marketplace card">
            <input className="input" value={shortDesc} onChange={(e) => setShortDesc(e.target.value)} placeholder="Crisp Japanese yuzu, lightly sparkling, zero sugar." />
          </Field>
          <Field full label="Detailed description · detail page">
            <textarea rows={3} value={longDesc} onChange={(e) => setLongDesc(e.target.value)} placeholder="A bright, citrus-forward sparkling soda…" />
          </Field>
        </div>

        {/* RIGHT — media · custom meta · certificates */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <MediaUpload draftId={draftId} />

          <div className="card">
            <div className="eyebrow">Custom meta fields · max 10</div>
            <div style={{ marginTop: 8 }}>
              {meta.map((m, i) => (
                <div key={i} className="row" style={{ gap: 8, marginBottom: 6 }}>
                  <input className="input" style={{ width: '38%' }} value={m.key} placeholder="Key" onChange={(e) => setMeta(meta.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} />
                  <input className="input" style={{ flex: 1 }} value={m.value} placeholder="Value" onChange={(e) => setMeta(meta.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
                  <button className="btn sm" onClick={() => setMeta(meta.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              {meta.length < 10 && <button className="btn sm" onClick={() => setMeta([...meta, { key: '', value: '' }])}>+ Add field</button>}
            </div>
          </div>

          <CertificatesCard draftId={draftId} />
        </div>
      </div>
    </div>
  )
}

// --- dynamic card variants -------------------------------------------------

function SingleProduction({ facilities, baseSku }: { facilities: FacilityOption[]; baseSku: string }) {
  return (
    <>
      <div className="section-title"><span className="ic">▦</span> Production &amp; availability</div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginTop: 14 }}>
        <Field label="Fulfillment mode"><select className="sel" defaultValue="Bulk production"><option>Bulk production</option><option>Make-to-order (on-demand)</option><option>Both</option></select></Field>
        <Field label="MOQ"><input className="input" defaultValue="500" /></Field>
        <Field label="Order increment"><input className="input" defaultValue="100" /></Field>
        <Field label="Lead time (days)"><input className="input" defaultValue="21" /></Field>
        <Field label="Monthly capacity"><input className="input" defaultValue="50,000" /></Field>
        <Field label="Shelf life (days)"><input className="input" defaultValue="365" /></Field>
        <Field label="SKU"><input className="input" defaultValue={baseSku} /></Field>
        <Field label="Lot / batch tracking"><select className="sel"><option>On (recommended)</option><option>Off</option></select></Field>
        <Field label="Facility · Manufactured by">
          <select className="sel">
            {facilities.length === 0 && <option>Onboarding address (default)</option>}
            {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
      </div>
      <p className="tiny muted" style={{ marginTop: 8 }}>Net weight, servings &amp; container live in Recipe + Packaging — not here.</p>
    </>
  )
}

function MultiFlavor({ facilities, baseSku }: { facilities: FacilityOption[]; baseSku: string }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="section-title"><span className="ic">❀</span> Flavors <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>· one product, flavors = presets</span></div>
        <button className="btn primary sm">+ Add flavor</button>
      </div>
      <table style={{ marginTop: 14 }}>
        <thead><tr><th>Flavor</th><th>SKU</th><th>Statement of Identity</th><th>Facility</th><th>MOQ</th></tr></thead>
        <tbody>
          <tr><td><b>Yuzu</b></td><td>{baseSku}-YUZU</td><td>Sparkling yuzu soda</td><td>{facilities[0]?.name ?? 'Default'}</td><td>500</td></tr>
        </tbody>
      </table>
      <p className="tiny muted" style={{ marginTop: 8 }}>Statement of Identity per flavor (label common name). Facility = "Manufactured by".</p>
    </>
  )
}

function MultiPack() {
  return (
    <>
      <div className="section-title"><span className="ic">▣</span> Pack composition</div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginTop: 12 }}>
        <Field label="Pack type"><select className="sel"><option>Variety multipack</option><option>Single-flavor multipack</option><option>Sampler</option></select></Field>
        <Field label="Outer pack"><select className="sel"><option>Paper carton (printed)</option><option>Shrink (no print)</option></select></Field>
        <Field label="Units per outer"><input className="input" defaultValue="12" /></Field>
      </div>
      <div className="compbar">
        <div className="compcard"><b>PRIMARY · Can</b><div className="muted small">printed · die-line required</div></div>
        <div className="compcard"><b>SECONDARY · Carton</b><div className="muted small">printed · die-line required</div></div>
        <div className="compcard" style={{ opacity: .7 }}><b>TERTIARY · Shipper</b><div className="muted small">not decorated</div></div>
      </div>
    </>
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

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className="field" style={full ? { gridColumn: '1/3' } : undefined}>
      <label>{label}</label>
      {children}
    </div>
  )
}
