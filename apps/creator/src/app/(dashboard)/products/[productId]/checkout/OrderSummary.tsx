'use client'

// Phase G1 — sticky Order Summary, right-rail of the wizard.
//
// Live-updating breakdown of the choices the creator has made so far. G1
// renders the line shape with placeholders ($-.--) for amounts because
// real cost computation lives in G3 (Production Options) — that's where
// quantity × per-unit and substrate / packaging / finish prices flow in.

import type { CheckoutDraftState } from './types'

interface Props {
  state: CheckoutDraftState
}

export function OrderSummary({ state }: Props) {
  const qty = state.production.quantity ?? 0
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-[10.5px] font-semibold uppercase tracking-widest text-ink-500">
        Order summary
      </h2>

      <dl className="space-y-2 text-sm">
        <Row
          label={`Production${qty ? ` × ${qty}` : ''}`}
          value="$—.——"
          dimmed={qty === 0}
        />
        <Row
          label="Packaging material"
          value="$—.——"
          dimmed={!state.production.packagingMaterialSlug}
        />
        <Row
          label={`Finishes${
            state.production.finishPartnerFinishIds.length
              ? ` (${state.production.finishPartnerFinishIds.length})`
              : ''
          }`}
          value="$—.——"
          dimmed={state.production.finishPartnerFinishIds.length === 0}
        />
        <Row label="Shipping" value="$—.——" dimmed={!state.fulfillment.shipToType} />
        <Row label="Tax" value="$—.——" dimmed />
        <Row label="Platform fee" value="$—.——" dimmed />
      </dl>

      <div className="my-4 h-px bg-ink-100" />

      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-ink-900">Total</span>
        <span className="text-lg font-bold text-ink-900">$—.——</span>
      </div>

      <p className="mt-3 text-[11px] text-ink-500">
        Live cost lights up once you pick a quantity in step 2.
      </p>
    </div>
  )
}

function Row({
  label,
  value,
  dimmed,
}: {
  label: string
  value: string
  dimmed?: boolean
}) {
  return (
    <div
      className={
        'flex items-center justify-between gap-2 ' +
        (dimmed ? 'text-ink-400' : 'text-ink-700')
      }
    >
      <dt className="truncate">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}
