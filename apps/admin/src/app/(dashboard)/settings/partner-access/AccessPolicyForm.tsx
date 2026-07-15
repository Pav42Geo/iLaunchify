'use client'

// Global Partner Access & Opportunity policy editor (Policy tab).
// design/partner-access-admin-prototype.html → "Global policy" view.
// Master switches + Group A / Group B defaults every partner inherits.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Switch } from '@ilaunchify/ui'
import type { PartnerAccessPolicyValues } from '@ilaunchify/db'
import { setPartnerAccessPolicy } from '../partner-access-actions'

type Bool = {
  [K in keyof PartnerAccessPolicyValues]: PartnerAccessPolicyValues[K] extends boolean ? K : never
}[keyof PartnerAccessPolicyValues]

function Row({
  title,
  desc,
  children,
}: {
  title: string
  desc: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-ink-100 py-3 last:border-b-0">
      <div>
        <div className="text-[13px] font-semibold text-ink-900">{title}</div>
        <div className="mt-0.5 text-[11.5px] text-ink-500">{desc}</div>
      </div>
      {children}
    </div>
  )
}

const selectCls =
  'rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-ink-900 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20'

export function AccessPolicyForm({ initial }: { initial: PartnerAccessPolicyValues }) {
  const [v, setV] = useState<PartnerAccessPolicyValues>(initial)
  const [dirty, setDirty] = useState(false)
  const [pending, start] = useTransition()

  function patch(p: Partial<PartnerAccessPolicyValues>) {
    setV((s) => ({ ...s, ...p }))
    setDirty(true)
  }
  const toggle = (k: Bool) => (e: React.ChangeEvent<HTMLInputElement>) =>
    patch({ [k]: e.target.checked } as Partial<PartnerAccessPolicyValues>)

  function save() {
    start(async () => {
      const r = await setPartnerAccessPolicy(v)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success('Partner access policy saved.')
      setDirty(false)
    })
  }

  return (
    <div className="space-y-4">
      {/* Master switches */}
      <div className="rounded-2xl border border-ink-200 bg-white p-5">
        <div className="flex items-center gap-2 font-display text-[15px] font-bold text-ink-900">
          Master switches
        </div>
        <p className="mb-3 mt-1 text-[12.5px] text-ink-500">
          Platform-wide kill switches. Off wins over any per-partner “Allow” — a hard stop.
        </p>
        <Row
          title="Public partner profiles"
          desc="Master enable for all public profiles & sharing."
        >
          <Switch
            checked={v.publicProfilesEnabled}
            onChange={toggle('publicProfilesEnabled')}
            aria-label="Public partner profiles"
          />
        </Row>
        <Row
          title="Marketplace discoverability"
          desc="Master enable for search listing."
        >
          <Switch
            checked={v.discoverabilityEnabled}
            onChange={toggle('discoverabilityEnabled')}
            aria-label="Marketplace discoverability"
          />
        </Row>
      </div>

      {/* Group A — identity & disclosure defaults */}
      <div className="rounded-2xl border border-ink-200 bg-white p-5">
        <div className="font-display text-[15px] font-bold text-ink-900">
          Identity &amp; disclosure defaults
        </div>
        <p className="mb-3 mt-1 text-[12.5px] text-ink-500">
          Group A defaults new partners inherit.
        </p>
        <Row
          title="New-partner visibility default"
          desc="Seeds a brand-new partner's own choice. Partners who publish control their own visibility — this does NOT gate them; use a per-partner DENY to restrict for cause."
        >
          <select
            className={selectCls}
            value={v.defaultProfileVisibility}
            onChange={(e) =>
              patch({ defaultProfileVisibility: e.target.value as PartnerAccessPolicyValues['defaultProfileVisibility'] })
            }
          >
            <option value="invited">Invited only</option>
            <option value="public">Public</option>
            <option value="off">Off</option>
          </select>
        </Row>
        <Row title="Named reviews audience" desc="Who sees real client names on reviews.">
          <select
            className={selectCls}
            value={v.namedReviewsAudience}
            onChange={(e) =>
              patch({ namedReviewsAudience: e.target.value as PartnerAccessPolicyValues['namedReviewsAudience'] })
            }
          >
            <option value="paid">Paid creators only</option>
            <option value="any">Any logged-in</option>
            <option value="anonymous">Anonymous always</option>
          </select>
        </Row>
        <Row
          title="Tier to see identity in context"
          desc="PDP name + link + named reviews (not the profile page)."
        >
          <select
            className={selectCls}
            value={v.minCreatorTierForIdentity}
            onChange={(e) =>
              patch({ minCreatorTierForIdentity: e.target.value as PartnerAccessPolicyValues['minCreatorTierForIdentity'] })
            }
          >
            <option value="maker">All creators</option>
            <option value="builder">Builder &amp; Agency</option>
            <option value="agency">Agency only</option>
          </select>
        </Row>
        <Row title="Profile sharing" desc="Share button on by default.">
          <Switch
            checked={v.defaultProfileSharing}
            onChange={toggle('defaultProfileSharing')}
            aria-label="Profile sharing default"
          />
        </Row>
      </div>

      {/* Group B — marketplace opportunity defaults */}
      <div className="rounded-2xl border border-ink-200 bg-white p-5">
        <div className="font-display text-[15px] font-bold text-ink-900">
          Marketplace opportunity defaults
        </div>
        <p className="mb-3 mt-1 text-[12.5px] text-ink-500">Group B defaults for new partners.</p>
        <Row title="Creator brief intake" desc="Eligible for the Brief pool.">
          <Switch checked={v.defaultBriefIntake} onChange={toggle('defaultBriefIntake')} aria-label="Brief intake default" />
        </Row>
        <Row title="Discoverable in marketplace" desc="Listed in search.">
          <Switch checked={v.defaultDiscoverable} onChange={toggle('defaultDiscoverable')} aria-label="Discoverable default" />
        </Row>
        <Row
          title="Print rotation"
          desc="Public pure printers are in the rotation pool by default. Restrict a specific printer with a per-partner DENY on their Access tab (drives excludeFromAutoRotation) — this default is not a gate."
        >
          <Switch checked={v.defaultPrintRotation} onChange={toggle('defaultPrintRotation')} aria-label="Print rotation default" />
        </Row>
        <Row title="Sample order intake" desc="Accept samples.">
          <Switch checked={v.defaultSampleIntake} onChange={toggle('defaultSampleIntake')} aria-label="Sample intake default" />
        </Row>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || pending}
          className={
            'rounded-full px-5 py-2.5 text-[13px] font-semibold transition-colors ' +
            (!dirty || pending
              ? 'cursor-default border border-ink-200 bg-ink-50 text-ink-400'
              : 'bg-ink-900 text-white hover:bg-black')
          }
        >
          {pending ? 'Saving…' : 'Save policy'}
        </button>
        {dirty && !pending && <span className="text-[12px] text-ink-500">Unsaved changes</span>}
      </div>
    </div>
  )
}
