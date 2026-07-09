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
  const partners = await prisma.partner.findMany({
    select: {
      id: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      facilities: { select: { id: true, isPrimary: true } },
    },
  })

  let created = 0
  let linkedServices = 0
  let linkedCerts = 0

  for (const p of partners) {
    let primaryId = p.facilities.find((f) => f.isPrimary)?.id ?? p.facilities[0]?.id ?? null

    if (!primaryId) {
      const f = await prisma.facility.create({
        data: {
          partnerId: p.id,
          name: 'Primary facility',
          isPrimary: true,
          addressLine1: p.addressLine1,
          addressLine2: p.addressLine2,
          city: p.city,
          state: p.state,
          postalCode: p.postalCode,
          country: p.country ?? 'US',
        },
        select: { id: true },
      })
      primaryId = f.id
      created++
    }

    const s = await prisma.partnerService.updateMany({
      where: { partnerId: p.id, facilityId: null },
      data: { facilityId: primaryId },
    })
    linkedServices += s.count

    const c = await prisma.partnerCertificateInstance.updateMany({
      where: { partnerId: p.id, facilityId: null },
      data: { facilityId: primaryId },
    })
    linkedCerts += c.count
  }

  // eslint-disable-next-line no-console
  console.log(
    `Facilities backfill complete — created ${created} primary facilities across ${partners.length} partners; linked ${linkedServices} services + ${linkedCerts} cert instances.`,
  )
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
