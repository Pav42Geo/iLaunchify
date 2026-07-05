// Notification Center — Branding (checklist D). Global header + footer chrome
// for every transactional email; the per-event body comes from Templates.

import { prisma } from '@ilaunchify/db'
import {
  DEFAULT_NOTIFICATION_BRANDING,
  renderEmailShell,
  type NotificationBrandingConfig,
} from '@ilaunchify/notifications'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { BrandingForm } from './BrandingForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Email branding — Admin' }

export default async function BrandingPage() {
  const row = await prisma.notificationBranding.findUnique({
    where: { singletonKey: 'default' },
  })

  const branding: NotificationBrandingConfig = {
    ...DEFAULT_NOTIFICATION_BRANDING,
    ...(row
      ? {
          logoUrl: row.logoUrl,
          brandName: row.brandName,
          accentHex: row.accentHex,
          inkHex: row.inkHex,
          footerText: row.footerText,
          unsubscribeText: row.unsubscribeText,
          preferencesText: row.preferencesText,
          preferenceCenterUrl: row.preferenceCenterUrl,
          fromName: row.fromName,
          replyToEmail: row.replyToEmail,
        }
      : {}),
  }

  const previewHtml = renderEmailShell({
    branding,
    subject: 'Acme Foods Co. accepted your manufacturer dispatch',
    bodySource:
      'Your order for **Daily Greens Powder** (#12345678) is one step closer to production.\n\nWe’ll keep you posted at every step.',
    cta: { label: 'View order', url: 'https://example.com/orders/1' },
    unsubscribeUrl: 'https://example.com/unsubscribe?token=preview',
  })

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Notifications"
        title="Email branding"
        description="The global header and footer wrapped around every notification email. Set once — Templates only control the per-event body. Empty fields fall back to the locked design-system defaults."
      />
      <BrandingForm initial={branding} initialPreviewHtml={previewHtml} />
    </div>
  )
}
