// Activation Setup — the post-approval, service-composed capability overview.
// docs/PARTNER_ONBOARDING_STRATEGY_2026-07.md §5B.
//
// Server-rendered overview: reads the partner's services, composes the union of
// their responsibility tracks via the pure engine (apps/partner/src/lib/
// activation-tracks.ts), and renders them grouped by service with the "where
// this data lands" routing tags + per-service go-live progress — matching the
// approved prototype's "③ Activation Setup" (design/partner-onboarding-mockup.html).
//
// v1 = read-only overview; per-step forms + completion persistence are the next
// slices (completion needs a schema addition, so every step shows "To do" here).
// Nav wiring + FSM-stage gating (this sits between approval and ACTIVE) are
// follow-ups. Chrome mirrors services/page.tsx (partner-v2).

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { cn } from '@ilaunchify/ui'
import {
  activationStepsFor,
  activationProgress,
  ACTIVATION_SERVICE_ORDER,
  type ActivationStep,
  type PartnerServiceType,
} from '@/lib/activation-tracks'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Activation Setup — Partners' }

const SERVICE_LABEL: Record<string, string> = {
  MANUFACTURING: 'Manufacturing',
  COPACKING: 'Co-packing',
  LABEL_PRINTING: 'Label printing',
  WAREHOUSE: 'Fulfillment',
  SHARED: 'Shared',
}

// Token-backed accents only (raw off-palette families are banned by check:colors).
const SERVICE_ACCENT: Record<string, { dot: string; pill: string }> = {
  MANUFACTURING: { dot: 'bg-pink-500', pill: 'border-pink-200 bg-pink-50 text-pink-700' },
  COPACKING: { dot: 'bg-info-500', pill: 'border-info-200 bg-info-50 text-info-800' },
  LABEL_PRINTING: { dot: 'bg-warning-500', pill: 'border-warning-200 bg-warning-50 text-warning-800' },
  WAREHOUSE: { dot: 'bg-success-500', pill: 'border-success-200 bg-success-50 text-success-800' },
  SHARED: { dot: 'bg-ink-400', pill: 'border-ink-200 bg-ink-100 text-ink-700' },
}
const accent = (k: string) => SERVICE_ACCENT[k] ?? SERVICE_ACCENT.SHARED

export default async function ActivationPage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    include: { services: true },
  })
  if (!partner) return null

  const serviceTypes = partner.services.map((s) => s.type as PartnerServiceType)
  const steps = activationStepsFor(serviceTypes)
  // TODO(next slice): load persisted completed step keys; empty for v1.
  const completed = new Set<string>()
  const progress = activationProgress(serviceTypes, completed)

  // Group composed steps into ordered service blocks (+ the shared tail).
  const order: string[] = [...ACTIVATION_SERVICE_ORDER.filter((t) => serviceTypes.includes(t)), 'SHARED']
  const groups = order
    .map((svc) => ({ svc, steps: steps.filter((s) => s.serviceType === svc) }))
    .filter((g) => g.steps.length > 0)

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          Post-approval · Activation Setup
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Get every service operational
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Your setup is the union of every service you run. Everything you enter routes itself to the
          right place across the platform — and each service goes live on its own as you complete it.
        </p>

        {/* Per-service progress */}
        <div className="mt-4 flex flex-wrap gap-2">
          {serviceTypes.map((t) => {
            const p = progress.perService[t]
            const a = accent(t)
            return (
              <span
                key={t}
                className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-medium text-ink-700"
              >
                <span className={cn('h-2 w-2 rounded-full', a.dot)} />
                {SERVICE_LABEL[t]}
                <span className="text-ink-500">
                  {p?.live ? '✓ live' : `${p?.done ?? 0}/${p?.total ?? 0}`}
                </span>
              </span>
            )
          })}
        </div>
      </div>

      {/* Grouped step tracks */}
      {groups.map((g) => (
        <section key={g.svc} className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <header className="flex items-center gap-2 border-b border-ink-100 bg-[var(--bg-hero)] px-4 py-2.5">
            <span className={cn('h-2.5 w-2.5 rounded-full', accent(g.svc).dot)} />
            <h2 className="font-display text-[14px] font-semibold tracking-tight text-ink-900">
              {SERVICE_LABEL[g.svc]}
            </h2>
            <span className="ml-auto text-[11px] uppercase tracking-wide text-ink-500">
              {g.steps.length} steps
            </span>
          </header>
          <ol className="divide-y divide-ink-100">
            {g.steps.map((s: ActivationStep, i: number) => (
              <li key={s.key} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-start">
                <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-ink-100 text-[11px] font-bold text-ink-500">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-ink-900">{s.title}</p>
                  <p className="mt-0.5 text-[12.5px] text-ink-600">{s.description}</p>
                  {/* Where this data lands — automatically */}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.routesTo.map((r) => (
                      <span
                        key={r}
                        className="inline-flex items-center rounded-full border border-pink-200 bg-pink-50 px-2 py-[3px] text-[11px] font-semibold text-pink-700"
                      >
                        → {r}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="flex-none self-start rounded-full border border-ink-200 bg-ink-50 px-2.5 py-[3px] text-[11px] font-semibold text-ink-600">
                  To do
                </span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}
