// AI Create — P2 demo harness (AI_PACKAGING_GENERATOR §8).
//
// Renders the AiCreatePanel against a FIXTURE die-line set so the whole flow is
// viewable end-to-end on placeholder art, with no model and no DB. The real page
// loads the product's actual die-line set + Brand Kit + domain/market + tier and
// mounts this same panel into the Studio rail — see HANDOFF (Code owns the Studio
// shell). Route: /studio/ai-create.

import { AiCreatePanel, type DielineTarget } from './AiCreatePanel'
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

export default function AiCreateDemoPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
        P2 demo harness — fixture die-line set, placeholder art. Real loader + Studio-rail mount pending (Code).
      </div>
      <AiCreatePanel
        productDescriptor="box of stroopwafel cookies"
        brandName="Mood Cookies"
        brandPalette={['#E8943A', '#9CC4A0']}
        substrateLabel="kraft carton"
        domain="FOOD"
        dielines={fixture}
        tier="agency"
        creditsRemaining={30}
      />
    </div>
  )
}
