'use client'

// #140 — Per-row action chrome for the admin ingredient queue.
//
// Two actions surface inline on each row:
//   1. Verify    — quick path, single button, no extra fields. Flips
//                  SELF_ATTESTED → ADMIN_VERIFIED. Use when the row
//                  is bespoke enough to stay private but you trust the
//                  attestation.
//   2. Promote   — expanded form. Lets admin override label declaration
//                  name + compliance notes + bioengineered status, then
//                  creates a LIBRARY-source copy via promoteToLibrary.
//
// V1 pattern matches /admin/tiers row actions: useTransition for the
// pending state, window.alert for errors, router.refresh for success.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Check, Library, Sparkles } from 'lucide-react'
import { promoteToLibrary, verifyIngredient } from './actions'

type BioStatus =
  | 'NOT_APPLICABLE'
  | 'BIOENGINEERED'
  | 'DERIVED_FROM_BIOENGINEERED'

const BIO_LABELS: Record<BioStatus, string> = {
  NOT_APPLICABLE: 'Not applicable',
  BIOENGINEERED: 'Bioengineered',
  DERIVED_FROM_BIOENGINEERED: 'Derived from bioengineered',
}

interface Props {
  ingredientId: string
  internalName: string
  existingLabelDeclarationName: string | null
  existingBioengineeredStatus: BioStatus
}

export function IngredientRowActions({
  ingredientId,
  internalName,
  existingLabelDeclarationName,
  existingBioengineeredStatus,
}: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [expanded, setExpanded] = useState(false)
  const [labelName, setLabelName] = useState(
    existingLabelDeclarationName ?? internalName,
  )
  const [complianceNotes, setComplianceNotes] = useState('')
  const [bioStatus, setBioStatus] = useState<BioStatus>(
    existingBioengineeredStatus,
  )

  function handleVerify() {
    start(async () => {
      const res = await verifyIngredient({ ingredientId })
      if (!res.ok) {
        window.alert(res.error)
        return
      }
      router.refresh()
    })
  }

  function handlePromote() {
    start(async () => {
      const res = await promoteToLibrary({
        ingredientId,
        labelDeclarationName: labelName.trim() || undefined,
        complianceNotes: complianceNotes.trim() || undefined,
        bioengineeredStatus: bioStatus,
      })
      if (!res.ok) {
        window.alert(res.error)
        return
      }
      router.refresh()
    })
  }

  if (!expanded) {
    return (
      <div className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleVerify}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
          title="Mark ADMIN_VERIFIED — keeps the row private to its owning partner"
        >
          <Check className="h-3 w-3" />
          Verify
        </button>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-1 rounded-full bg-pink-600 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-pink-700"
          title="Copy this row into the shared Curated Library"
        >
          <Library className="h-3 w-3" />
          Promote
          <ChevronDown className="h-2.5 w-2.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="mt-1 w-[340px] space-y-2 rounded-lg border border-pink-200 bg-pink-50/40 p-3 text-left text-[11.5px]">
      <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-pink-700">
        <Sparkles className="h-3 w-3" />
        Promote to Curated Library
      </p>
      <p className="text-[10.5px] text-zinc-600">
        Creates a new LIBRARY row visible to every partner. The
        partner-private row stays as the provenance trail.
      </p>

      <label className="block">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-700">
          Label declaration name (FDA-printed)
        </span>
        <input
          type="text"
          value={labelName}
          onChange={(e) => setLabelName(e.target.value)}
          maxLength={120}
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-[12px]"
          placeholder="e.g. natural strawberry flavor"
        />
      </label>

      <label className="block">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-700">
          Compliance notes (optional)
        </span>
        <input
          type="text"
          value={complianceNotes}
          onChange={(e) => setComplianceNotes(e.target.value)}
          maxLength={400}
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-[12px]"
          placeholder="e.g. FDA class I nutrient"
        />
      </label>

      <label className="block">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-700">
          Bioengineered status
        </span>
        <select
          value={bioStatus}
          onChange={(e) => setBioStatus(e.target.value as BioStatus)}
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-[12px]"
        >
          {Object.entries(BIO_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => setExpanded(false)}
          disabled={pending}
          className="flex-1 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-700 hover:bg-zinc-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handlePromote}
          disabled={pending}
          className="flex-1 rounded-full bg-pink-600 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Promoting…' : 'Confirm promote'}
        </button>
      </div>
    </div>
  )
}
