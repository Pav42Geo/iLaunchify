'use client'

// Creator configurator — live §9 quote + recomputed FDA Facts. Pure client
// computation off the server-resolved ConfiguratorData; confirm → issue PSS.

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { resolveConfiguredSelection, calculateLabel, toPanelData } from '@ilaunchify/nutrition'
// Client-safe money subpath (PP-0b). NOT '@ilaunchify/plans': that barrel
// re-exports the server-only lookups module, which eagerly imports prisma.
import { creatorFeeCents } from '@ilaunchify/plans/math'
import { NutritionFactsRenderer, Checkbox, formatCents } from '@ilaunchify/ui'
import { composeQuote, type QuoteValueDelta } from './quote'
import type { ConfiguratorData, ConfiguratorAxis, ConfiguratorValue } from './configure-data'
import { issueProductSpecSheet } from './configure-actions'
import type { SpecSheetSnapshot } from './spec-sheet-types'

export function ConfiguratorClient({ data }: { data: ConfiguratorData }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const defaultValueFor = (ax: ConfiguratorAxis): ConfiguratorValue | null =>
    ax.values.find((v) => v.isDefault) ?? ax.values[0] ?? null

  const [flavorId, setFlavorId] = useState<string | null>(data.flavors[0]?.id ?? null)
  const [picks, setPicks] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const ax of data.axes) {
      const d = defaultValueFor(ax)
      if (d) init[ax.id] = d.id
    }
    return init
  })
  const [quantity, setQuantity] = useState<number>(data.variantMoqMin)
  const [firstRun, setFirstRun] = useState(true)

  const flavor = data.flavors.find((f) => f.id === flavorId) ?? null

  // Resolved value per axis: editable axes follow the pick, locked axes use default.
  const selectedValues: ConfiguratorValue[] = useMemo(
    () =>
      data.axes
        .map((ax) => {
          const id = ax.editableByCreator ? picks[ax.id] : defaultValueFor(ax)?.id
          return ax.values.find((v) => v.id === id) ?? defaultValueFor(ax)
        })
        .filter((v): v is ConfiguratorValue => v != null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.axes, picks],
  )

  // Base per-unit cost for this quantity band.
  const baseTierUnitCostCents = useMemo(() => {
    const tier = data.pricingTiers.find(
      (t) => quantity >= t.minQty && (t.maxQty == null || quantity <= t.maxQty),
    )
    return tier?.perUnitCostCents ?? data.fallbackUnitCostCents
  }, [data.pricingTiers, data.fallbackUnitCostCents, quantity])

  // EXCLUDE rule resolution.
  const selectedIds = useMemo(() => new Set(selectedValues.map((v) => v.id)), [selectedValues])
  const labelById = useMemo(() => {
    const m = new Map<string, string>()
    for (const ax of data.axes) for (const v of ax.values) m.set(v.id, v.label)
    return m
  }, [data.axes])
  const excludeViolation = useMemo(() => {
    for (const r of data.rules) {
      if (r.kind === 'EXCLUDE' && selectedIds.has(r.whenValueId) && selectedIds.has(r.targetValueId)) {
        return {
          whenLabel: labelById.get(r.whenValueId) ?? 'This option',
          targetLabel: labelById.get(r.targetValueId) ?? 'another option',
        }
      }
    }
    return null
  }, [data.rules, selectedIds, labelById])

  // §9 quote.
  const quote = useMemo(() => {
    const deltas: QuoteValueDelta[] = selectedValues.map((v) => ({
      unitCostDeltaCents: v.unitCostDeltaCents,
      leadTimeDeltaDays: v.leadTimeDeltaDays,
      moqOverride: v.moqOverride,
      priceDeltaCents: v.priceDeltaCents,
    }))
    if (flavor) {
      deltas.push({
        unitCostDeltaCents: 0,
        leadTimeDeltaDays: 0,
        moqOverride: null,
        priceDeltaCents: flavor.priceDeltaCents,
      })
    }
    return composeQuote({
      quantity,
      baseTierUnitCostCents,
      variantMoqMin: data.variantMoqMin,
      orderIncrement: null,
      firstRun,
      leadTimeFirstRunDays: data.leadTimeFirstRunDays,
      leadTimeRepeatDays: data.leadTimeRepeatDays,
      selected: deltas,
      fees: data.fees,
      excludeViolation,
    })
  }, [selectedValues, flavor, quantity, baseTierUnitCostCents, firstRun, data, excludeViolation])

  // Recomputed FDA Facts.
  const { panel, labelChanged } = useMemo(() => {
    const flavorOverlay = flavor?.overlay ?? []
    const optionOverlays = selectedValues.map((v) => v.overlay).filter((o): o is NonNullable<typeof o> => o != null)
    const list = resolveConfiguredSelection(data.baseRows, flavorOverlay, optionOverlays)
    try {
      const result = calculateLabel(list, {
        basis: 'serving',
        servingSizeG: data.geometry.servingSizeG,
        servingsPerPackage: data.geometry.servingsPerContainer,
      })
      return { panel: toPanelData(result), labelChanged: flavorOverlay.length + optionOverlays.length > 0 }
    } catch {
      return { panel: null, labelChanged: false }
    }
  }, [flavor, selectedValues, data.baseRows, data.geometry])

  // PP-0b: the fee is computed by the SAME function the charge uses
  // (creatorFeeCents), imported from the client-safe '@ilaunchify/plans/math'
  // subpath. It used to be `Math.round((subtotal * pct) / 100)` inline, which
  // looks equivalent and is not: it silently ignored the FeeRule's flat/min/max
  // bounds that placeOrder applies, so a cart hitting a floor or a cap was QUOTED
  // unclamped and CHARGED clamped. Do not import '@ilaunchify/plans' (the barrel)
  // here: it re-exports the server-only lookups module, which imports prisma.
  const platformFeeCents = creatorFeeCents(quote.subtotalCents, data.platformFeeBps, data.platformFeeBounds)
  const allInCents = quote.subtotalCents + platformFeeCents

  function confirm() {
    if (!quote.valid) {
      toast.error('Fix the highlighted issues first.')
      return
    }
    const snapshot: SpecSheetSnapshot = {
      productId: data.product.id,
      productName: data.product.name,
      templateId: data.template.id,
      templateName: data.template.name,
      flavor: flavor ? { id: flavor.id, name: flavor.name } : null,
      options: data.axes.map((ax) => {
        const v =
          selectedValues.find((sv) => ax.values.some((av) => av.id === sv.id)) ?? defaultValueFor(ax)!
        return {
          axisKey: ax.key,
          axisLabel: ax.label,
          valueId: v.id,
          valueLabel: v.label,
          affectsLabel: ax.affectsLabel,
          overlayOp: v.overlay?.op ?? null,
          unitCostDeltaCents: v.unitCostDeltaCents,
          leadTimeDeltaDays: v.leadTimeDeltaDays,
          moqOverride: v.moqOverride,
          priceDeltaCents: v.priceDeltaCents,
        }
      }),
      quantity: quote.quantity,
      firstRun,
      quote: {
        unitCostCents: quote.unitCostCents,
        leadTimeDays: quote.leadTimeDays,
        moq: quote.moq,
        oneTimeFeesCents: quote.oneTimeFeesCents,
        perUnitFeesCents: quote.perUnitFeesCents,
        perOrderFeesCents: quote.perOrderFeesCents,
        subtotalCents: quote.subtotalCents,
        priceDeltaCents: quote.priceDeltaCents,
        valid: quote.valid,
        platformFeePercent: data.platformFeePercent,
        platformFeeCents,
        allInTotalCents: allInCents,
      },
      label: labelChanged ? (panel as unknown) : null,
      recipe: data.baseRows.map((r) => r.name),
    }
    start(async () => {
      const res = await issueProductSpecSheet({ productId: data.product.id, snapshot })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Spec sheet v${res.version} issued`)
      router.push(`/products/${data.product.id}/spec-sheet`)
    })
  }

  const editableAxes = data.axes.filter((a) => a.editableByCreator)
  const lockedAxes = data.axes.filter((a) => !a.editableByCreator)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,360px]">
      {/* LEFT — pickers */}
      <div className="space-y-5">
        {data.flavors.length > 0 && (
          <Section title="Flavor">
            <div className="flex flex-wrap gap-2">
              {data.flavors.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFlavorId(f.id)}
                  className={chip(flavorId === f.id)}
                >
                  <span
                    className="inline-block h-3 w-3 rounded-full border border-ink-200"
                    style={{ backgroundColor: f.swatchHex ?? '#E5E5E5' }}
                  />
                  {f.name}
                  {f.priceDeltaCents !== 0 && (
                    <span className="text-[10.5px] text-ink-500">
                      {f.priceDeltaCents > 0 ? '+' : ''}
                      {formatCents(f.priceDeltaCents)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </Section>
        )}

        {editableAxes.map((ax) => (
          <Section key={ax.id} title={ax.label} affectsLabel={ax.affectsLabel}>
            <div className="flex flex-wrap gap-2">
              {ax.values.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setPicks((p) => ({ ...p, [ax.id]: v.id }))}
                  className={chip(picks[ax.id] === v.id)}
                >
                  {v.label}
                  {v.unitCostDeltaCents !== 0 && (
                    <span className="text-[10.5px] text-ink-500">
                      {v.unitCostDeltaCents > 0 ? '+' : ''}
                      {formatCents(v.unitCostDeltaCents)}/u
                    </span>
                  )}
                </button>
              ))}
            </div>
          </Section>
        ))}

        {lockedAxes.length > 0 && (
          <Section title="Set by manufacturer">
            <div className="flex flex-wrap gap-2">
              {lockedAxes.map((ax) => {
                const d = defaultValueFor(ax)
                return (
                  <span
                    key={ax.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-ink-50 px-3 py-1 text-[12px] text-ink-600"
                  >
                    <span className="font-medium text-ink-800">{ax.label}:</span> {d?.label ?? '—'}
                  </span>
                )
              })}
            </div>
          </Section>
        )}

        <Section title="Quantity">
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={0}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(0, parseInt(e.target.value || '0', 10)))}
              className="h-10 w-40 rounded-lg border border-ink-200 px-3 text-[14px] tabular-nums focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
            />
            <span className="text-[12px] text-ink-500">units · MOQ {quote.moq.toLocaleString()}</span>
          </div>
          <Checkbox
            checked={firstRun}
            onChange={(e) => setFirstRun(e.target.checked)}
            label="First production run (new SKU — longer lead time)"
            className="mt-3 text-[12.5px] text-ink-700"
          />
        </Section>
      </div>

      {/* RIGHT — live quote + Facts */}
      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-2xl border border-ink-200 bg-white p-4">
          <h3 className="font-display text-[15px] font-semibold text-ink-900">Your quote</h3>
          <dl className="mt-3 space-y-1.5 text-[13px]">
            <Qline label="Per unit" value={formatCents(quote.unitCostCents)} />
            <Qline label="Quantity" value={`${quote.quantity.toLocaleString()} units`} />
            <Qline label="Lead time" value={`${quote.leadTimeDays} days`} />
            {quote.oneTimeFeesCents > 0 && (
              <Qline label="One-time fees" value={formatCents(quote.oneTimeFeesCents)} />
            )}
            {quote.perUnitFeesCents > 0 && (
              <Qline label="Per-unit fees" value={formatCents(quote.perUnitFeesCents)} />
            )}
            {quote.perOrderFeesCents > 0 && (
              <Qline label="Per-order fees" value={formatCents(quote.perOrderFeesCents)} />
            )}
            <Qline label="Production subtotal" value={formatCents(quote.subtotalCents)} />
            <Qline
              label={`Administrative fee · ${data.creatorTier} · ${data.platformFeePercent}%`}
              value={formatCents(platformFeeCents)}
            />
            <div className="mt-1 flex items-center justify-between border-t border-ink-100 pt-2 text-[14px] font-semibold text-ink-900">
              <span>Your total</span>
              <span className="tabular-nums">{formatCents(allInCents)}</span>
            </div>
          </dl>
          <p className="mt-2 text-[10.5px] text-ink-400">
            Includes your <span className="font-medium">{data.creatorTier}</span>-tier platform fee.
            Production shipping is estimated at checkout.
          </p>

          {quote.issues.length > 0 && (
            <ul className="mt-3 space-y-1">
              {quote.issues.map((iss, i) => (
                <li
                  key={i}
                  className={`rounded-md px-2 py-1 text-[11.5px] ${
                    iss.tone === 'block'
                      ? 'bg-danger-50 text-danger-700'
                      : 'bg-warning-50 text-warning-800'
                  }`}
                >
                  {iss.tone === 'block' ? '❌ ' : '⚠️ '}
                  {iss.message}
                </li>
              ))}
            </ul>
          )}

          <button
            onClick={confirm}
            disabled={pending || !quote.valid}
            className="mt-4 w-full rounded-full bg-ink-900 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? 'Issuing…' : 'Issue spec sheet'}
          </button>
        </div>

        {panel && (
          <div className="rounded-2xl border border-ink-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display text-[14px] font-semibold text-ink-900">Nutrition Facts</h3>
              {labelChanged && (
                <span className="rounded-full border border-success-200 bg-success-50 px-2 py-[1px] text-[10px] font-semibold uppercase tracking-wider text-success-800">
                  Updated for your picks
                </span>
              )}
            </div>
            <NutritionFactsRenderer data={panel} widthPx={300} />
          </div>
        )}
      </aside>
    </div>
  )
}

function Section({
  title,
  affectsLabel,
  children,
}: {
  title: string
  affectsLabel?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <h2 className="font-display text-[14px] font-semibold text-ink-900">{title}</h2>
        {affectsLabel && (
          <span className="rounded-full border border-warning-200 bg-warning-50 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wider text-warning-800">
            Changes label
          </span>
        )}
      </div>
      {children}
    </section>
  )
}

function QLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-ink-600">
      <span>{label}</span>
      <span className="tabular-nums text-ink-900">{value}</span>
    </div>
  )
}
// alias to keep JSX terse above
const Qline = QLine

function chip(active: boolean): string {
  return [
    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors',
    active
      ? 'border-ink-900 bg-ink-900 text-white'
      : 'border-ink-200 bg-white text-ink-700 hover:border-pink-300 hover:bg-pink-50',
  ].join(' ')
}
