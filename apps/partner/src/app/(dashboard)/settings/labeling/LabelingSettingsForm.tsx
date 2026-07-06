'use client'

// Labeling & value-added capability editor (docs/PRINT_PROVIDER_SELECTION.md).
// One page, per-service cards: manufacturing (labeling mode + application),
// co-packing (application), fulfillment (VAS job catalog, admin-verified).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { saveLabelingCapabilities, saveVasService, removeVasService, saveSampleCapable } from './actions'

// ---------------------------------------------------------------------------

const MODE_OPTIONS = [
  {
    value: 'IN_HOUSE',
    label: 'We print everything in-house',
    help: 'No external print providers are ever offered on your products.',
  },
  {
    value: 'EXTERNAL_ALLOWED',
    label: 'We can print, but external printers are fine',
    help: 'The default. Creators may pick a print partner; you remain the fallback.',
  },
  {
    value: 'EXTERNAL_REQUIRED',
    label: "We don't print — a print partner is required",
    help: 'Products can only be ordered when a qualified print provider exists.',
  },
] as const

const VAS_JOB_OPTIONS = [
  { value: 'RELABEL', label: 'Relabel / label application', help: 'Apply or replace product labels' },
  { value: 'KITTING', label: 'Kitting', help: 'Combine components into sellable kits' },
  { value: 'LIGHT_ASSEMBLY', label: 'Light assembly', help: 'Simple assembly, no production equipment' },
  { value: 'BAGGING_BUNDLING', label: 'Bagging / bundling', help: 'Polybag, shrink-band, multipack banding' },
  { value: 'DISPLAY_BUILDS', label: 'Display builds', help: 'Retail display assembly' },
  { value: 'REWORK', label: 'Rework', help: 'Correction jobs (wrong label, market swaps)' },
] as const

const APPLY_METHOD_OPTIONS = [
  { value: 'PRESSURE_SENSITIVE_LABEL', label: 'Pressure-sensitive labels' },
  { value: 'SHRINK_SLEEVE', label: 'Shrink sleeves (steam tunnel)' },
  { value: 'HEAT_TRANSFER', label: 'Heat transfer' },
] as const

export interface ServiceView {
  id: string
  type: string
  labelingMode: string
  appliesLabels: boolean
}

export interface VasRowView {
  jobType: string
  labelMethods: string[]
  feeCentsPerUnit: number
  minUnits: number
  leadTimeDays: number
  notes: string | null
  status: string
}

const inputCls =
  'mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200'

// ---------------------------------------------------------------------------
// Producing services — labeling mode + application
// ---------------------------------------------------------------------------

