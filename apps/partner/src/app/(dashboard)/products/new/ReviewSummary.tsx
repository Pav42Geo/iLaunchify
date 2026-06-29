'use client'

// Detailed, display-only "Review & submit" view for the New Product builder —
// mirrors the DISPLAY sections of the admin product detail page, but rendered in
// the builder's own `.gb` chrome (card / section-title / eyebrow / pill / hint /
// muted / .gb tables). NO admin decision / governance tooling. Loads the rich
// draft via getProductReviewDetail. Sections render in the same order as the
// admin display half and self-hide when empty.

import * as React from 'react'
import {
  FileText,
  Beaker,
  FlaskConical,
  ShieldAlert,
  Box,
  Layers,
  Sparkles,
  DollarSign,
  Image as ImageIcon,
  PackageOpen,
  Receipt,
  BadgeCheck,
  Hash,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getProductReviewDetail, type ReviewDetail } from './review-actions'

const usd = (c: number | null | undefined) => (c == null ? '—' : `$${(c / 100).toFixed(2)}`)
const FORMULATION_PILL: Record<ReviewDetail['formulationStatus'], { cls: string; text: string }> = {
  done: { cls: 'green', text: '✓ complete' },
  progress: { cls: 'amber', text: 'in progress' },
  empty: { cls: 'amber', text: 'not started' },
}
const FEE_BASIS_LABEL: Record<string, string> = {
  PER_UNIT: 'Per unit',
  PER_SKU_ONE_TIME: 'One-time / SKU',
  PER_ORDER: 'Per order',
}
const STORAGE_CLASS_LABEL: Record<string, string> = {
  AMBIENT: 'Ambient',
  CHILLED: 'Chilled',
  FROZEN: 'Frozen',
}
const FULFILLMENT_LABEL: Record<string, string> = {
  BULK_PRODUCTION: 'Bulk',
  ON_DEMAND: 'On-demand',
}
const humanize = (s: string) =>
  s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())

function SectionTitle({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="section-title">
      <span className="ic"><Icon size={16} strokeWidth={2} /></span> {children}
    </div>
  )
}

function NotSet() {
  return <span className="muted small">Not set</span>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '7px 0', borderTop: '1px solid var(--ink-100)' }}>
      <span className="muted small" style={{ flex: 'none' }}>{label}</span>
      <span className="small" style={{ textAlign: 'right', minWidth: 0 }}>{children}</span>
    </div>
  )
}

