// Admin — Partner Nomination kill-switch (D7). BUILT DARK.
// docs/legal/NOMINATION_LIABILITY_D7_FRAMEWORK.md. Server-rendered: reads the
// flag via isNominationEnabled() and flips it through the audited
// setNominationEnabled() action (bound form buttons — no client component).
// The whole nomination feature stays dark while this is OFF; every nomination
// action checks isNominationEnabled() first. Do NOT enable until counsel signs
// off on the §6 liability allocation.

import { requireCapability } from '@ilaunchify/auth'
import { isNominationEnabled } from '@ilaunchify/db'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { setNominationEnabled } from '../nomination-actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Partner Nomination — Admin' }

export default async function NominationSettingPage() {
  await requireCapability('platform:admin')
  const enabled = await isNominationEnabled()

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
    </div>
  )
}
