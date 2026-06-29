'use client'

// Digital Product Passport — the builder's "Review & submit" view. A
// document-grade, sign-off-aesthetic review of EVERYTHING a draft has
// accumulated, laid out as a two-column document:
//   • MAIN column — Cover (full-width, top) · Identity · Recipe & formulation
//     (base + replaceable + optional) · Variants & flavors · Packaging &
//     die-lines · Imagery · Cost & pricing · Certificates · Manufacturer
//     references / custom meta.
//   • RIGHT RAIL (sticky) — Compliance scan (ComplianceCard) + the regulated
//     Facts label (NutritionFactsSvg / SupplementFactsSvg / InciDeclarationSvg /
//     GuaranteedAnalysisSvg). For multi-flavor FOOD the Facts card offers a
//     "View all flavor labels" button that opens LabelViewerModal.
// Display-only — no decision tooling, no mutations. Loads via getProductPassport.
// Sections self-hide when empty.

import * as React from 'react'
import {
  FileText,
  FlaskConical,
  Beaker,
  Box,
  Layers,
  DollarSign,
  ImageIcon,
  PackageOpen,
  BadgeCheck,
  Hash,
  Scissors,
  ClipboardList,
  Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  NutritionFactsSvg,
  SupplementFactsSvg,
  InciDeclarationSvg,
  GuaranteedAnalysisSvg,
} from '@ilaunchify/ui'
import { getProductPassport, type ProductPassport } from './review-actions'
import { ComplianceCard } from './ComplianceCard'
import { LabelViewerModal } from './LabelViewerModal'

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

// ── typography primitives (approved scale: dense, body 14px) ──────────────────

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '.04em',
  color: 'var(--ink-500)',
  lineHeight: 1.3,
}
const VALUE_STYLE: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--ink-900)',
  lineHeight: 1.4,
}
const BODY_STYLE: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 400,
  color: 'var(--ink-700)',
  lineHeight: 1.55,
}
const CAPTION_STYLE: React.CSSProperties = {
  fontSize: 12.5,
  color: 'var(--ink-500)',
  lineHeight: 1.45,
}

function SectionTitle({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="section-title">
      <span className="ic"><Icon size={16} strokeWidth={2} /></span> {children}
    </div>
  )
}

function NotSet() {
  return <span style={{ ...CAPTION_STYLE }}>Not set</span>
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

/** Label-ABOVE-value definition cell. */
function DefCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={LABEL_STYLE}>{label}</span>
      <span style={VALUE_STYLE}>{children}</span>
    </div>
  )
}

/** Responsive grid of label-above-value cells. */
function DefGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '14px 20px',
      }}
    >
      {children}
    </div>
  )
}

/** Framed rail card with a pink icon chip + title (matches `.section-title` look). */
function RailCard({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="section-title"><span className="ic"><Icon size={16} strokeWidth={2} /></span> {title}</div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  )
}

/** Interactive gallery: a large main image with a vertical thumbnail strip
 *  flush to its LEFT. Clicking a thumb swaps the main image. */
