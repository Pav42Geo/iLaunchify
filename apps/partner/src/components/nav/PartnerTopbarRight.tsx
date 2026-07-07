'use client'

// Right cluster for the partner dashboard topbar (REBUILD R1.3 · menu v2
// 2026-07-06, docs/ACCOUNT_MENUS_PROPOSAL.md).
//
// Notification bell + AppHeaderUserMenu v2. Ink-toned avatar (vs creator's
// pink) signals the audience.
//
// Menu contract (Pavel 2026-07-06): identity + status chip + company card +
// ONE work shortcut (My products) + account section. The role-skinned
// sidebar owns the rest of nav — don't add rows back without a decision.
//
// Status chip is INFO-ONLY per the locked partner-tier rule: label the tier,
// never attach benefit copy ("Premier gets X").

import { AppHeaderUserMenu } from '@ilaunchify/ui'
import {
  Package,
  FileText,
  CreditCard,
  Receipt,
  Users,
  Settings,
  HelpCircle,
} from 'lucide-react'
import { signOut } from 'next-auth/react'
import { NotificationBell } from '@/components/notifications/NotificationBell'

interface Props {
  email: string
  name: string | null
  /** Avatar photo URL. Hardcoded placeholder until real profile images land. */
  image?: string | null
  companyName: string
  /** Partner subscription tier (PartnerTier). Rendered as an info-only chip. */
  tier?: 'VERIFIED' | 'TRUSTED' | 'PREMIER' | null
  /** Show the "My application" row — only while the partner is still in the
      onboarding/approval funnel. Hidden post-activation (Pavel 2026-07-06). */
  showMyApplication?: boolean
}

const TIER_CHIP_LABEL: Record<NonNullable<Props['tier']>, string> = {
  VERIFIED: '✓ Verified partner',
  TRUSTED: '✓ Trusted partner',
  PREMIER: '✓ Premier partner',
}

export function PartnerTopbarRight({
  email,
  name,
  image,
  companyName,
  tier = null,
  showMyApplication = false,
}: Props) {
  return (
    <>
      <NotificationBell />
      <AppHeaderUserMenu
        user={{ name: name ?? companyName, email, image }}
        avatarTone="ink"
        roleChip={tier ? { label: TIER_CHIP_LABEL[tier], tone: 'ink' } : undefined}
        contextCard={{ label: 'Company', name: companyName, href: '/settings' }}
        sections={[
          {
            items: [
              // The ONE work shortcut (Pavel 2026-07-06) — sidebar owns the rest.
              { label: 'My products', href: '/products', icon: Package },
            ],
          },
          {
            label: 'Account',
            items: [
              ...(showMyApplication
                ? [{ label: 'My application', href: '/my-application', icon: FileText }]
                : []),
              { label: 'Billing', href: '/settings/billing', icon: Receipt },
              { label: 'Payments', href: '/payments', icon: CreditCard },
              { label: 'Team', href: '/settings/team', icon: Users },
              { label: 'Settings', href: '/settings', icon: Settings },
            ],
          },
          {
            items: [
              { label: 'Help & support', href: '/help', icon: HelpCircle },
            ],
          },
        ]}
        onSignOut={() => signOut({ callbackUrl: '/login' })}
      />
    </>
  )
}
