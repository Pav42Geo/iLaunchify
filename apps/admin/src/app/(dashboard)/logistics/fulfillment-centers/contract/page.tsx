// Admin — Contract a new Fulfillment Center (Pavel 2026-07-13).
// The FC network is a curated, separately-contracted program (WAREHOUSE was
// removed from partner self-serve). Two paths:
//   A) EXISTING approved partner → record the contract ref and grant the
//      WAREHOUSE service (DRAFT → their Activation Setup track takes it live).
//   B) NEW 3PL company → invite them through the normal partner funnel first
//      (Leads), then return here once approved.

import Link from 'next/link'
import { ArrowLeft, FileSignature, UserPlus } from 'lucide-react'
import { requireCapability } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { ContractFcForm } from './ContractFcForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Contract new FC — Admin' }

export default async function ContractFcPage() {
  await requireCapability('platform:admin')

  // Eligible = any non-sanctioned partner without a WAREHOUSE service —
  // including invited/in-review 3PLs (pre-approval grant makes their
  // onboarding show the FC program; review + activation still gate go-live).
  const partners = await prisma.partner.findMany({
    where: {
      status: { notIn: ['SUSPENDED', 'TERMINATED', 'PAUSED'] },
      services: { none: { type: 'WAREHOUSE' } },
    },
    select: { id: true, companyName: true, city: true, state: true, status: true },
    orderBy: { companyName: 'asc' },
    take: 200,
  })

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Logistics · Network"
        title="Contract a new Fulfillment Center"
        description="Joining the FC network is a separately contracted program — receiving SLAs, multi-client liability, and network membership. Granting the WAREHOUSE service here is the contract's platform counterpart; the partner then takes it live through their Activation Setup track."
      />

      <Link
        href="/logistics/fulfillment-centers"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-500 hover:text-ink-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to the FC network
      </Link>

      {/* The contracting flow — mirrors how warehouse networks (Deliverr /
          Extensiv Fulfillment Marketplace / Fulfill.com) onboard 3PLs:
          apply → vet → contract → integrate → ramp → live w/ scorecards.
          Every stage maps to an existing platform surface. */}
      <div className="rounded-2xl border border-ink-200 bg-white p-6">
        <h2 className="mb-3 font-display text-[15px] font-bold text-ink-900">
          The FC contracting flow
        </h2>
        <ol className="grid gap-2.5 text-[13px] text-ink-700 lg:grid-cols-2">
          {(
            [
              ['1 · Apply / invite', 'The 3PL enters the normal partner funnel — invite via Leads, company identity captured.', '/leads', 'Leads'],
              ['2 · Vetting', 'Identity + operations review: legal entity, tenure, facility, FDA registration & food-safety certs, liability COI (expiry-tracked).', '/partners', 'Partner review'],
              ['3 · Contract', 'The signed 3PL network agreement — receiving SLAs, rate card, liability. Record its reference here and grant the WAREHOUSE service (below).', null, null],
              ['4 · Activation (integration)', 'The partner completes the WAREHOUSE Activation track: storage classes, capacity & geo, VAS + pick/pack fees. The partner app is their portal — dispatches, receiving, manifests.', null, null],
              ['5 · Ramp', 'Trial volume before full routing weight — dock-to-stock and accuracy proven on real orders.', '/partners/ramp', 'Partner ramp'],
              ['6 · Live + scorecards', 'Enters the FC selector; nightly risk features + performance scorecards govern standing (and offboarding).', '/logistics/fulfillment-centers', 'FC network'],
            ] as const
          ).map(([t, d, href, label]) => (
            <li key={t} className="flex gap-2.5 rounded-xl border border-ink-100 bg-ink-50/50 px-3.5 py-3">
              <div>
                <div className="font-semibold text-ink-900">{t}</div>
                <div className="mt-0.5 text-[12px] leading-[1.55] text-ink-600">
                  {d}
                  {href && (
                    <>
                      {' '}
                      <Link href={href} className="font-semibold text-pink-700 underline underline-offset-2">
                        {label} →
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
        {/* Path A — existing approved partner */}
        <div className="rounded-2xl border border-ink-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-pink-50 text-pink-700">
              <FileSignature className="h-[18px] w-[18px]" />
            </span>
            <div>
              <h2 className="font-display text-[16px] font-bold text-ink-900">
                Grant the WAREHOUSE service
              </h2>
              <p className="text-[12px] text-ink-500">
                To an existing approved partner, under a recorded contract.
              </p>
            </div>
          </div>
          {partners.length === 0 ? (
            <p className="rounded-xl border border-dashed border-ink-300 px-4 py-6 text-center text-[13px] text-ink-500">
              No eligible partners — every approved partner already runs a WAREHOUSE service, or
              none are approved yet.
            </p>
          ) : (
            <ContractFcForm
              partners={partners.map((p) => ({
                id: p.id,
                label: `${p.companyName}${p.city ? ` — ${p.city}${p.state ? `, ${p.state}` : ''}` : ''}${
                  p.status === 'ACTIVE' || p.status === 'INTEGRATION_ENHANCED'
                    ? ''
                    : ` · ${p.status.replace(/_/g, ' ').toLowerCase()}`
                }`,
              }))}
            />
          )}
        </div>

        {/* Path B — new 3PL company */}
        <aside className="rounded-2xl border border-ink-200 bg-white p-6">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-ink-100 text-ink-600">
              <UserPlus className="h-[18px] w-[18px]" />
            </span>
            <h3 className="font-display text-[15px] font-bold text-ink-900">New 3PL company?</h3>
          </div>
          <p className="text-[12.5px] leading-[1.6] text-ink-600">
            Invite them via Leads, then return here and grant the WAREHOUSE service{' '}
            <b>right away</b> — the grant is what makes their onboarding show the FC program
            (Fulfillment appears as a contracted, locked service; it&rsquo;s never
            self-selectable). Identity + operations review and the Activation track still gate
            go-live.
          </p>
          <Link
            href="/leads"
            className="mt-4 inline-flex items-center rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
          >
            Open Leads →
          </Link>
        </aside>
      </div>
    </div>
  )
}
