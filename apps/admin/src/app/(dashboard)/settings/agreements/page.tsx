// Admin — Partner Agreements + signatures (read-only compliance view).
// docs/PARTNER_ONBOARDING_STRATEGY_2026-07.md §4. Shows published agreement
// versions and the tamper-evident signature records (who signed what, when, +
// the certificate hash) so legal/ops can verify e-signatures. Read-only.

import { requireCapability } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { AdminPageHeader } from '@/components/AdminPageHeader'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Partner Agreements — Admin' }

export default async function AgreementsPage() {
  await requireCapability('platform:admin')

  const agreements = await prisma.partnerAgreement.findMany({
    orderBy: { effectiveAt: 'desc' },
    select: {
      id: true,
      version: true,
      title: true,
      isCurrent: true,
      effectiveAt: true,
      _count: { select: { signatures: true } },
    },
  })

  const signatures = await prisma.partnerAgreementSignature.findMany({
    orderBy: { signedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      signerName: true,
      signerEmail: true,
      agreementVersion: true,
      method: true,
      signedAt: true,
      recordSha256: true,
      partner: { select: { companyName: true } },
    },
  })

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Platform · Legal"
        title="Partner Agreements"
        description="Published agreement versions and the tamper-evident e-signature records (ESIGN/UETA). Read-only — publish/edit the agreement text via the seed/config; signatures are immutable."
      />

      {/* Versions */}
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <header className="border-b border-ink-100 bg-[var(--bg-hero)] px-4 py-2.5">
          <h2 className="font-display text-[14px] font-semibold text-ink-900">Versions</h2>
        </header>
        {agreements.length === 0 ? (
          <p className="px-4 py-4 text-[13px] text-ink-500">
            No agreement published yet. Seed one: <code>pnpm --filter @ilaunchify/db seed:partner-agreement</code>
          </p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500">
                <th className="px-4 py-2 font-semibold">Version</th>
                <th className="px-4 py-2 font-semibold">Title</th>
                <th className="px-4 py-2 font-semibold">Effective</th>
                <th className="px-4 py-2 font-semibold">Signatures</th>
                <th className="px-4 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {agreements.map((a) => (
                <tr key={a.id} className="border-t border-ink-100">
                  <td className="px-4 py-2.5 font-mono text-ink-900">{a.version}</td>
                  <td className="px-4 py-2.5 text-ink-700">{a.title}</td>
                  <td className="px-4 py-2.5 text-ink-600">{a.effectiveAt.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-2.5 text-ink-900">{a._count.signatures}</td>
                  <td className="px-4 py-2.5">
                    {a.isCurrent ? (
                      <span className="rounded-full border border-success-200 bg-success-50 px-2 py-[2px] text-[11px] font-semibold text-success-800">
                        Current
                      </span>
                    ) : (
                      <span className="rounded-full border border-ink-200 bg-ink-100 px-2 py-[2px] text-[11px] font-semibold text-ink-600">
                        Archived
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent signatures */}
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <header className="border-b border-ink-100 bg-[var(--bg-hero)] px-4 py-2.5">
          <h2 className="font-display text-[14px] font-semibold text-ink-900">Recent signatures</h2>
        </header>
        {signatures.length === 0 ? (
          <p className="px-4 py-4 text-[13px] text-ink-500">No signatures recorded yet.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500">
                <th className="px-4 py-2 font-semibold">Partner</th>
                <th className="px-4 py-2 font-semibold">Signer</th>
                <th className="px-4 py-2 font-semibold">Version</th>
                <th className="px-4 py-2 font-semibold">Signed</th>
                <th className="px-4 py-2 font-semibold">Certificate hash</th>
              </tr>
            </thead>
            <tbody>
              {signatures.map((s) => (
                <tr key={s.id} className="border-t border-ink-100">
                  <td className="px-4 py-2.5 text-ink-900">{s.partner?.companyName ?? '—'}</td>
                  <td className="px-4 py-2.5 text-ink-700">
                    {s.signerName}
                    <span className="block text-[11px] text-ink-400">{s.signerEmail}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-ink-700">{s.agreementVersion}</td>
                  <td className="px-4 py-2.5 text-ink-600">{s.signedAt.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-ink-500">
                    {s.recordSha256.slice(0, 20)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
