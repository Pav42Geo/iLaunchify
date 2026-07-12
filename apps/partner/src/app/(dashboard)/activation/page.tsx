// Activation Setup — the post-approval Launch Console.
// docs/PARTNER_ONBOARDING_STRATEGY_2026-07.md §5B.
//
// Server side: reads the partner's services + completed steps via the D8 status
// reader (activation-status.ts), composes the per-service tracks + shared tail
// via the pure engine (activation-tracks.ts), and hands a serializable view
// model to the LaunchConsole client component — the 1:1 port of the approved
// prototype design/activation-launch-console-tokens.html (dark launch hero +
// progress ring + launchpads, next-best-step focus, track card with inline
// drawers, right rail, go-live celebration).
//
// Step completion still persists through the audited setActivationStepComplete
// server action; per-service go-live remains the D8 hybrid gate.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import {
  ACTIVATION_SERVICE_ORDER,
  ACTIVATION_SHARED_STEPS,
  trackFor,
  type ActivationStep,
} from '@/lib/activation-tracks'
import { getPartnerActivationStatus } from '@/lib/activation-status'
import { SiteFooterServer } from '@/components/SiteFooterServer'
import { LaunchConsole, type ConsoleVM, type StepVM } from './LaunchConsole'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Activation Setup — Partners' }

const SERVICE_LABEL: Record<string, string> = {
  MANUFACTURING: 'Manufacturing',
  COPACKING: 'Co-packing',
  LABEL_PRINTING: 'Print production',
  WAREHOUSE: 'Fulfillment',
}

// Activation Setup opens once a partner is past identity/ops approval. Before
// that, onboarding + admin review come first — show a "not yet" notice instead
// of the setup tracks (the route is directly reachable even though the nav hides
// it pre-approval).
const PRE_APPROVAL_STATUSES = new Set([
  'DRAFT',
  'LEAD',
  'INVITED',
  'IN_PROGRESS',
  'IDENTITY_PENDING_REVIEW',
  'UNDER_REVIEW',
])

export default async function ActivationPage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, status: true },
  })
  if (!partner) return null

  if (PRE_APPROVAL_STATUSES.has(partner.status)) {
    return (
      <div className="space-y-6">
        <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
            Post-approval · Activation Setup
          </p>
          <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
            Activation Setup opens after approval
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
            Finish onboarding and pass identity + operations review first. Once you’re approved,
            you’ll set up each service here to go live.
          </p>
        </div>
        <div className="rounded-2xl border border-ink-200 bg-white p-8 text-center text-[13px] text-ink-600">
          Your account is still in onboarding / review. We’ll open Activation Setup as soon as
          you’re approved.
        </div>
      </div>
    )
  }

  const status = await getPartnerActivationStatus(partner.id)
  const { serviceTypes, progress } = status
  const completed = new Set(status.completedKeys)
  const auto = new Set(status.autoCompletedKeys)

  const toStepVM = (s: ActivationStep): StepVM => ({
    key: s.key,
    title: s.title,
    description: s.description,
    routesTo: s.routesTo,
    ...(s.href ? { href: s.href } : {}),
    done: completed.has(s.key),
    auto: auto.has(s.key),
  })

  const tracks = ACTIVATION_SERVICE_ORDER.filter((t) => serviceTypes.includes(t)).map((t) => {
    const p = progress.perService[t]
    return {
      svc: t,
      label: SERVICE_LABEL[t] ?? t,
      steps: trackFor(t).map(toStepVM),
      done: p?.done ?? 0,
      total: p?.total ?? 0,
      live: p?.live ?? false,
    }
  })

  const vm: ConsoleVM = {
    tracks,
    shared: ACTIVATION_SHARED_STEPS.map(toStepVM),
    stepsDone: progress.done,
    stepsTotal: progress.total,
    liveCount: status.liveServiceTypes.length,
  }

  return (
    <div className="space-y-6">
      <LaunchConsole vm={vm} />
      <SiteFooterServer />
    </div>
  )
}
