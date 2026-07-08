// Partner Agreement — read + e-sign surface (server-rendered).
// docs/PARTNER_ONBOARDING_STRATEGY_2026-07.md §4. Renders the current
// PartnerAgreement text and signs it via the signAgreementFromForm server
// action (native form + required "I agree" checkbox — no client component).
// The richer scroll-gated / draw-signature modal is a client enhancement; this
// is the functional, verifiable baseline that persists a tamper-evident record.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { signAgreementFromForm } from '../agreement-actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Partner Agreement — iLaunchify' }

export default async function AgreementPage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!partner) return null

  const agreement = await prisma.partnerAgreement.findFirst({
    where: { isCurrent: true },
    orderBy: { effectiveAt: 'desc' },
    select: { id: true, version: true, title: true, bodyMarkdown: true },
  })

  const signature = agreement
    ? await prisma.partnerAgreementSignature.findUnique({
        where: {
          partnerId_agreementVersion: {
            partnerId: partner.id,
            agreementVersion: agreement.version,
          },
        },
        select: { signerName: true, signedAt: true, recordSha256: true },
      })
    : null

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-2">
      <div>
        <h1 className="font-display text-[24px] font-bold tracking-tight text-ink-900">
          {agreement?.title ?? 'Partner Agreement'}
        </h1>
        {agreement && (
          <p className="mt-1 text-[12.5px] text-ink-500">Version {agreement.version}</p>
        )}
      </div>

      {!agreement ? (
        <div className="rounded-2xl border border-ink-200 bg-ink-50 p-6 text-[13px] text-ink-600">
          No partner agreement is published yet. An admin needs to publish one before you can sign.
        </div>
      ) : (
        <>
          {/* Document */}
          <div className="max-h-[52vh] overflow-y-auto rounded-2xl border border-ink-200 bg-white p-6">
            {agreement.bodyMarkdown.split('\n').map((line, i) => {
              if (line.startsWith('## '))
                return (
                  <h3 key={i} className="mt-4 text-[14px] font-semibold text-ink-900">
                    {line.slice(3)}
                  </h3>
                )
              if (line.startsWith('# '))
                return (
                  <h2 key={i} className="font-display text-[17px] font-bold text-ink-900">
                    {line.slice(2)}
                  </h2>
                )
              if (!line.trim()) return null
              return (
                <p key={i} className="mt-1.5 text-[12.5px] leading-relaxed text-ink-700">
                  {line}
                </p>
              )
            })}
          </div>

          {signature ? (
            <div className="rounded-2xl border border-success-200 bg-success-50 p-5">
              <p className="text-[14px] font-semibold text-success-800">✓ Signed</p>
              <p className="mt-1 text-[12.5px] text-success-800">
                Signed by <b>{signature.signerName}</b> on{' '}
                {signature.signedAt.toISOString().slice(0, 10)}.
              </p>
              <p className="mt-2 font-mono text-[11px] text-success-800/80">
                Certificate hash: {signature.recordSha256.slice(0, 24)}…
              </p>
            </div>
          ) : (
            <form action={signAgreementFromForm} className="rounded-2xl border border-ink-200 bg-white p-5">
              <label className="flex items-start gap-2.5 text-[13px] text-ink-700">
                <input type="checkbox" name="agree" required className="mt-0.5 h-4 w-4 flex-none" />
                <span>
                  I have read and agree to the {agreement.title}, and I intend this to be my
                  electronic signature (legally binding under the U.S. ESIGN Act and UETA).
                </span>
              </label>

              <label className="mt-4 block text-[13px] font-semibold text-ink-900">
                Type your full legal name
              </label>
              <input
                type="text"
                name="signerName"
                required
                placeholder="e.g. Jane Q. Partner"
                className="mt-1.5 w-full rounded-xl border border-ink-200 px-3 py-2.5 text-[14px] text-ink-900 focus:border-pink-500 focus:outline-none"
              />

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="submit"
                  className="rounded-full bg-ink-900 px-5 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Sign &amp; submit
                </button>
                <span className="text-[11px] text-ink-400">
                  🕓 timestamp · 🌐 IP + device · # document hash — all recorded
                </span>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  )
}
