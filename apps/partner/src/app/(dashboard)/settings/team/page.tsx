// Partner team settings — P3 multi-seat (PRINT_PRODUCTION_WORKFLOW §2.1–2.4,
// D1 LOCKED). Org admins manage memberships + invites; unlocks at ACTIVE.

import { redirect } from 'next/navigation'
import { prisma } from '@ilaunchify/db'
import { requireUser, requirePartnerAdminAccess } from '@ilaunchify/auth'
import { SERVICE_TYPE_LABEL, type PartnerServiceType } from '@/lib/role-skins'
import { TeamManager, type TeamMemberView, type PendingInviteView, type ServiceOption } from './TeamManager'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Team — Partners' }

export default async function TeamSettingsPage() {
  const user = await requireUser()
  const access = await requirePartnerAdminAccess(user.id)
  if (!access) redirect('/settings')

  const partner = await prisma.partner.findUnique({
    where: { id: access.partnerId },
    select: {
      userId: true,
      companyName: true,
      services: { select: { id: true, type: true } },
      memberships: {
        where: { removedAt: null },
        orderBy: { acceptedAt: 'asc' },
        select: {
          id: true,
          isAdmin: true,
          acceptedAt: true,
          lastActiveAt: true,
          user: { select: { id: true, name: true, email: true } },
          serviceMemberships: {
            where: { removedAt: null },
            select: { partnerServiceId: true, roles: true },
          },
        },
      },
      invites: {
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, emailAddress: true, grantAdmin: true, createdAt: true, tokenExpiresAt: true },
      },
    },
  })
  if (!partner) redirect('/settings')

  const serviceLabel = new Map(
    partner.services.map((s) => [
      s.id,
      SERVICE_TYPE_LABEL[s.type as PartnerServiceType] ?? (s.type as string),
    ]),
  )

  const members: TeamMemberView[] = partner.memberships.map((m) => ({
    membershipId: m.id,
    name: m.user.name,
    email: m.user.email ?? '',
    isAdmin: m.isAdmin,
    isFounder: m.user.id === partner.userId,
    acceptedAt: m.acceptedAt.toISOString(),
    lastActiveAt: m.lastActiveAt?.toISOString() ?? null,
    serviceRoles: m.serviceMemberships.map((sm) => ({
      serviceLabel: serviceLabel.get(sm.partnerServiceId) ?? 'Service',
      roles: sm.roles as string[],
    })),
  }))

  const invites: PendingInviteView[] = partner.invites.map((i) => ({
    id: i.id,
    email: i.emailAddress,
    grantAdmin: i.grantAdmin,
    createdAt: i.createdAt.toISOString(),
    expiresAt: i.tokenExpiresAt.toISOString(),
  }))

  const services: ServiceOption[] = partner.services.map((s) => ({
    id: s.id,
    label: serviceLabel.get(s.id) ?? (s.type as string),
  }))

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          Settings · Team
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Team
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Invite teammates and scope what they see. Admins manage everything; service roles see
          only their queues — a prepress tech never touches billing.
        </p>
      </div>

      <TeamManager members={members} invites={invites} services={services} />
    </div>
  )
}
