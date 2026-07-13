// Brand → Legal identity (label) — the responsible-party firm + place of
// business for the 21 CFR 101.5 signature line (Pavel 2026-07-12).
// "Manufactured for / Distributed by [Brand], City, ST ZIP" on every label —
// this page captures the company identity that line composes from. The
// per-product CHOICE of line (brand vs "Manufactured by [Partner]") lives in
// the Design Studio's label drawer.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requireUser } from '@ilaunchify/auth'
import { prisma, getActiveMarketCountries } from '@ilaunchify/db'
import { LegalIdentityForm } from './LegalIdentityForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Legal identity — Brand' }

export default async function BrandLegalPage({
  params,
}: {
  params: Promise<{ brandId: string }>
}) {
  const { brandId } = await params
  const user = await requireUser()
  const brand = await prisma.brand.findFirst({
    where: { id: brandId, creatorProfile: { userId: user.id } },
    select: {
      id: true,
      name: true,
      legalName: true,
      legalAddressLine1: true,
      legalAddressLine2: true,
      legalCity: true,
      legalState: true,
      legalPostalCode: true,
      legalCountry: true,
    },
  })
  if (!brand) notFound()

  const countries = await getActiveMarketCountries()

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <Link
          href={`/brands/${brand.id}`}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-500 hover:text-ink-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {brand.name}
        </Link>
        <h1 className="mt-2 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Legal identity for labels
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          FDA rules (21 CFR 101.5) require every label to name a responsible firm and its place of
          business — your company address, not a factory. This is what prints as
          &ldquo;Manufactured for&rdquo; or &ldquo;Distributed by&rdquo; {brand.name} in the Design
          Studio.
        </p>
      </div>

      <LegalIdentityForm
        brandId={brand.id}
        brandName={brand.name}
        countries={countries}
        initial={{
          legalName: brand.legalName ?? '',
          legalAddressLine1: brand.legalAddressLine1 ?? '',
          legalAddressLine2: brand.legalAddressLine2 ?? '',
          legalCity: brand.legalCity ?? '',
          legalState: brand.legalState ?? '',
          legalPostalCode: brand.legalPostalCode ?? '',
          legalCountry: brand.legalCountry || 'US',
        }}
      />
    </div>
  )
}
