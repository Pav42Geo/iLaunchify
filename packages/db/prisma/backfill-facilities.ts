// Facility Phase 1 backfill (Pavel 2026-07-08) — docs/FACILITY_MODEL_2026-07.md.
//
// Creates one PRIMARY Facility per existing partner from their current address,
// then points every facility-less PartnerService + PartnerCertificateInstance at
// it. After this, every current read still works (facilityId defaults to the
// primary). Idempotent: a partner that already has a facility is skipped.
//
// Run AFTER `pnpm db:push` + `pnpm db:generate`:
//   pnpm --filter @ilaunchify/db backfill:facilities

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Reuse the EXISTING PartnerFacility model (isDefault = primary; region = state).
  const partners = await prisma.partner.findMany({
    select: {
      id: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      facilities: { select: { id: true, isDefault: true } },
    },
  })

  let created = 0
  let skipped = 0
  let linkedServices = 0
  let linkedCerts = 0

  for (const p of partners) {
    let facilityId =
      p.facilities.find((f) => f.isDefault)?.id ?? p.facilities[0]?.id ?? null

    // No facility yet → create a default one, but only if we have the address
    // PartnerFacility requires (addressLine1/city/region/postalCode are NOT NULL).
    // Partners without an address just keep facility-less services (facilityId null)
    // until they add a facility in onboarding.
    if (!facilityId) {
      if (p.addressLine1 && p.city && p.state && p.postalCode) {
        const f = await prisma.partnerFacility.create({
          data: {
            partnerId: p.id,
            name: 'Primary facility',
            isDefault: true,
            addressLine1: p.addressLine1,
            addressLine2: p.addressLine2 ?? null,
            city: p.city,
            region: p.state,
            postalCode: p.postalCode,
            country: p.country ?? 'US',
          },
          select: { id: true },
        })
        facilityId = f.id
        created++
      } else {
        skipped++
        continue
      }
    }

    const s = await prisma.partnerService.updateMany({
      where: { partnerId: p.id, facilityId: null },
      data: { facilityId },
    })
    linkedServices += s.count

    const c = await prisma.partnerCertificateInstance.updateMany({
      where: { partnerId: p.id, facilityId: null },
      data: { facilityId },
    })
    linkedCerts += c.count
  }

  // eslint-disable-next-line no-console
  console.log(
    `Facilities backfill complete — created ${created} default PartnerFacilities across ${partners.length} partners (${skipped} skipped: no address yet); linked ${linkedServices} services + ${linkedCerts} cert instances.`,
  )
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
