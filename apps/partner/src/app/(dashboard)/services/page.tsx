// Partner Services — WORKSPACE v2 (Pavel 2026-07-14,
// design/partner-services-workspace-tokens.html). Accordions are GONE:
//   ① service switcher CARDS (status + "Prepress not set" warning on the face)
//   ② pill SECTION TABS for the selected service (warning dot on unfinished)
//   ③ ONE flat, fully-visible form per section.
// URL-driven: ?svc=<serviceId>&sec=<section> — shareable, back-button-safe.
// Manufacturing + co-packing are CTA-only (their full service builders live at
// /services/manufacturing and /services/copacking). Print, Storage, ProductDefaults,
// labeling cards and PrepressSection remain inline — data layer unchanged.
// Storage / Product defaults ride the PRODUCING service (mfr first, else
// co-packer); WAREHOUSE shows a read-only overview linking to its real editors.

import Link from 'next/link'
import { prisma, isNominationEnabled } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { cn } from '@ilaunchify/ui'
import { ExternalLink, Factory, Package, Plus, Printer, SlidersHorizontal, Warehouse } from 'lucide-react'
import { StPill, type PillTone } from '@/components/panel-kit'
import { addService, type AddableServiceType } from './actions'
import {
  StorageEditor,
  type StorageTypedVM,
} from './ServiceEditors'
import { ProductDefaultsForm } from '../settings/product-defaults/ProductDefaultsForm'
import { getPartnerProductDefaults } from '../settings/product-defaults/actions'
import {
  ProducingServiceCard,
  FcVasCard,
  PrinterSampleCard,
  type VasRowView,
} from '../settings/labeling/LabelingSettingsForm'
import { PrepressSection } from '../print-spec/PrepressSection'
import { PageTabs } from '@/components/PageTabs'
import { ListTitleRow } from '@/components/list-kit'

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
      return <Factory className="h-4 w-4" />
    case 'COPACKING':
      return <Package className="h-4 w-4" />
    case 'LABEL_PRINTING':
      return <Printer className="h-4 w-4" />
    case 'WAREHOUSE':
      return <Warehouse className="h-4 w-4" />
    default:
      return <Factory className="h-4 w-4" />
  }
}

