// Activation demo partner — an APPROVED (ACTIVE) manufacturer + co-packer parked
// mid-Activation-Setup, so you can eyeball the /activation page and its real
// in-progress state (and the limited "in-profile" nav).
//
// Why this exists: /activation lives in the (dashboard) route group, whose
// layout only admits ACTIVE / INTEGRATION_ENHANCED partners — every pre-submit
// status (LEAD/DRAFT/INVITED/IN_PROGRESS) is redirected to /onboarding. So the
// onboarding-demo account (status INVITED) can never reach /activation. This
// seed makes a partner that IS approved but hasn't finished activation:
//   - MANUFACTURING + COPACKING services with partial capability data, so a few
//     steps auto-complete (products, MOQ, pack formats) but the rest are still
//     pending → neither service is "live" → the activation checklist has work
//     left, and resolveActivationLimited() shows the limited nav.
//
// IDEMPOTENT + RESETTABLE: re-running resets this partner to the mid-activation
// state (clears any manual step completions + the sticky activationComplete
// flag), so you can re-walk activation as many times as you like.
//
// Run:   pnpm --filter @ilaunchify/db seed:activation-demo
// Then:  http://localhost:3002/api/dev/login?email=activation-demo@ilaunchify.dev&callbackUrl=/activation

import { PrismaClient, UserRole } from '@prisma/client'

const prisma = new PrismaClient()

const EMAIL = 'activation-demo@ilaunchify.dev'
const COMPANY = 'Activation Demo Co'

// Partial capabilities: enough to auto-complete a couple steps so the checklist
// looks realistically half-done, but not enough for any service to go live.
const MFG_CAPS = { type: 'MANUFACTURING', categories: ['FOOD', 'SUPPLEMENT'], moqMin: 500 }
const COPACK_CAPS = {
  type: 'COPACKING',
  containerFormats: ['BOTTLE', 'POUCH'], // ContainerCategory
  packagingFormats: ['SINGLE_UNIT', 'MULTI_UNIT_SAME'], // StructuralPackType
}

