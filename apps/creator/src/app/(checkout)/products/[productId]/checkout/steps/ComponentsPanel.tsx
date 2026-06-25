'use client'

// Track C / C7.f — packaging Components section (creator-facing).
//
// Lists the product's PackagingComponent slots (CONTAINER / CLOSURE / SEAL / …),
// each with its decoration-variant radio group + remove control. When the
// product has no components yet, offers a primary-container picker that
// materializes the implied slots via createDefaultComponentSlots (C7.d).
//
// Variant lists come from partner-listed PackagingComponentVariant rows; until
// partners list them each slot shows the default-included state.

import * as React from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, Lock } from 'lucide-react'
import { Radio } from '@ilaunchify/ui'
import {
  listProductComponents,
  listContainerPackagingTypes,
  listCartonPackagingTypes,
  listComponentVariants,
  createDefaultComponentSlots,
  addOuterCarton,
  getComponentsContext,
  setComponentVariant,
  removePackagingComponent,
  type ComponentRow,
  type ContainerTypeOption,
  type ComponentVariantOption,
} from '../component-actions'

const ROLE_LABEL: Record<string, string> = {
  CONTAINER: 'Primary',
  CLOSURE: 'Closure',
  SEAL: 'Seal',
  CARTON: 'Carton',
  INSERT: 'Insert',
  LABEL: 'Label',
  SHIPPER: 'Shipper',
}

