'use client'

// Adaptive, service-composed application (docs/PARTNER_APPLICATION_ADAPTIVE_2026-07.md).
// The middle steps are the UNION of the question cards for the services the
// applicant selects — a 3PL never sees "what products do you make?". Card/survey
// shell from the approved prototype.

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Input, Label } from '@ilaunchify/ui'
import { CertificatePicker, type CertPickerOption } from '@/components/CertificatePicker'
import { submitLead } from './actions'

const Schema = z.object({
  companyName: z.string().min(2, 'Company name required').max(120),
  legalName: z.string().max(120).optional().or(z.literal('')),
  yearsInBusiness: z.string().max(20).optional().or(z.literal('')),
  serviceTypes: z
    .array(z.enum(['MANUFACTURING', 'COPACKING', 'LABEL_PRINTING', 'WAREHOUSE']))
    .min(1, 'Pick at least one service'),
  certificateTypeIds: z.array(z.string()).default([]),
  contactName: z.string().min(2, 'Your name').max(80),
  email: z.string().email('Valid email required'),
  phone: z.string().max(30).optional().or(z.literal('')),
  website: z.string().url('Must be a valid URL').max(200).optional().or(z.literal('')),
  producedFor: z.string().max(600).optional().or(z.literal('')),
  successDescription: z.string().min(20, 'A few words on what success looks like').max(800),
})
type Values = z.infer<typeof Schema>
type ServiceT = Values['serviceTypes'][number]

const SERVICE_ORDER: ServiceT[] = ['MANUFACTURING', 'COPACKING', 'LABEL_PRINTING', 'WAREHOUSE']
const SERVICE: Record<ServiceT, { label: string; sub: string }> = {
  MANUFACTURING: { label: 'Manufacturing', sub: 'Make from scratch' },
  COPACKING: { label: 'Co-packing', sub: 'Fill & package' },
  LABEL_PRINTING: { label: 'Packaging printing', sub: 'Labels · sleeves · cartons · flexible' },
  WAREHOUSE: { label: 'Fulfillment (3PL)', sub: 'Store · pick · pack · ship' },
}

const MFG_CATEGORIES: [string, string][] = [
  ['FOOD', 'Food'],
  ['BEVERAGE_FUNCTIONAL', 'Beverage'],
  ['SUPPLEMENT', 'Supplement'],
  ['COSMETIC', 'Cosmetic'],
  ['PET', 'Pet'],
]
const MFG_PROCESSES = ['Hot-fill', 'Cold-fill', 'HPP', 'Pasteurization', 'Blending', 'Encapsulation', 'Spray-dry', 'Aseptic']
const MODELS: [string, string, string][] = [
  ['white', 'White label', 'Your existing product, their label — fastest, lowest MOQ'],
  ['private', 'Private label', 'Your base formula, customized under their brand'],
  ['custom', 'Fully customized', 'Bespoke formulation from their spec'],
]
const COPACK_FORMATS = ['Bottles', 'Jars', 'Pouches', 'Sachets', 'Cartons', 'Cans', 'Shrink sleeves', 'Blister']
const FILL_TYPES = ['Powder', 'Liquid', 'Capsule / tablet', 'Cream / gel', 'Aerosol']
const PRINT_WHAT = ['Labels', 'Shrink sleeves', 'Folding cartons', 'Flexible packaging']
const PRINT_METHODS = ['Digital', 'Flexo', 'Offset', 'Gravure', 'Screen']
const STORAGE_CLASSES = ['Ambient', 'Refrigerated', 'Frozen', 'Hazmat']
const VALUE_ADDS = ['Kitting', 'Assembly', 'Returns', 'Pick & pack']

type Detail = Record<string, string[] | string>