async function main() {
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {}, // never clobber an existing user row
    create: {
      email: EMAIL,
      name: 'Activation Demo',
      role: UserRole.PARTNER,
      partner: {
        create: {
          companyName: COMPANY,
          legalName: `${COMPANY} LLC`,
          status: 'ACTIVE',
          country: 'US',
          leadSource: 'activation-demo-seed',
          onboardingProgress: { welcomeSeen: true }, // no activationComplete → stays mid-activation
          services: {
            // DRAFT = the true mid-activation state (D8 flips DRAFT→ACTIVE at
            // go-live; an ACTIVE service now COUNTS as live in
            // getPartnerActivationStatus — Pavel 2026-07-12).
            create: [
              {
                type: 'MANUFACTURING',
                status: 'DRAFT',
                disclosureLevel: 'ANONYMOUS',
                capabilities: MFG_CAPS,
              },
              {
                type: 'COPACKING',
                status: 'DRAFT',
                disclosureLevel: 'ANONYMOUS',
                capabilities: COPACK_CAPS,
              },
            ],
          },
        },
      },
    },
    include: { partner: { include: { services: true } } },
  })

  const partner = user.partner
  if (partner) {
    // Reset to the mid-activation START (idempotent re-run): re-assert ACTIVE,
    // restore the partial capabilities, and clear anything a previous walk left
    // (manual step completions + the sticky activationComplete flag) so the
    // checklist opens with work remaining again.
    await prisma.partner.update({
      where: { id: partner.id },
      data: { status: 'ACTIVE', onboardingProgress: { welcomeSeen: true } },
    })
    await prisma.partnerActivationStep.deleteMany({ where: { partnerId: partner.id } })

    const byType = new Map(partner.services.map((s) => [s.type, s]))
    const mfg = byType.get('MANUFACTURING')
    const copack = byType.get('COPACKING')
    // Reset services to DRAFT (mid-activation) — ACTIVE services now count as
    // LIVE in the activation resolver, so a previous walk that flipped them
    // must be undone for the demo to restart (activationCompletedAt cleared too).
    if (mfg) {
      await prisma.partnerService.update({
        where: { id: mfg.id },
        data: { status: 'DRAFT', capabilities: MFG_CAPS, activationCompletedAt: null },
      })
    }
    if (copack) {
      await prisma.partnerService.update({
        where: { id: copack.id },
        data: { status: 'DRAFT', capabilities: COPACK_CAPS, activationCompletedAt: null },
      })
    }

    // ------------------------------------------------------------------------
    // FULL APPLICATION RECORD (Pavel 2026-07-12) — everything the read-only
    // /my-application "Onboarding record" renders: review-journey dates,
    // verified sections (+ an admin note), compliance files (one with a
    // near-term expiry so the renewal-warning row shows), contact/address,
    // and two facilities. Idempotent: dates re-anchor to "now" on each run.
    // ------------------------------------------------------------------------
    const DAY = 24 * 60 * 60 * 1000
    const appliedAt = new Date(Date.now() - 28 * DAY)
    const submittedAt = new Date(Date.now() - 24 * DAY)
    const identityVerifiedAt = new Date(Date.now() - 18 * DAY)
    const opsVerifiedAt = new Date(Date.now() - 12 * DAY)
    const approvedAt = new Date(Date.now() - 4 * DAY)

    await prisma.partner.update({
      where: { id: partner.id },
      data: {
        createdAt: appliedAt, // timeline "Applied"
        activatedAt: approvedAt, // timeline "Approved"
        statusChangedAt: approvedAt,
        websiteUrl: 'https://activation-demo.example.com',
        contactPhone: '+1 (503) 555-0142',
        addressLine1: '1420 NW Industrial Way',
        city: 'Portland',
        state: 'OR',
        postalCode: '97209',
        country: 'US',
      },
    })

    // Verification sections — one row per (partner, type), all VERIFIED, with
    // createdAt = submission date (feeds the timeline "Submitted" step) and an
    // admin note on DOCUMENTS. Upserted on the [partnerId, type] unique.
    const sections = [
      { type: 'BUSINESS', verifiedAt: identityVerifiedAt, adminNotes: null },
      { type: 'FACILITY', verifiedAt: opsVerifiedAt, adminNotes: null },
      {
        type: 'DOCUMENTS',
        verifiedAt: opsVerifiedAt,
        adminNotes:
          'Insurance certificate approved. Please keep coverage continuous — an expired GL policy suspends routing until the renewal is verified.',
      },
      { type: 'PUBLIC_PROFILE', verifiedAt: opsVerifiedAt, adminNotes: null },
    ] as const
    for (const s of sections) {
      await prisma.partnerVerificationSection.upsert({
        where: { partnerId_type: { partnerId: partner.id, type: s.type } },
        create: {
          partnerId: partner.id,
          type: s.type,
          status: 'VERIFIED',
          verifiedAt: s.verifiedAt,
          adminNotes: s.adminNotes,
          createdAt: submittedAt,
        },
        update: { status: 'VERIFIED', verifiedAt: s.verifiedAt, adminNotes: s.adminNotes, createdAt: submittedAt },
      })
    }

    // Compliance files — display-only records (fake R2 keys; the record view
    // never links them). GL insurance expires in 22 days → warning row + Renew CTA.
    await prisma.partnerFile.deleteMany({
      where: { partnerId: partner.id, r2Key: { startsWith: 'demo/activation-demo/' } },
    })
    await prisma.partnerFile.createMany({
      data: [
        {
          partnerId: partner.id,
          sectionType: 'DOCUMENTS',
          kind: 'CERT_OF_INCORPORATION',
          r2Key: `demo/activation-demo/incorporation-${partner.id}.pdf`,
          originalFilename: 'incorporation.pdf',
          contentType: 'application/pdf',
          sizeBytes: 182_044,
          uploadedById: user.id,
          uploadedAt: submittedAt,
        },
        {
          partnerId: partner.id,
          sectionType: 'DOCUMENTS',
          kind: 'BUSINESS_LICENSE',
          r2Key: `demo/activation-demo/business-license-${partner.id}.pdf`,
          originalFilename: 'business-license.pdf',
          contentType: 'application/pdf',
          sizeBytes: 96_310,
          uploadedById: user.id,
          uploadedAt: submittedAt,
        },
        {
          partnerId: partner.id,
          sectionType: 'DOCUMENTS',
          kind: 'INSURANCE',
          r2Key: `demo/activation-demo/gl-insurance-${partner.id}.pdf`,
          originalFilename: 'gl-insurance-2026.pdf',
          contentType: 'application/pdf',
          sizeBytes: 240_775,
          uploadedById: user.id,
          uploadedAt: submittedAt,
          issuedAt: new Date(Date.now() - 340 * DAY),
          expiresAt: new Date(Date.now() + 22 * DAY), // → "Renewal due" warning row
        },
      ],
    })

    // Facilities — primary Portland plant + secondary Reno fulfillment site.
    await prisma.partnerFacility.deleteMany({ where: { partnerId: partner.id } })
    await prisma.partnerFacility.createMany({
      data: [
        {
          partnerId: partner.id,
          name: 'Plant A — Portland',
          addressLine1: '1420 NW Industrial Way',
          city: 'Portland',
          region: 'OR',
          postalCode: '97209',
          country: 'US',
          isDefault: true,
        },
        {
          partnerId: partner.id,
          name: 'Plant B — Reno',
          addressLine1: '790 Sparks Blvd',
          city: 'Reno',
          region: 'NV',
          postalCode: '89434',
          country: 'US',
          isDefault: false,
        },
      ],
    })
  }

  console.log('\n✓ Activation demo partner ready (status: ACTIVE, mid-activation)\n')
  console.log(`  Company: ${COMPANY}`)
  console.log(`  Email:   ${EMAIL}`)
  console.log('  Services: MANUFACTURING + COPACKING (partial — neither live yet)')
  console.log('  Application record: 4 VERIFIED sections + admin note, 3 compliance files')
  console.log('  (GL insurance expires in 22 days → renewal warning), 2 facilities,')
  console.log('  full review timeline (applied 28d ago → approved 4d ago).')
  console.log('  → /my-application renders the read-only Onboarding record in full.')
  console.log('\nEyeball the activation flow →')
  console.log('  1. Start the partner app (port 3002): pnpm dev')
  console.log(`  2. Open: http://localhost:3002/api/dev/login?email=${EMAIL}&callbackUrl=/activation`)
  console.log('     (ACTIVE + not-all-live → limited "in-profile" nav + the activation checklist)')
  console.log('  Re-run this seed any time to reset back to mid-activation.\n')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
