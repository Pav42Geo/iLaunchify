// Partner services page.
// ACTIVE partners: render each service with an editable ServiceProfileForm.
// Other statuses: read-only JSON view (changes go through onboarding).
//
// Partner-v2 chrome (Pavel 2026-06-05): cream hero + v2 service sections.
// Data wiring + edit gating unchanged.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { cn } from '@ilaunchify/ui'
import { ServiceProfileForm } from '../../(onboarding)/onboarding/service/ServiceProfileForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Services — Partners' }

const SERVICE_LABEL: Record<string, string> = {
  MANUFACTURING: 'Manufacturing',
  COPACKING: 'Co-packing',
  LABEL_PRINTING: 'Label printing',
  WAREHOUSE: 'Warehouse / 3PL',
}

const SERVICE_STATUS_PILL: Record<string, string> = {
  ACTIVE: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  DRAFT: 'border-ink-200 bg-ink-100 text-ink-700',
  PAUSED: 'border-amber-200 bg-amber-50 text-amber-800',
}

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
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          Manufacturing · Services
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Your services
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          {canEdit
            ? 'Edit your capability profile in place. Changes save immediately.'
            : 'Capability profile is read-only while your application is under review. Visit My Application to make changes.'}
        </p>
      </div>

      <div className="space-y-4">
        {partner.services.map((s) => (
          <section key={s.id} className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
            <header className="flex flex-wrap items-center gap-2 border-b border-ink-100 bg-cream px-4 py-2.5">
              <h2 className="font-display text-[14px] font-semibold leading-none tracking-tight text-ink-900">
                {SERVICE_LABEL[s.type] ?? s.type}
              </h2>
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider',
                  SERVICE_STATUS_PILL[s.status] ?? 'border-ink-200 bg-ink-100 text-ink-700',
                )}
              >
                {s.status}
              </span>
              <span className="ml-auto text-[12px] uppercase tracking-wide text-ink-700">
                {s.disclosureLevel.replace(/_/g, ' ').toLowerCase()} disclosure
              </span>
            </header>
            <div className="p-4">
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
                <pre className="whitespace-pre-wrap rounded-xl border border-ink-100 bg-ink-50 p-3 font-mono text-[11.5px] text-ink-700">
                  {JSON.stringify(s.capabilities, null, 2)}
                </pre>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