export function ProducingServiceCard({ service, label }: { service: ServiceView; label: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [mode, setMode] = useState(service.labelingMode)
  const [applies, setApplies] = useState(service.appliesLabels)

  function save(next: { labelingMode?: string; appliesLabels?: boolean }) {
    start(async () => {
      const r = await saveLabelingCapabilities({
        serviceId: service.id,
        ...(next.labelingMode ? { labelingMode: next.labelingMode as never } : {}),
        ...(typeof next.appliesLabels === 'boolean' ? { appliesLabels: next.appliesLabels } : {}),
      })
      if (r.ok) {
        toast.success('Saved')
        router.refresh()
      } else toast.error(r.error)
    })
  }

  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5">
      <h2 className="font-display text-[15px] font-semibold text-ink-900">{label}</h2>

      {service.type === 'MANUFACTURING' && (
        <fieldset className="mt-4" disabled={pending}>
          <legend className="text-[12.5px] font-medium text-ink-700">Who prints your products' decoration?</legend>
          <p className="mt-0.5 text-[11.5px] text-ink-500">
            This decides whether creators see print-provider options on your product pages —
            changes are audited and affect routing immediately.
          </p>
          <div className="mt-2 space-y-2">
            {MODE_OPTIONS.map((o) => (
              <label
                key={o.value}
                className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors ${
                  mode === o.value ? 'border-ink-900 bg-ink-50/60' : 'border-ink-200 hover:border-ink-400'
                }`}
              >
                <input
                  type="radio"
                  name={`mode-${service.id}`}
                  checked={mode === o.value}
                  onChange={() => {
                    setMode(o.value)
                    save({ labelingMode: o.value })
                  }}
                  className="mt-0.5 accent-pink-600"
                />
                <span>
                  <span className="block text-[13.5px] font-medium text-ink-900">{o.label}</span>
                  <span className="block text-[12px] text-ink-500">{o.help}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <label className="mt-4 flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={applies}
          disabled={pending}
          onChange={(e) => {
            setApplies(e.target.checked)
            save({ appliesLabels: e.target.checked })
          }}
          className="mt-0.5 accent-pink-600"
        />
        <span>
          <span className="block text-[13.5px] font-medium text-ink-900">
            We apply labels at fill/pack
          </span>
          <span className="block text-[12px] text-ink-500">
            When a separate printer produces labels, they ship to you for application. Turning
            this OFF means your products need a co-packer or qualified fulfillment center in the
            chain — orders that can't finish are blocked before payment.
          </span>
        </span>
      </label>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Print service — sample capability (SR-2.2)
// ---------------------------------------------------------------------------

export function PrinterSampleCard({
  serviceId,
  initialSampleCapable,
}: {
  serviceId: string
  initialSampleCapable: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [capable, setCapable] = useState(initialSampleCapable)

  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5">
      <h2 className="font-display text-[15px] font-semibold text-ink-900">
        Label printing — sample runs
      </h2>
      <label className="mt-3 flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={capable}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked
            setCapable(next)
            startTransition(async () => {
              const res = await saveSampleCapable({ serviceId, sampleCapable: next })
              if (!res.ok) {
                toast.error(res.error)
                setCapable(!next)
                return
              }
              toast.success('Saved.')
              router.refresh()
            })
          }}
          className="mt-0.5 accent-pink-600"
        />
        <span>
          <span className="block text-[13.5px] font-medium text-ink-900">
            We can print 1-unit pre-production samples
          </span>
          <span className="block text-[12px] text-ink-500">
            Samples are how creators pick their printer — the sample&rsquo;s printer wins
            the bulk run when approved. Digital presses usually can; untick this if your
            process (flexo, gravure) makes single-unit runs impractical. Off = you skip the
            sample pool but stay fully available for production orders.
          </span>
        </span>
      </label>
    </section>
  )
}

// ---------------------------------------------------------------------------
// FC value-added services
// ---------------------------------------------------------------------------

export function FcVasCard({ serviceId, rows }: { serviceId: string; rows: VasRowView[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [adding, setAdding] = useState(false)
  const [jobType, setJobType] = useState<string>('RELABEL')
  const [methods, setMethods] = useState<string[]>([])
  const [fee, setFee] = useState('')
  const [minUnits, setMinUnits] = useState('1')
  const [leadDays, setLeadDays] = useState('2')
  const [notes, setNotes] = useState('')

  const existing = new Set(rows.map((r) => r.jobType))
  const addable = VAS_JOB_OPTIONS.filter((o) => !existing.has(o.value))

  function submit() {
    start(async () => {
      const r = await saveVasService({
        serviceId,
        jobType: jobType as never,
        labelMethods: methods as never,
        feeCentsPerUnit: Math.round(Number(fee) * 100),
        minUnits: Number(minUnits),
        leadTimeDays: Number(leadDays),
        notes,
      })
      if (r.ok) {
        toast.success('Submitted — an admin verifies it before it goes live')
        setAdding(false)
        setMethods([])
        setFee('')
        setNotes('')
        router.refresh()
      } else toast.error(r.error)
    })
  }

  function remove(jt: string) {
    start(async () => {
      const r = await removeVasService({ serviceId, jobType: jt as never })
      if (r.ok) router.refresh()
      else toast.error(r.error)
    })
  }

  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[15px] font-semibold text-ink-900">
          Fulfillment value-added services
        </h2>
        {!adding && addable.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setJobType(addable[0]!.value)
              setAdding(true)
            }}
            className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-medium text-ink-700 hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            + Declare a service
          </button>
        )}
      </div>
      <p className="mt-1 text-[12px] text-ink-600">
        Jobs your floor can run beyond pick/pack — relabeling, kitting, and more. Every
        declaration is <span className="font-medium text-ink-900">verified by iLaunchify before it goes live</span>;
        verified relabel capability lets orders finalize labeling at your facility.
      </p>

      {rows.length > 0 && (
        <ul className="mt-4 divide-y divide-ink-50 rounded-xl border border-ink-100">
          {rows.map((r) => (
            <li key={r.jobType} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]">
              <span className="font-medium text-ink-900">
                {VAS_JOB_OPTIONS.find((o) => o.value === r.jobType)?.label ?? r.jobType}
              </span>
              {r.jobType === 'RELABEL' && (
                <span className="text-[11.5px] text-ink-500">
                  {r.labelMethods
                    .map((m) => APPLY_METHOD_OPTIONS.find((o) => o.value === m)?.label ?? m)
                    .join(' · ')}
                </span>
              )}
              <span className="text-ink-600">
                ${(r.feeCentsPerUnit / 100).toFixed(2)}/unit · min {r.minUnits} · {r.leadTimeDays}d
              </span>
              <span
                className={`ml-auto rounded px-1.5 py-0.5 text-[10.5px] font-medium ${
                  r.status === 'ACTIVE' ? 'bg-success-50 text-success-800' : 'bg-warning-50 text-warning-900'
                }`}
              >
                {r.status === 'ACTIVE' ? 'Verified · live' : 'Awaiting verification'}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => remove(r.jobType)}
                className="text-[11.5px] font-medium text-ink-500 hover:text-danger-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="mt-4 rounded-xl border border-ink-100 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[12px] font-medium text-ink-700">
              Service
              <select value={jobType} onChange={(e) => setJobType(e.target.value)} className={inputCls}>
                {addable.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[12px] font-medium text-ink-700">
              Fee per unit (USD)
              <input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" placeholder="0.35" className={inputCls} />
            </label>
            <label className="block text-[12px] font-medium text-ink-700">
              Minimum units
              <input value={minUnits} onChange={(e) => setMinUnits(e.target.value)} inputMode="numeric" className={inputCls} />
            </label>
            <label className="block text-[12px] font-medium text-ink-700">
              Lead time (days)
              <input value={leadDays} onChange={(e) => setLeadDays(e.target.value)} inputMode="numeric" className={inputCls} />
            </label>
          </div>

          {jobType === 'RELABEL' && (
            <fieldset className="mt-3">
              <legend className="text-[12px] font-medium text-ink-700">
                Application methods your floor can run
              </legend>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {APPLY_METHOD_OPTIONS.map((m) => (
                  <label
                    key={m.value}
                    className={`cursor-pointer rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                      methods.includes(m.value)
                        ? 'border-ink-900 bg-ink-900 text-white'
                        : 'border-ink-200 text-ink-600 hover:border-ink-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={methods.includes(m.value)}
                      onChange={(e) =>
                        setMethods((prev) =>
                          e.target.checked ? [...prev, m.value] : prev.filter((x) => x !== m.value),
                        )
                      }
                      className="sr-only"
                    />
                    {m.label}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-ink-500">
                Shrink sleeves need a steam tunnel — only declare what you can actually run.
              </p>
            </fieldset>
          )}

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Equipment / constraints the verifier should know (optional)"
            className={`${inputCls} mt-3`}
          />
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded-full border border-ink-200 px-3.5 py-1.5 text-[12px] font-medium text-ink-600 hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending || !fee}
              onClick={submit}
              className="rounded-full bg-ink-900 px-4 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            >
              Submit for verification
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
