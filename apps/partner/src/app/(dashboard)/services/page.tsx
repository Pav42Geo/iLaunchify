// Partner services — per-service accordion editors, the real port of
// design/partner-services-prototype-tokens.html (Pavel 2026-07-13).
//
// Each service opens a PURPOSE-BUILT editor (no generic shared form):
//   MANUFACTURING → domains / formulation+samples / runs+capacity (capabilities
//     JSON, merged — unknown keys always survive), PLUS a separate
//     "Storage at your facility" card for the TYPED offersStorage columns
//     (HOLD_AT_MANUFACTURER destination — explicitly NOT an FC).
//   COPACKING     → containers / fills / supply model / lines+runs.
//   LABEL_PRINTING→ specs + appliesLabels; substrates & die-lines link to
//     their real stores in Packaging (counts shown from the DB).
//   WAREHOUSE     → the 3PL/FC service — summary card linking to its dedicated
//     editors (Settings → Storage / Fulfillment / Shipping); never edited here.
// Pre-approval partners get the read-only humanized readout. Real data only —
// empty fields render empty (no invented defaults).

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { ExternalLink, Factory, Package, Plus, Printer, Warehouse } from 'lucide-react'
import { PanelCard, PanelHeader, LRow, StPill, type PillTone } from '@/components/panel-kit'
import { getPartnerRoleWord } from '@/lib/partner-role'
import { addService, type AddableServiceType } from './actions'
import {
  ManufacturingEditor,
  CopackEditor,
  PrintEditor,
  StorageEditor,
  type StorageTypedVM,
} from './ServiceEditors'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Services — Partners' }

