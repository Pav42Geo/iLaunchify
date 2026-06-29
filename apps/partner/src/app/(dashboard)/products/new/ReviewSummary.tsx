'use client'

// Digital Product Passport — the builder's "Review & submit" view. A
// document-grade, sign-off-aesthetic review of EVERYTHING a draft has
// accumulated: a cover with hero + key-facts tiles, the REAL regulated Facts
// label(s) rendered at natural size (NutritionFactsSvg / SupplementFactsSvg /
// InciDeclarationSvg / GuaranteedAnalysisSvg), the full recipe / formulation,
// die-line outline(s), product + mockup imagery, and all collected data laid out
// in the builder's `.gb` chrome. Display-only — no decision tooling, no
// mutations. Loads via getProductPassport. Sections self-hide when empty.

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
  ImageIcon,
  PackageOpen,
  Receipt,
  BadgeCheck,
  Hash,
  Scissors,
  ClipboardList,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  NutritionFactsSvg,
  SupplementFactsSvg,
  InciDeclarationSvg,
  GuaranteedAnalysisSvg,
} from '@ilaunchify/ui'
import { getProductPassport, type ProductPassport } from './review-actions'

const usd = (c: number | null | undefined) => (c == null ? '—' : `$${(c / 100).toFixed(2)}`)

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

// ── primitives ──────────────────────────────────────────────────────────────

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

/** Tight label/value definition row — label left (muted), value bold right. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 16,
        padding: '8px 0',
        borderTop: '1px solid var(--ink-100)',
      }}
    >
      <span className="muted small" style={{ flex: 'none' }}>{label}</span>
      <span className="small" style={{ textAlign: 'right', fontWeight: 600, minWidth: 0 }}>{children}</span>
    </div>
  )
}

/** A card section in the `.gb` look. */
function Section({
  icon,
  title,
  children,
  style,
}: {
  icon: LucideIcon
  title: string
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div className="card" style={{ marginBottom: 16, ...style }}>
      <SectionTitle icon={icon}>{title}</SectionTitle>
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  )
}

/** White, hairline-framed mount for a regulated SVG panel — print-document feel. */
function LabelFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'inline-block',
        background: '#fff',
        border: '1px solid var(--ink-200)',
        borderRadius: 12,
        padding: 16,
        boxShadow: '0 1px 3px rgba(17,17,19,0.06)',
      }}
    >
      {children}
    </div>
  )
}

// ── view ─────────────────────────────────────────────────────────────────────