export function ApplicationWizard({
  defaultServiceTypes = [],
  certOptions = [],
}: {
  defaultServiceTypes?: ServiceT[]
  certOptions?: CertPickerOption[]
}) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState<'next' | 'back'>('next')
  const [busy, setBusy] = useState(false)
  const [details, setDetails] = useState<Record<string, Detail>>({})

  const form = useForm<Values>({
    resolver: zodResolver(Schema),
    defaultValues: {
      companyName: '',
      legalName: '',
      yearsInBusiness: '',
      serviceTypes: defaultServiceTypes,
      certificateTypeIds: [],
      contactName: '',
      email: '',
      phone: '',
      website: '',
      producedFor: '',
      successDescription: '',
    },
  })
  const { register, watch, setValue, trigger, handleSubmit, formState } = form

  function toggleService(v: ServiceT) {
    const cur = watch('serviceTypes')
    setValue('serviceTypes', cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v], {
      shouldValidate: true,
    })
  }
  // per-service detail helpers
  const arr = (svc: string, key: string) => (details[svc]?.[key] as string[]) ?? []
  const str = (svc: string, key: string) => (details[svc]?.[key] as string) ?? ''
  function toggleDetail(svc: string, key: string, val: string) {
    setDetails((d) => {
      const cur = (d[svc]?.[key] as string[]) ?? []
      const next = cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val]
      return { ...d, [svc]: { ...d[svc], [key]: next } }
    })
  }
  function setDetail(svc: string, key: string, val: string) {
    setDetails((d) => ({ ...d, [svc]: { ...d[svc], [key]: val } }))
  }

  const activeServices = SERVICE_ORDER.filter((s) => watch('serviceTypes').includes(s))
  const STEPS: { fields: (keyof Values)[]; render: () => React.ReactNode }[] = [
    { fields: ['companyName'], render: stepCompany },
    { fields: ['serviceTypes'], render: stepServices },
    ...activeServices.map((s) => ({ fields: [] as (keyof Values)[], render: () => stepService(s) })),
    { fields: [], render: stepCerts },
    { fields: ['contactName', 'email', 'successDescription'], render: stepContact },
  ]
  const total = STEPS.length
  const cur = Math.min(step, total - 1)
  const last = cur === total - 1
  const pct = Math.round(((cur + 1) / total) * 100)

  async function next() {
    const ok = await trigger(STEPS[cur]!.fields as never)
    if (!ok) return
    if (!last) {
      setDir('next')
      setStep(cur + 1)
    } else {
      handleSubmit(onSubmit)()
    }
  }
  function back() {
    if (cur > 0) {
      setDir('back')
      setStep(cur - 1)
    }
  }
  async function onSubmit(values: Values) {
    setBusy(true)
    const serviceDetails: Record<string, unknown> = {}
    for (const s of activeServices) serviceDetails[s] = details[s] ?? {}
    const r = await submitLead({ ...values, serviceDetails })
    if (!r.ok) {
      toast.error(r.error)
      setBusy(false)
    } else {
      toast.success('Application received')
      router.push('/partners/thanks')
    }
  }

  // ---- shared steps ----
  function stepCompany() {
    return (
      <>
        <Eyebrow>About your company</Eyebrow>
        <H>
          Let&apos;s start with <Em>the basics.</Em>
        </H>
        <Sub>Takes ~2 minutes. No account needed yet — if it&apos;s a fit we&apos;ll invite you to onboard.</Sub>
        <FieldBox label="Company name" error={formState.errors.companyName?.message}>
          <Input placeholder="Northwind Co." {...register('companyName')} />
        </FieldBox>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldBox label="Legal name (if different)">
            <Input placeholder="Northwind Co. LLC" {...register('legalName')} />
          </FieldBox>
          <FieldBox label="Years in business">
            <Input placeholder="e.g. 8" {...register('yearsInBusiness')} />
          </FieldBox>
        </div>
      </>
    )
  }
  function stepServices() {
    const svc = watch('serviceTypes')
    return (
      <>
        <Eyebrow>Your services</Eyebrow>
        <H>
          What do you <Em>offer?</Em>
        </H>
        <Sub>Pick everything you do — we&apos;ll only ask about the services you select.</Sub>
        <div className="space-y-2.5">
          {SERVICE_ORDER.map((s) => {
            const on = svc.includes(s)
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleService(s)}
                aria-pressed={on}
                className={
                  'block w-full rounded-2xl border px-4 py-3.5 text-left transition-colors ' +
                  (on ? 'border-pink-500 bg-pink-50' : 'border-ink-200 bg-white hover:border-ink-300')
                }
              >
                <span className={'text-[14px] font-bold ' + (on ? 'text-pink-700' : 'text-ink-800')}>
                  {on ? '✓ ' : ''}
                  {SERVICE[s].label}
                </span>
                <span className={'mt-0.5 block text-[12px] ' + (on ? 'text-pink-700' : 'text-ink-500')}>
                  {SERVICE[s].sub}
                </span>
              </button>
            )
          })}
        </div>
        {formState.errors.serviceTypes && (
          <p className="mt-2 text-[12px] text-danger-600">
            {formState.errors.serviceTypes.message as string}
          </p>
        )}
      </>
    )
  }
  function stepCerts() {
    return (
      <>
        <Eyebrow>Compliance</Eyebrow>
        <H>
          Which certifications <Em>do you hold?</Em>
        </H>
        <Sub>Pick every one you hold — you&apos;ll upload the PDFs during onboarding.</Sub>
        <CertificatePicker
          options={certOptions}
          value={watch('certificateTypeIds')}
          onChange={(ids) => setValue('certificateTypeIds', ids, { shouldValidate: true })}
        />
      </>
    )
  }
  function stepContact() {
    return (
      <>
        <Eyebrow>Almost there</Eyebrow>
        <H>
          Who should we <Em>reach out to?</Em>
        </H>
        <Sub>And a couple lines of context so we can judge fit.</Sub>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldBox label="Your name" error={formState.errors.contactName?.message}>
            <Input placeholder="Jane Doe" {...register('contactName')} />
          </FieldBox>
          <FieldBox label="Work email" error={formState.errors.email?.message}>
            <Input type="email" placeholder="you@company.com" {...register('email')} />
          </FieldBox>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldBox label="Phone (optional)">
            <Input {...register('phone')} />
          </FieldBox>
          <FieldBox label="Website" error={formState.errors.website?.message}>
            <Input placeholder="https://" {...register('website')} />
          </FieldBox>
        </div>
        <FieldBox label="Who have you produced for? (brands / categories)">
          <textarea
            className="flex min-h-[60px] w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm placeholder:text-ink-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            placeholder="A few brands or product types you've made."
            {...register('producedFor')}
          />
        </FieldBox>
        <FieldBox
          label="What does success on iLaunchify look like for you?"
          error={formState.errors.successDescription?.message}
        >
          <textarea
            className="flex min-h-[72px] w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm placeholder:text-ink-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            {...register('successDescription')}
          />
        </FieldBox>
      </>
    )
  }

  // ---- per-service cards ----
  function stepService(s: ServiceT) {
    return (
      <>
        <Eyebrow>{SERVICE[s].label}</Eyebrow>
        {s === 'MANUFACTURING' && manufacturingCard()}
        {s === 'COPACKING' && copackingCard()}
        {s === 'LABEL_PRINTING' && printingCard()}
        {s === 'WAREHOUSE' && fulfillmentCard()}
      </>
    )
  }
  function manufacturingCard() {
    const k = 'MANUFACTURING'
    return (
      <>
        <H>
          What do you <Em>make?</Em>
        </H>
        <Sub>A small-batch white / private-label runner is our sweet spot.</Sub>
        <FieldBox label="Product categories">
          <Chips>
            {MFG_CATEGORIES.map(([v, l]) => (
              <Chip key={v} on={arr(k, 'categories').includes(v)} onClick={() => toggleDetail(k, 'categories', v)}>
                {l}
              </Chip>
            ))}
          </Chips>
        </FieldBox>
        <FieldBox label="Processes you run">
          <Chips>
            {MFG_PROCESSES.map((p) => (
              <Chip key={p} on={arr(k, 'processes').includes(p)} onClick={() => toggleDetail(k, 'processes', p)}>
                {p}
              </Chip>
            ))}
          </Chips>
        </FieldBox>
        <FieldBox label="Which do you offer?">
          <Chips>
            {MODELS.map(([v, l]) => (
              <Chip key={v} on={arr(k, 'models').includes(v)} onClick={() => toggleDetail(k, 'models', v)}>
                {l}
              </Chip>
            ))}
          </Chips>
        </FieldBox>
        <FieldBox label="Smallest run you'll take">
          <Input placeholder="e.g. 500 units" value={str(k, 'minRun')} onChange={(e) => setDetail(k, 'minRun', e.target.value)} />
        </FieldBox>
      </>
    )
  }
  function copackingCard() {
    const k = 'COPACKING'
    return (
      <>
        <H>
          How do you <Em>pack?</Em>
        </H>
        <Sub>You fill and package goods — tell us the formats and fills you run.</Sub>
        <FieldBox label="Packaging formats you handle">
          <Chips>
            {COPACK_FORMATS.map((f) => (
              <Chip key={f} on={arr(k, 'formats').includes(f)} onClick={() => toggleDetail(k, 'formats', f)}>
                {f}
              </Chip>
            ))}
          </Chips>
        </FieldBox>
        <FieldBox label="Fill types">
          <Chips>
            {FILL_TYPES.map((f) => (
              <Chip key={f} on={arr(k, 'fills').includes(f)} onClick={() => toggleDetail(k, 'fills', f)}>
                {f}
              </Chip>
            ))}
          </Chips>
        </FieldBox>
        <FieldBox label="Do you supply the packaging?">
          <Chips>
            {['Yes, we source it', 'No, brand supplies'].map((o) => (
              <Chip key={o} on={str(k, 'supply') === o} onClick={() => setDetail(k, 'supply', o)}>
                {o}
              </Chip>
            ))}
          </Chips>
        </FieldBox>
        <FieldBox label="Smallest run you'll take">
          <Input placeholder="e.g. 1,000 units" value={str(k, 'minRun')} onChange={(e) => setDetail(k, 'minRun', e.target.value)} />
        </FieldBox>
      </>
    )
  }
  function printingCard() {
    const k = 'LABEL_PRINTING'
    return (
      <>
        <H>
          What do you <Em>print?</Em>
        </H>
        <Sub>You print packaging materials — labels, sleeves, cartons, flexible.</Sub>
        <FieldBox label="What you print">
          <Chips>
            {PRINT_WHAT.map((f) => (
              <Chip key={f} on={arr(k, 'prints').includes(f)} onClick={() => toggleDetail(k, 'prints', f)}>
                {f}
              </Chip>
            ))}
          </Chips>
        </FieldBox>
        <FieldBox label="Print methods">
          <Chips>
            {PRINT_METHODS.map((m) => (
              <Chip key={m} on={arr(k, 'methods').includes(m)} onClick={() => toggleDetail(k, 'methods', m)}>
                {m}
              </Chip>
            ))}
          </Chips>
        </FieldBox>
        <FieldBox label="Smallest run you'll take">
          <Input placeholder="e.g. 2,000 units" value={str(k, 'minRun')} onChange={(e) => setDetail(k, 'minRun', e.target.value)} />
        </FieldBox>
      </>
    )
  }
  function fulfillmentCard() {
    const k = 'WAREHOUSE'
    return (
      <>
        <H>
          How do you <Em>fulfill?</Em>
        </H>
        <Sub>You store finished goods and ship them — no products of your own needed.</Sub>
        <FieldBox label="Storage classes">
          <Chips>
            {STORAGE_CLASSES.map((c) => (
              <Chip key={c} on={arr(k, 'storage').includes(c)} onClick={() => toggleDetail(k, 'storage', c)}>
                {c}
              </Chip>
            ))}
          </Chips>
        </FieldBox>
        <FieldBox label="Value-added services">
          <Chips>
            {VALUE_ADDS.map((c) => (
              <Chip key={c} on={arr(k, 'vas').includes(c)} onClick={() => toggleDetail(k, 'vas', c)}>
                {c}
              </Chip>
            ))}
          </Chips>
        </FieldBox>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldBox label="Rough capacity">
            <Input placeholder="e.g. 500 pallets" value={str(k, 'capacity')} onChange={(e) => setDetail(k, 'capacity', e.target.value)} />
          </FieldBox>
          <FieldBox label="Location (city / state)">
            <Input placeholder="Columbus, OH" value={str(k, 'location')} onChange={(e) => setDetail(k, 'location', e.target.value)} />
          </FieldBox>
        </div>
      </>
    )
  }

  return (
    <div className="mx-auto max-w-[620px] px-5 pb-24 pt-8">
      <style>{`@keyframes appN{from{opacity:0;transform:translateX(28px) scale(.99)}to{opacity:1;transform:none}}@keyframes appB{from{opacity:0;transform:translateX(-28px) scale(.99)}to{opacity:1;transform:none}}`}</style>
      <div className="mb-1.5 flex items-center justify-between text-[12.5px] font-semibold text-ink-500">
        <span>Step {cur + 1} of {total}</span>
        <span>{pct}%</span>
      </div>
      <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-ink-200">
        <div className="h-full rounded-full bg-pink-500 transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      <div
        key={cur}
        style={{ animation: `${dir === 'next' ? 'appN' : 'appB'} .32s cubic-bezier(.22,.61,.36,1)` }}
        className="rounded-3xl border border-ink-200 bg-white p-7 shadow-[0_18px_50px_-28px_rgba(20,20,25,0.35)]"
      >
        {STEPS[cur]!.render()}
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={back}
            disabled={cur === 0}
            className="rounded-full px-2 py-2.5 text-[14px] font-semibold text-ink-600 disabled:opacity-35"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={next}
            disabled={busy}
            className={
              'rounded-full px-6 py-3 text-[14px] font-bold text-white disabled:opacity-60 ' +
              (last ? 'bg-pink-600 hover:opacity-90' : 'bg-ink-900 hover:opacity-90')
            }
          >
            {last ? (busy ? 'Submitting…' : 'Submit application') : 'Continue →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- presentational helpers ----
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-pink-700">{children}</div>
}
function H({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-1 mt-2 font-display text-[26px] font-extrabold leading-[1.05] tracking-[-0.03em] text-ink-900">
      {children}
    </h2>
  )
}
function Em({ children }: { children: React.ReactNode }) {
  return <span className="font-serif font-medium italic text-pink-500">{children}</span>
}
function Sub({ children }: { children: React.ReactNode }) {
  return <p className="mb-5 text-[14px] leading-[1.5] text-ink-600">{children}</p>
}
function FieldBox({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-[12px] text-danger-600">{error}</p>}
    </div>
  )
}
function Chips({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={
        'rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors ' +
        (on ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300')
      }
    >
      {on ? '✓ ' : ''}
      {children}
    </button>
  )
}
