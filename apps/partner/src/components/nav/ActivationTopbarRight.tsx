'use client'

// Right cluster for the ACTIVATION-phase journey topbar (Pavel 2026-07-12).
//
// Sits directly on the dark ink-900 band (no white capsule): the notification
// bell + a deliberately LIMITED account menu —
//   identity (initials avatar + name + email) · tier badge ("✓ Verified
//   partner" for new partners) · Onboarding · Activation Setup ·
//   Help & support · Sign out.
// Nothing else: billing/team/products/settings stay hidden until go-live,
// mirroring the two-link sidebar.
//
// The bell STAYS during this phase — approval updates, certification
// verifications, legal-doc notices and service-went-live events all land as
// in-app notifications while the partner is activating.
//
// Dark-band styling: the shared bell/menu primitives are built for white
// headers (ink-toned triggers), so a wrapper re-tints ONLY their trigger
// buttons via scoped arbitrary variants ([data-notification-bell]>button and
// button.group>*) — the white dropdown panels themselves are untouched.

import { AppHeaderUserMenu } from '@ilaunchify/ui'
import { FileCheck2, HelpCircle, Rocket } from 'lucide-react'
import { signOut } from 'next-auth/react'
import { NotificationBell } from '@/components/notifications/NotificationBell'

const TIER_CHIP_LABEL: Record<string, string> = {
  VERIFIED: '✓ Verified partner',
  TRUSTED: '✓ Trusted partner',
  PREMIER: '✓ Premier partner',
}

export function ActivationTopbarRight({
  email,
  name,
  companyName,
  tier = 'VERIFIED',
}: {
  email: string
  name: string | null
  companyName: string
  tier?: 'VERIFIED' | 'TRUSTED' | 'PREMIER' | null
}) {
  return (
    <div
      className={
        // Bell trigger → light on dark.
        '[&_[data-notification-bell]>button]:text-ink-300 ' +
        '[&_[data-notification-bell]>button:hover]:bg-white/10 ' +
        '[&_[data-notification-bell]>button:hover]:text-white ' +
        // Menu trigger avatar (ink-900 disappears on the band) → glassy ring.
        '[&_button.group>span]:bg-white/10 ' +
        '[&_button.group>span]:ring-1 [&_button.group>span]:ring-white/30 ' +
        '[&_button.group>svg]:text-ink-300 ' +
        'flex items-center gap-1'
      }
    >
      <NotificationBell />
      <AppHeaderUserMenu
        // No image → the shared menu renders the INITIALS avatar (trigger + panel).
        user={{ name: name ?? companyName, email, image: null }}
        avatarTone="ink"
        roleChip={tier ? { label: TIER_CHIP_LABEL[tier] ?? tier, tone: 'ink' } : undefined}
        sections={[
          {
            items: [
              { label: 'Onboarding', href: '/my-application', icon: FileCheck2 },
              { label: 'Activation Setup', href: '/activation', icon: Rocket },
            ],
          },
          {
            items: [{ label: 'Help & support', href: '/help', icon: HelpCircle }],
          },
        ]}
        onSignOut={() => signOut({ callbackUrl: '/login' })}
      />
    </div>
  )
}
