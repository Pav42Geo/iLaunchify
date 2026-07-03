// Print-job skin for LABEL dispatches — Partner Role Accounts P2
// (docs/PARTNER_ROLE_ACCOUNTS.md §3.3.A). Two panels:
//
//   1. Print contract — the printer's OWN output spec echoed back as the terms
//      this job was routed against (the platform normalized the print master
//      to it; die-line normalization spec owns the artifact).
//   2. Artwork gate — the printer's accept/flag decision point. The PLATFORM
//      owns preflight (Studio produces the print master); the printer's gate
//      is "accept or flag the received file". Flagging routes through the
//      existing structured change-request flow (Phase H) — platform-mediated,
//      the creator never hears from the printer directly.
//
// Server component; no client state — actions live in the DispatchActions rail.

import { FileCheck2, Palette, AlertTriangle } from 'lucide-react'

export interface PrintOutputSpecView {
  preferredFileFormat: string
  colorSpace: string
  iccProfile: string | null
  tacLimitPct: number
  spotColorsAccepted: boolean
  minDpi: number
  bleedMm: string
  fontPolicy: string
  dielineDeliveryFormat: string
  dielineLayerName: string | null
}

const ARTWORK_FLAG_REASONS = [
  'Wrong die-line version',
  'Missing / insufficient bleed',
  'Below minimum DPI',
  'Unprintable spot channel',
  'Color space mismatch',
  'Other (describe)',
]

export function PrintJobCard({
  spec,
  status,
}: {
  spec: PrintOutputSpecView | null
  status: string
}) {
  const preAcceptance = status === 'PENDING_ACCEPT' || status === 'CHANGES_REQUESTED'

  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5">
      <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink-900">
        <Palette className="h-4 w-4 text-ink-500" aria-hidden="true" /> Print contract
      </h2>
      <p className="mt-1 text-[12px] text-ink-600">
        This job&apos;s print master was normalized to your published output spec — these are the
        terms it was routed against.
      </p>
      {spec ? (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-3">
          <SpecField label="File format" value={spec.preferredFileFormat.replace(/_/g, '-')} />
          <SpecField label="Color space" value={spec.colorSpace} />
          <SpecField label="Min resolution" value={`${spec.minDpi} DPI`} />
          <SpecField label="Bleed" value={`${spec.bleedMm} mm`} />
          <SpecField label="TAC limit" value={`${spec.tacLimitPct}%`} />
          <SpecField label="Spot colors" value={spec.spotColorsAccepted ? 'Accepted' : 'Not accepted'} />
          <SpecField label="Fonts" value={spec.fontPolicy.toLowerCase()} />
          <SpecField label="Die-line delivery" value={spec.dielineDeliveryFormat.replace(/_/g, ' ').toLowerCase()} />
          {spec.iccProfile && <SpecField label="ICC profile" value={spec.iccProfile} />}
        </dl>
      ) : (
        <p className="mt-3 rounded-lg border border-warning-200 bg-warning-50/60 px-3 py-2 text-[12.5px] text-warning-800">
          No output spec on file for this service — set one under Prepress output so jobs are
          normalized to your press requirements.
        </p>
      )}

      {/* Artwork gate */}
      <div className="mt-5 rounded-xl border border-ink-100 bg-ink-50/60 p-4">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-ink-900">
          <FileCheck2 className="h-4 w-4 text-ink-500" aria-hidden="true" /> Artwork gate
        </h3>
        {preAcceptance ? (
          <>
            <p className="mt-1 text-[12.5px] text-ink-700">
              <span className="font-medium">Accepting this job confirms the received print master
              is printable as-is.</span>{' '}
              If it isn&apos;t, use <span className="font-medium">Request changes</span> in the
              action rail and name the problem — iLaunchify mediates with the creator and reroutes
              a corrected master; you never chase artwork yourself.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {ARTWORK_FLAG_REASONS.map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-2 py-[3px] text-[11px] text-ink-600"
                >
                  <AlertTriangle className="h-2.5 w-2.5 text-warning-500" aria-hidden="true" />
                  {r}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-1 text-[12.5px] text-ink-600">
            Artwork was confirmed printable at acceptance. Defects found in production or after
            delivery go through the platform&apos;s defect workflow — never directly to the creator.
          </p>
        )}
      </div>
    </section>
  )
}

function SpecField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink-900">{value}</dd>
    </div>
  )
}