export function ComponentsPanel({ productId }: { productId: string }) {
  const [rows, setRows] = React.useState<ComponentRow[] | null>(null)
  const [containers, setContainers] = React.useState<ContainerTypeOption[]>([])
  const [cartons, setCartons] = React.useState<ContainerTypeOption[]>([])
  const [cartonRecommended, setCartonRecommended] = React.useState(false)
  const [primaryId, setPrimaryId] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const reload = React.useCallback(async () => {
    const res = await listProductComponents(productId)
    if (res.ok) setRows(res.data)
  }, [productId])

  React.useEffect(() => {
    void reload()
    listContainerPackagingTypes().then((r) => {
      if (r.ok) setContainers(r.data)
    })
    listCartonPackagingTypes().then((r) => {
      if (r.ok) setCartons(r.data)
    })
    getComponentsContext(productId).then((r) => {
      if (r.ok) setCartonRecommended(r.data.cartonRecommended)
    })
  }, [reload, productId])

  async function setUp() {
    if (!primaryId) return
    setBusy(true)
    try {
      const res = await createDefaultComponentSlots(productId, primaryId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Added ${res.data.created} component${res.data.created === 1 ? '' : 's'}`)
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const heading = (
    <div className="flex items-center gap-1.5">
      <h3 className="text-[13px] font-semibold text-ink-900">Packaging components</h3>
      <span className="text-[11px] text-ink-400">— primary, closure, seal &amp; more</span>
    </div>
  )

  if (rows === null) {
    return (
      <section className="rounded-xl border border-ink-200 p-4">
        {heading}
        <div className="mt-2 flex items-center gap-2 text-[12px] text-ink-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading components…
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-ink-200 p-4">
      {heading}

      {rows.length === 0 ? (
        <div className="mt-3 space-y-2">
          <p className="text-[12px] text-ink-500">
            Pick the primary container — we&apos;ll set up the matching closure and seal slots
            automatically (seals are required for supplements &amp; OTC).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={primaryId}
              onChange={(e) => setPrimaryId(e.target.value)}
              className="rounded-md border border-ink-300 px-2.5 py-1.5 text-[12.5px] focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
            >
              <option value="">Choose a container…</option>
              {containers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={setUp}
              disabled={!primaryId || busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-ink-900 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-black disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Set up components
            </button>
          </div>
        </div>
      ) : (
        <>
          <ul className="mt-3 space-y-2.5">
            {rows.map((row) => (
              <ComponentSlotRow key={row.id} productId={productId} row={row} onChanged={reload} />
            ))}
          </ul>

          {/* Single-unit products that ship inside an outer folding box (e.g. a
              supplement bottle in a carton). Optional — hidden once added. */}
          {!rows.some((r) => r.role === 'CARTON') && cartons.length > 0 && (
            <AddOuterCarton
              productId={productId}
              cartons={cartons}
              recommended={cartonRecommended}
              onAdded={reload}
            />
          )}
        </>
      )}
    </section>
  )
}

function AddOuterCarton({
  productId,
  cartons,
  recommended,
  onAdded,
}: {
  productId: string
  cartons: ContainerTypeOption[]
  recommended: boolean
  onAdded: () => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const [cartonId, setCartonId] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  // Auto-expand once when a carton is recommended (supplement/OTC). One-shot, so
  // it won't re-open if the creator deliberately collapses it.
  const autoOpenedRef = React.useRef(false)
  React.useEffect(() => {
    if (recommended && !autoOpenedRef.current) {
      setOpen(true)
      autoOpenedRef.current = true
    }
  }, [recommended])

  async function add() {
    if (!cartonId) return
    setBusy(true)
    try {
      const res = await addOuterCarton(productId, cartonId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Outer carton added')
      setOpen(false)
      setCartonId('')
      await onAdded()
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-ink-300 px-3 py-1.5 text-[12px] font-medium text-ink-600 hover:border-pink-400 hover:text-pink-700"
      >
        <Plus className="h-3.5 w-3.5" /> Add outer carton
        {recommended && <span className="text-[11px] font-normal text-pink-600">· recommended</span>}
      </button>
    )
  }

  return (
    <div
      className={`mt-3 rounded-lg border px-3 py-2.5 ${
        recommended ? 'border-pink-200 bg-pink-50/40' : 'border-ink-200 bg-ink-50/50'
      }`}
    >
      {recommended && (
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-pink-700">
          Recommended for supplements &amp; OTC
        </p>
      )}
      <p className="text-[12px] text-ink-600">
        Add a secondary folding box this unit ships inside (the carton becomes its own
        component for production &amp; routing).
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={cartonId}
          onChange={(e) => setCartonId(e.target.value)}
          className="rounded-md border border-ink-300 px-2.5 py-1.5 text-[12.5px] focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
        >
          <option value="">Choose a carton…</option>
          {cartons.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={add}
          disabled={!cartonId || busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-ink-900 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-black disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add carton
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setCartonId('')
          }}
          className="rounded-md px-2 py-1.5 text-[12px] text-ink-500 hover:text-ink-800"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function ComponentSlotRow({
  productId,
  row,
  onChanged,
}: {
  productId: string
  row: ComponentRow
  onChanged: () => Promise<void>
}) {
  const [variants, setVariants] = React.useState<ComponentVariantOption[] | null>(null)
  const [pending, start] = React.useTransition()

  React.useEffect(() => {
    listComponentVariants(row.packagingTypeId, row.role).then((r) => {
      if (r.ok) setVariants(r.data)
      else setVariants([])
    })
  }, [row.packagingTypeId, row.role])

  function pick(variantId: string | null) {
    start(async () => {
      const res = await setComponentVariant(productId, row.id, variantId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      await onChanged()
    })
  }

  function remove() {
    start(async () => {
      const res = await removePackagingComponent(productId, row.id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Component removed')
      await onChanged()
    })
  }

  return (
    <li className="rounded-lg border border-ink-200 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-600">
              {ROLE_LABEL[row.role] ?? row.role}
            </span>
            <span className="text-[13px] font-medium text-ink-900">{row.packagingTypeName}</span>
            {row.fdaLocked && (
              <span
                title="FDA-required tamper-evident seal (21 CFR 211.132)"
                className="inline-flex items-center gap-0.5 text-[10px] text-amber-700"
              >
                <Lock className="h-3 w-3" /> required
              </span>
            )}
          </div>

          {/* Variant radio group */}
          <div className="mt-1.5 space-y-1">
            {variants === null ? (
              <span className="text-[11px] text-ink-400">Loading options…</span>
            ) : variants.length === 0 ? (
              <span className="text-[11.5px] text-ink-500">Standard — included</span>
            ) : (
              <>
                <Radio
                  name={`variant-${row.id}`}
                  checked={!row.selectedVariantId}
                  onChange={() => pick(null)}
                  disabled={pending}
                  label="Standard — included"
                  className="gap-1.5 text-[12px] text-ink-700"
                />
                {variants.map((v) => (
                  <Radio
                    key={v.id}
                    name={`variant-${row.id}`}
                    checked={row.selectedVariantId === v.id}
                    onChange={() => pick(v.id)}
                    disabled={pending}
                    className="gap-1.5 text-[12px] text-ink-700"
                    label={
                      <>
                        {v.name}
                        {v.baseSurchargePerUnitCents > 0 && (
                          <span className="text-ink-500">
                            +${(v.baseSurchargePerUnitCents / 100).toFixed(2)}/unit
                          </span>
                        )}
                        {v.leadTimeDeltaDays > 0 && (
                          <span className="text-ink-400">+{v.leadTimeDeltaDays}d</span>
                        )}
                      </>
                    }
                  />
                ))}
              </>
            )}
          </div>
        </div>

        {!row.fdaLocked && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            title="Remove component"
            className="shrink-0 rounded p-1 text-ink-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </li>
  )
}
