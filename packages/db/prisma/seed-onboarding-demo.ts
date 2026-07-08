// Onboarding demo partner — a fresh manufacturer parked at the START of
// onboarding so you can walk the partner onboarding UI yourself.
//
// Why this exists: the main-seed `sample-manufacturer@ilaunchify.dev` is
// hardcoded status ACTIVE, so the onboarding layout immediately redirects it to
// /dashboard (apps/partner/.../(onboarding)/layout.tsx: `if ACTIVE redirect`).
// This seed makes a partner in INVITED status with a mostly-empty profile, so:
//   1. first login flips INVITED → IN_PROGRESS (real invite handshake)
//   2. the /onboarding accordion renders empty for you to fill
//   3. submitting advances to IDENTITY_PENDING_REVIEW (the canonical new path)
//
// IDEMPOTENT + RESETTABLE: re-running resets this partner to INVITED with a
// clean profile, so you can re-walk onboarding as many times as you like.
//
// Run:   pnpm --filter @ilaunchify/db seed:onboarding-demo
// Then:  http://localhost:3002/api/dev/login?email=onboarding-demo@ilaunchify.dev&callbackUrl=/onboarding

import { PrismaClient, UserRole } from '@prisma/client'

const prisma = new PrismaClient()

const EMAIL = 'onboarding-demo@ilaunchify.dev'
const COMPANY = 'Onboarding Demo Co'

async function main() {
  // Create the User + Partner + one draft MANUFACTURING service if absent.
  // Mirrors the public-apply genesis shape (partners/apply/actions.ts) so the
  // profile is intentionally minimal — the point is to fill it via the UI.
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {}, // never clobber an existing user row
    create: {
      email: EMAIL,
      name: 'Onboarding Demo',
      role: UserRole.PARTNER,
      partner: {
        create: {
          companyName: COMPANY,
          legalName: `${COMPANY} LLC`,
          status: 'INVITED',
          country: 'US',
          leadSource: 'onboarding-demo-seed',
          services: {
            create: {
              type: 'MANUFACTURING',
              status: 'DRAFT',
              disclosureLevel: 'ANONYMOUS',
              capabilities: { type: 'MANUFACTURING' }, // empty stub — filled during onboarding
            },
          },
        },
      },
    },
    include: { partner: { include: { services: true } } },
  })

  // Reset to the onboarding START (idempotent re-run): status back to INVITED
  // and clear the address/contact a previous walkthrough may have saved so the
  // accordion opens empty again. Only nullable scalar fields — safe to null.
  const partner = user.partner
  if (partner) {
    await prisma.partner.update({
      where: { id: partner.id },
      data: {
        status: 'INVITED',
        statusChangedAt: null,
        statusChangedById: null,
        statusChangeReason: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        state: null,
        postalCode: null,
        contactPhone: null,
        websiteUrl: null,
      },
    })
  }

  console.log('\n✓ Onboarding demo partner ready (status: INVITED)\n')
  console.log(`  Company: ${COMPANY}`)
  console.log(`  Email:   ${EMAIL}`)
  console.log('\nWalk onboarding →')
  console.log('  1. Start the partner app (port 3002): pnpm dev')
  console.log(`  2. Open: http://localhost:3002/api/dev/login?email=${EMAIL}&callbackUrl=/onboarding`)
  console.log('     (first load flips INVITED → IN_PROGRESS, then the accordion renders)')
  console.log('  3. Fill the 4 sections and Submit → status becomes IDENTITY_PENDING_REVIEW')
  console.log('  Re-run this seed any time to reset back to the start.\n')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
