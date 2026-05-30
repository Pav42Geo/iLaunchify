'use client'

// REBUILD R15.d + R16.c-fix — reusable per-account tier + fee-override
// edit form.
//
// Used by both /tiers/creator/[id] and /tiers/partner/[id]. R15.d
// shipped this with `onChangeTier` / `onSaveOverride` closure props,
// but Next 15 rejects non-action functions across the server→client
// boundary (the closures themselves aren't `'use server'` marked even
// though they wrap server actions). The fix: import the four server
// actions directly here and branch on `audience` + `entityId`. Server
// actions can be imported from a client component because actions.ts
// is `'use server'` — Next stubs them as RPC calls.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import {
  CREATOR_TIER_STYLE,
  PARTNER_TIER_STYLE,
  tierPillStyle,
  type TierPalette,
} from './tier-style'
import {
  changeCreatorTier,
  changePartnerTier,
  setCreatorFeeOverride,
  setPartnerFeeOverride,
} from './actions'

interface Props {
  audience: 'CREATOR' | 'PARTNER'
  /** CreatorProfile.id when audience='CREATOR'; Partner.id otherwise. */
  entityId: string
  currentTier: string
  currentFeeOverrideBp: number | null
  currentFeeOverrideReason: string | null
  /** Where to send the user after they finish (typically back to the list). */
  backHref?: string
}

const CREATOR_TIERS = ['MAKER', 'BUILDER', 'AGENCY'] as const
const PARTNER_TIERS = ['VERIFIED', 'TRUSTED', 'PREMIER'] as const

export function AccountTierEditor({
  audience,
  entityId,
  currentTier,
  currentFeeOverrideBp,
  currentFeeOverrideReason,
  backHref,
}: Props) {
  const router = useRouter()
  const tiers = audience === 'CREATOR' ? CREATOR_TIERS : PARTNER_TIERS
  const palette =
    audience === 'CREATOR'
      ? CREATOR_TIER_STYLE
      : PARTNER_TIER_STYLE

  const [selectedTier, setSelectedTier] = useState(currentTier)
  const [tierReason, setTierReason] = useState('')
  const [overridePercent, setOverridePercent] = useState<string>(
    currentFeeOverrideBp != null ? (currentFeeOverrideBp / 100).toFixed(2) : '',
  )
  const [overrideReason, setOverrideReason] = useState(
    currentFeeOverrideReason ?? '',
  )
  const [savingTier, startTierSave] = useTransition()
  const [savingOverride, startOverrideSave] = useTransition()

  function commitTier() {
    if (selectedTier === currentTier) {
      toast.error('Pick a different tier first.')
      return
    }
    if (!tierReason.trim()) {
      toast.error('Reason is required.')
      return
    }
    startTierSave(async () => {
      const r =
        audience === 'CREATOR'
          ? await changeCreatorTier({
              creatorProfileId: entityId,
              newTier: selectedTier as 'MAKER' | 'BUILDER' | 'AGENCY',
              reason: tierReason.trim(),
            })
          : await changePartnerTier({
              partnerId: entityId,
              newTier: selectedTier as 'VERIFIED' | 'TRUSTED' | 'PREMIER',
              reason: tierReason.trim(),
            })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success('Tier updated · audit log written.')
      setTierReason('')
      router.refresh()
      if (backHref) router.push(backHref)
    })
  }

  function commitOverride(clear: boolean) {
    if (!overrideReason.trim()) {
      toast.error('Reason is required.')
      return
    }
    const bp = clear ? null : Math.round(parseFloat(overridePercent || '0') * 100)
    if (!clear && Number.isNaN(bp!)) {
      toast.error('Invalid percentage.')
      return
    }
    startOverrideSave(async () => {
      const r =
        audience === 'CREATOR'
          ? await setCreatorFeeOverride({
              creatorProfileId: entityId,
              overrideBp: bp,
              reason: overrideReason.trim(),
            })
          : await setPartnerFeeOverride({
              partnerId: entityId,
              overrideBp: bp,
              reason: overrideReason.trim(),
            })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(
        clear ? 'Fee override cleared · audit log written.' : 'Fee override saved · audit log written.',
      )
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* TIER */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500">
          Tier
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {tiers.map((t) => {
            const p = (palette as Record<string, TierPalette>)[t]!
            const isSelected = selectedTier === t
            return (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedTier(t)}
                className={
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-medium uppercase tracking-[0.04em] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 ' +
                  (isSelected ? 'ring-2 ring-pink-300' : '')
                }
                style={tierPillStyle(p)}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: p.dot }}
                />
                {p.label}
                {t === currentTier && (
                  <span className="ml-1 text-[10px] opacity-70">current</span>
                )}
              </button>
            )
          })}
        </div>

        <div className="mt-4">
          <label className="block text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500">
            Reason <span className="text-pink-600">*</span>
          </label>
          <textarea
            value={tierReason}
            onChange={(e) => setTierReason(e.target.value)}
            rows={3}
            placeholder={
              audience === 'CREATOR'
                ? 'e.g. Promoted after agency contract signed 2026-04-02.'
                : 'e.g. Promoted to Trusted — 25 orders + 92% on-time.'
            }
            className="mt-1 block w-full rounded-md border border-zinc-200 px-3 py-2 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
          <p className="mt-1 text-[11px] text-zinc-500">
            Required. Shown on the AuditLog row alongside the before/after tier.
          </p>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={commitTier}
            disabled={savingTier || selectedTier === currentTier}
            className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-[12px] font-semibold uppercase tracking-wider text-white hover:bg-black disabled:opacity-50"
          >
            {savingTier && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {savingTier ? 'Saving…' : 'Save tier · audit log'}
          </button>
        </div>
      </section>

      {/* FEE OVERRIDE */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500">
          Fee override
        </h2>
        <p className="mt-1 text-[12.5px] text-zinc-600">
          {audience === 'CREATOR'
            ? "Overrides the platform-fee % on this creator's production orders. Leave blank to use the plan-level rate."
            : "Overrides the commission % iLaunchify keeps on this partner's orders."}
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500">
              Rate (%)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={overridePercent}
              onChange={(e) => setOverridePercent(e.target.value)}
              placeholder="e.g. 9.50"
              className="mt-1 block w-32 rounded-md border border-zinc-200 px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
            />
          </div>
          <p className="pb-2 text-[12px] text-zinc-500">
            Applied to production order subtotal.
          </p>
        </div>

        <div className="mt-4">
          <label className="block text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500">
            Reason <span className="text-pink-600">*</span>
          </label>
          <textarea
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            rows={2}
            placeholder="Why this override? Will appear in the audit log."
            className="mt-1 block w-full rounded-md border border-zinc-200 px-3 py-2 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {currentFeeOverrideBp != null && (
            <button
              type="button"
              onClick={() => commitOverride(true)}
              disabled={savingOverride}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              Clear override
            </button>
          )}
          <button
            type="button"
            onClick={() => commitOverride(false)}
            disabled={savingOverride || !overridePercent.trim()}
            className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-[12px] font-semibold uppercase tracking-wider text-white hover:bg-black disabled:opacity-50"
          >
            {savingOverride && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {savingOverride ? 'Saving…' : 'Save override · audit log'}
          </button>
        </div>
      </section>
    </div>
  )
}