function Gallery({ images }: { images: Array<{ url: string; label: string }> }) {
  const [active, setActive] = React.useState(0)
  if (images.length === 0) return null
  const current = images[Math.min(active, images.length - 1)] ?? images[0]!
  const single = images.length === 1

  return (
    <div style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
      {/* Vertical thumbnail strip (hidden when only one image) */}
      {!single && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            paddingRight: 10,
            maxHeight: 340,
            overflowY: 'auto',
            flex: 'none',
          }}
        >
          {images.map((img, i) => {
            const isActive = i === Math.min(active, images.length - 1)
            return (
              <button
                key={`thumb-${i}`}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show ${img.label}`}
                aria-pressed={isActive}
                style={{
                  width: 62,
                  height: 62,
                  flex: 'none',
                  padding: 0,
                  borderRadius: 9,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  background: 'var(--ink-50)',
                  border: isActive ? '2px solid var(--pink)' : '1px solid var(--ink-200)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </button>
            )
          })}
        </div>
      )}

      {/* Large main image */}
      <div
        style={{
          flex: '1 1 auto',
          minWidth: 0,
          borderRadius: 14,
          overflow: 'hidden',
          border: '1px solid var(--ink-200)',
          background: 'var(--ink-50)',
          display: 'grid',
          placeItems: 'center',
          minHeight: 260,
          maxHeight: 340,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={current.label}
          style={{ width: '100%', height: '100%', maxHeight: 340, objectFit: 'contain' }}
        />
      </div>
    </div>
  )
}

// ── view ─────────────────────────────────────────────────────────────────────

export function ReviewSummary({ draftId }: { draftId?: string | null }) {
  const [data, setData] = React.useState<ProductPassport | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [labelViewerOpen, setLabelViewerOpen] = React.useState(false)

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

  if (loading) return <div className="card"><p style={CAPTION_STYLE}>Loading product passport…</p></div>
  if (!data) return <div className="card"><p style={CAPTION_STYLE}>Save your draft to generate the product passport.</p></div>

  const d = data
  const hasProductionStorage =
    d.storageClass != null ||
    d.leadTimeFirstRunDays != null ||
    d.leadTimeRepeatDays != null ||
    d.maxFlavorsPerPack != null

  const hero = d.images.find((i) => i.kind === 'hero')
  const gallery = d.images.filter((i) => i.kind === 'gallery')
  const mockup = d.images.find((i) => i.kind === 'mockup')
  // One ordered list for the gallery viewer: hero → gallery → mockup.
  const galleryImages: Array<{ url: string; label: string }> = [
    ...(hero ? [{ url: hero.url, label: 'Hero' }] : []),
    ...gallery.map((g, i) => ({ url: g.url, label: `Gallery ${i + 1}` })),
    ...(mockup ? [{ url: mockup.url, label: 'Mockup' }] : []),
  ]

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
  const canViewFlavorLabels = d.isMultiFlavor && d.flavorColumns.length > 0

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto' }}>
      {/* ── COVER (full width across both columns) ──────────────────────────── */}
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
              style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.08, margin: '8px 0 6px', color: 'var(--ink-900)' }}
            >
              {d.name || 'Untitled product'}
            </h2>
            <p style={{ ...CAPTION_STYLE, marginBottom: 10 }}>
              {[d.categoryName, d.subcategoryName].filter(Boolean).join(' › ') || 'Uncategorized'}
              {' · '}{d.domainLabel}
              {' · '}<span>{d.labelArtifact}</span>
            </p>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              <span className={`pill ${d.name ? 'green' : 'amber'}`}>{d.name ? '✓ ready for review' : 'needs a name'}</span>
              {d.isMultiFlavor && <span className="pill pink">{d.flavors.length} flavors</span>}
              {d.niches.map((n) => <span key={`niche-${n}`} className="pill">{n}</span>)}
              {d.lifestyleTags.slice(0, 6).map((t) => <span key={`tag-${t}`} className="pill">{t}</span>)}
            </div>

            {/* Certificates — icon-only badges (name on hover), promoted into the cover */}
            {d.certificates.length > 0 && (
              <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
                {d.certificates.map((c) => (
                  <span
                    key={c.id}
                    title={`${c.name} · ${c.status.toLowerCase().replace(/_/g, ' ')}`}
                    aria-label={`${c.name} · ${c.status.toLowerCase().replace(/_/g, ' ')}`}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: 'var(--pink-50)',
                      border: '1px solid var(--pink-100)',
                      display: 'grid',
                      placeItems: 'center',
                      flex: 'none',
                    }}
                  >
                    <BadgeCheck size={26} strokeWidth={2} style={{ color: 'var(--pink-700)' }} />
                  </span>
                ))}
              </div>
            )}
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
              <div style={{ ...LABEL_STYLE, marginBottom: 4 }}>{t.label}</div>
              <div style={VALUE_STYLE}>{t.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── DOCUMENT BODY: main column + sticky right rail ──────────────────── */}
      <div className="passport-body">
        {/* ===== MAIN COLUMN ===== */}
        <div className="passport-main">
          {/* 1 · IDENTITY */}
          <Section icon={FileText} title="Identity">
            {d.description ? (
              <p style={{ ...BODY_STYLE, margin: '0 0 10px' }}>{d.description}</p>
            ) : null}
            {d.longDescription ? (
              <p style={{ ...BODY_STYLE, margin: '0 0 14px' }}>{d.longDescription}</p>
            ) : null}
            <DefGrid>
              <DefCell label="Slug"><span className="tnum">{d.slug}</span></DefCell>
              <DefCell label="Domain">{d.domainLabel}</DefCell>
              <DefCell label="Statement of identity">{d.statementOfIdentity || <NotSet />}</DefCell>
              {d.ageGroupLabel && <DefCell label="Nutrition Facts audience">{d.ageGroupLabel}</DefCell>}
              <DefCell label="Manufacturing format">{d.manufacturingFormat ? humanize(d.manufacturingFormat) : <NotSet />}</DefCell>
              <DefCell label="Country of origin">{d.countryOfOrigin || <NotSet />}</DefCell>
              <DefCell label="Markets">{d.marketCodes.length ? d.marketCodes.join(', ') : <NotSet />}</DefCell>
            </DefGrid>
            {(d.allergenCrossContamination ||
              d.allergenManualOverrides.length > 0 ||
              d.allergenFreeClaims.length > 0 ||
              d.factsPanel?.contains) && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--ink-100)' }}>
                <div style={{ ...LABEL_STYLE, marginBottom: 8 }}>Allergens</div>
                <DefGrid>
                  {d.factsPanel?.contains && (
                    <DefCell label="Contains">{d.factsPanel.contains.replace(/^Contains:\s*/, '').replace(/\.$/, '')}</DefCell>
                  )}
                  <DefCell label="Cross-contamination">{d.allergenCrossContamination || <NotSet />}</DefCell>
                  {d.allergenManualOverrides.length > 0 && (
                    <DefCell label="Manual additions">{d.allergenManualOverrides.map((o) => o.allergen).join(', ')}</DefCell>
                  )}
                </DefGrid>
                {d.allergenFreeClaims.length > 0 && (
                  <div className="row" style={{ flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
                    {d.allergenFreeClaims.map((c) => <span key={c} className="pill green">{humanize(c)}</span>)}
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* 2 · RECIPE & FORMULATION (base + replaceable + optional) */}
          {(d.ingredients.length > 0 ||
            d.optionalIngredients.length > 0 ||
            d.supplementIngredients.length > 0 ||
            d.cosmeticIngredients.length > 0 ||
            d.petIngredients.length > 0) && (
            <Section icon={FlaskConical} title="Recipe & formulation">
              {/* FOOD recipe slots — base ingredients with ⇄ replacement sub-lines */}
              {d.ingredients.length > 0 && (
                <>
                  <p style={{ ...CAPTION_STYLE, margin: '0 0 6px' }}>
                    {d.ingredients.length} base ingredient{d.ingredients.length === 1 ? '' : 's'}
                    {d.totalRecipeWeightG > 0 && <> · <span className="tnum">{d.totalRecipeWeightG.toFixed(1)}g</span> batch</>}
                  </p>
                  <table>
                    <thead>
                      <tr><th>Ingredient</th><th>Weight</th><th>% recipe</th><th>Source</th><th>Allergens</th></tr>
                    </thead>
                    <tbody>
                      {d.ingredients.map((i) => (
                        <React.Fragment key={i.id}>
                          <tr>
                            <td><b>{i.name}</b></td>
                            <td className="tnum">{i.weightG}g</td>
                            <td className="tnum">{i.weightPct.toFixed(1)}%</td>
                            <td style={CAPTION_STYLE}>{i.source ?? 'unsourced'}</td>
                            <td style={{ fontSize: 14 }}>{i.allergenFlags.length ? i.allergenFlags.join(', ') : '—'}</td>
                          </tr>
                          {i.replacements.length > 0 && (
                            <tr>
                              <td colSpan={5} style={{ paddingTop: 0, borderBottom: '1px solid var(--ink-50)' }}>
                                <span style={{ ...CAPTION_STYLE }}>
                                  ⇄ or:{' '}
                                  {i.replacements
                                    .map((r) => (r.weightGOverride != null ? `${r.name} (${r.weightGOverride}g)` : r.name))
                                    .join(', ')}
                                </span>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>

                  {/* Optional ingredients group */}
                  {d.optionalIngredients.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ ...LABEL_STYLE, marginBottom: 8 }}>Optional ingredients</div>
                      <table>
                        <thead>
                          <tr><th>Ingredient</th><th>Weight</th><th>Note</th></tr>
                        </thead>
                        <tbody>
                          {d.optionalIngredients.map((o) => (
                            <tr key={o.id}>
                              <td><b>{o.name}</b></td>
                              <td className="tnum">{o.weightG}g</td>
                              <td style={CAPTION_STYLE}>{o.note ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {d.factsPanel?.ingredientStatement && (
                    <p style={{ ...BODY_STYLE, marginTop: 12 }}>
                      <b style={{ color: 'var(--ink-900)' }}>INGREDIENTS:</b> {d.factsPanel.ingredientStatement}.
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
                          <td style={CAPTION_STYLE}>{r.note ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ))}
            </Section>
          )}

          {/* 3 · VARIANTS & FLAVORS */}
          {(d.variants.length > 0 || d.flavors.length > 0) && (
            <Section icon={Layers} title="Variants & flavors">
              {d.variants.length > 0 && (
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
                        <td style={CAPTION_STYLE}>{v.sku ?? '—'}</td>
                        <td style={CAPTION_STYLE}>{v.gtin ? <span className="tnum">{v.gtin}</span> : '—'}</td>
                        <td style={CAPTION_STYLE}>{v.netContentDisplay ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {d.flavors.length > 0 && (
                <div style={{ marginTop: d.variants.length > 0 ? 16 : 0 }}>
                  <div className="row" style={{ alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Sparkles size={15} strokeWidth={2} style={{ color: 'var(--pink-700)' }} />
                    <span style={{ ...LABEL_STYLE }}>
                      {d.flavors.length} flavor preset{d.flavors.length === 1 ? '' : 's'}
                    </span>
                  </div>
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
                        <b style={{ fontSize: 14, color: 'var(--ink-900)' }}>{f.name}</b>
                        <span className={`pill ${f.status === 'ACTIVE' ? 'green' : 'amber'}`}>{f.status.toLowerCase()}</span>
                        {f.hasExtras && <span className="pill">extras</span>}
                        {f.hasOverrides && <span className="pill amber">nutrient override</span>}
                      </span>
                      <span className="tnum" style={{ fontSize: 14, fontWeight: 600 }}>
                        {f.priceDeltaCents === 0 ? 'Base' : `${f.priceDeltaCents > 0 ? '+' : ''}${usd(f.priceDeltaCents)}/unit`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* 4 · PACKAGING & DIE-LINES */}
          {(d.packingProfile ||
            d.packaging.length > 0 ||
            d.packagingMaterials.length > 0 ||
            d.dielines.length > 0) && (
            <Section icon={Box} title="Packaging & die-lines">
              {/* (a) Packaging structure — chosen packing profile + filled logistics */}
              {d.packingProfile && (
                <DefGrid>
                  <DefCell label="Packing profile">{d.packingProfile.name}</DefCell>
                  {d.packingProfile.structuralType && (
                    <DefCell label="Structure">{humanize(d.packingProfile.structuralType)}</DefCell>
                  )}
                  {d.packingProfile.merchandisingTag && (
                    <DefCell label="Merchandising">{humanize(d.packingProfile.merchandisingTag)}</DefCell>
                  )}
                  {d.packingProfile.unitCount != null && (
                    <DefCell label="Units / pack"><span className="tnum">{d.packingProfile.unitCount}</span></DefCell>
                  )}
                  {(d.packingProfile.casesPerLayer != null || d.packingProfile.layersPerPallet != null) && (
                    <DefCell label="Ti × Hi (pallet)">
                      <span className="tnum">{d.packingProfile.casesPerLayer ?? '—'}</span>
                      {' × '}
                      <span className="tnum">{d.packingProfile.layersPerPallet ?? '—'}</span>
                      {d.packingProfile.casesPerLayer != null && d.packingProfile.layersPerPallet != null && (
                        <span style={{ ...CAPTION_STYLE, fontWeight: 400 }}>
                          {' '}= <span className="tnum">{d.packingProfile.casesPerLayer * d.packingProfile.layersPerPallet}</span> cases
                        </span>
                      )}
                    </DefCell>
                  )}
                  {d.packingProfile.grossWeightG != null && (
                    <DefCell label="Gross weight"><span className="tnum">{d.packingProfile.grossWeightG}</span> g / unit</DefCell>
                  )}
                </DefGrid>
              )}

              {/* (b) Substrate / packaging material — chips */}
              {d.packagingMaterials.length > 0 && (
                <div style={{ marginTop: d.packingProfile ? 16 : 0 }}>
                  <div style={{ ...LABEL_STYLE, marginBottom: 8 }}>Substrate / material</div>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                    {d.packagingMaterials.map((m) => <span key={m} className="pill">{m}</span>)}
                  </div>
                </div>
              )}

              {/* (c) Packaging systems table */}
              {d.packaging.length > 0 && (
                <table style={{ marginTop: d.packingProfile || d.packagingMaterials.length > 0 ? 16 : 0 }}>
                  <thead>
                    <tr><th>System</th><th>Topology</th><th>Per pack</th><th>MOQ</th><th>Price</th><th>Lead</th></tr>
                  </thead>
                  <tbody>
                    {d.packaging.map((p) => (
                      <tr key={p.id}>
                        <td><b>{p.partnerName}</b></td>
                        <td style={CAPTION_STYLE}>{humanize(p.topology)}</td>
                        <td className="tnum">{p.unitCount}</td>
                        <td className="tnum">{p.moq.toLocaleString()}</td>
                        <td className="tnum">{usd(p.basePriceCents)}</td>
                        <td className="tnum">{p.leadTimeDays}d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* (d) Die-line outline SVGs */}
              {d.dielines.length > 0 && (
                <div style={{ marginTop: d.packaging.length > 0 || d.packingProfile || d.packagingMaterials.length > 0 ? 16 : 0 }}>
                  <div className="row" style={{ alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <Scissors size={15} strokeWidth={2} style={{ color: 'var(--pink-700)' }} />
                    <span style={{ ...LABEL_STYLE }}>Die-line outline{d.dielines.length === 1 ? '' : 's'}</span>
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
                        <div style={{ textAlign: 'center' }}>
                          <b style={{ fontSize: 14, color: 'var(--ink-900)' }}>{dl.flavorName ?? dl.name}</b>
                          <div style={CAPTION_STYLE}>{dl.widthMm}×{dl.heightMm} mm</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Section>
          )}

          {/* 5 · IMAGERY */}
          <Section icon={ImageIcon} title="Imagery">
            {galleryImages.length > 0 ? (
              <Gallery images={galleryImages} />
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
                <p style={{ ...CAPTION_STYLE, marginTop: 8 }}>
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

          {/* 6 · COST & PRICING */}
          <Section icon={DollarSign} title="Cost & pricing">
            <DefGrid>
              <DefCell label="Base price (floor)"><span className="tnum">{usd(d.priceFloorCents)}</span> <span style={{ ...CAPTION_STYLE, fontWeight: 400 }}>USD</span></DefCell>
              <DefCell label="Unit cost"><span className="tnum">{usd(d.unitCostCents)}</span> <span style={{ ...CAPTION_STYLE, fontWeight: 400 }}>USD</span></DefCell>
            </DefGrid>
            {d.pricingTiers.length > 0 ? (
              <table style={{ marginTop: 14 }}>
                <thead>
                  <tr><th>Mode</th><th>Min</th><th>Max</th><th>Cost/unit</th><th>Floor</th><th>Lead</th></tr>
                </thead>
                <tbody>
                  {d.pricingTiers.map((t) => (
                    <tr key={t.id}>
                      <td style={CAPTION_STYLE}>{FULFILLMENT_LABEL[t.fulfillmentMode] ?? t.fulfillmentMode}</td>
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
              <p style={{ ...CAPTION_STYLE, marginTop: 10 }}>No volume tiers yet.</p>
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
                      <td style={CAPTION_STYLE}>{FEE_BASIS_LABEL[f.basis] ?? humanize(f.basis)}</td>
                      <td className="tnum">{usd(f.amountCents)}</td>
                      <td className="tnum">{f.waivedAboveQty != null ? `${f.waivedAboveQty.toLocaleString()} u` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* 7 · PRODUCTION & STORAGE */}
          {hasProductionStorage && (
            <Section icon={PackageOpen} title="Production & storage">
              <DefGrid>
                {(d.leadTimeFirstRunDays != null || d.leadTimeRepeatDays != null) && (
                  <DefCell label="Lead time">
                    {d.leadTimeFirstRunDays != null ? `${d.leadTimeFirstRunDays}d first run` : '—'}
                    {' · '}
                    {d.leadTimeRepeatDays != null ? `${d.leadTimeRepeatDays}d repeat` : '—'}
                  </DefCell>
                )}
                {d.storageClass && (
                  <DefCell label="Storage class">
                    {STORAGE_CLASS_LABEL[d.storageClass] ?? humanize(d.storageClass)}
                    {(d.storageTempMinF != null || d.storageTempMaxF != null) && (
                      <span style={{ ...CAPTION_STYLE, fontWeight: 400 }}> · {d.storageTempMinF ?? '—'}–{d.storageTempMaxF ?? '—'}°F</span>
                    )}
                  </DefCell>
                )}
                {d.maxFlavorsPerPack != null && (
                  <DefCell label="Max flavors / pack"><span className="tnum">{d.maxFlavorsPerPack}</span> distinct</DefCell>
                )}
              </DefGrid>
            </Section>
          )}

          {/* 8 · MANUFACTURER REFERENCES / CUSTOM META */}
          {(d.manufacturerRefs.length > 0 || d.customMeta.length > 0) && (
            <Section icon={Hash} title="Manufacturer references">
              {d.manufacturerRefs.length > 0 && (
                <DefGrid>
                  {d.manufacturerRefs.map((r, i) => (
                    <DefCell key={`ref-${i}`} label={r.label}><span className="tnum">{r.value}</span></DefCell>
                  ))}
                </DefGrid>
              )}
              {d.customMeta.length > 0 && (
                <div style={{ marginTop: d.manufacturerRefs.length > 0 ? 14 : 0 }}>
                  <div className="row" style={{ alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <ClipboardList size={15} strokeWidth={2} style={{ color: 'var(--pink-700)' }} />
                    <span style={LABEL_STYLE}>Additional data</span>
                  </div>
                  <DefGrid>
                    {d.customMeta.map((m, i) => (
                      <DefCell key={`meta-${i}`} label={m.label}>{m.value}</DefCell>
                    ))}
                  </DefGrid>
                </div>
              )}
              {d.manufacturerRefs.length > 0 && (
                <p style={{ ...CAPTION_STYLE, marginTop: 12 }}>
                  Your own tracking codes (ERP, warehouse, legacy SKU). Reference only — iLaunchify never routes or matches on these.
                </p>
              )}
            </Section>
          )}
        </div>

        {/* ===== RIGHT RAIL (sticky) ===== */}
        <aside className="passport-rail">
          {/* Compliance — first rail card, next to the cover */}
          <ComplianceCard draftId={draftId ?? null} />

          {/* Facts label */}
          {hasFacts && (
            <RailCard icon={Beaker} title="Facts label">
              <div style={{ ...LABEL_STYLE, marginBottom: 10 }}>{d.labelArtifact}</div>
              <div style={{ display: 'grid', placeItems: 'center', gap: 12 }}>
                {d.factsPanel && d.factsPanel.panel.format === 'SUPPLEMENT_FACTS' ? (
                  <SupplementFactsSvg data={d.factsPanel.panel} widthPx={280} />
                ) : d.factsPanel ? (
                  <NutritionFactsSvg
                    data={d.factsPanel.panel}
                    contains={d.factsPanel.contains ?? undefined}
                    ingredientStatement={d.factsPanel.ingredientStatement ?? undefined}
                    widthPx={280}
                  />
                ) : null}

                {d.cosmeticFacts && (
                  <InciDeclarationSvg
                    ingredients={d.cosmeticFacts.ingredients}
                    netContents={d.cosmeticFacts.netContents ?? undefined}
                    responsiblePerson={d.cosmeticFacts.responsiblePerson ?? undefined}
                    adverseEventContact={d.cosmeticFacts.adverseEventContact ?? undefined}
                    widthPx={280}
                  />
                )}

                {d.petFacts && (
                  <GuaranteedAnalysisSvg
                    gaRows={d.petFacts.gaRows}
                    ingredients={d.petFacts.ingredients}
                    adequacyStatement={d.petFacts.adequacyStatement ?? undefined}
                    feedingDirections={d.petFacts.feedingDirections ?? undefined}
                    widthPx={280}
                  />
                )}
              </div>

              {d.factsPanel?.declared && (
                <p style={{ ...CAPTION_STYLE, marginTop: 10, textAlign: 'center' }}>
                  Panel entered by the manufacturer (declared values).
                </p>
              )}

              {canViewFlavorLabels && (
                <>
                  <p style={{ ...CAPTION_STYLE, marginTop: 10, textAlign: 'center' }}>
                    Base recipe panel. Each unit prints its own single-flavor label.
                  </p>
                  <button
                    type="button"
                    className="btn pink sm"
                    style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
                    onClick={() => setLabelViewerOpen(true)}
                  >
                    View all flavor labels
                  </button>
                </>
              )}
            </RailCard>
          )}
        </aside>
      </div>

      {labelViewerOpen && canViewFlavorLabels && (
        <LabelViewerModal
          columns={d.flavorColumns}
          productName={d.name || undefined}
          netContents={d.packNetContents ?? undefined}
          onClose={() => setLabelViewerOpen(false)}
        />
      )}

      <style>{PASSPORT_CSS}</style>
    </div>
  )
}

// Two-column document layout: main + sticky right rail; collapses under 900px.
const PASSPORT_CSS = `
.passport-body{display:grid;grid-template-columns:1fr 330px;gap:16px;align-items:start}
.passport-main{min-width:0}
.passport-rail{position:sticky;top:16px;align-self:start;display:flex;flex-direction:column;gap:16px;min-width:0}
@media(max-width:900px){.passport-body{grid-template-columns:1fr}.passport-rail{position:static}}
`