const SERVICE_LABEL: Record<string, string> = {
  MANUFACTURING: 'Manufacturing',
  COPACKING: 'Co-packing',
  LABEL_PRINTING: 'Print production',
  WAREHOUSE: 'Fulfillment Center (3PL)',
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

/** One-line REAL summary per service — only values that exist, ' · ' joined. */
function capabilitySummary(s: { capabilities: unknown; storageClasses: string[] }): string | null {
  const caps = (s.capabilities ?? {}) as Record<string, unknown>
  const strArr = (k: string): string[] =>
    Array.isArray(caps[k]) ? (caps[k] as unknown[]).filter((x): x is string => typeof x === 'string') : []
  const int = (k: string): number | null =>
    typeof caps[k] === 'number' && Number.isFinite(caps[k]) ? (caps[k] as number) : null

  const parts: string[] = []
  const cats = [...strArr('categories'), ...strArr('containerFormats'), ...strArr('processes')]
  parts.push(...cats.slice(0, 3).map(humanize))
  parts.push(...strArr('fillTypes').slice(0, 2).map(humanize))
  const moqMin = int('moqMin')
  if (moqMin !== null) parts.push(`MOQ ${moqMin.toLocaleString()}`)
  const leadStock = int('leadTimeStockDays')
  const leadCustom = int('leadTimeCustomDays')
  const leadFlat = int('leadTimeDays')
  if (leadStock !== null && leadCustom !== null) parts.push(`lead ${leadStock}–${leadCustom}d`)
  else if (leadFlat !== null) parts.push(`lead ${leadFlat}d`)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** Real storage summary from the TYPED columns. */
function storageSummary(s: StorageTypedVM): string {
  if (!s.offersStorage) return 'Not offered — creators can’t hold stock at your facility'
  const parts: string[] = []
  if (s.storageClasses.length) parts.push(s.storageClasses.map(humanize).join(' + '))
  if (s.maxDwellDays != null) parts.push(`${s.maxDwellDays}-day max dwell`)
  if (s.storageRateCents != null && s.storageBillingUnit)
    parts.push(
      `$${(s.storageRateCents / 100).toFixed(2)}/${s.storageBillingUnit === 'PALLET_MONTH' ? 'pallet-mo' : 'cu ft-mo'}`,
    )
  if (s.onDemandEnabled) parts.push('ships on demand')
  return parts.length ? parts.join(' · ') : 'Enabled — set classes, dwell & billing'
}

export default async function ServicesPage() {
  const roleWord = await getPartnerRoleWord()
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    include: { services: true },
  })
  if (!partner) return null

  const canEdit = partner.status === 'ACTIVE' || partner.status === 'INTEGRATION_ENHANCED'
  // WAREHOUSE is NOT self-serve — the FC network is admin-contracted
  // (Pavel 2026-07-13). Producers offer "storage at your facility" instead.
  const missingTypes = (
    ['MANUFACTURING', 'COPACKING', 'LABEL_PRINTING'] as AddableServiceType[]
  ).filter((t) => !partner.services.some((s) => (s.type as string) === t))

  // Real substrate / die-line counts for the print card.
  const printSvc = partner.services.find((s) => (s.type as string) === 'LABEL_PRINTING')
  const [substrateCount, dielineCount] = printSvc
    ? await Promise.all([
        prisma.partnerServiceSubstrate.count({ where: { partnerServiceId: printSvc.id } }).catch(() => 0),
        prisma.packagingDieline.count({ where: { partnerServiceId: printSvc.id } }).catch(() => 0),
      ])
    : [0, 0]

  // "Storage at your facility" attaches to the producing service (mfr first,
  // else co-packer) — the typed offersStorage columns. NEVER the WAREHOUSE row.
  const producingSvc =
    partner.services.find((s) => (s.type as string) === 'MANUFACTURING') ??
    partner.services.find((s) => (s.type as string) === 'COPACKING')
  const storageVM: StorageTypedVM | null = producingSvc
    ? {
        offersStorage: producingSvc.offersStorage,
        storageClasses: producingSvc.storageClasses ?? [],
        maxDwellDays: producingSvc.maxDwellDays,
        storageBillingUnit: (producingSvc.storageBillingUnit as string | null) ?? null,
        storageRateCents: producingSvc.storageRateCents,
        storageFreeGraceDays: producingSvc.storageFreeGraceDays,
        storageMinMonthlyCents: producingSvc.storageMinMonthlyCents,
        canShipParcel: producingSvc.canShipParcel,
        onDemandEnabled: producingSvc.onDemandEnabled,
      }
    : null

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
          One card per service, each with its own editor. Everything here routes itself — matching,
          checkout ETA, capacity gates, print eligibility, and the hold-at-manufacturer destination
          all read these profiles directly.
        </p>
      </div>

      <PanelCard>
        <PanelHeader
          title="Capabilities & services"
          desc={
            canEdit
              ? 'Every service you offer, with its live capability profile.'
              : 'Read-only while your application is under review — changes go through My Application.'
          }
        />

        {partner.services.map((s) => {
          const type = s.type as string
          const status = SERVICE_STATUS[s.status] ?? { tone: 'muted' as PillTone, label: s.status }
          const summary = capabilitySummary({
            capabilities: s.capabilities,
            storageClasses: s.storageClasses ?? [],
          })
          const caps = (s.capabilities ?? {}) as Record<string, unknown>

          // WAREHOUSE = the 3PL/FC service — managed in its dedicated pages.
          if (type === 'WAREHOUSE') {
            return (
              <div key={s.id} className="mb-2.5 last:mb-0">
                <LRow
                  icon={serviceIcon(type)}
                  iconClassName="bg-pink-50 text-pink-700"
                  title={SERVICE_LABEL[type]}
                  sub={
                    summary
                      ? `${summary} · 3PL fulfillment — managed in Settings`
                      : '3PL fulfillment — managed in Settings'
                  }
                  right={
                    <>
                      <StPill tone={status.tone}>{status.label}</StPill>
                      <a
                        href="/settings/storage"
                        className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-900 hover:bg-ink-50"
                      >
                        Storage <ExternalLink className="h-3 w-3" />
                      </a>
                      <a
                        href="/settings/fulfillment"
                        className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-900 hover:bg-ink-50"
                      >
                        Fulfillment <ExternalLink className="h-3 w-3" />
                      </a>
                    </>
                  }
                />
              </div>
            )
          }

          return (
            <details key={s.id} className="group mb-2.5 last:mb-0" open={type === 'MANUFACTURING'}>
              <summary className="block cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <LRow
                  className="mb-0"
                  icon={serviceIcon(type)}
                  iconClassName="bg-pink-50 text-pink-700"
                  title={SERVICE_LABEL[type] ?? type}
                  sub={summary ?? 'No capability details yet — open to fill them in'}
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
                {!canEdit ? (
                  <CapabilityReadout capabilities={s.capabilities} />
                ) : type === 'MANUFACTURING' ? (
                  <ManufacturingEditor serviceId={s.id} capabilities={caps} />
                ) : type === 'COPACKING' ? (
                  <CopackEditor serviceId={s.id} capabilities={caps} />
                ) : (
                  <PrintEditor
                    serviceId={s.id}
                    capabilities={caps}
                    appliesLabels={s.appliesLabels}
                    substrateCount={substrateCount}
                    dielineCount={dielineCount}
                  />
                )}
              </div>
            </details>
          )
        })}

        {/* Storage at YOUR facility — typed columns on the producing service. */}
        {producingSvc && storageVM && (
          <details className="group mb-2.5 last:mb-0">
            <summary className="block cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <LRow
                className="mb-0"
                icon={<Warehouse />}
                iconClassName="bg-pink-50 text-pink-700"
                title="Storage at your facility"
                sub={storageSummary(storageVM)}
                right={
                  <>
                    <StPill tone={storageVM.offersStorage ? 'ok' : 'muted'}>
                      {storageVM.offersStorage ? 'Offered' : 'Off'}
                    </StPill>
                    <span className="rounded-full border border-ink-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-900 transition-colors group-hover:bg-ink-50">
                      {canEdit ? 'Edit' : 'View'}
                    </span>
                  </>
                }
              />
            </summary>
            <div className="mt-2 rounded-xl border border-ink-200 bg-white p-4">
              {canEdit ? (
                <StorageEditor serviceId={producingSvc.id} initial={storageVM} />
              ) : (
                <p className="text-[13px] text-ink-500">
                  Storage offering becomes editable once your application is approved.
                </p>
              )}
            </div>
          </details>
        )}

        {partner.services.length === 0 && (
          <p className="rounded-xl border border-dashed border-ink-300 px-4 py-6 text-center text-[13px] text-ink-500">
            No services yet — add the first one below.
          </p>
        )}

        {canEdit && missingTypes.length > 0 && (
          <div className="mt-4 border-t border-ink-100 pt-4">
            <div className="mb-2 text-[12px] font-semibold text-ink-700">Add a service</div>
            <div className="flex flex-wrap gap-2">
              {missingTypes.map((t) => (
                <form key={t} action={addService.bind(null, t)}>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-full bg-pink-500 px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-pink-600"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {SERVICE_LABEL[t]}
                  </button>
                </form>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-ink-500">
              New services start as Draft — fill in the capability profile here, then complete the
              service&rsquo;s Activation Setup track to go live for routing. Interested in joining
              the Fulfillment Center network as a 3PL? That&rsquo;s a separately contracted
              program —{' '}
              <a href="/help" className="font-semibold underline underline-offset-2">
                talk to us
              </a>
              .
            </p>
          </div>
        )}
      </PanelCard>
    </div>
  )
}

/** Read-only capability display (pre-approval) — humanized rows, never raw JSON. */
function CapabilityReadout({ capabilities }: { capabilities: unknown }) {
  const caps = (capabilities ?? {}) as Record<string, unknown>
  const entries = Object.entries(caps).filter(([k, v]) => {
    if (k === 'type') return false
    if (v == null || v === '') return false
    if (Array.isArray(v)) return v.length > 0
    return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
  })
  if (entries.length === 0) {
    return <p className="text-[13px] text-ink-500">No capability details submitted yet.</p>
  }
  return (
    <div className="grid gap-x-6 sm:grid-cols-2">
      {entries.map(([k, v]) => (
        <div
          key={k}
          className="flex justify-between gap-3 border-b border-ink-100 py-2 text-[13px] last:border-b-0"
        >
          <span className="text-ink-500">{humanize(k.replace(/([A-Z])/g, ' $1'))}</span>
          <span className="text-right font-semibold text-ink-900">
            {Array.isArray(v)
              ? (v as unknown[]).filter((x) => typeof x === 'string').map((x) => humanize(x as string)).join(', ')
              : typeof v === 'boolean'
                ? v
                  ? 'Yes'
                  : 'No'
                : typeof v === 'number'
                  ? v.toLocaleString()
                  : humanize(String(v))}
          </span>
        </div>
      ))}
    </div>
  )
}
