'use client'

import * as React from 'react'
import type { DecorationOfferingCard } from '@/lib/decoration-offerings-db'

/**
 * Slice C8.2 — marketplace decoration picker.
 *
 * One card per resolved decoration method (see getDecorationOfferings). The
 * creator picks how their container is decorated; the selection flows into
 * the "Start Launching" CTA, which carries `{ decorationMethod,
 * partnerOfferingId }` through to product creation.
 *
 * Pure data in, plain `onSelect` callback out — no function props cross the
 * server/client boundary (the parent configurator owns the state).
 */

export interface DecorationSelection {
  decorationMethod: string
  partnerOfferingId: string
}

interface Props {
  offerings: DecorationOfferingCard[]
  /** Currently-selected partnerOfferingId (null = none chosen yet). */
  selectedOfferingId: string | null
  onSelect: (selection: DecorationSelection | null) => void
}

const FULFILLMENT_TAG: Record<string, { label: string; cls: string }> = {
  BULK_PRODUCTION: {
    label: 'Bulk',
    cls: 'bg-ink-900 text-white',
  },
  ON_DEMAND: {
    label: 'On-demand',
    cls: 'bg-pink-100 text-pink-700',
  },
  BOTH: {
    label: 'Flexible',
    cls: 'bg-[#B5FF3D] text-ink-900',
  },
}

export function DecorationPicker({
  offerings,
  selectedOfferingId,
  onSelect,
}: Props) {
  if (offerings.length === 0) return null

  return (
    <div className="flex flex-col gap-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">
        Decoration method
        <span className="text-ink-400 normal-case font-normal tracking-normal">
          {' '}· how your container is finished
        </span>
      </div>

      <div
        role="radiogroup"
        aria-label="Decoration method"
        className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
      >
        {offerings.map((o) => {
          const isActive = o.offeringId === selectedOfferingId
          const tag = FULFILLMENT_TAG[o.fulfillmentMode] ?? FULFILLMENT_TAG.BOTH!
          return (
            <button
              key={o.offeringId}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() =>
                onSelect(
                  isActive
                    ? null
                    : {
                        decorationMethod: o.decorationMethod,
                        partnerOfferingId: o.offeringId,
                      },
                )
              }
              className={
                'group flex flex-col items-start gap-2 rounded-xl border p-3.5 text-left transition-[border-color,box-shadow] duration-base ease-out-quart cursor-pointer ' +
                (isActive
                  ? 'border-pink-500 ring-[3px] ring-pink-500/15 bg-white'
                  : 'border-ink-200 bg-white hover:border-ink-400')
              }
            >
              <div className="flex w-full items-start justify-between gap-2">
                <span className="text-[14px] font-semibold leading-tight text-ink-900">
                  {o.methodLabel}
                </span>
                <span
                  className={
                    'flex-shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ' +
                    tag.cls
                  }
                >
                  {tag.label}
                </span>
              </div>

              <div className="text-[18px] font-bold leading-none text-ink-900 tabular-nums">
                ${(o.startingPricePerUnitCents / 100).toFixed(2)}
                <span className="ml-1 text-[11px] font-medium text-ink-500">
                  / unit
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-ink-500 tabular-nums">
                <span>MOQ {o.moq.toLocaleString()}</span>
                <span className="text-ink-300">·</span>
                <span>{o.leadTimeDays}-day lead</span>
              </div>
            </button>
          )
        })}
      </div>

      {selectedOfferingId && (
        <p className="text-[11px] text-ink-500">
          Carried into your launch — price shows at checkout for your quantity.
        </p>
      )}
    </div>
  )
}
