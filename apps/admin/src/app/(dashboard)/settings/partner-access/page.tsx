// Admin: Partner Access & Opportunity console.
// docs/PARTNER_ACCESS_ADMIN_CONTROLS_2026-07-14.md (Policy tab) + the legacy
// private↔public signup-mode toggle (docs/PARTNER_ONBOARDING_STRATEGY_2026-07.md
// §7), now folded in as a section of the Policy tab. Two tabs: Policy | Partners
// (the bulk Access list lands in the next increment).

import Link from 'next/link'
import { requireCapability } from '@ilaunchify/auth'
import {
  getPartnerAccessMode,
  getPartnerAccessPolicy,
  listPartnerAccessRequests,
} from '@ilaunchify/db'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { setPartnerAccessMode } from '../partner-access-actions'
import { AccessPolicyForm } from './AccessPolicyForm'
import { PartnersAccessTable } from './PartnersAccessTable'
import { RequestsQueue } from './RequestsQueue'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Partner Access (Admin)' }

type TabKey = 'policy' | 'partners' | 'requests'
const TABS = [
  { key: 'policy', label: 'Policy' },
  { key: 'partners', label: 'Partners' },
  { key: 'requests', label: 'Requests' },
] as const

export default async function PartnerAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>
}) {
  await requireCapability('platform:admin')
  const { tab: rawTab, page: rawPage } = await searchParams
  const tab: TabKey =
    rawTab === 'partners' ? 'partners' : rawTab === 'requests' ? 'requests' : 'policy'
  const pageNum = Math.max(1, Number.parseInt(rawPage ?? '1', 10) || 1)
  const [mode, policy, requests] = await Promise.all([
    getPartnerAccessMode(),
    getPartnerAccessPolicy(),
    tab === 'requests' ? listPartnerAccessRequests({ take: 100 }) : Promise.resolve([]),
  ])
  const isPrivate = mode === 'PRIVATE'

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Platform"
        title="Partner Access & Opportunities"
        description="Global defaults and master switches that govern partner disclosure, sharing, and marketplace opportunities. Per-partner overrides live on each partner’s detail page; approval requests live in the Inbox."
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-ink-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/settings/partner-access?tab=${t.key}`}
            className={
              'border-b-[2.5px] px-3 py-2.5 text-[13px] font-semibold transition-colors ' +
              (tab === t.key
                ? 'border-pink-500 text-pink-700'
                : 'border-transparent text-ink-500 hover:text-ink-900')
            }
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === 'policy' ? (
        <div className="space-y-4">
          {/* Network signup mode (legacy toggle, folded in) */}
          <div className="rounded-2xl border border-ink-200 bg-white p-5">
            <div className="font-display text-[15px] font-bold text-ink-900">Network signup mode</div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="text-[13px] font-semibold text-ink-700">Current mode</span>
              <span
                className={
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-bold uppercase tracking-wide ' +
                  (isPrivate
                    ? 'border-pink-200 bg-pink-50 text-pink-700'
                    : 'border-success-200 bg-success-50 text-success-800')
                }
              >
                {isPrivate ? '🔒 Private (invite-only)' : '🌐 Public (open signup)'}
              </span>
            </div>
            <p className="mt-3 max-w-2xl text-[13px] text-ink-600">
              {isPrivate
                ? 'New partners can only join by admin invitation. The public form collects a Lead (in /admin/leads); nobody self-provisions. CTAs read “Become a partner”.'
                : 'Anyone can sign up and start onboarding directly. CTAs read “Sign up”. Consider keeping this private until the network is curated.'}
            </p>
            <div className="mt-5 flex flex-wrap gap-3 border-t border-ink-100 pt-4">
              <form action={setPartnerAccessMode.bind(null, 'PRIVATE')}>
                <button
                  type="submit"
                  disabled={isPrivate}
                  className={
                    'rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ' +
                    (isPrivate
                      ? 'cursor-default border border-ink-200 bg-ink-50 text-ink-400'
                      : 'bg-ink-900 text-white hover:opacity-90')
                  }
                >
                  {isPrivate ? '✓ Private (active)' : 'Switch to Private'}
                </button>
              </form>
              <form action={setPartnerAccessMode.bind(null, 'PUBLIC')}>
                <button
                  type="submit"
                  disabled={!isPrivate}
                  className={
                    'rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ' +
                    (!isPrivate
                      ? 'cursor-default border border-ink-200 bg-ink-50 text-ink-400'
                      : 'bg-pink-500 text-white hover:opacity-90')
                  }
                >
                  {!isPrivate ? '✓ Public (active)' : 'Switch to Public'}
                </button>
              </form>
            </div>
          </div>

          {/* Global access & opportunity policy */}
          <AccessPolicyForm initial={policy} />
        </div>
      ) : tab === 'partners' ? (
        <PartnersAccessTable policy={policy} page={pageNum} />
      ) : (
        <RequestsQueue rows={requests} />
      )}
    </div>
  )
}
