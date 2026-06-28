'use client'

// Real, domain-aware Review summary cards (replaces the hardcoded placeholders on
// the New Product Review step). Loads the actual draft via getProductReviewSummary
// and renders the formulation/pricing/packaging the manufacturer actually entered,
// with the correct label artifact per domain. Uses the GuidedBuilder `.gb` card
// classes so it matches the surrounding chrome.

import * as React from 'react'
import { getProductReviewSummary, type ReviewSummary as Summary } from './review-actions'

const STATUS_PILL: Record<Summary['formulationStatus'], { cls: string; text: string }> = {
  done: { cls: 'green', text: '✓ complete' },
  progress: { cls: 'amber', text: 'in progress' },
  empty: { cls: 'amber', text: 'not started' },
}
const usd = (c: number | null) => (c == null ? '—' : `$${(c / 100).toFixed(2)}`)

export function ReviewSummary({ draftId }: { draftId?: string | null }) {
  const [data, setData] = React.useState<Summary | null>(null)
  const [loading, setLoading] = React.useState(true)
  React.useEffect(() => {
    if (!draftId) { setLoading(false); return }
    let cancelled = false
    getProductReviewSummary(draftId).then((r) => {
      if (cancelled) return
      if (r.ok) setData(r.data)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [draftId])

  if (loading) return <div className="card"><p className="muted small">Loading summary…</p></div>
  if (!data) return <div className="card"><p className="muted small">Save your draft to see the review summary.</p></div>

  const fpill = STATUS_PILL[data.formulationStatus]

  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <div className="card">
        <div className="eyebrow">Basics</div>
        <h3 className="display" style={{ fontSize: 18, margin: '6px 0' }}>{data.name || 'Untitled product'}</h3>
        <p className="muted small">{data.domainLabel} · {data.niches} niche{data.niches === 1 ? '' : 's'} · {data.tags} tag{data.tags === 1 ? '' : 's'}</p>
        <span className={`pill ${data.name ? 'green' : 'amber'}`}>{data.name ? '✓ named' : 'needs a name'}</span>
      </div>

      <div className="card">
        <div className="eyebrow">{data.labelArtifact}</div>
        <h3 style={{ margin: '6px 0' }}>{data.formulationTitle}</h3>
        {data.statementOfIdentity && <p className="muted small" style={{ marginBottom: 6 }}>SoI: {data.statementOfIdentity}</p>}
        <span className={`pill ${fpill.cls}`}>{fpill.text}</span>
      </div>

      <div className="card">
        <div className="eyebrow">Packaging</div>
        <h3 style={{ margin: '6px 0' }}>{data.packagingName ?? 'Not selected'}</h3>
        <span className={`pill ${data.packagingName ? 'green' : 'amber'}`}>{data.packagingName ? '✓ chosen' : 'pick a type'}</span>
      </div>

      <div className="card">
        <div className="eyebrow">Pricing</div>
        <h3 style={{ margin: '6px 0' }}>{data.pricingTiers > 0 ? `${data.pricingTiers} tier${data.pricingTiers === 1 ? '' : 's'} · from ${usd(data.lowestCents)}/unit` : 'No tiers yet'}</h3>
        <span className={`pill ${data.pricingTiers > 0 ? 'green' : 'amber'}`}>{data.pricingTiers > 0 ? '✓ set' : 'add a tier'}</span>
      </div>

      <div className="card">
        <div className="eyebrow">Label regime</div>
        <h3 style={{ margin: '6px 0' }}>{data.labelArtifact}</h3>
        {data.ageGroupLabel && (
          <p className="muted small" style={{ marginTop: 2 }}>
            Audience: <b>{data.ageGroupLabel}</b>
            {data.ageGroupLabel.startsWith('General') ? '' : ' · age-specific Nutrition Facts variant (21 CFR 101.9(j)(5))'}
          </p>
        )}
      </div>

      <div className="card">
        <div className="eyebrow">Marketplace facets</div>
        <p className="muted small" style={{ marginTop: 6 }}>Category, niche, tags, packaging type, format, allergens, certs, MOQ, lead time, fulfillment mode.</p>
      </div>
    </div>
  )
}
