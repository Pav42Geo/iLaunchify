// V1 seed for Partner 5-layer onboarding foundation rows.
// Idempotent — re-running is safe (upserts on natural keys).
//
// Seeds:
//   - 1 PlatformMandatedStandards row: v1.0 (platform-wide rules every partner inherits)
//   - 1 ContractTerms row: STANDARD_V1.0 ACTIVE (the contract every partner signs in V1;
//     per-partner overrides land V1.5+ via PartnerCommercialTerms.contractOverrideId)
//
// Spec: docs/PARTNER_ONBOARDING.md §2.5 (failure responsibility matrix)
//                                 §2.4 (Layer 3 standards)

import { PrismaClient, ContractStatus, PricingModel, InvoiceCycle } from '@prisma/client'

// -----------------------------------------------------------------------------
// PLATFORM MANDATED STANDARDS v1.0 — applies to every partner
// -----------------------------------------------------------------------------

const PLATFORM_STANDARDS_V1_ESCALATION_PATH = {
  tiers: [
    { level: 1, role: 'admin', name: 'iLaunchify operations admin', responseTimeBusinessHours: 4 },
    { level: 2, role: 'admin', name: 'iLaunchify senior operations admin', responseTimeBusinessHours: 24 },
    { level: 3, role: 'legal', name: 'iLaunchify legal team', responseTimeBusinessHours: 72 },
  ],
}

// -----------------------------------------------------------------------------
// STANDARD CONTRACT v1.0 — failure responsibility matrix per docs/PARTNER_ONBOARDING.md §2.5
// Every partner agrees to these terms during onboarding. Per-partner overrides
// are reserved for V1.5+ via the contractOverrideId nullable FK on
// PartnerCommercialTerms.
// -----------------------------------------------------------------------------

const STANDARD_V1_FAILURE_RESPONSIBILITY = {
  failedProductionBatch_partnerError: {
    payer: 'partner',
    description:
      'Failed production batch due to partner error (wrong recipe, missed spec). Partner re-runs at their own cost; creator is not charged for the failed run.',
  },
  failedProductionBatch_creatorError: {
    payer: 'creator',
    description:
      'Failed production batch due to creator-supplied error (wrong spec provided). Creator pays; partner is reimbursed for materials + labor at standard rate.',
  },
  damagedPackagingInTransit: {
    payer: 'ilaunchify_mediated',
    description:
      'Damage during shipping. iLaunchify files carrier claim; creator made whole; partner not penalized.',
  },
  postDeliveryQualityIssue: {
    payer: 'investigated',
    description:
      'Quality issue raised within the 14-day dispute window. iLaunchify investigates: if partner fault, partner pays remake; if material fault, iLaunchify mediates with supplier; if creator misuse, creator absorbs.',
  },
  reformulationRequest_creatorInitiated: {
    payer: 'creator',
    description:
      'Creator-initiated reformulation after order accepted. Creator pays full re-run cost plus restock fee on retired ingredients.',
  },
  expiredIngredientLiability: {
    payer: 'partner',
    description: 'Partner is responsible for inventory dating and quality at production time.',
  },
  cancelledOrder_creatorInitiated: {
    payer: 'creator',
    description:
      'Creator-initiated cancellation post-acceptance. Creator pays for materials already procured + 50% of labor allocation.',
  },
  cancelledOrder_partnerInitiated: {
    payer: 'partner',
    description:
      'Partner-initiated cancellation post-acceptance. Partner pays creator a reasonable replacement-sourcing premium.',
  },
}

const STANDARD_V1_PAYMENT_TERMS = {
  supportedMethods: ['STRIPE_CONNECT', 'ACH'],
  defaultMethod: 'STRIPE_CONNECT',
  payoutTimingDaysMin: 1,
  payoutTimingDaysMax: 30,
  payoutTimingDaysDefault: 7,
  notes:
    'V1 default Stripe Connect Express. ACH supported by special request through admin. WIRE deferred to V1.5+.',
}

const STANDARD_V1_DISPUTE_POLICY = {
  windowDays: 14,
  raisedBy: ['creator', 'partner'],
  escalation: 'See PlatformMandatedStandards.escalationPath for tier sequence.',
  arbitrationProvider: null,
  governingLaw: 'TBD (subject to legal review before V1 launch)',
}

// -----------------------------------------------------------------------------
// Main seed function
// -----------------------------------------------------------------------------

export async function seedPartnerOnboarding(prisma: PrismaClient) {
  console.log('Seeding partner onboarding foundation (PlatformMandatedStandards + STANDARD_V1.0 contract)...')

  // --- PlatformMandatedStandards v1.0 ---
  await prisma.platformMandatedStandards.upsert({
    where: { version: 'v1.0' },
    update: {},
    create: {
      version: 'v1.0',
      acceptedArtworkFormats: ['AI', 'PDF', 'SVG', 'PSD'],
      versioningRule: 'every_change_new_version',
      disputeResolutionWindowDays: 14,
      escalationPath: PLATFORM_STANDARDS_V1_ESCALATION_PATH,
      effectiveFrom: new Date('2026-06-01'),
    },
  })

  // --- ContractTerms: STANDARD_V1.0 ---
  await prisma.contractTerms.upsert({
    where: { version: 'STANDARD_V1.0' },
    update: {},
    create: {
      version: 'STANDARD_V1.0',
      name: 'iLaunchify Standard Partner Agreement V1.0',
      description:
        'Default partner agreement for V1 launch. All partners agree to these baseline terms during onboarding. Per-partner side agreements are reserved for V1.5+ (via PartnerCommercialTerms.contractOverrideId) and require admin negotiation + legal review.',
      status: ContractStatus.ACTIVE,
      failureResponsibility: STANDARD_V1_FAILURE_RESPONSIBILITY,
      paymentTerms: STANDARD_V1_PAYMENT_TERMS,
      pricingModelOptions: [PricingModel.FIXED, PricingModel.QUOTE_BASED, PricingModel.VOLUME_TIERED],
      invoiceCycleOptions: [InvoiceCycle.PER_ORDER, InvoiceCycle.WEEKLY, InvoiceCycle.MONTHLY],
      disputePolicy: STANDARD_V1_DISPUTE_POLICY,
      effectiveFrom: new Date('2026-06-01'),
      pdfFileId: null, // Lawyer-reviewed PDF generated separately and attached before launch (see PARTNER_ONBOARDING.md §10 open item 3)
    },
  })

  console.log('Partner onboarding foundation seeded: PlatformMandatedStandards v1.0 + ContractTerms STANDARD_V1.0.')
}