/** 'BEVERAGE_FUNCTIONAL' → 'Beverage functional' */
function humanize(v: string) {
  const s = v.replace(/_/g, ' ').toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

type SectionKey = 'capabilities' | 'storage' | 'defaults' | 'labeling' | 'prepress' | 'overview'

const SECTION_LABEL: Record<SectionKey, string> = {
  capabilities: 'Capabilities',
  storage: 'Storage at facility',
  defaults: 'Product defaults',
  labeling: 'Labeling & VAS',
  prepress: 'Prepress delivery',
  overview: 'Overview',
}

// Services whose 'capabilities' now live in a dedicated builder page — the sub-rail
// links out to it. Print's old PrintEditor was folded into the PP-7 builder (2026-07-20),
// so it joins the set; the PP-7 writer keeps the legacy display caps keys populated.
const BUILDER_HREF: Partial<Record<string, string>> = {
  MANUFACTURING: '/services/manufacturing',
  COPACKING: '/services/copacking',
  LABEL_PRINTING: '/services/printing',
}

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ svc?: string; sec?: string }>
}) {
  const sp = await searchParams
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    include: {
      services: true,
      facilities: { select: { id: true, name: true }, orderBy: { isDefault: 'desc' } },
    },
  })
  if (!partner) return null

  const nominationOn = await isNominationEnabled().catch(() => false)
  const canEdit = partner.status === 'ACTIVE' || partner.status === 'INTEGRATION_ENHANCED'
  // WAREHOUSE is NOT self-serve — the FC network is admin-contracted (Pavel 2026-07-13).
  const missingTypes = (
    ['MANUFACTURING', 'COPACKING', 'LABEL_PRINTING'] as AddableServiceType[]
  ).filter((t) => !partner.services.some((s) => (s.type as string) === t))

  // Producing service carries Storage + Product defaults (mfr first, else co-packer).
  const producingSvc =
    partner.services.find((s) => (s.type as string) === 'MANUFACTURING') ??
    partner.services.find((s) => (s.type as string) === 'COPACKING')

  const productDefaults = producingSvc ? await getPartnerProductDefaults(partner.id) : null

  const warehouseSvcIds = partner.services
    .filter((sv) => (sv.type as string) === 'WAREHOUSE')
    .map((sv) => sv.id)
  const vasRows = warehouseSvcIds.length
    ? await prisma.fcValueAddedService
        .findMany({ where: { partnerServiceId: { in: warehouseSvcIds } }, orderBy: { jobType: 'asc' } })
        .catch(() => [])
    : []

  // Prepress-spec presence — an empty spec silently breaks the automatic export
  // pipeline, so cards + tabs warn until it's saved (Pavel 2026-07-14).
  const prepressIds = partner.services
    .filter((sv) => ['MANUFACTURING', 'COPACKING', 'LABEL_PRINTING'].includes(sv.type as string))
    .map((sv) => sv.id)
  const specRows = prepressIds.length
    ? await prisma.partnerPrintOutputSpec
        .findMany({ where: { partnerServiceId: { in: prepressIds } }, select: { partnerServiceId: true } })
        .catch(() => [])
    : []
  const hasPrepressSpec = new Set(specRows.map((r) => r.partnerServiceId))

  // ---- selection (URL-driven) ----
  const ordered = [...partner.services].sort((a, b) => {
    const rank = (t: string) =>
      ['MANUFACTURING', 'COPACKING', 'LABEL_PRINTING', 'WAREHOUSE'].indexOf(t)
    return rank(a.type as string) - rank(b.type as string)
  })
  const selected = ordered.find((s) => s.id === sp.svc) ?? ordered[0] ?? null

  function sectionsFor(svc: NonNullable<typeof selected>): SectionKey[] {
    const type = svc.type as string
    if (type === 'WAREHOUSE') return ['overview']
    // Co-packing capabilities (scope + lines + operations + pricing) now live in
    // the full builder at /services/copacking, not in an in-page section.
    const secs: SectionKey[] = type === 'COPACKING' ? [] : ['capabilities']
    if (producingSvc && svc.id === producingSvc.id) secs.push('storage', 'defaults')
    if (type === 'MANUFACTURING' || type === 'COPACKING' || type === 'LABEL_PRINTING')
      secs.push('labeling')
    secs.push('prepress')
    return secs
  }

  const sections = selected ? sectionsFor(selected) : []
  // 'capabilities' becomes the top link of the left sub-rail (to the dedicated builder)
  // for services whose editor is folded (mfr, co-pack) + only when editable. Everyone
  // else keeps it as an in-pane section (print's PrintEditor, or the read-only readout).
  const builderHref = selected && canEdit ? (BUILDER_HREF[selected.type as string] ?? null) : null
  const inPaneSections: SectionKey[] = builderHref ? sections.filter((k) => k !== 'capabilities') : sections
  const sec: SectionKey =
    sp.sec && sections.includes(sp.sec as SectionKey)
      ? (sp.sec as SectionKey)
      : (inPaneSections[0] ?? sections[0] ?? 'capabilities')

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
        pickFeeCents: producingSvc.pickFeeCents,
        packFeeCents: producingSvc.packFeeCents,
      }
    : null

  const sectionWarns = (svc: NonNullable<typeof selected>, k: SectionKey): boolean =>
    k === 'prepress' && canEdit && !hasPrepressSpec.has(svc.id)

  return (
    <div className="space-y-5">
      <PageTabs group="services" hidden={nominationOn ? [] : ['/co-partners']} />

      <ListTitleRow
        title="Services"
        sub="Pick a service, then work through its sections — every form is flat and fully visible."
      />

      {/* ① service switcher cards */}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {ordered.map((s) => {
          const type = s.type as string
          const status = SERVICE_STATUS[s.status] ?? { tone: 'muted' as PillTone, label: s.status }
          const on = selected?.id === s.id
          return (
            <Link
              key={s.id}
              // Every service lands on its hub, then the left sub-rail opens the builder
              // (Capabilities) or a section in place.
              href={`/services?svc=${s.id}`}
              className={cn(
                'rounded-[14px] border-[1.5px] p-3.5 transition-colors',
                on ? 'border-pink-500 bg-pink-50' : 'border-ink-200 bg-white hover:border-ink-400',
              )}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'grid h-8 w-8 flex-none place-items-center rounded-[9px] text-pink-700',
                    on ? 'bg-white' : 'bg-pink-50',
                  )}
                >
                  {serviceIcon(type)}
                </span>
                <span className="text-[13px] font-bold text-ink-900">
                  {SERVICE_LABEL[type] ?? type}
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <StPill tone={status.tone}>{status.label}</StPill>
                {type !== 'WAREHOUSE' && canEdit && !hasPrepressSpec.has(s.id) && (
                  <StPill tone="warn">Prepress not set</StPill>
                )}
              </div>
            </Link>
          )
        })}
        {canEdit && missingTypes.length > 0 && (
          <div className="grid min-h-[74px] place-items-center rounded-[14px] border-[1.5px] border-dashed border-ink-300 bg-white/60 p-3">
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {missingTypes.map((t) => (
                <form key={t} action={addService.bind(null, t)}>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 rounded-full border border-ink-300 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-ink-700 transition-colors hover:border-pink-500 hover:text-pink-700"
                  >
                    <Plus className="h-3 w-3" /> {SERVICE_LABEL[t]}
                  </button>
                </form>
              ))}
            </div>
          </div>
        )}
      </div>

      {partner.services.length === 0 && (
        <p className="rounded-xl border border-dashed border-ink-300 px-4 py-6 text-center text-[13px] text-ink-500">
          No services yet — add the first one above.
        </p>
      )}

      {selected && (
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          {/* ② left section sub-rail — Capabilities builder link + in-page sections */}
          <nav className="flex flex-row flex-wrap gap-1.5 md:w-56 md:flex-none md:flex-col md:gap-1">
            {builderHref && (
              <a
                href={builderHref}
                className="flex items-center gap-2 rounded-xl border border-pink-200 bg-pink-50 px-3.5 py-2.5 text-[13px] font-semibold text-pink-700 transition-colors hover:bg-pink-100"
              >
                <SlidersHorizontal className="h-4 w-4 flex-none" />
                <span className="flex-1">Capabilities builder</span>
                <ExternalLink className="h-3.5 w-3.5 flex-none opacity-70" />
              </a>
            )}
            {inPaneSections.map((k) => (
              <Link
                key={k}
                href={`/services?svc=${selected.id}&sec=${k}`}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[13px] font-semibold transition-colors',
                  sec === k
                    ? 'border-ink-900 bg-ink-900 text-white'
                    : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400',
                )}
              >
                <span className="flex-1">{SECTION_LABEL[k]}</span>
                {sectionWarns(selected, k) && (
                  <span aria-hidden="true" className="h-1.5 w-1.5 flex-none rounded-full bg-warning-500" />
                )}
              </Link>
            ))}
          </nav>

          {/* ③ right panel — the selected section, fully visible */}
          <div className="min-w-0 flex-1 rounded-2xl border border-ink-200 bg-white p-6">
            <SectionPanel
              sec={sec}
              svc={selected}
              canEdit={canEdit}
              storageVM={storageVM}
              facilities={partner.facilities}
              productDefaults={productDefaults}
              vasRows={vasRows}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Section panel — renders the EXISTING editor for (service, section).
