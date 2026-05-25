'use client'

// Allergens editor card — auto-derived Big-9 contains-list + manual overrides
// + cross-contamination statement.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §5a + #131.
//
// FDA Big-9 = milk, eggs, fish, shellfish, tree_nuts, peanuts, wheat, soybeans,
// sesame. Auto-derived from union of slot ingredients' allergenFlags. Partner
// can manually ADD (e.g., cross-contamination from facility) or REMOVE (e.g.,
// they switched suppliers and the underlying ingredient flag is stale) with
// a required reason for the audit trail.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Label } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { Plus, Trash2, ShieldAlert, AlertTriangle } from 'lucide-react'
import {
  saveManualAllergens,
  // saveProductFields lives in the parent actions file
} from '../card-actions'
import { saveProductFields } from '../../../actions'

const BIG_9 = [
  'milk',
  'eggs',
  'fish',
  'shellfish',
  'tree_nuts',
  'peanuts',
  'wheat',
  'soybeans',
  'sesame',
] as const

type ManualOverride = { allergen: string; action: 'ADD' | 'REMOVE'; reason: string }

interface AllergensCardProps {
  productTemplateId: string
  isDraft: boolean
  // Union of allergenFlags from slot ingredients
  autoDerived: string[]
  // Persisted in ProductTemplate.allergenManualOverrides
  initialManualOverrides: ManualOverride[]
  // Cross-contamination statement (from ProductTemplate.allergenCrossContamination)
  initialCrossContamination: string | null
}

