// Partner services page — the "Capabilities & services" panel of
// design/partner-profile-prototype-v2.html (Pavel 2026-07-12).
//
// Each service renders as an LRow (pink icon chip · label · one-line real
// capability summary · status StPill + Edit/View affordance). The row is a
// <details>/<summary> toggle so the existing edit surface is fully preserved:
// ACTIVE partners expand into the editable ServiceProfileForm; other statuses
// expand into the read-only JSON view (changes go through onboarding).
// Data wiring + edit gating unchanged.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { Factory, Package, Printer, Warehouse } from 'lucide-react'
import { PanelCard, PanelHeader, LRow, StPill, type PillTone } from '@/components/panel-kit'
import { ServiceProfileForm } from '../../(onboarding)/onboarding/service/ServiceProfileForm'
import { getPartnerRoleWord } from '@/lib/partner-role'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Services — Partners' }

const SERVICE_LABEL: Record<string, string> = {
  MANUFACTURING: 'Manufacturing',
  COPACKING: 'Co-packing',
  LABEL_PRINTING: 'Packaging printing',
  WAREHOUSE: 'Warehouse / 3PL',
}

const SERVICE_STATUS: Record<string, { tone: PillTone; label: string }> = {
  ACTIVE: { tone: 'ok', label: 'Active' },
  DRAFT: { tone: 'warn', label: 'Draft' },
  PAUSED: { tone: 'muted', label: 'Paused' },
}

function serviceIcon(type: string) {
  switch (type) {
    case 'MANUFACTURING':
      return <Factory />
    case 'COPACKING':
      return <Package />
    case 'LABEL_PRINTING':
      return <Printer />
    case 'WAREHOUSE':
      return <Warehouse />
    default:
      return <Factory />
  }
}

/** 'BEVERAGE_FUNCTIONAL' → 'Beverage functional' */
function humanize(v: string) {
  const s = v.replace(/_/g, ' ').toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * One-line real capability summary from the service's capabilities JSON +
 * typed storageClasses column — only values that actually exist, ' · ' joined
 * (both the ServiceProfileForm shape and the onboarding v2 shape are handled).
 */
function capabilitySummary(s: {
  capabilities: unknown
  storageClasses: string[]
}): string | null {
  const caps = (s.capabilities ?? {}) as Record<string, unknown>
  const strArr = (k: string): string[] =>
    Array.isArray(caps[k]) ? (caps[k] as unknown[]).filter((x): x is string => typeof x === 'string') : []
  const int = (k: string): number | null =>
    typeof caps[k] === 'number' && Number.isFinite(caps[k]) ? (caps[k] as number) : null

  const parts: string[] = []

  // Category-ish lists (first 3 across the known shapes)
  const cats = [
    ...strArr('categories'),
    ...strArr('productTypes'),
    ...strArr('packagingFormats'),
    ...strArr('substrates'),
    ...strArr('storageType'),
  ]
  parts.push(...cats.slice(0, 3).map(humanize))

  // Fill types (e.g. cold-fill)
  parts.push(...strArr('fillTypes').slice(0, 2).map(humanize))

  // Typed warehouse storage classes column
  if (s.storageClasses.length > 0 && cats.length === 0) {
    parts.push(...s.storageClasses.slice(0, 3).map(humanize))
  }

  // MOQ
  const moqMin = int('moqMin') ?? int('moqUnitsTypical')
  if (moqMin !== null) parts.push(`MOQ ${moqMin.toLocaleString()}`)

  // Capacity
  const palletCapacity = int('palletCapacity')
  if (palletCapacity !== null) parts.push(`${palletCapacity.toLocaleString()} pallets`)

  // Lead time
  const leadMin = int('leadTimeDaysMin') ?? int('leadTimeStockDays')
  const leadMax = int('leadTimeDaysMax') ?? int('leadTimeCustomDays')
  const leadFlat = int('leadTimeDays')
  if (leadMin !== null && leadMax !== null && leadMax !== leadMin) {
    parts.push(`lead ${leadMin}–${leadMax}d`)
  } else if (leadMin !== null) {
    parts.push(`lead ${leadMin}d`)
  } else if (leadFlat !== null) {
    parts.push(`lead ${leadFlat}d`)
  }

  return parts.length > 0 ? parts.join(' · ') : null
}

export default async function ServicesPage() {
  const roleWord = await getPartnerRoleWord()
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    include: { services: true },
  })
  if (!partner) return null

  const canEdit = partner.status === 'ACTIVE'

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          {roleWord} · Services
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

      <PanelCard>
        <PanelHeader
          title="Capabilities & services"
          desc={
            canEdit
              ? 'Every service you offer, with its live capability profile.'
              : 'Every service on your application, with its capability profile.'
          }
        />
        {partner.services.map((s) => {
          const status = SERVICE_STATUS[s.status] ?? { tone: 'muted' as PillTone, label: s.status }
          const summary = capabilitySummary({
            capabilities: s.capabilities,
            storageClasses: s.storageClasses ?? [],
          })
          const disclosureNote = `${s.disclosureLevel.replace(/_/g, ' ').toLowerCase()} disclosure`
          return (
            <details key={s.id} className="group mb-2.5 last:mb-0">
              <summary className="block cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <LRow
                  className="mb-0"
                  icon={serviceIcon(s.type)}
                  iconClassName="bg-pink-50 text-pink-700"
                  title={SERVICE_LABEL[s.type] ?? s.type}
                  sub={summary ? `${summary} · ${disclosureNote}` : disclosureNote}
                  right={
                    <>
                      <StPill tone={status.tone}>{status.label}</StPill>
                      <span className="rounded-full border border-ink-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-900 transition-colors group-hover:bg-ink-50">
                        {canEdit ? 'Edit' : 'View'}
                      </span>
                    </>
                  }
                />
              </summary>
              <div className="mt-2 rounded-xl border border-ink-200 bg-white p-4">
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
            </details>
          )
        })}
      </PanelCard>
    </div>
  )
}