// -----------------------------------------------------------------------------

function SectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-[15px] font-bold text-ink-900">{title}</h2>
      <p className="mt-0.5 text-[12px] text-ink-500">{desc}</p>
    </div>
  )
}

async function SectionPanel({
  sec,
  svc,
  canEdit,
  storageVM,
  facilities,
  productDefaults,
  vasRows,
}: {
  sec: SectionKey
  svc: {
    id: string
    type: string
    status: string
    capabilities: unknown
    appliesLabels: boolean
    labelingMode: string
    sampleCapable: boolean
  }
  canEdit: boolean
  storageVM: StorageTypedVM | null
  facilities: { id: string; name: string }[]
  productDefaults: Awaited<ReturnType<typeof getPartnerProductDefaults>>
  vasRows: Array<{
    partnerServiceId: string
    jobType: string
    labelMethods: string[]
    feeCentsPerUnit: number
    minUnits: number
    leadTimeDays: number
    notes: string | null
    status: string
  }>
}) {
  const type = svc.type

  if (type === 'WAREHOUSE') {
    return (
      <>
        <SectionHeader
          title="Fulfillment Center (3PL)"
          desc="Contracted network service — configured through its dedicated operational surfaces."
        />
        <div className="flex flex-wrap gap-2">
          <a
            href="/settings/fulfillment"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-900 hover:bg-ink-50"
          >
            Receiving & availability <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href="/settings/shipping"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-900 hover:bg-ink-50"
          >
            Carrier & shipping <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href="/billing"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-900 hover:bg-ink-50"
          >
            Storage billing <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        {canEdit && (
          <div className="mt-5 border-t border-ink-100 pt-4">
            <SectionHeader
              title="Value-added services"
              desc="Kitting, labeling and finishing work you offer on stored stock — admin-verified before going live."
            />
            <FcVasCard
              serviceId={svc.id}
              rows={vasRows
                .filter((v) => v.partnerServiceId === svc.id)
                .map(
                  (v): VasRowView => ({
                    jobType: v.jobType,
                    labelMethods: v.labelMethods,
                    feeCentsPerUnit: v.feeCentsPerUnit,
                    minUnits: v.minUnits,
                    leadTimeDays: v.leadTimeDays,
                    notes: v.notes,
                    status: v.status,
                  }),
                )}
            />
          </div>
        )}
      </>
    )
  }

  if (!canEdit && sec !== 'capabilities') {
    return (
      <p className="text-[13px] text-ink-500">
        This section becomes editable once your application is approved.
      </p>
    )
  }

  switch (sec) {
    case 'capabilities':
      return (
        <>
          <SectionHeader
            title="Capabilities"
            desc="What this service can do — drives matching, checkout ETA, capacity gates and print eligibility."
          />
          {!canEdit ? (
            <CapabilityReadout capabilities={svc.capabilities} />
          ) : type === 'MANUFACTURING' ? (
            <a
              href="/services/manufacturing"
              className="flex items-center gap-2.5 rounded-xl border border-pink-200 bg-pink-50 px-3.5 py-3 text-[12.5px] font-semibold text-pink-700 transition-colors hover:bg-pink-100"
            >
              <Factory className="h-4 w-4 flex-none" />
              <span className="flex-1">
                Open the full manufacturing builder: batches, scope, formulation, samples, runs &amp;
                capacity, commercial defaults and a live MOQ check.
              </span>
              <ExternalLink className="h-3.5 w-3.5 flex-none" />
            </a>
          ) : type === 'COPACKING' ? (
            <a
              href="/services/copacking"
              className="flex items-center gap-2.5 rounded-xl border border-pink-200 bg-pink-50 px-3.5 py-3 text-[12.5px] font-semibold text-pink-700 transition-colors hover:bg-pink-100"
            >
              <Package className="h-4 w-4 flex-none" />
              <span className="flex-1">
                Open the full co-packing builder: lines, operations, run pricing and a live quote
                check.
              </span>
              <ExternalLink className="h-3.5 w-3.5 flex-none" />
            </a>
          ) : (
            <a
              href="/services/printing"
              className="flex items-center gap-2.5 rounded-xl border border-pink-200 bg-pink-50 px-3.5 py-3 text-[12.5px] font-semibold text-pink-700 transition-colors hover:bg-pink-100"
            >
              <Printer className="h-4 w-4 flex-none" />
              <span className="flex-1">
                Open the full print builder: presses, capability, finishes, per-press price curves and a
                live crossover check.
              </span>
              <ExternalLink className="h-3.5 w-3.5 flex-none" />
            </a>
          )}
        </>
      )
    case 'storage':
      return (
        <>
          <SectionHeader
            title="Storage at your facility"
            desc="Hold finished goods at YOUR plant (hold-at-manufacturer — explicitly not a fulfillment center) and optionally ship on demand."
          />
          {storageVM && <StorageEditor serviceId={svc.id} initial={storageVM} />}
        </>
      )
    case 'defaults':
      return (
        <>
          <SectionHeader
            title="Product defaults"
            desc="Pre-fills every new product — a teammate only edits what changes per product."
          />
          <ProductDefaultsForm facilities={facilities} initial={productDefaults} />
        </>
      )
    case 'labeling':
      return (
        <>
          <SectionHeader
            title="Labeling & value-added"
            desc="Print sourcing, label application and sample capability — the declarations that drive routing."
          />
          <div className="space-y-4">
            {(type === 'MANUFACTURING' || type === 'COPACKING') && (
              <ProducingServiceCard
                service={{
                  id: svc.id,
                  type,
                  labelingMode: svc.labelingMode,
                  appliesLabels: svc.appliesLabels,
                }}
                label={
                  type === 'MANUFACTURING'
                    ? 'Manufacturing — print sourcing & label application'
                    : 'Co-packing — label application'
                }
              />
            )}
            {type === 'LABEL_PRINTING' && (
              <PrinterSampleCard serviceId={svc.id} initialSampleCapable={svc.sampleCapable} />
            )}
          </div>
        </>
      )
    case 'prepress':
      return (
        <>
          <SectionHeader
            title="Prepress delivery"
            desc="How the Studio prepares export files for THIS service — the platform builds every bundle to exactly these parameters."
          />
          <PrepressSection serviceId={svc.id} />
        </>
      )
    default:
      return null
  }
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
