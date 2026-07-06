// Category glyphs + tones for notification rows (in-app P1 item 7,
// docs/IN_APP_NOTIFICATIONS_AUDIT.md §4).
//
// Slugs mirror packages/notifications categories.ts (the settings-matrix
// registry) — kept as a plain string map here so client components can use
// it without importing the server-only notifications package.
//
// Tone language (§4): pink = needs your action · danger = money/SLA ·
// ink = FYI.

import {
  UserRound,
  CreditCard,
  ShoppingBag,
  FileCheck,
  Truck,
  RotateCcw,
  Shield,
  LifeBuoy,
  Boxes,
  Bell,
  Megaphone,
  Inbox,
  type LucideIcon,
} from 'lucide-react'

export type NotificationTone = 'action' | 'danger' | 'info'

const CATEGORY_META: Record<string, { icon: LucideIcon; tone: NotificationTone }> = {
  account: { icon: UserRound, tone: 'info' },
  billing: { icon: CreditCard, tone: 'danger' },
  orders: { icon: ShoppingBag, tone: 'action' },
  proofs: { icon: FileCheck, tone: 'action' },
  fulfillment: { icon: Truck, tone: 'info' },
  cancellations: { icon: RotateCcw, tone: 'danger' },
  compliance: { icon: Shield, tone: 'danger' },
  support: { icon: LifeBuoy, tone: 'action' },
  inventory: { icon: Boxes, tone: 'info' },
  reminders: { icon: Bell, tone: 'info' },
  marketing: { icon: Megaphone, tone: 'info' },
}

const FALLBACK = { icon: Inbox, tone: 'info' as NotificationTone }

export function notificationCategoryMeta(slug: string | null | undefined): {
  icon: LucideIcon
  tone: NotificationTone
} {
  return (slug && CATEGORY_META[slug]) || FALLBACK
}

/** Icon-badge classes per tone (icon color + soft chip bg). */
export function toneClasses(tone: NotificationTone): { icon: string; chip: string } {
  switch (tone) {
    case 'action':
      return { icon: 'text-pink-700', chip: 'bg-pink-50' }
    case 'danger':
      return { icon: 'text-danger-600', chip: 'bg-danger-50' }
    default:
      return { icon: 'text-ink-500', chip: 'bg-ink-100' }
  }
}
