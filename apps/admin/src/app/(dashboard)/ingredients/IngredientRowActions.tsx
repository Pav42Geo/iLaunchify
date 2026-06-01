'use client'

// Per-row action chrome for the admin ingredient queue (v2 advanced surface).
//
// Uses the platform RowActionsMenu primitive (Pavel 2026-06-01).
// Standard items:
//   • Review               — opens audit log filtered to this ingredient
//   • Verify (SELF_ATTESTED → ADMIN_VERIFIED)
//   • Promote to library   — opens a modal-ish prompt for label name + bio
//   • Flag                 — currently a placeholder (schema has no FLAGGED
//                            status today; logs an audit row instead)
//   • More submenu         — Copy internal name / Copy ID + audit deep link
//
// Promote intentionally uses the existing inline expanded-form pattern from
// the old component, hosted inside a small details disclosure beneath the
// menu trigger so the rich form (label name + compliance notes + bio status)
// still works without re-implementing it as a Radix dialog.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Eye,
  Check,
  Library,
  Sparkles,
  Copy,
  ExternalLink,
  AlertTriangle,
  X,
} from 'lucide-react'
import type { VerificationStatus, IngredientSource } from '@ilaunchify/db'
import {
  RowActionsMenu,
  RowActionItem,
  RowActionSeparator,
  RowActionSubMenu,
  RowActionLabel,
} from '@ilaunchify/ui'
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
  source: IngredientSource | null
  status: VerificationStatus
}

export function IngredientRowActions({
  ingredientId,
  internalName,
  existingLabelDeclarationName,
  existingBioengineeredStatus,
  source,
  status,
}: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [promoteOpen, setPromoteOpen] = useState(false)
  const [labelName, setLabelName] = useState(existingLabelDeclarationName ?? internalName)
  const [complianceNotes, setComplianceNotes] = useState('')
  const [bioStatus, setBioStatus] = useState<BioStatus>(existingBioengineeredStatus)

  const canVerify = status === 'SELF_ATTESTED'
  const canPromote = source === 'PARTNER_PRIVATE'

  function copyToClipboard(value: string, what: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(value).then(
        () => undefined,
        () => window.prompt(`Copy ${what}:`, value),
      )
    } else {
      window.prompt(`Copy ${what}:`, value)
    }
  }

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

  function handlePromoteConfirm() {
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
      setPromoteOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="relative inline-block">
      <RowActionsMenu label={`Actions for ${internalName}`}>
        <RowActionLabel>{internalName}</RowActionLabel>
        <RowActionItem
          href={`/audit?entityType=Ingredient&entityId=${ingredientId}`}
          icon={Eye}
        >
          Review history
        </RowActionItem>

        <RowActionSeparator />

        {canVerify && (
          <RowActionItem onSelect={handleVerify} icon={Check} disabled={pending}>
            {pending ? 'Verifying…' : 'Verify'}
          </RowActionItem>
        )}
        {canPromote && (
          <RowActionItem
            onSelect={() => setPromoteOpen(true)}
            icon={Library}
            disabled={pending}
          >
            Promote to library
          </RowActionItem>
        )}
        <RowActionItem
          onSelect={() =>
            window.alert(
              'Flagging not yet wired — schema has no FLAGGED status today. Use Review history to file a manual note.',
            )
          }
          icon={AlertTriangle}
          danger
        >
          Flag for review
        </RowActionItem>

        <RowActionSeparator />

        <RowActionSubMenu label="More" icon={Sparkles}>
          <RowActionItem
            onSelect={() => copyToClipboard(internalName, 'internal name')}
            icon={Copy}
          >
            Copy internal name
          </RowActionItem>
          <RowActionItem
            onSelect={() => copyToClipboard(ingredientId, 'ID')}
            icon={Copy}
          >
            Copy ID
          </RowActionItem>
          <RowActionSeparator />
          <RowActionItem
            href={`/audit?entityType=Ingredient&entityId=${ingredientId}`}
            icon={ExternalLink}
          >
            View in audit log
          </RowActionItem>
        </RowActionSubMenu>
      </RowActionsMenu>

      {promoteOpen && (
        <div className="absolute right-0 top-9 z-40 w-[340px] space-y-2 rounded-lg border border-pink-200 bg-white p-3 text-left text-[11.5px] shadow-lg">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-pink-700">
              <Sparkles className="h-3 w-3" />
              Promote to Curated Library
            </p>
            <button
              type="button"
              onClick={() => setPromoteOpen(false)}
              className="rounded-full p-0.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
              aria-label="Close promote form"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-[10.5px] text-ink-600">
            Creates a new LIBRARY row visible to every partner. The partner-private row stays as the provenance trail.
          </p>

          <label className="block">
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-700">
              Label declaration name (FDA-printed)
            </span>
            <input
              type="text"
              value={labelName}
              onChange={(e) => setLabelName(e.target.value)}
              maxLength={120}
              className="mt-1 block w-full rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12px]"
              placeholder="e.g. natural strawberry flavor"
            />
          </label>

          <label className="block">
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-700">
              Compliance notes (optional)
            </span>
            <input
              type="text"
              value={complianceNotes}
              onChange={(e) => setComplianceNotes(e.target.value)}
              maxLength={400}
              className="mt-1 block w-full rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12px]"
              placeholder="e.g. FDA class I nutrient"
            />
          </label>

          <label className="block">
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-700">
              Bioengineered status
            </span>
            <select
              value={bioStatus}
              onChange={(e) => setBioStatus(e.target.value as BioStatus)}
              className="mt-1 block w-full rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12px]"
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
              onClick={() => setPromoteOpen(false)}
              disabled={pending}
              className="flex-1 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-700 hover:bg-ink-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePromoteConfirm}
              disabled={pending}
              className="flex-1 rounded-full bg-pink-600 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? 'Promoting…' : 'Confirm promote'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