export function AllergensCard({
  productTemplateId,
  isDraft,
  autoDerived,
  initialManualOverrides,
  initialCrossContamination,
}: AllergensCardProps) {
  const router = useRouter()
  const [overrides, setOverrides] = useState<ManualOverride[]>(initialManualOverrides)
  const [crossContamination, setCrossContamination] = useState(initialCrossContamination ?? '')
  const [crossSaveStatus, setCrossSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [isPending, startTransition] = useTransition()

  // Computed contains-list — auto-derived minus REMOVE overrides plus ADD overrides
  const effectiveAllergens = computeEffective(autoDerived, overrides)

  // Apply override list + persist
  function persistOverrides(next: ManualOverride[]) {
    setOverrides(next)
    startTransition(async () => {
      const result = await saveManualAllergens({
        productTemplateId,
        manualOverrides: next,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      router.refresh()
    })
  }

  function addOverride(allergen: string, action: 'ADD' | 'REMOVE', reason: string) {
    if (!reason.trim()) {
      toast.error('Reason is required for manual overrides.')
      return
    }
    // Replace any existing override for this allergen
    const next = overrides.filter((o) => o.allergen !== allergen)
    next.push({ allergen, action, reason: reason.trim() })
    persistOverrides(next)
  }

  function removeOverride(allergen: string) {
    persistOverrides(overrides.filter((o) => o.allergen !== allergen))
  }

  function saveCrossContamination() {
    setCrossSaveStatus('saving')
    startTransition(async () => {
      await saveProductFields(productTemplateId, {
        allergenCrossContamination: crossContamination.trim() || null,
      })
      setCrossSaveStatus('saved')
      setTimeout(() => setCrossSaveStatus('idle'), 1500)
    })
  }

  return (
    <div className="space-y-5">
      {/* Effective contains-list */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-zinc-500" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Contains (FDA Big-9)
          </h3>
        </div>
        {effectiveAllergens.length === 0 ? (
          <div className="rounded-md border border-dashed border-emerald-200 bg-emerald-50/30 px-3 py-2 text-sm text-emerald-700">
            No Big-9 allergens detected in current ingredient slots.
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {effectiveAllergens.map((a) => {
              const override = overrides.find((o) => o.allergen === a && o.action === 'ADD')
              return (
                <span
                  key={a}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    override
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                  title={override ? `Manually added: ${override.reason}` : 'Auto-derived from ingredients'}
                >
                  {humanize(a)}
                  {override && ' ⚠'}
                </span>
              )
            })}
          </div>
        )}
        <p className="text-xs text-zinc-500">
          Auto-derived from your ingredient slots&apos; allergen flags. The contains-list
          prints on the FDA label.
        </p>
      </section>

      {/* Manual overrides */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-zinc-500" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Manual overrides ({overrides.length})
          </h3>
        </div>

        {overrides.length > 0 && (
          <ul className="space-y-1.5">
            {overrides.map((o) => (
              <li
                key={o.allergen}
                className="flex items-start justify-between gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium text-zinc-900">
                    {o.action === 'ADD' ? '+ Add ' : '− Remove '}
                    {humanize(o.allergen)}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">{o.reason}</div>
                </div>
                {isDraft && (
                  <button
                    type="button"
                    onClick={() => removeOverride(o.allergen)}
                    disabled={isPending}
                    className="text-zinc-400 hover:text-red-600"
                    aria-label="Remove override"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {isDraft && <AddOverrideForm autoDerived={autoDerived} onAdd={addOverride} />}
      </section>

      {/* Cross-contamination statement */}
      <section className="space-y-2">
        <Label className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Cross-contamination statement
        </Label>
        <p className="text-xs text-zinc-500">
          Optional statement printed on the label (e.g., shared facility warnings).
        </p>
        <textarea
          value={crossContamination}
          onChange={(e) => setCrossContamination(e.target.value)}
          onBlur={saveCrossContamination}
          rows={2}
          placeholder='e.g. "Manufactured in a facility that also processes peanuts and tree nuts."'
          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
          disabled={!isDraft || isPending}
        />
        {crossSaveStatus !== 'idle' && (
          <span className="text-xs text-emerald-600">
            {crossSaveStatus === 'saving' ? 'Saving…' : '✓ Saved'}
          </span>
        )}
      </section>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Add override sub-form
// -----------------------------------------------------------------------------

function AddOverrideForm({
  autoDerived,
  onAdd,
}: {
  autoDerived: string[]
  onAdd: (allergen: string, action: 'ADD' | 'REMOVE', reason: string) => void
}) {
  const [allergen, setAllergen] = useState<string>(BIG_9[0])
  const [action, setAction] = useState<'ADD' | 'REMOVE'>('ADD')
  const [reason, setReason] = useState('')

  const isInAutoDerived = autoDerived.includes(allergen)
  // Helpful default: if allergen is in auto-derived, default to REMOVE; if not, default to ADD.
  // We don't force this — partner can override.

  return (
    <div className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <div className="grid gap-2 sm:grid-cols-[140px,100px,1fr]">
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-zinc-500">Allergen</Label>
          <select
            value={allergen}
            onChange={(e) => setAllergen(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm focus:border-zinc-400 focus:outline-none"
          >
            {BIG_9.map((a) => (
              <option key={a} value={a}>
                {humanize(a)}
                {autoDerived.includes(a) ? ' (auto)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-zinc-500">Action</Label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as 'ADD' | 'REMOVE')}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm focus:border-zinc-400 focus:outline-none"
          >
            <option value="ADD">Add</option>
            <option value="REMOVE" disabled={!isInAutoDerived}>
              Remove {!isInAutoDerived ? '(not in auto)' : ''}
            </option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-zinc-500">Reason</Label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              action === 'ADD'
                ? 'e.g. shared facility with peanuts'
                : 'e.g. supplier changed; ingredient no longer contains this'
            }
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={() => {
            onAdd(allergen, action, reason)
            setReason('')
          }}
          disabled={!reason.trim()}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add override
        </Button>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function computeEffective(autoDerived: string[], overrides: ManualOverride[]): string[] {
  const set = new Set(autoDerived)
  for (const o of overrides) {
    if (o.action === 'ADD') set.add(o.allergen)
    if (o.action === 'REMOVE') set.delete(o.allergen)
  }
  return BIG_9.filter((a) => set.has(a))
}

function humanize(a: string): string {
  return a.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