export function ReviewSummary({ draftId }: { draftId?: string | null }) {
  const [data, setData] = React.useState<ReviewDetail | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (!draftId) { setLoading(false); return }
    let cancelled = false
    getProductReviewDetail(draftId).then((r) => {
      if (cancelled) return
      if (r.ok) setData(r.data)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [draftId])

  if (loading) return <div className="card"><p className="muted small">Loading summary…</p></div>
  if (!data) return <div className="card"><p className="muted small">Save your draft to see the review summary.</p></div>

  const d = data
  const fpill = FORMULATION_PILL[d.formulationStatus]
  const hasProductionStorage =
    d.storageClass != null ||
    d.leadTimeFirstRunDays != null ||
    d.leadTimeRepeatDays != null ||
    d.maxFlavorsPerPack != null

  return (
    <div>
      {/* 1 — BASICS / IDENTITY */}
      <div className="card" style={{ marginBottom: 16 }}>
        <SectionTitle icon={FileText}>Basics &amp; identity</SectionTitle>
        <h3 className="display" style={{ fontSize: 19, margin: '8px 0 2px' }}>{d.name || 'Untitled product'}</h3>
        <p className="muted small" style={{ marginBottom: 8 }}>
          {[d.categoryName, d.subcategoryName].filter(Boolean).join(' · ') || 'Uncategorized'}
          {' · '}<span className="hint">slug {d.slug}</span>
        </p>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
          <span className={`pill ${d.name ? 'green' : 'amber'}`}>{d.name ? '✓ named' : 'needs a name'}</span>
          {d.niches.map((n) => <span key={`niche-${n}`} className="pill">{n}</span>)}
          {d.lifestyleTags.map((t) => <span key={`tag-${t}`} className="pill">{t}</span>)}
        </div>
        <div style={{ marginTop: 8 }}>
          <Field label="Domain">{d.domainLabel}</Field>
          {d.description ? <Field label="Short description">{d.description}</Field> : null}
          {d.longDescription ? <Field label="Long description">{d.longDescription}</Field> : null}
          <Field label="Base SKU / family code">{d.familyCode || <NotSet />}</Field>
          <Field label="GTIN / barcode">{d.gtin ? <span className="tnum">{d.gtin}</span> : <NotSet />}</Field>
          <Field label="Statement of identity">{d.statementOfIdentity || <NotSet />}</Field>
          <Field label="Country of origin">{d.countryOfOrigin || <NotSet />}</Field>
          <Field label="Manufacturing format">{d.manufacturingFormat ? humanize(d.manufacturingFormat) : <NotSet />}</Field>
          <Field label="Markets">{d.marketCodes.length ? d.marketCodes.join(', ') : <NotSet />}</Field>
        </div>
      </div>

      {/* 2 — RECIPE & NUTRITION (formulation summary) */}
      <div className="card" style={{ marginBottom: 16 }}>
        <SectionTitle icon={Beaker}>Recipe &amp; nutrition</SectionTitle>
        <div className="eyebrow" style={{ marginTop: 8 }}>{d.labelArtifact}</div>
        <h3 className="display" style={{ fontSize: 16, margin: '4px 0 6px' }}>{d.formulationTitle}</h3>
        <span className={`pill ${fpill.cls}`}>{fpill.text}</span>
        <div style={{ marginTop: 8 }}>
          {d.totalRecipeWeightG > 0 && (
            <Field label="Total recipe weight">
              <span className="tnum">{d.totalRecipeWeightG.toFixed(1)}g</span>{' '}
              <span className="hint">across {d.ingredients.length} slot{d.ingredients.length === 1 ? '' : 's'}</span>
            </Field>
          )}
          {(d.servingsPerContainer != null || d.servingSizeG != null) && (
            <Field label="Per-container">
              <span className="tnum">{d.servingsPerContainer ?? '—'}</span> servings ·{' '}
              <span className="tnum">{d.servingSizeG ?? '—'}g</span>/serving
            </Field>
          )}
          {d.ageGroupLabel && <Field label="Nutrition Facts audience">{d.ageGroupLabel}</Field>}
        </div>
      </div>

      {/* 3 — INGREDIENTS (food recipe slots only) */}
      {d.ingredients.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <SectionTitle icon={FlaskConical}>Ingredients</SectionTitle>
          <p className="muted small" style={{ marginTop: 6, marginBottom: 6 }}>
            {d.ingredients.length} slot{d.ingredients.length === 1 ? '' : 's'}
          </p>
          <table>
            <thead>
              <tr><th>Ingredient</th><th>Weight</th><th>% recipe</th><th>Source</th><th>Allergens</th></tr>
            </thead>
            <tbody>
              {d.ingredients.map((i) => (
                <tr key={i.id}>
                  <td><b>{i.name}</b></td>
                  <td className="tnum">{i.weightG}g</td>
                  <td className="tnum">{i.weightPct.toFixed(1)}%</td>
                  <td className="muted small">{i.source ?? 'unsourced'}</td>
                  <td className="small">{i.allergenFlags.length ? i.allergenFlags.join(', ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 4 — ALLERGENS */}
      {(d.allergenCrossContamination ||
        d.allergenManualOverrides.length > 0 ||
        d.allergenFreeClaims.length > 0) && (
        <div className="card" style={{ marginBottom: 16 }}>
          <SectionTitle icon={ShieldAlert}>Allergens</SectionTitle>
          <div style={{ marginTop: 8 }}>
            <Field label="Cross-contamination statement">{d.allergenCrossContamination || <NotSet />}</Field>
            {d.allergenManualOverrides.length > 0 && (
              <Field label="Manual additions">
                {d.allergenManualOverrides.map((o) => o.allergen).join(', ')}
              </Field>
            )}
            {d.allergenFreeClaims.length > 0 && (
              <Field label="Allergen-free claims">
                <span className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap', gap: 5 }}>
                  {d.allergenFreeClaims.map((c) => <span key={c} className="pill green">{humanize(c)}</span>)}
                </span>
              </Field>
            )}
          </div>
        </div>
      )}

      {/* 5 — PACKAGING */}
      {d.packaging.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <SectionTitle icon={Box}>Packaging</SectionTitle>
          <p className="muted small" style={{ marginTop: 6, marginBottom: 6 }}>
            {d.packaging.length} linked system{d.packaging.length === 1 ? '' : 's'}
          </p>
          <table>
            <thead>
              <tr><th>System</th><th>Topology</th><th>Per pack</th><th>MOQ</th><th>Price</th><th>Lead</th></tr>
            </thead>
            <tbody>
              {d.packaging.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.partnerName}</b></td>
                  <td className="muted small">{humanize(p.topology)}</td>
                  <td className="tnum">{p.unitCount}</td>
                  <td className="tnum">{p.moq.toLocaleString()}</td>
                  <td className="tnum">{usd(p.basePriceCents)}</td>
                  <td className="tnum">{p.leadTimeDays}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 6 — VARIANTS */}
      {d.variants.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <SectionTitle icon={Layers}>Variants</SectionTitle>
          <p className="muted small" style={{ marginTop: 6, marginBottom: 6 }}>
            {d.variants.length} variant{d.variants.length === 1 ? '' : 's'}
          </p>
          <table>
            <thead>
              <tr><th>Container</th><th>Servings</th><th>MOQ range</th><th>SKU</th><th>Net content</th></tr>
            </thead>
            <tbody>
              {d.variants.map((v) => (
                <tr key={v.id}>
                  <td><b>{v.containerFormat}</b></td>
                  <td className="tnum">{v.servingsPerContainer} × {v.servingSizeG}g</td>
                  <td className="tnum">{v.moqMin.toLocaleString()}–{v.moqMax.toLocaleString()}</td>
                  <td className="muted small">{v.sku ?? '—'}</td>
                  <td className="muted small">{v.netContentDisplay ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 7 — FLAVORS */}
      {d.flavors.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <SectionTitle icon={Sparkles}>Flavors</SectionTitle>
          <p className="muted small" style={{ marginTop: 6, marginBottom: 6 }}>
            {d.flavors.length} preset{d.flavors.length === 1 ? '' : 's'}
          </p>
          <div>
            {d.flavors.map((f) => (
              <div
                key={f.id}
                className="row"
                style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--ink-100)' }}
              >
                <span className="row" style={{ alignItems: 'center', gap: 9, minWidth: 0 }}>
                  <span
                    aria-hidden="true"
                    style={{ width: 18, height: 18, borderRadius: 999, border: '1px solid var(--ink-200)', background: f.swatchHex ?? 'var(--ink-100)', flex: 'none' }}
                  />
                  <b>{f.name}</b>
                  <span className={`pill ${f.status === 'ACTIVE' ? 'green' : 'amber'}`}>{f.status.toLowerCase()}</span>
                  {f.hasExtras && <span className="pill">extras</span>}
                  {f.hasOverrides && <span className="pill amber">nutrient override</span>}
                </span>
                <span className="tnum small">
                  {f.priceDeltaCents === 0
                    ? 'Base'
                    : `${f.priceDeltaCents > 0 ? '+' : ''}${usd(f.priceDeltaCents)}/unit`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 8 — COST & PRICING (full tier table) */}
      <div className="card" style={{ marginBottom: 16 }}>
        <SectionTitle icon={DollarSign}>Cost &amp; pricing</SectionTitle>
        <div style={{ marginTop: 8 }}>
          <Field label="Base price (floor)"><span className="tnum">{usd(d.priceFloorCents)}</span> <span className="hint">USD</span></Field>
          <Field label="Unit cost"><span className="tnum">{usd(d.unitCostCents)}</span> <span className="hint">USD</span></Field>
        </div>
        {d.pricingTiers.length > 0 ? (
          <table style={{ marginTop: 10 }}>
            <thead>
              <tr><th>Mode</th><th>Min</th><th>Max</th><th>Cost/unit</th><th>Floor</th><th>Lead</th></tr>
            </thead>
            <tbody>
              {d.pricingTiers.map((t) => (
                <tr key={t.id}>
                  <td className="muted small">{FULFILLMENT_LABEL[t.fulfillmentMode] ?? t.fulfillmentMode}</td>
                  <td className="tnum">{t.minQty.toLocaleString()}</td>
                  <td className="tnum">{t.maxQty != null ? t.maxQty.toLocaleString() : '∞'}</td>
                  <td className="tnum">{usd(t.perUnitCostCents)}</td>
                  <td className="tnum">{usd(t.perUnitFloorCents)}</td>
                  <td className="tnum">{t.leadTimeDays != null ? `${t.leadTimeDays}d` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted small" style={{ marginTop: 8 }}>No volume tiers yet.</p>
        )}
      </div>

      {/* 9 — MEDIA */}
      {(d.hasHeroImage || d.galleryCount > 0 || d.hasVideo) && (
        <div className="card" style={{ marginBottom: 16 }}>
          <SectionTitle icon={ImageIcon}>Media</SectionTitle>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {d.hasHeroImage && <span className="pill green">✓ hero image</span>}
            {d.galleryCount > 0 && <span className="pill">{d.galleryCount} gallery image{d.galleryCount === 1 ? '' : 's'}</span>}
            {d.hasVideo && <span className="pill">✓ product video</span>}
          </div>
        </div>
      )}

      {/* 10 — PRODUCTION & STORAGE */}
      {hasProductionStorage && (
        <div className="card" style={{ marginBottom: 16 }}>
          <SectionTitle icon={PackageOpen}>Production &amp; storage</SectionTitle>
          <div style={{ marginTop: 8 }}>
            {(d.leadTimeFirstRunDays != null || d.leadTimeRepeatDays != null) && (
              <Field label="Lead time">
                {d.leadTimeFirstRunDays != null ? `${d.leadTimeFirstRunDays}d first run` : '—'}
                {' · '}
                {d.leadTimeRepeatDays != null ? `${d.leadTimeRepeatDays}d repeat` : '—'}
              </Field>
            )}
            {d.storageClass && (
              <Field label="Storage class">
                {STORAGE_CLASS_LABEL[d.storageClass] ?? humanize(d.storageClass)}
                {(d.storageTempMinF != null || d.storageTempMaxF != null) && (
                  <span className="hint"> · {d.storageTempMinF ?? '—'}–{d.storageTempMaxF ?? '—'}°F</span>
                )}
              </Field>
            )}
            {d.maxFlavorsPerPack != null && (
              <Field label="Max flavors / pack"><span className="tnum">{d.maxFlavorsPerPack}</span> distinct</Field>
            )}
          </div>
        </div>
      )}

      {/* 11 — FEES */}
      {d.fees.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <SectionTitle icon={Receipt}>Fees</SectionTitle>
          <p className="muted small" style={{ marginTop: 6, marginBottom: 6 }}>
            {d.fees.length} fee{d.fees.length === 1 ? '' : 's'}
          </p>
          <table>
            <thead>
              <tr><th>Fee</th><th>Basis</th><th>Amount</th><th>Waived above</th></tr>
            </thead>
            <tbody>
              {d.fees.map((f) => (
                <tr key={f.id}>
                  <td><b>{f.label}</b></td>
                  <td className="muted small">{FEE_BASIS_LABEL[f.basis] ?? humanize(f.basis)}</td>
                  <td className="tnum">{usd(f.amountCents)}</td>
                  <td className="tnum">{f.waivedAboveQty != null ? `${f.waivedAboveQty.toLocaleString()} u` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 12 — CERTIFICATES */}
      {d.certificates.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <SectionTitle icon={BadgeCheck}>Certificates</SectionTitle>
          <p className="muted small" style={{ marginTop: 6, marginBottom: 6 }}>
            {d.certificates.length} attached
          </p>
          <div>
            {d.certificates.map((c) => (
              <div key={c.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '1px solid var(--ink-100)' }}>
                <b className="small">{c.name}</b>
                <span className={`pill ${c.status === 'VERIFIED' ? 'green' : c.status === 'EXPIRED' ? 'amber' : ''}`}>
                  {c.status.toLowerCase().replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 13 — MANUFACTURER REFERENCES */}
      {d.manufacturerRefs.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <SectionTitle icon={Hash}>Manufacturer references</SectionTitle>
          <div style={{ marginTop: 8 }}>
            {d.manufacturerRefs.map((r, i) => (
              <Field key={i} label={r.label}><span className="tnum">{r.value}</span></Field>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            Your own tracking codes (ERP, warehouse, legacy SKU). Reference only — iLaunchify never routes or matches on these.
          </p>
        </div>
      )}
    </div>
  )
}
