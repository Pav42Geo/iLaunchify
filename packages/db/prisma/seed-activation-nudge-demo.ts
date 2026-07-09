// Activation NUDGE demo partner — a partner who already GRADUATED to the full
// dashboard nav (sticky onboardingProgress.activationComplete = true), then had
// a NEW service added that isn't live yet. This is the exact case the dashboard
// "Finish setup →" nudge exists for: the partner keeps the full nav, so nothing
// funnels them to /activation, and the home-page nudge is their only prompt.
//
// Setup:
//   - MANUFACTURING service → LIVE: every step in its track + the shared tail is
//     marked complete, so it counts as a live (routing-eligible) service.
//   - WAREHOUSE service → PENDING: newly added, no steps done → not live.
//   → getPartnerActivationStatus: 2 services, 1 live → pendingActivationCount = 1
//     → the /dashboard nudge renders, with the FULL nav (activationComplete set).
//
// Contrast with seed-activation-demo (mid-activation, limited nav, /activation).
//
// IDEMPOTENT + RESETTABLE.
//
// Run:   pnpm --filter @ilaunchify/db seed:activation-nudge-demo
// Then:  http://localhost:3002/api/dev/login?email=activation-nudge-demo@ilaunchify.dev&callbackUrl=/dashboard

import { PrismaClient, UserRole } from '@prisma/client'

const prisma = new PrismaClient()

const EMAIL = 'activation-nudge-demo@ilaunchify.dev'
const COMPANY = 'Activation Nudge Demo Co'

const MFG_CAPS = { type: 'MANUFACTURING', categories: ['FOOD', 'SUPPLEMENT'], moqMin: 500 }
const WAREHOUSE_CAPS = { type: 'WAREHOUSE' } // minimal — the pending, not-yet-live service

// Keys that make MANUFACTURING live: its whole track + the shared tail.
// (Mirrors activation-tracks.ts — keep in sync if those keys ever change.)
const LIVE_MFG_KEYS = [
  'mfr.products',
  'mfr.specs',
  'mfr.moq',
  'shared.certs',
  'shared.pricing',
  'shared.review',
]

async function main() {
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {},
    create: {
      email: EMAIL,
      name: 'Activation Nudge Demo',
      role: UserRole.PARTNER,
      partner: {
        create: {
          companyName: COMPANY,
          legalName: `${COMPANY} LLC`,
          status: 'ACTIVE',
          country: 'US',
          leadSource: 'activation-nudge-demo-seed',
          // Sticky flag set → full nav (graduated); the added WAREHOUSE service
          // is what the nudge surfaces.
          onboardingProgress: { welcomeSeen: true, activationComplete: true },
          services: {
            create: [
              { type: 'MANUFACTURING', status: 'ACTIVE', disclosureLevel: 'ANONYMOUS', capabilities: MFG_CAPS },
              { type: 'WAREHOUSE', status: 'ACTIVE', disclosureLevel: 'ANONYMOUS', capabilities: WAREHOUSE_CAPS },
            ],
          },
        },
      },
    },
    include: { partner: { include: { services: true } } },
  })

  const partner = user.partner
  if (!partner) throw new Error('partner not created')

  // Reset to the intended state (idempotent re-run).
  await prisma.partner.update({
    where: { id: partner.id },
    data: { status: 'ACTIVE', onboardingProgress: { welcomeSeen: true, activationComplete: true } },
  })
  const byType = new Map(partner.services.map((s) => [s.type, s]))
  const mfg = byType.get('MANUFACTURING')
  const wh = byType.get('WAREHOUSE')
  if (mfg) await prisma.partnerService.update({ where: { id: mfg.id }, data: { status: 'ACTIVE', capabilities: MFG_CAPS } })
  if (wh) {
    // Ensure WAREHOUSE stays NOT live: minimal caps, no storage/capacity backing
    // data (fc.vas has no auto-detect, so it can never auto-complete anyway).
    await prisma.partnerService.update({
      where: { id: wh.id },
      data: { status: 'ACTIVE', capabilities: WAREHOUSE_CAPS, storageClasses: [], weeklyPalletCapacity: null },
    })
  }

  // Mark MANUFACTURING live: clear prior steps, then complete its full set.
  await prisma.partnerActivationStep.deleteMany({ where: { partnerId: partner.id } })
  await prisma.partnerActivationStep.createMany({
    data: LIVE_MFG_KEYS.map((stepKey) => ({ partnerId: partner.id, stepKey })),
    skipDuplicates: true,
  })

  console.log('\n✓ Activation nudge demo partner ready (ACTIVE, full nav, 1 pending service)\n')
  console.log(`  Company: ${COMPANY}`)
  console.log(`  Email:   ${EMAIL}`)
  console.log('  MANUFACTURING → live · WAREHOUSE → pending (newly added)')
  console.log('\nEyeball the dashboard nudge →')
  console.log('  1. Start the partner app (port 3002): pnpm dev')
  console.log(`  2. Open: http://localhost:3002/api/dev/login?email=${EMAIL}&callbackUrl=/dashboard`)
  console.log('     (full nav + a pink "Finish setup →" banner under the hero)')
  console.log('  Re-run this seed any time to reset.\n')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
