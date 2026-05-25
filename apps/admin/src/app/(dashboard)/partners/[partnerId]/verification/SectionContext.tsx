// Read-only context panels rendered above each SectionReview card.
// Surfaces the Phase 2 data the admin needs to actually decide
// VERIFIED / NEEDS_CHANGES / REJECTED:
//
//   BUSINESS: legal entity + address + contact (Partner.* core fields)
//   FACILITY: PartnerService rows with capabilities JSON (one card per type)
//   OPERATIONAL_STANDARDS: contract version + signer + signedAt + Stripe status
//
// All purely presentational — no actions live here.

import type { Partner, PartnerService, ServiceType } from '@prisma/client'

// -----------------------------------------------------------------------------
// BUSINESS context
// -----------------------------------------------------------------------------

export function BusinessContext({
  partner,
}: {
  partner: Pick<
    Partner,
    | 'companyName'
    | 'legalName'
    | 'websiteUrl'
    | 'contactPhone'
    | 'addressLine1'
    | 'addressLine2'
    | 'city'
    | 'state'
    | 'postalCode'
    | 'country'
  >
}) {
  const addressLines = [
    partner.addressLine1,
    partner.addressLine2,
    [partner.city, partner.state, partner.postalCode].filter(Boolean).join(', '),
    partner.country,
  ].filter(Boolean)

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
      <Row label="DBA" value={partner.companyName} />
      <Row label="Legal name" value={partner.legalName} />
      <Row label="Website" value={partner.websiteUrl} />
      <Row label="Phone" value={partner.contactPhone} />
      <div className="mt-2 border-t border-zinc-200 pt-2">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Primary facility address
        </div>
        {addressLines.length > 0 ? (
          <div className="mt-1 text-zinc-700">
            {addressLines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        ) : (
          <div className="mt-1 text-zinc-400">Not provided</div>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// FACILITY context — capabilities per selected ServiceType
// -----------------------------------------------------------------------------

const SERVICE_LABEL: Record<ServiceType, string> = {
  MANUFACTURING: 'Manufacturing',
  COPACKING: 'Co-packing',
  LABEL_PRINTING: 'Label printing',
  WAREHOUSE: 'Warehouse / 3PL',
}

export function CapabilitiesContext({
  services,
}: {
  services: Pick<PartnerService, 'id' | 'type' | 'capabilities'>[]
}) {
  if (services.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-zinc-200 px-4 py-3 text-sm text-zinc-500">
        Partner hasn&apos;t selected any service types yet.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {services.map((s) => (
        <div key={s.id} className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
              {SERVICE_LABEL[s.type]}
            </span>
          </div>
          <CapabilityFields capabilities={s.capabilities as Record<string, unknown> | null} />
        </div>
      ))}
    </div>
  )
}

function CapabilityFields({ capabilities }: { capabilities: Record<string, unknown> | null }) {
  if (!capabilities || Object.keys(capabilities).length === 0) {
    return <div className="text-zinc-400">No capability details filled in yet.</div>
  }

  // The partner accordion writes shapes like:
  //   { productTypes: [], productionSpecs: [], moqUnitsTypical: 1000, ... }
  // We render every key generically so newly added fields surface without UI changes.
  // _stub is a marker we set when the row is first auto-created — skip it.
  const entries = Object.entries(capabilities).filter(
    ([k, v]) => k !== '_stub' && k !== 'type' && v !== null && v !== undefined && v !== '',
  )

  if (entries.length === 0) {
    return <div className="text-zinc-400">No capability details filled in yet.</div>
  }

  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
      {entries.map(([k, v]) => (
        <div key={k} className="flex flex-col">
          <dt className="text-xs uppercase tracking-wider text-zinc-500">{humanizeKey(k)}</dt>
          <dd className="text-zinc-800">{formatValue(v)}</dd>
        </div>
      ))}
    </dl>
  )
}

function humanizeKey(key: string): string {
  // moqUnitsTypical -> "MOQ units typical"; leadTimeDaysMin -> "Lead time days min"
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .replace(/\bMoq\b/i, 'MOQ')
    .trim()
}

function formatValue(v: unknown): string {
  if (Array.isArray(v)) return v.length === 0 ? '—' : v.join(', ')
  if (typeof v === 'number') return v.toLocaleString()
  return String(v)
}

// -----------------------------------------------------------------------------
// OPERATIONAL_STANDARDS context — contract acceptance + Stripe Connect status
// -----------------------------------------------------------------------------

interface CommercialContextProps {
  contract: {
    version: string
    name: string
    status: string
  } | null
  signedAt: Date | null
  signerName: string
  signerEmail: string
  payoutTimingDays: number | null
  stripeAccountId: string | null
  stripeAccountStatus: string
}

export function CommercialContext({
  contract,
  signedAt,
  signerName,
  signerEmail,
  payoutTimingDays,
  stripeAccountId,
  stripeAccountStatus,
}: CommercialContextProps) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Partner agreement
        </div>
        {contract && signedAt ? (
          <div className="mt-2 space-y-1">
            <Row
              label="Contract"
              value={`${contract.name} (${contract.version})`}
              badge={contract.status === 'ACTIVE' ? 'ACTIVE' : contract.status}
              badgeClass={
                contract.status === 'ACTIVE'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }
            />
            <Row label="Signed at" value={new Date(signedAt).toLocaleString()} />
            <Row
              label="Signer"
              value={signerName ? `${signerName} <${signerEmail}>` : signerEmail}
            />
            <Row
              label="Payout timing"
              value={payoutTimingDays !== null ? `${payoutTimingDays} days` : '—'}
            />
          </div>
        ) : (
          <div className="mt-1 text-zinc-400">Partner has not signed the contract yet.</div>
        )}
      </div>

      <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Stripe Connect (payouts)
        </div>
        <div className="mt-2 space-y-1">
          <Row
            label="Status"
            value=""
            badge={stripeAccountStatus}
            badgeClass={stripeBadgeClass(stripeAccountStatus)}
          />
          <Row
            label="Account ID"
            value={stripeAccountId ?? 'Not connected'}
            mono={!!stripeAccountId}
          />
        </div>
        {stripeAccountStatus !== 'ACTIVE' && (
          <p className="mt-2 text-xs text-amber-700">
            Payouts won&apos;t flow until this is ACTIVE. Partner must complete Stripe Connect Express
            onboarding from their /onboarding accordion.
          </p>
        )}
      </div>
    </div>
  )
}

function stripeBadgeClass(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-emerald-100 text-emerald-800'
    case 'PENDING':
    case 'RESTRICTED':
      return 'bg-amber-100 text-amber-800'
    case 'REJECTED':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-zinc-100 text-zinc-700'
  }
}

// -----------------------------------------------------------------------------
// Tiny shared row component
// -----------------------------------------------------------------------------

function Row({
  label,
  value,
  badge,
  badgeClass,
  mono,
}: {
  label: string
  value: string | null
  badge?: string
  badgeClass?: string
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs uppercase tracking-wider text-zinc-500">{label}</span>
      <span className="flex min-w-0 items-center gap-2 text-right">
        {value && (
          <span
            className={`truncate text-zinc-800 ${mono ? 'font-mono text-xs' : ''}`}
            title={value}
          >
            {value}
          </span>
        )}
        {badge && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
              badgeClass ?? 'bg-zinc-100 text-zinc-700'
            }`}
          >
            {badge}
          </span>
        )}
      </span>
    </div>
  )
}
