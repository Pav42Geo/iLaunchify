import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { CompanyForm } from './CompanyForm'

export default async function CompanyStep() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({ where: { userId: user.id } })
  if (!partner) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company details</CardTitle>
        <CardDescription>Address used for shipping coordination + tax forms.</CardDescription>
      </CardHeader>
      <CardContent>
        <CompanyForm
          partnerId={partner.id}
          initial={{
            companyName: partner.companyName,
            legalName: partner.legalName,
            websiteUrl: partner.websiteUrl ?? '',
            contactPhone: partner.contactPhone ?? '',
            addressLine1: partner.addressLine1 ?? '',
            addressLine2: partner.addressLine2 ?? '',
            city: partner.city ?? '',
            state: partner.state ?? '',
            postalCode: partner.postalCode ?? '',
            country: partner.country,
          }}
        />
      </CardContent>
    </Card>
  )
}
