// Admin — Partner Nomination kill-switch (D7). BUILT DARK.
// docs/legal/NOMINATION_LIABILITY_D7_FRAMEWORK.md. Server-rendered: reads the
// flag via isNominationEnabled() and flips it through the audited
// setNominationEnabled() action (bound form buttons — no client component).
// The whole nomination feature stays dark while this is OFF; every nomination
// action checks isNominationEnabled() first. Do NOT enable until counsel signs
// off on the §6 liability allocation.

import { requireCapability } from '@ilaunchify/auth'
import { isNominationEnabled, listAllNominations } from '@ilaunchify/db'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { setNominationEnabled } from '../nomination-actions'
import {
  rejectNominationFromForm,
  forceUnpinNominationFromForm,
} from '../nomination-govern-actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Partner Nomination — Admin' }

const STATUS_PILL: Record<string, string> = {
  PENDING_ONBOARDING: 'border-ink-200 bg-ink-50 text-ink-600',
  PENDING_ACTIVATION: 'border-warning-200 bg-warning-50 text-warning-800',
  ACTIVE: 'border-success-200 bg-success-50 text-success-800',
  REJECTED: 'border-danger-200 bg-danger-50 text-danger-700',
  REVOKED: 'border-ink-200 bg-ink-100 text-ink-500',
}

function fmtDate(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : '—'
}

