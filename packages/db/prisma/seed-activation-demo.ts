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
            create: [
              {
                type: 'MANUFACTURING',
                status: 'ACTIVE',
                disclosureLevel: 'ANONYMOUS',
                capabilities: MFG_CAPS,
              },
              {
                type: 'COPACKING',
                status: 'ACTIVE',
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
    if (mfg) {
      await prisma.partnerService.update({
        where: { id: mfg.id },
        data: { status: 'ACTIVE', capabilities: MFG_CAPS },
      })
    }
    if (copack) {
      await prisma.partnerService.update({
        where: { id: copack.id },
        data: { status: 'ACTIVE', capabilities: COPACK_CAPS },
      })
    }
  }

  console.log('\n✓ Activation demo partner ready (status: ACTIVE, mid-activation)\n')
  console.log(`  Company: ${COMPANY}`)
  console.log(`  Email:   ${EMAIL}`)
  console.log('  Services: MANUFACTURING + COPACKING (partial — neither live yet)')
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
