'use client'

// #38 (2026-07-19): the PDP packaging picker. Packaging is a PDP choice, scoped to
// the product's REAL offerings (getTemplatePackagingOptions), never the flat
// PackagingMaterial catalog. The creator picks the CONTAINER (from the manufacturer's
// options); the container determines the die-line + the possible decorations. Per
// Pavel: surface the DECORATION on the PDP only when the chosen container offers >1
// method, otherwise auto-pin the sole method. The resolved offering flows to launch
// as partnerOfferingId. See memory ilaunchify-packaging-picked-on-pdp.

import * as React from 'react'
import type { PdpPackagingOption } from '@/lib/container-offerings-db'

export interface PackagingSelection {
  packagingTypeId: string
  offeringId: string
  decorationMethod: string
  dielineId: string | null
}

export function PdpPackagingPicker({
  options,
  onSelect,
  hideDecoration = false,
  onDemandFinishLabel,
}: {
  options: PdpPackagingOption[]
  /** Fired with the resolved (container × decoration) offering, or null when none. */
  onSelect: (sel: PackagingSelection | null) => void
  /** ON_DEMAND display mode (docs/ON_DEMAND_FULL_SERVICE_GATE §4b.1): MOQ'd
   *  decoration offerings contradict a qty-1 made-to-order unit, so the
   *  decoration section is replaced by the in-house line. The CONTAINER choice
   *  stays (it defines the product either way), and the offering resolution is
   *  untouched — this is display-only until the partner's made-to-order
   *  declaration (§4b.2) exists. */
  hideDecoration?: boolean
  /** §4b.2 — the manufacturer's declared made-to-order finish (pin or sole
   *  candidate). Shown in the hideDecoration line; undefined = generic copy. */
  onDemandFinishLabel?: string
}) {
  const [containerId, setContainerId] = React.useState<string | null>(
    options[0]?.packagingTypeId ?? null,
  )
  const container =
    options.find((o) => o.packagingTypeId === containerId) ?? options[0] ?? null
  const [offeringId, setOfferingId] = React.useState<string | null>(
    container?.decorations[0]?.offeringId ?? null,
  )

  // Resolve the chosen offering and notify the parent whenever the pick changes
  // (including the initial default). Deps are the two ids only, so a fresh onSelect
  // identity from the parent never re-fires this.
  React.useEffect(() => {
    if (!container) return onSelect(null)
    const dec =
      container.decorations.find((d) => d.offeringId === offeringId) ??
      container.decorations[0]
    if (!dec) return onSelect(null)
    onSelect({
      packagingTypeId: container.packagingTypeId,
      offeringId: dec.offeringId,
      decorationMethod: dec.decorationMethod,
      dielineId: dec.dielineId,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId, offeringId])

  const pickContainer = (id: string) => {
    setContainerId(id)
    const c = options.find((o) => o.packagingTypeId === id)
    setOfferingId(c?.decorations[0]?.offeringId ?? null)
  }

  if (options.length === 0 || !container) return null

  const multiContainer = options.length > 1
  const decorations = container.decorations
  const multiDecoration = decorations.length > 1
  const activeOfferingId = offeringId ?? decorations[0]?.offeringId ?? null
  const pinned = decorations.find((d) => d.offeringId === activeOfferingId) ?? decorations[0]

  return (
    <div className="flex flex-col gap-2.5">
      {/* Container */}
      <div className="flex flex-col gap-1.5">
        <div className="text-[12px] font-semibold text-ink-700">
          Packaging
          {!multiContainer && (
            <span className="ml-1 font-normal text-ink-400">· {container.containerName}</span>
          )}
        </div>
        {multiContainer ? (
          <div role="radiogroup" aria-label="Packaging" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {options.map((o) => {
              const active = o.packagingTypeId === container.packagingTypeId
              return (
                <button
                  key={o.packagingTypeId}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => pickContainer(o.packagingTypeId)}
                  className={
                    'rounded-[10px] border px-3 py-2.5 text-left text-[13px] transition-[border-color] cursor-pointer ' +
                    (active ? 'border-2 border-ink-900 font-semibold text-ink-900' : 'border border-ink-200 text-ink-700 hover:border-ink-400')
                  }
                >
                  {o.containerName}
                  <span className="mt-0.5 block text-[11px] font-normal text-ink-500">
                    {o.decorations.length} finish{o.decorations.length === 1 ? '' : 'es'}
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          // Single container: shown as a confirmed, non-editable chip (the product
          // has exactly one packaging option). No fake choice.
          <div className="inline-flex w-fit items-center gap-1.5 rounded-[9px] border border-ink-200 bg-ink-50 px-3 py-1.5 text-[13px] font-medium text-ink-800">
            {container.containerName}
          </div>
        )}
      </div>

      {/* Decoration — only when the chosen container offers a choice. In
          ON_DEMAND display mode the section is replaced entirely (§4b.1). */}
      {hideDecoration ? (
        <div className="text-[11.5px] leading-relaxed text-ink-500">
          {onDemandFinishLabel ? (
            <>
              Finished with <span className="font-medium text-ink-700">{onDemandFinishLabel}</span>, applied
              in-house by the manufacturer for each made-to-order unit.
            </>
          ) : (
            <>
              Decorated and finished <span className="font-medium text-ink-700">in-house by the manufacturer</span> for
              each made-to-order unit.
            </>
          )}
        </div>
      ) : multiDecoration ? (
        <div className="flex flex-col gap-1.5">
          <div className="text-[12px] font-semibold text-ink-700">
            Decoration
            <span className="ml-1 font-normal text-ink-400">· how it's finished</span>
          </div>
          <div role="radiogroup" aria-label="Decoration" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {decorations.map((d) => {
              const active = d.offeringId === activeOfferingId
              return (
                <button
                  key={d.offeringId}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setOfferingId(d.offeringId)}
                  className={
                    'flex flex-col items-start gap-1 rounded-[10px] border px-3 py-2.5 text-left transition-[border-color] cursor-pointer ' +
                    (active ? 'border-2 border-pink-500 bg-white' : 'border border-ink-200 bg-white hover:border-ink-400')
                  }
                >
                  <span className="text-[13px] font-semibold text-ink-900">{d.methodLabel}</span>
                  <span className="text-[11px] text-ink-500 tabular-nums">
                    {d.startingPricePerUnitCents != null
                      ? `from $${(d.startingPricePerUnitCents / 100).toFixed(2)}/unit · `
                      : ''}
                    MOQ {d.moq.toLocaleString()} · {d.leadTimeDays}-day
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        pinned && (
          // Single method: auto-pinned, shown for confirmation only.
          <div className="text-[11.5px] text-ink-500">
            Finished with <span className="font-medium text-ink-700">{pinned.methodLabel}</span>
          </div>
        )
      )}
    </div>
  )
}
