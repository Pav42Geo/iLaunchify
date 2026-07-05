// Notification Center — category registry seed (docs/EMAIL_NOTIFICATION_CENTER.md).
// Idempotent — upserts on slug; only label/description are refreshed on re-run
// (admins may have edited copy; opt-outability + channels follow the CODE
// registry, which is the source of truth).
//
// KEEP IN SYNC with packages/notifications/src/categories.ts
// (NOTIFICATION_CATEGORIES). The db package can't import @ilaunchify/notifications
// (circular dep — notifications depends on db), so the 11 rows are mirrored here.
//
import type { PrismaClient } from '@prisma/client'

type ChannelName = 'IN_APP' | 'EMAIL'

const CATEGORIES: Array<{
  slug: string
  label: string
  description: string
  optOutable: boolean
  defaultChannels: ChannelName[]
}> = [
  { slug: 'account', label: 'Account & security', description: 'Application review, verification outcomes, and account status.', optOutable: false, defaultChannels: ['IN_APP', 'EMAIL'] },
  { slug: 'billing', label: 'Billing', description: 'Payment failures, grace periods, and subscription changes.', optOutable: false, defaultChannels: ['IN_APP', 'EMAIL'] },
  { slug: 'orders', label: 'Order & production updates', description: 'Dispatch activity, acceptance, changes, and production progress.', optOutable: true, defaultChannels: ['IN_APP', 'EMAIL'] },
  { slug: 'proofs', label: 'Proofs & approvals', description: 'Pre-production proofs awaiting review and their outcomes.', optOutable: true, defaultChannels: ['IN_APP', 'EMAIL'] },
  { slug: 'fulfillment', label: 'Fulfillment & receiving', description: 'Inbound receipts, receiving discrepancies, and release SLAs.', optOutable: true, defaultChannels: ['IN_APP', 'EMAIL'] },
  { slug: 'cancellations', label: 'Cancellations & disputes', description: 'Cancellation and dispute outcomes. These are mandatory notices.', optOutable: false, defaultChannels: ['IN_APP', 'EMAIL'] },
  { slug: 'compliance', label: 'Compliance reminders', description: 'Certificate and document expiry reminders.', optOutable: true, defaultChannels: ['IN_APP', 'EMAIL'] },
  { slug: 'support', label: 'Support', description: 'Ticket activity, replies, resolutions, and SLA alerts.', optOutable: true, defaultChannels: ['IN_APP', 'EMAIL'] },
  { slug: 'inventory', label: 'Inventory alerts', description: 'Channel stock level alerts and recoveries.', optOutable: true, defaultChannels: ['IN_APP', 'EMAIL'] },
  { slug: 'reminders', label: 'Reminders & digests', description: 'Acceptance-deadline nudges, SLA-at-risk reminders, and daily digests.', optOutable: true, defaultChannels: ['IN_APP', 'EMAIL'] },
  { slug: 'marketing', label: 'Marketing & product updates', description: 'Announcements and product news. Sent from a separate stream; consent recorded here.', optOutable: true, defaultChannels: ['EMAIL'] },
]

export async function seedNotificationCategories(prisma: PrismaClient): Promise<void> {
  for (const c of CATEGORIES) {
    await prisma.notificationCategory.upsert({
      where: { slug: c.slug },
      create: c,
      update: {
        label: c.label,
        description: c.description,
        optOutable: c.optOutable,
        defaultChannels: c.defaultChannels,
      },
    })
  }
  // eslint-disable-next-line no-console
  console.log(`  ✓ notification categories (${CATEGORIES.length})`)
}
