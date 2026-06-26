'use client'

// Compact tier editor for the right rail on the partner detail page.
// Renders the current PartnerTier as a pill + a dropdown popover with the
// three tier options. Per the marketplace decisions memo 2026-06-01:
// the tier has NO behavioral binding in V1 — this is display + admin
// override only. Audit-logged via setPartnerTier.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronDown, Loader2 } from 'lucide-react'
import { setPartnerTier } from './actions'
import { PARTNER_TIER_STYLE, tierPillStyle } from '../../tiers/tier-style'

type Tier = 'VERIFIED' | 'TRUSTED' | 'PREMIER'

const TIERS: Tier[] = ['VERIFIED', 'TRUSTED', 'PREMIER']

interface Props {
  partnerId: string
  currentTier: Tier
  tierChangedAt: Date | null
}

export function PartnerTierPill({ partnerId, currentTier, tierChangedAt }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()
  const palette = PARTNER_TIER_STYLE[currentTier]

  function pick(toTier: Tier) {
    if (toTier === currentTier) {
      setOpen(false)
      return
    }
    startTransition(async () => {
      const r = await setPartnerTier({
        partnerId,
        toTier,
        reason: reason.trim() || undefined,
      })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(`Tier set to ${PARTNER_TIER_STYLE[toTier].label} · audit logged`)
      setReason('')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[11px] font-semibold uppercase tracking-wider"
          style={tierPillStyle(palette)}
        >
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: palette.dot }}
          />
          {palette.label}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-medium text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
          aria-expanded={open}
        >
          Change
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>

      {tierChangedAt && (
        <p className="text-[10.5px] text-ink-500">
          Since {new Date(tierChangedAt).toLocaleDateString()}
        </p>
      )}
      <p className="text-[10.5px] leading-snug text-ink-500">
        Tier is informational only in V1 — no behavioral binding. Display rank for marketplace ordering may follow.
      </p>

      {open && (
        <div className="space-y-3 rounded-lg border border-ink-200 bg-ink-50 p-3">
          <div className="flex flex-wrap gap-1.5">
            {TIERS.map((t) => {
              const p = PARTNER_TIER_STYLE[t]
              const isCurrent = t === currentTier
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => pick(t)}
                  disabled={pending}
                  className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 disabled:opacity-50"
                  style={tierPillStyle(p)}
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: p.dot }}
                  />
                  {p.label}
                  {isCurrent && <span className="ml-1 opacity-60">current</span>}
                </button>
              )
            })}
          </div>
          <div>
            <label
              htmlFor="tier-reason"
              className="block text-[12px] font-bold uppercase tracking-wider text-ink-700"
            >
              Reason (optional, audit-logged)
            </label>
            <textarea
              id="tier-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={pending}
              placeholder='e.g. "12 orders shipped on time."'
              className="mt-1 block w-full rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12px] focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-300"
            />
          </div>
          {pending && (
            <p className="inline-flex items-center gap-1 text-[11px] text-ink-500">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving…
            </p>
          )}
        </div>
      )}
    </div>
  )
}
