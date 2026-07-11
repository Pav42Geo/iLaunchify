// V1 seed for the TicketCategory library.
// Idempotent — safe to re-run.
//
// 10 starter categories cover the workflows surfaced in
// docs/SUPPORT_TICKETING_PLAN.md §2.2. Admin can add more via
// /admin/support/categories CRUD once that surface ships (task W2-SUP3).
//
// SLA windows that should differ from the priority default are encoded
// per-category. URGENT-priority categories (order-issue,
// dispatch-deadline, payment-payout, account-billing) need tighter
// first-response windows than the global MEDIUM default.

import { PrismaClient, TicketPriority } from '@prisma/client'

type StarterCategory = {
  slug: string
  name: string
  description: string
  defaultPriority: TicketPriority
  slaResponseMinutes?: number
  slaResolveMinutes?: number
  sortOrder: number
}

const STARTER_CATEGORIES: StarterCategory[] = [
  {
    slug: 'order-issue',
    name: 'Order issue',
    description:
      'Production order stuck, missing dispatch update, ETA slipped, wrong quantity produced, damaged in transit.',
    defaultPriority: TicketPriority.HIGH,
    slaResponseMinutes: 240, // 4h
    slaResolveMinutes: 1440, // 24h
    sortOrder: 10,
  },
  {
    slug: 'dispatch-deadline',
    name: 'Dispatch deadline',
    description:
      'Partner-reported dispatch deadline confusion, acceptance window about to lapse, deadline negotiation.',
    defaultPriority: TicketPriority.URGENT,
    slaResponseMinutes: 60, // 1h
    slaResolveMinutes: 480, // 8h
    sortOrder: 20,
  },
  {
    slug: 'payment-payout',
    name: 'Payment / payout',
    description:
      'Payment declined unexpectedly, payout missing or delayed, Stripe Connect issue, refund dispute.',
    defaultPriority: TicketPriority.HIGH,
    slaResponseMinutes: 240, // 4h
    slaResolveMinutes: 1440, // 24h
    sortOrder: 30,
  },
  {
    slug: 'account-billing',
    name: 'Account / billing',
    description:
      'Subscription tier upgrade/downgrade failed, double-charged, plan change confusion, cancel / restart.',
    defaultPriority: TicketPriority.HIGH,
    slaResponseMinutes: 240, // 4h
    slaResolveMinutes: 1440, // 24h
    sortOrder: 40,
  },
  {
    slug: 'product-approval',
    name: 'Product approval',
    description:
      'Question on an admin product-review decision, request changes to an approved template, compliance-checklist disagreement.',
    defaultPriority: TicketPriority.MEDIUM,
    sortOrder: 50,
  },
  {
    slug: 'partner-verification',
    name: 'Partner verification',
    description:
      'Onboarding section returned with changes, document upload not accepted, activation timing question.',
    defaultPriority: TicketPriority.MEDIUM,
    sortOrder: 60,
  },
  {
    slug: 'design-studio-bug',
    name: 'Design Studio bug',
    description:
      'Canvas crash, export failure, font not rendering, label compliance scan false positive, drawer not opening.',
    defaultPriority: TicketPriority.MEDIUM,
    sortOrder: 70,
  },
  {
    slug: 'compliance-question',
    name: 'Compliance question',
    description:
      'FDA labeling clarification, allergen disclosure question, claim-language guidance, rule-pack interpretation.',
    defaultPriority: TicketPriority.MEDIUM,
    sortOrder: 80,
  },
  {
    slug: 'feature-request',
    name: 'Feature request',
    description:
      'Suggestion or wish-list item. Triaged into roadmap; not necessarily resolved with a fix.',
    defaultPriority: TicketPriority.LOW,
    slaResponseMinutes: 1440, // 24h
    sortOrder: 90,
  },
  {
    slug: 'co-creation-dispute',
    name: 'Co-creation dispute',
    description:
      'Creator ⇄ manufacturer conflict inside a collaboration room (unresponsive counterpart, contested work, terms disagreement). The room decision log is the evidence trail — admin mediates.',
    defaultPriority: TicketPriority.HIGH,
    slaResponseMinutes: 240, // 4h — money + relationships at stake
    sortOrder: 95,
  },
  {
    slug: 'other',
    name: 'Other',
    description:
      'Catch-all when no other category fits. Admin recategorises during triage.',
    defaultPriority: TicketPriority.LOW,
    sortOrder: 100,
  },
]

export async function seedTicketCategories(prisma: PrismaClient) {
  console.log('Seeding TicketCategory library (10 starter categories)...')

  for (const c of STARTER_CATEGORIES) {
    await prisma.ticketCategory.upsert({
      where: { slug: c.slug },
      // Re-run preserves admin edits to name/description/SLA/defaults.
      update: {},
      create: {
        slug: c.slug,
        name: c.name,
        description: c.description,
        defaultPriority: c.defaultPriority,
        slaResponseMinutes: c.slaResponseMinutes ?? null,
        slaResolveMinutes: c.slaResolveMinutes ?? null,
        sortOrder: c.sortOrder,
        isActive: true,
      },
    })
  }

  console.log(`Seeded ${STARTER_CATEGORIES.length} ticket categories.`)
}