export function ReviewSummary({ draftId }: { draftId?: string | null }) {
  const [data, setData] = React.useState<ProductPassport | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (!draftId) { setLoading(false); return }
    let cancelled = false
    getProductPassport(draftId).then((r) => {
      if (cancelled) return
      if (r.ok) setData(r.data)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [draftId])

  if (loading) return <div className="card"><p className="muted small">Loading product passport…</p></div>
  if (!data) return <div className="card"><p className="muted small">Save your draft to generate the product passport.</p></div>

  const d = data
  const hasProductionStorage =
    d.storageClass != null ||
    d.leadTimeFirstRunDays != null ||
    d.leadTimeRepeatDays != null ||
    d.maxFlavorsPerPack != null

  const hero = d.images.find((i) => i.kind === 'hero')
  const gallery = d.images.filter((i) => i.kind === 'gallery')
  const mockup = d.images.find((i) => i.kind === 'mockup')

  // Key-facts tiles for the cover strip.
  const tiles: Array<{ label: string; value: React.ReactNode }> = [
    { label: 'Base SKU', value: d.familyCode || '—' },
    { label: 'GTIN', value: d.gtin ? <span className="tnum">{d.gtin}</span> : '—' },
    { label: 'From / unit', value: <span className="tnum">{usd(d.priceFloorCents)}</span> },
    { label: 'MOQ', value: <span className="tnum">{d.variants[0]?.moqMin ? d.variants[0].moqMin.toLocaleString() : '—'}</span> },
    { label: 'Markets', value: d.marketCodes.length ? d.marketCodes.join(', ') : '—' },
    { label: 'Country', value: d.countryOfOrigin || '—' },
  ]

  const hasFacts = Boolean(d.factsPanel || d.cosmeticFacts || d.petFacts)

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* ── COVER ─────────────────────────────────────────────────────────── */}
      <div
        className="card"
        style={{ marginBottom: 16, padding: 0, overflow: 'hidden', border: '1px solid var(--ink-200)' }}
      >
        {/* Hero band */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: hero ? '260px 1fr' : '1fr',
            gap: 0,
            alignItems: 'stretch',
          }}
        >
          {hero ? (
            <div
              style={{
                background: 'var(--ink-50)',
                borderRight: '1px solid var(--ink-100)',
                display: 'grid',
                placeItems: 'center',
                minHeight: 200,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={hero.url}
                alt={d.name || 'Product'}
                style={{ width: '100%', height: '100%', maxHeight: 260, objectFit: 'cover' }}
              />
            </div>
          ) : null}
          <div style={{ padding: 24 }}>
            <div className="eyebrow" style={{ color: 'var(--pink-700)' }}>Digital product passport</div>
            <h2
              className="display"
              style={{ fontSize: 30, lineHeight: 1.08, margin: '8px 0 6px', color: 'var(--ink-900)' }}
            >
              {d.name || 'Untitled product'}
            </h2>
            <p className="muted small" style={{ marginBottom: 10 }}>
              {[d.categoryName, d.subcategoryName].filter(Boolean).join(' › ') || 'Uncategorized'}
              {' · '}{d.domainLabel}
              {' · '}<span className="hint">{d.labelArtifact}</span>
            </p>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              <span className={`pill ${d.name ? 'green' : 'amber'}`}>{d.name ? '✓ ready for review' : 'needs a name'}</span>
              {d.isMultiFlavor && <span className="pill pink">{d.flavors.length} flavors</span>}
              {d.niches.map((n) => <span key={`niche-${n}`} className="pill">{n}</span>)}
              {d.lifestyleTags.slice(0, 6).map((t) => <span key={`tag-${t}`} className="pill">{t}</span>)}
            </div>
          </div>
        </div>

        {/* Key-facts tile strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            borderTop: '1px solid var(--ink-100)',
            background: 'var(--ink-50)',
          }}
        >
          {tiles.map((t, i) => (
            <div
              key={t.label}
              style={{
                padding: '14px 16px',
                borderLeft: i === 0 ? 'none' : '1px solid var(--ink-100)',
              }}
            >
              <div className="eyebrow" style={{ marginBottom: 4 }}>{t.label}</div>
              <div className="small" style={{ fontWeight: 700, color: 'var(--ink-900)' }}>{t.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 1 · IDENTITY ──────────────────────────────────────────────────── */}
      <Section icon={FileText} title="Identity">
        {d.description ? <Field label="Short description">{d.description}</Field> : null}
        {d.longDescription ? <Field label="Long description">{d.longDescription}</Field> : null}
        <Field label="Slug"><span className="tnum">{d.slug}</span></Field>
        <Field label="Domain">{d.domainLabel}</Field>
        <Field label="Statement of identity">{d.statementOfIdentity || <NotSet />}</Field>
        {d.ageGroupLabel && <Field label="Nutrition Facts audience">{d.ageGroupLabel}</Field>}
        <Field label="Manufacturing format">{d.manufacturingFormat ? humanize(d.manufacturingFormat) : <NotSet />}</Field>
        <Field label="Country of origin">{d.countryOfOrigin || <NotSet />}</Field>
        <Field label="Markets">{d.marketCodes.length ? d.marketCodes.join(', ') : <NotSet />}</Field>
      </Section>

      {/* ── 2 · FACTS LABEL (centerpiece) ─────────────────────────────────── */}
      {hasFacts && (
        <Section icon={Beaker} title="Regulated Facts label">
          <div className="eyebrow" style={{ marginBottom: 12 }}>{d.labelArtifact}</div>
          <div style={{ display: 'grid', placeItems: 'center', gap: 12, padding: '4px 0 6px' }}>
            {d.factsPanel && d.factsPanel.panel.format === 'SUPPLEMENT_FACTS' ? (
              <LabelFrame>
                <SupplementFactsSvg data={d.factsPanel.panel} widthPx={300} />
              </LabelFrame>
            ) : d.factsPanel ? (
              <LabelFrame>
                <NutritionFactsSvg
                  data={d.factsPanel.panel}
                  contains={d.factsPanel.contains ?? undefined}
                  ingredientStatement={d.factsPanel.ingredientStatement ?? undefined}
                  widthPx={320}
                />
              </LabelFrame>
            ) : null}

            {d.cosmeticFacts && (
              <LabelFrame>
                <InciDeclarationSvg
                  ingredients={d.cosmeticFacts.ingredients}
                  netContents={d.cosmeticFacts.netContents ?? undefined}
                  responsiblePerson={d.cosmeticFacts.responsiblePerson ?? undefined}
                  adverseEventContact={d.cosmeticFacts.adverseEventContact ?? undefined}
                  widthPx={320}
                />
              </LabelFrame>
            )}

            {d.petFacts && (
              <LabelFrame>
                <GuaranteedAnalysisSvg
                  gaRows={d.petFacts.gaRows}
                  ingredients={d.petFacts.ingredients}
                  adequacyStatement={d.petFacts.adequacyStatement ?? undefined}
                  feedingDirections={d.petFacts.feedingDirections ?? undefined}
                  widthPx={320}
                />
              </LabelFrame>
            )}
          </div>
          {d.factsPanel?.declared && (
            <p className="hint" style={{ marginTop: 10, textAlign: 'center' }}>
              Panel entered by the manufacturer (declared values).
            </p>
          )}
          {d.isMultiFlavor && d.factsPanel && (
            <p className="hint" style={{ marginTop: 10, textAlign: 'center' }}>
              Base recipe panel. Each flavor prints its own single-flavor label; the variety comparison panel is available in the Recipe step.
            </p>
          )}
        </Section>
      )}

      {/* ── 3 · RECIPE / FORMULATION ──────────────────────────────────────── */}
      {(d.ingredients.length > 0 ||
        d.supplementIngredients.length > 0 ||
        d.cosmeticIngredients.length > 0 ||
        d.petIngredients.length > 0) && (
        <Section icon={FlaskConical} title="Recipe & formulation">
          {/* FOOD recipe slots */}
          {d.ingredients.length > 0 && (
            <>
              <p className="muted small" style={{ margin: '0 0 6px' }}>
                {d.ingredients.length} slot{d.ingredients.length === 1 ? '' : 's'}
                {d.totalRecipeWeightG > 0 && <> · <span className="tnum">{d.totalRecipeWeightG.toFixed(1)}g</span> batch</>}
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
              {d.factsPanel?.ingredientStatement && (
                <p className="small" style={{ marginTop: 12, lineHeight: 1.5 }}>
                  <b>INGREDIENTS:</b> {d.factsPanel.ingredientStatement}.
                </p>
              )}
            </>
          )}

          {/* Non-food formulation lists */}
          {[
            { rows: d.supplementIngredients, head: 'Dietary ingredients' },
            { rows: d.cosmeticIngredients, head: 'INCI ingredients' },
            { rows: d.petIngredients, head: 'Ingredients' },
          ]
            .filter((g) => g.rows.length > 0)
            .map((g) => (
              <table key={g.head} style={{ marginTop: d.ingredients.length > 0 ? 14 : 0 }}>
                <thead>
                  <tr><th>{g.head}</th><th>Amount</th><th>Note</th></tr>
                </thead>
                <tbody>
                  {g.rows.map((r, i) => (
                    <tr key={`${g.head}-${i}`}>
                      <td><b>{r.name}</b></td>
                      <td className="tnum">{r.amount ?? '—'}</td>
                      <td className="muted small">{r.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
        </Section>
      )}

      {/* ── 4 · ALLERGENS ─────────────────────────────────────────────────── */}
      {(d.allergenCrossContamination ||
        d.allergenManualOverrides.length > 0 ||
        d.allergenFreeClaims.length > 0 ||
        d.factsPanel?.contains) && (
        <Section icon={ShieldAlert} title="Allergens">
          {d.factsPanel?.contains && <Field label="Contains">{d.factsPanel.contains.replace(/^Contains:\s*/, '').replace(/\.$/, '')}</Field>}
          <Field label="Cross-contamination statement">{d.allergenCrossContamination || <NotSet />}</Field>
          {d.allergenManualOverrides.length > 0 && (
            <Field label="Manual additions">{d.allergenManualOverrides.map((o) => o.allergen).join(', ')}</Field>
          )}
          {d.allergenFreeClaims.length > 0 && (
            <Field label="Allergen-free claims">
              <span className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap', gap: 5 }}>
                {d.allergenFreeClaims.map((c) => <span key={c} className="pill green">{humanize(c)}</span>)}
              </span>
            </Field>
          )}
        </Section>
      )}

      {/* ── 5 · FLAVORS ───────────────────────────────────────────────────── */}
      {d.flavors.length > 0 && (
        <Section icon={Sparkles} title="Flavors">
          <p className="muted small" style={{ margin: '0 0 6px' }}>
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
                  {f.priceDeltaCents === 0 ? 'Base' : `${f.priceDeltaCents > 0 ? '+' : ''}${usd(f.priceDeltaCents)}/unit`}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── 6 · PACKAGING & DIE-LINES ─────────────────────────────────────── */}
      {(d.packaging.length > 0 || d.dielines.length > 0) && (
        <Section icon={Box} title="Packaging & die-lines">
          {d.packaging.length > 0 && (
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
          )}

          {d.dielines.length > 0 && (
            <div style={{ marginTop: d.packaging.length > 0 ? 16 : 0 }}>
              <div className="row" style={{ alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Scissors size={15} strokeWidth={2} style={{ color: 'var(--pink-700)' }} />
                <span className="small" style={{ fontWeight: 600 }}>Die-line outline{d.dielines.length === 1 ? '' : 's'}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                {d.dielines.map((dl) => (
                  <div key={dl.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                    <div
                      style={{
                        background: '#fff',
                        border: '1px solid var(--ink-200)',
                        borderRadius: 12,
                        padding: 14,
                        width: 220,
                        height: 160,
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <svg viewBox={`0 0 ${dl.widthMm} ${dl.heightMm}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-label={dl.name}>
                        <path d={dl.outlineSvg} fill="none" stroke="var(--ink-700)" strokeWidth={Math.max(0.4, dl.widthMm / 280)} />
                      </svg>
                    </div>
                    <div className="tiny muted" style={{ textAlign: 'center' }}>
                      <b style={{ color: 'var(--ink-900)' }}>{dl.flavorName ?? dl.name}</b>
                      <div>{dl.widthMm}×{dl.heightMm} mm</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* ── 7 · VARIANTS ──────────────────────────────────────────────────── */}
      {d.variants.length > 0 && (
        <Section icon={Layers} title="Variants">
          <table>
            <thead>
              <tr><th>Container</th><th>Servings</th><th>MOQ range</th><th>SKU</th><th>GTIN</th><th>Net content</th></tr>
            </thead>
            <tbody>
              {d.variants.map((v) => (
                <tr key={v.id}>
                  <td><b>{v.containerFormat}</b></td>
                  <td className="tnum">{v.servingsPerContainer} × {v.servingSizeG}g</td>
                  <td className="tnum">{v.moqMin.toLocaleString()}–{v.moqMax.toLocaleString()}</td>
                  <td className="muted small">{v.sku ?? '—'}</td>
                  <td className="muted small">{v.gtin ? <span className="tnum">{v.gtin}</span> : '—'}</td>
                  <td className="muted small">{v.netContentDisplay ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* ── 8 · IMAGERY ───────────────────────────────────────────────────── */}
      <Section icon={ImageIcon} title="Imagery">
        {gallery.length > 0 || mockup ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {gallery.map((g, i) => (
              <div
                key={`g-${i}`}
                style={{ width: 132, height: 132, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--ink-100)', background: 'var(--ink-50)' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.url} alt={`Gallery ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))}
            {mockup && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ width: 132, height: 132, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--ink-100)', background: 'var(--ink-50)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mockup.url} alt="Mockup base" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <span className="tiny muted" style={{ textAlign: 'center' }}>Mockup base</span>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              placeItems: 'center',
              padding: '28px 16px',
              border: '1px dashed var(--ink-200)',
              borderRadius: 12,
              background: 'var(--ink-50)',
            }}
          >
            <ImageIcon size={26} strokeWidth={1.5} style={{ color: 'var(--ink-400)' }} />
            <p className="muted small" style={{ marginTop: 8 }}>
              {hero ? 'Hero image set. Add gallery images to showcase the product.' : 'No product imagery yet.'}
            </p>
          </div>
        )}
        <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {hero && <span className="pill green">✓ hero image</span>}
          {gallery.length > 0 && <span className="pill">{gallery.length} gallery image{gallery.length === 1 ? '' : 's'}</span>}
          {mockup && <span className="pill">✓ mockup base</span>}
          {d.hasVideo && <span className="pill">✓ product video</span>}
        </div>
      </Section>

      {/* ── 9 · COST & PRICING ────────────────────────────────────────────── */}
      <Section icon={DollarSign} title="Cost & pricing">
        <Field label="Base price (floor)"><span className="tnum">{usd(d.priceFloorCents)}</span> <span className="hint">USD</span></Field>
        <Field label="Unit cost"><span className="tnum">{usd(d.unitCostCents)}</span> <span className="hint">USD</span></Field>
        {d.pricingTiers.length > 0 ? (
          <table style={{ marginTop: 12 }}>
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
          <p className="muted small" style={{ marginTop: 10 }}>No volume tiers yet.</p>
        )}
        {d.fees.length > 0 && (
          <table style={{ marginTop: 14 }}>
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
        )}
      </Section>

      {/* ── 10 · PRODUCTION & STORAGE ─────────────────────────────────────── */}
      {hasProductionStorage && (
        <Section icon={PackageOpen} title="Production & storage">
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
        </Section>
      )}

      {/* ── 11 · CERTIFICATES ─────────────────────────────────────────────── */}
      {d.certificates.length > 0 && (
        <Section icon={BadgeCheck} title="Certificates">
          <div>
            {d.certificates.map((c) => (
              <div key={c.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--ink-100)' }}>
                <b className="small">{c.name}</b>
                <span className={`pill ${c.status === 'VERIFIED' ? 'green' : c.status === 'EXPIRED' ? 'amber' : ''}`}>
                  {c.status.toLowerCase().replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── 12 · MANUFACTURER REFERENCES ──────────────────────────────────── */}
      {d.manufacturerRefs.length > 0 && (
        <Section icon={Hash} title="Manufacturer references">
          {d.manufacturerRefs.map((r, i) => (
            <Field key={i} label={r.label}><span className="tnum">{r.value}</span></Field>
          ))}
          <p className="hint" style={{ marginTop: 10 }}>
            Your own tracking codes (ERP, warehouse, legacy SKU). Reference only — iLaunchify never routes or matches on these.
          </p>
        </Section>
      )}

      {/* ── 13 · ADDITIONAL DATA (custom meta) ────────────────────────────── */}
      {d.customMeta.length > 0 && (
        <Section icon={ClipboardList} title="Additional data">
          {d.customMeta.map((m, i) => (
            <Field key={i} label={m.label}>{m.value}</Field>
          ))}
        </Section>
      )}
    </div>
  )
}
