// AI Create (AI_PACKAGING_GENERATOR §8).
//
// Two modes on one route (/studio/ai-create):
//   • ?productId=… → REAL: loads that product's actual die-line SET + Brand Kit +
//     domain/market + tier + resolved per-domain vocab via loadAiCreateProps, and
//     mounts the panel against real data. Die-line-FIRST — the generator always
//     targets existing die-lines, never invents structure.
//   • no productId → FIXTURE demo so the flow stays viewable with no model/DB.
// The Studio-rail mount (Templates tab) is Code's hot file — see HANDOFF.

import { auth, requireCapability } from '@ilaunchify/auth'
import { resolveOutputPolicy } from '@ilaunchify/imagegen'
import { AiCreatePanel, type DielineTarget } from './AiCreatePanel'
import { loadAiCreateProps, loadAdminAiCreateProps } from './loader'
import type { FrameLayout } from '@ilaunchify/ui'

const primaryLayout: FrameLayout = {
  version: 1,
  frames: [
    { id: 'hero', kind: 'IMAGERY', box: { x: 0.05, y: 0.05, w: 0.9, h: 0.38 }, required: false, source: 'PLATFORM' },
    { id: 'logo', kind: 'LOGO', box: { x: 0.36, y: 0.46, w: 0.28, h: 0.1 }, required: false, source: 'PLATFORM' },
    { id: 'soi', kind: 'STATEMENT_OF_IDENTITY', box: { x: 0.05, y: 0.58, w: 0.4, h: 0.08 }, required: true, source: 'PLATFORM' },
    { id: 'nf', kind: 'NUTRITION_FACTS', box: { x: 0.05, y: 0.68, w: 0.4, h: 0.27 }, required: true, source: 'PLATFORM' },
    { id: 'ing', kind: 'INGREDIENTS', box: { x: 0.5, y: 0.68, w: 0.45, h: 0.16 }, required: true, source: 'PLATFORM' },
    { id: 'alg', kind: 'ALLERGENS', box: { x: 0.5, y: 0.86, w: 0.45, h: 0.06 }, required: true, source: 'PLATFORM' },
    { id: 'mfr', kind: 'MANUFACTURER', box: { x: 0.5, y: 0.93, w: 0.45, h: 0.05 }, required: true, source: 'PLATFORM' },
    { id: 'bc', kind: 'BARCODE', box: { x: 0.78, y: 0.58, w: 0.17, h: 0.08 }, required: false, source: 'PLATFORM' },
  ],
}

const cartonLayout: FrameLayout = {
  version: 1,
  frames: [
    { id: 'c-hero', kind: 'IMAGERY', box: { x: 0.05, y: 0.1, w: 0.9, h: 0.5 }, required: false, source: 'PLATFORM' },
    { id: 'c-logo', kind: 'LOGO', box: { x: 0.35, y: 0.64, w: 0.3, h: 0.12 }, required: false, source: 'PLATFORM' },
    { id: 'c-soi', kind: 'STATEMENT_OF_IDENTITY', box: { x: 0.1, y: 0.8, w: 0.5, h: 0.1 }, required: true, source: 'PLATFORM' },
  ],
}

const fixture: DielineTarget[] = [
  { id: 'primary', label: 'Primary box', shapeLabel: 'flip-top mailer box', layout: primaryLayout, surface: { widthMm: 120, heightMm: 180 } },
  { id: 'carton', label: 'Outer carton', shapeLabel: 'shipping carton', layout: cartonLayout, surface: { widthMm: 200, heightMm: 150 } },
]

export default async function AiCreatePage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; admin?: string; dieCut?: string; domain?: string }>
}) {
  const { productId, admin, dieCut, domain } = await searchParams

  // Admin (Design Studio → Templates) mode: generate against a die-cut, save as a library
  // template. Capability-gated — a normal creator can never reach this branch.
  if (admin) {
    await requireCapability('catalog:write')
    const data = await loadAdminAiCreateProps({ dieCutId: dieCut, domain })
    if (!data) {
      return (
        <div className="mx-auto max-w-5xl space-y-4 p-6">
          <div className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-[12px] text-ink-600">
            No die-cuts are available yet. Seed the die-cut library, then generate a template.
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <div className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-[12px] text-ink-600">
          Admin template mode — generating for <strong>{data.productName}</strong>. Save concepts to the library from the Studio.
        </div>
        <AiCreatePanel {...data.props} />
      </div>
    )
  }

  if (productId) {
    const session = await auth()
    const userId = session?.user?.id
    const data = userId ? await loadAiCreateProps(productId, userId) : null
    if (!data) {
      return (
        <div className="mx-auto max-w-5xl space-y-4 p-6">
          <div className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-[12px] text-ink-600">
            Product not found, or it has no confirmed die-line yet. The AI generator targets existing die-lines — add
            a packaging die-line to this product first.
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <AiCreatePanel {...data.props} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-[12px] text-warning-800">
        Demo harness — fixture die-line set, placeholder art. Pass <code>?productId=…</code> to load a real product.
      </div>
      <AiCreatePanel
        productDescriptor="box of stroopwafel cookies"
        brandName="Mood Cookies"
        brandPalette={['#E8943A', '#9CC4A0']}
        substrateLabel="kraft carton"
        domain="FOOD"
        dielines={fixture}
        flavors={[
          { id: 'strawberry', name: 'Strawberry', accentHex: '#E5486B', elementCue: 'sliced strawberries' },
          { id: 'cocoa', name: 'Double Cocoa', accentHex: '#6B4423', elementCue: 'cocoa nibs' },
          { id: 'matcha', name: 'Matcha', accentHex: '#7BA05B', elementCue: 'matcha whisk swirl' },
          { id: 'vanilla', name: 'Vanilla Bean', accentHex: '#E7D6A8', elementCue: 'vanilla pods' },
        ]}
        tier="agency"
        creditsRemaining={30}
        outputPolicy={resolveOutputPolicy('agency')}
        usage={{
          draftCyclesUsed: 8,
          draftCyclesCap: 120,
          finalizeMpUsed: 42,
          finalizeMpBudget: 240,
          storageBytesUsed: 380 * 1024 * 1024,
          storageBytesCap: 5 * 1024 * 1024 * 1024,
        }}
      />
    </div>
  )
}
