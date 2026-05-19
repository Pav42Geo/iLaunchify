import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { ServiceProfileForm } from './ServiceProfileForm'

export default async function ServiceStep() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    include: { services: true },
  })
  if (!partner) return null

  const primary = partner.services[0]
  if (!primary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No service declared</CardTitle>
          <CardDescription>Contact support.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{primary.type} capability profile</CardTitle>
        <CardDescription>
          We use this to route orders that fit your shop. You can edit anytime after activation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ServiceProfileForm
          serviceId={primary.id}
          serviceType={primary.type}
          disclosureLevel={primary.disclosureLevel}
          initial={primary.capabilities as Record<string, unknown>}
        />
      </CardContent>
    </Card>
  )
}
