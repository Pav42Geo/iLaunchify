// Partner services page.
// ACTIVE partners: render each service with an editable ServiceProfileForm
// (reuses the onboarding wizard form, redirected back here on save).
// Other statuses: read-only JSON view (changes go through the onboarding flow).

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { ServiceProfileForm } from '../../(onboarding)/onboarding/service/ServiceProfileForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Services — Partners' }

export default async function ServicesPage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    include: { services: true },
  })
  if (!partner) return null

  const canEdit = partner.status === 'ACTIVE'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your services</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {canEdit
            ? 'Edit your capability profile in place. Changes save immediately.'
            : 'Capability profile is read-only while your application is under review. Visit My Application to make changes.'}
        </p>
      </div>

      <div className="space-y-6">
        {partner.services.map((s) => (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle className="text-base">{s.type}</CardTitle>
              <CardDescription>
                Status: {s.status} · Disclosure: {s.disclosureLevel}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {canEdit ? (
                <ServiceProfileForm
                  serviceId={s.id}
                  serviceType={s.type}
                  disclosureLevel={s.disclosureLevel}
                  initial={(s.capabilities as Record<string, unknown>) ?? {}}
                  redirectAfterSave="/services"
                  submitLabel="Save changes"
                  successMessage="Service profile updated"
                />
              ) : (
                <pre className="whitespace-pre-wrap rounded-md bg-zinc-50 p-3 font-mono text-xs">
                  {JSON.stringify(s.capabilities, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
