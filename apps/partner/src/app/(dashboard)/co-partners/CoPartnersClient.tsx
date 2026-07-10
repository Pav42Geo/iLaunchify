'use client'

import { useState, useTransition } from 'react'
import { addCoPartnerByEmail, revokeNomination } from './actions'
import { NOMINATION_TERMS_VERSION, NOMINATION_CONSENT_POINTS } from './nomination-terms'

type Leg = 'COPACKING' | 'LABEL_PRINTING'
const LEG_LABEL: Record<Leg, string> = {
  COPACKING: 'Co-packing',
  LABEL_PRINTING: 'Packaging printing',
}
const STATUS_LABEL: Record<string, string> = {
  PENDING_ONBOARDING: 'Invited — onboarding',
  PENDING_ACTIVATION: 'Onboarding — activating',
  ACTIVE: 'Active co-partner',
  REJECTED: 'Rejected',
  REVOKED: 'Removed',
}
const STATUS_PILL: Record<string, string> = {
  PENDING_ONBOARDING: 'border-ink-200 bg-ink-50 text-ink-600',
  PENDING_ACTIVATION: 'border-warning-200 bg-warning-50 text-warning-800',
  ACTIVE: 'border-success-200 bg-success-50 text-success-800',
}

export type CoPartnerRow = {
  id: string
  nominatedPartnerName: string | null
  serviceType: string | null
  status: string
  createdAt: string
}

export function CoPartnersClient({
  nominations,
  nominatableLegs,
}: {
  nominations: CoPartnerRow[]
  nominatableLegs: Leg[]
}) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [contactName, setContactName] = useState('')
  const [legs, setLegs] = useState<Leg[]>([])
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function toggleLeg(l: Leg) {
    setLegs((cur) => (cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l]))
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await addCoPartnerByEmail({
        email,
        companyName,
        contactName,
        serviceTypes: legs,
        acceptedTermsVersion: NOMINATION_TERMS_VERSION,
      })
      if (!res.ok) setError(res.error)
      else {
        setOpen(false)
        setEmail('')
        setCompanyName('')
        setContactName('')
        setLegs([])
        setConsent(false)
      }
    })
  }

  function revoke(id: string) {
    setError(null)
    startTransition(async () => {
      const res = await revokeNomination(id)
      if (!res.ok) setError(res.error)
    })
  }

  const canSubmit = email.trim() && legs.length > 0 && consent && !pending

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[14px] font-semibold text-ink-800">
          Your co-partners <span className="text-ink-400">({nominations.length})</span>
        </h2>
        {nominatableLegs.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setError(null)
              setOpen(true)
            }}
            className="rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
          >
            + Add a co-partner
          </button>
        )}
      </div>

      {nominatableLegs.length === 0 && (
        <p className="mt-3 rounded-xl border border-ink-100 bg-ink-50 px-4 py-3 text-[13px] text-ink-600">
          You already offer printing and co-packing yourself, so there’s no leg to sub out. Co-partners
          are for legs you don’t service in-house.
        </p>
      )}

      {error && !open && (
        <p className="mt-3 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-[12px] text-danger-700">
          {error}
        </p>
      )}

      {nominations.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-ink-200 bg-ink-50 px-4 py-8 text-center text-[13px] text-ink-500">
          No co-partners yet. Add a print or co-packing partner you want to work with directly — they’ll
          serve your orders for that leg without going through rotation.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-ink-200 text-[11px] uppercase tracking-wide text-ink-500">
                <th className="py-2 pr-3 font-semibold">Partner</th>
                <th className="py-2 pr-3 font-semibold">Leg</th>
                <th className="py-2 pr-3 font-semibold">Added</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {nominations.map((n) => (
                <tr key={n.id} className="border-b border-ink-100">
                  <td className="py-2.5 pr-3 font-medium text-ink-800">
                    {n.nominatedPartnerName ?? '—'}
                  </td>
                  <td className="py-2.5 pr-3 text-ink-600">
                    {n.serviceType ? (LEG_LABEL[n.serviceType as Leg] ?? n.serviceType) : 'Any'}
                  </td>
                  <td className="py-2.5 pr-3 text-ink-600">{n.createdAt.slice(0, 10)}</td>
                  <td className="py-2.5 pr-3">
                    <span
                      className={
                        'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ' +
                        (STATUS_PILL[n.status] ?? 'border-ink-200 bg-ink-50 text-ink-600')
                      }
                    >
                      {STATUS_LABEL[n.status] ?? n.status}
                    </span>
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => revoke(n.id)}
                      disabled={pending}
                      className="text-[12px] font-semibold text-ink-500 hover:text-danger-700 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-ink-200 bg-white p-6 shadow-xl">
            <h3 className="font-display text-[18px] font-bold text-ink-900">Add a co-partner</h3>
            <p className="mt-1 text-[13px] text-ink-600">
              Enter their email. If they’re already on iLaunchify we’ll nominate them; if not, we’ll
              email them an invitation to onboard.
            </p>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-[12px] font-semibold text-ink-700">Their email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="partner@company.com"
                  className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[12px] font-semibold text-ink-700">Company</span>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Acme Printing"
                    className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                  />
                </label>
                <label className="block">
                  <span className="text-[12px] font-semibold text-ink-700">Contact name</span>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Jane Doe"
                    className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                  />
                </label>
              </div>
              <p className="text-[11px] text-ink-400">
                Company and contact are only used if they’re new to iLaunchify.
              </p>

              <div>
                <span className="text-[12px] font-semibold text-ink-700">For which service?</span>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {nominatableLegs.map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => toggleLeg(l)}
                      className={
                        'rounded-full border px-3 py-1.5 text-[12px] font-semibold ' +
                        (legs.includes(l)
                          ? 'border-pink-500 bg-pink-50 text-pink-700'
                          : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50')
                      }
                    >
                      {legs.includes(l) ? '✓ ' : ''}
                      {LEG_LABEL[l]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-ink-100 bg-ink-50 p-3">
                <p className="text-[12px] font-semibold text-ink-700">Before you nominate:</p>
                <ul className="mt-1.5 space-y-1">
                  {NOMINATION_CONSENT_POINTS.map((pt) => (
                    <li key={pt} className="flex gap-1.5 text-[12px] text-ink-600">
                      <span aria-hidden="true" className="text-pink-600">
                        •
                      </span>
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
                <label className="mt-2 flex items-start gap-2 text-[12px] text-ink-800">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-pink-600"
                  />
                  <span>I understand and accept responsibility for this nomination.</span>
                </label>
              </div>
            </div>

            {error && (
              <p className="mt-3 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-[12px] text-danger-700">
                {error}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-full border border-ink-300 bg-white px-4 py-2 text-[13px] font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className="rounded-full bg-pink-600 px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-40"
              >
                {pending ? 'Adding…' : 'Add co-partner'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