export default async function NominationSettingPage() {
  await requireCapability('platform:admin')
  const enabled = await isNominationEnabled()
  const nominations = await listAllNominations()

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Platform"
        title="Partner Nomination"
        description="Let creators and manufacturers direct a specific downstream partner (overriding automated rotation). This is a governed liability override — keep it OFF until counsel signs off on the partner agreement."
      />

      {/* Counsel gate — this is a legal-sensitive switch, not a normal feature flag. */}
      <div className="rounded-2xl border border-warning-200 bg-warning-50 p-4">
        <p className="text-[13px] font-semibold text-warning-800">⚠ Legal gate — D7</p>
        <p className="mt-1 max-w-2xl text-[13px] text-warning-800">
          Enabling nomination shifts a defined slice of liability onto the nominator
          for their directed choice. Do not turn this on in production until counsel
          has blessed §6 of the partner agreement and the nomination-responsibility
          terms. See <code className="rounded bg-white/60 px-1">docs/legal/NOMINATION_LIABILITY_D7_FRAMEWORK.md</code>.
        </p>
      </div>

      <div className="rounded-2xl border border-ink-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] font-semibold text-ink-700">Current state</span>
          <span
            className={
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-bold uppercase tracking-wide ' +
              (enabled
                ? 'border-success-200 bg-success-50 text-success-800'
                : 'border-ink-200 bg-ink-50 text-ink-500')
            }
          >
            {enabled ? '🟢 Enabled' : '⚫ Disabled — dark'}
          </span>
        </div>

        <p className="mt-3 max-w-2xl text-[13px] text-ink-600">
          {enabled
            ? 'Nomination actions are live. Nominators can pin a specific partner; every pin captures a consent record and audits. Governed reject/reroute and merit force-unpin still apply.'
            : 'All nomination actions no-op (they fail closed to this switch). The models, actions, and this console exist so the feature can be turned on the moment counsel clears it — no code deploy required.'}
        </p>

        <div className="mt-5 flex flex-wrap gap-3 border-t border-ink-100 pt-4">
          <form action={setNominationEnabled.bind(null, false)}>
            <button
              type="submit"
              disabled={!enabled}
              className={
                'rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ' +
                (!enabled
                  ? 'cursor-default border border-ink-200 bg-ink-50 text-ink-400'
                  : 'bg-ink-900 text-white hover:opacity-90')
              }
            >
              {!enabled ? '✓ Disabled (active)' : 'Disable (kill switch)'}
            </button>
          </form>
          <form action={setNominationEnabled.bind(null, true)}>
            <button
              type="submit"
              disabled={enabled}
              className={
                'rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ' +
                (enabled
                  ? 'cursor-default border border-ink-200 bg-ink-50 text-ink-400'
                  : 'bg-pink-500 text-white hover:opacity-90')
              }
            >
              {enabled ? '✓ Enabled (active)' : 'Enable nomination'}
            </button>
          </form>
        </div>
      </div>

      {/* Governance console — every nomination + the reject / force-unpin controls. */}
      <div className="rounded-2xl border border-ink-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-ink-800">
            Nominations <span className="text-ink-400">({nominations.length})</span>
          </h2>
          <span className="text-[12px] text-ink-500">newest 100 · governance always available</span>
        </div>

        {nominations.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-ink-200 bg-ink-50 px-4 py-8 text-center text-[13px] text-ink-500">
            No nominations yet. While the feature is dark, none can be created — this
            list fills once nomination is enabled and creators start directing partners.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-ink-200 text-[11px] uppercase tracking-wide text-ink-500">
                  <th className="py-2 pr-3 font-semibold">Nominated partner</th>
                  <th className="py-2 pr-3 font-semibold">Nominator</th>
                  <th className="py-2 pr-3 font-semibold">Leg</th>
                  <th className="py-2 pr-3 font-semibold">Visibility</th>
                  <th className="py-2 pr-3 font-semibold">Consent</th>
                  <th className="py-2 pr-3 font-semibold">Created</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 font-semibold">Governance</th>
                </tr>
              </thead>
              <tbody>
                {nominations.map((n) => {
                  const isPending =
                    n.status === 'PENDING_ONBOARDING' || n.status === 'PENDING_ACTIVATION'
                  const isActive = n.status === 'ACTIVE'
                  const actionable = isPending || isActive
                  return (
                    <tr key={n.id} className="border-b border-ink-100 align-top">
                      <td className="py-2.5 pr-3 font-medium text-ink-800">
                        {n.nominatedPartnerName ?? n.nominatedPartnerId.slice(0, 8)}
                      </td>
                      <td className="py-2.5 pr-3 text-ink-600">
                        {n.nominatorEmail ?? n.nominatorUserId.slice(0, 8)}
                      </td>
                      <td className="py-2.5 pr-3 text-ink-600">{n.serviceType ?? 'any'}</td>
                      <td className="py-2.5 pr-3 text-ink-600">
                        {n.visibility === 'PUBLIC' ? 'Public' : 'Private'}
                      </td>
                      <td className="py-2.5 pr-3 text-ink-600">
                        {n.consentAt ? `${fmtDate(n.consentAt)}${n.consentTermsVersion ? ` · ${n.consentTermsVersion}` : ''}` : '—'}
                      </td>
                      <td className="py-2.5 pr-3 text-ink-600">{fmtDate(n.createdAt)}</td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={
                            'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ' +
                            (STATUS_PILL[n.status] ?? 'border-ink-200 bg-ink-50 text-ink-600')
                          }
                        >
                          {n.status}
                        </span>
                      </td>
                      <td className="py-2.5">
                        {actionable ? (
                          <form className="flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              name="reason"
                              required
                              placeholder="Reason (required)"
                              className="w-44 rounded-lg border border-ink-200 px-2 py-1 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                            />
                            {isPending && (
                              <button
                                type="submit"
                                formAction={rejectNominationFromForm.bind(null, n.id)}
                                className="rounded-full bg-danger-600 px-3 py-1 text-[12px] font-semibold text-white hover:opacity-90"
                              >
                                Reject
                              </button>
                            )}
                            <button
                              type="submit"
                              formAction={forceUnpinNominationFromForm.bind(null, n.id)}
                              className="rounded-full bg-ink-900 px-3 py-1 text-[12px] font-semibold text-white hover:opacity-90"
                            >
                              {isActive ? 'Force-unpin' : 'Revoke'}
                            </button>
                          </form>
                        ) : (
                          <span className="text-[12px] text-ink-500">
                            {n.rejectedReason ? `“${n.rejectedReason}”` : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
