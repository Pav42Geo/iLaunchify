import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { redirect } from 'next/navigation'
import { NewProductForm } from './NewProductForm'

export const metadata = { title: 'New product — iLaunchify' }

export default async function NewProductPage() {
  const user = await requireUser()

  // Resolve creator's primary brand. V1 creates one Brand per CreatorProfile
  // automatically when the profile is created; if missing, send them through setup.
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: user.id },
    include: { brands: true },
  })

  if (!profile) redirect('/onboarding/creator')
  const brand = profile.brands[0]
  if (!brand) redirect('/onboarding/brand')

  // V1 only has US market. Fetch it.
  const market = await prisma.market.findUnique({ where: { code: 'US' } })
  if (!market) {
    throw new Error('US market row missing. Run the seed script.')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New product</h1>
        <p className="mt-1 text-sm text-zinc-500">Step 1 of 3: name, category, basic info.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Product basics</CardTitle>
          <CardDescription>You can edit these later.</CardDescription>
        </CardHeader>
        <CardContent>
          <NewProductForm brandId={brand.id} marketId={market.id} />
        </CardContent>
      </Card>
    </div>
  )
}
