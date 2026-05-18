import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Services — Partners' }

export default async function ServicesPage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    include: { services: true },
  })
  if (!partner) return null

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Your services</h1>
      <div className="space-y-3">
        {partner.services.map((s) => (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle className="text-base">{s.type}</CardTitle>
              <CardDescription>
                Status: {s.status} · Disclosure: {s.disclosureLevel}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap rounded-md bg-zinc-50 p-3 font-mono text-xs">
                {JSON.stringify(s.capabilities, null, 2)}
              </pre>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-sm text-zinc-500">
        Editing your service profile in-portal lands in V1.1. Until then, email{' '}
        <a href="mailto:partners@ilaunchify.com" className="underline">partners@ilaunchify.com</a> for changes.
      </p>
    </div>
  )
}
