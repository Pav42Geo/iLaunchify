'use client'

// Multi-step "card / survey" application (approved prototype:
// design/partner-application-cards-mockup.html). One card per logical group,
// slide transition, progress bar. Same submitLead contract — just re-housed +
// the private-label / min-run / years / references qualification fields.

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
  productCategories: z
    .array(z.enum(['FOOD', 'BEVERAGE_FUNCTIONAL', 'SUPPLEMENT', 'COSMETIC', 'PET']))
    .default([]),
  productModels: z.array(z.enum(['WHITE_LABEL', 'PRIVATE_LABEL', 'FULLY_CUSTOM'])).default([]),
  minRunUnits: z.string().max(40).optional().or(z.literal('')),
  monthlyCapacity: z.string().max(80).optional().or(z.literal('')),
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
type CategoryT = Values['productCategories'][number]
type ModelT = Values['productModels'][number]

const SERVICES: [ServiceT, string][] = [
  ['MANUFACTURING', 'Manufacturing'],
  ['COPACKING', 'Co-packing'],
  ['LABEL_PRINTING', 'Label printing'],
  ['WAREHOUSE', 'Fulfillment / warehouse'],
]
const CATEGORIES: [CategoryT, string][] = [
  ['FOOD', 'Food'],
  ['BEVERAGE_FUNCTIONAL', 'Beverage'],
  ['SUPPLEMENT', 'Supplement'],
  ['COSMETIC', 'Cosmetic'],
  ['PET', 'Pet'],
]
const MODELS: [ModelT, string, string][] = [
  ['WHITE_LABEL', 'White label', 'Your existing product, their label — fastest, lowest MOQ'],
  ['PRIVATE_LABEL', 'Private label', 'Your base formula, customized (flavor / packaging) under their brand'],
  ['FULLY_CUSTOM', 'Fully customized', 'Bespoke formulation built from their spec'],
]

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

  const form = useForm<Values>({
    resolver: zodResolver(Schema),
    defaultValues: {
      companyName: '',
      legalName: '',
      yearsInBusiness: '',
      serviceTypes: defaultServiceTypes,
      productCategories: [],
      productModels: [],
      minRunUnits: '',
      monthlyCapacity: '',
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

  function toggle<T extends string>(field: keyof Values, val: T) {
    const cur = (watch(field) as unknown as T[]) ?? []
    setValue(
      field,
      (cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val]) as never,
      { shouldValidate: true },
    )
  }

  const STEPS: { fields: (keyof Values)[]; render: () => React.ReactNode }[] = [
    { fields: ['companyName'], render: stepCompany },
    { fields: ['serviceTypes'], render: stepCapabilities },
    { fields: [], render: stepModel },
    { fields: [], render: stepCerts },
    { fields: ['contactName', 'email', 'successDescription'], render: stepContact },
  ]
  const total = STEPS.length
  const last = step === total - 1
  const pct = Math.round(((step + 1) / total) * 100)

  async function next() {
    const ok = await trigger(STEPS[step]!.fields as never)
    if (!ok) return
    if (!last) {
      setDir('next')
      setStep(step + 1)
    } else {
      handleSubmit(onSubmit)()
    }
  }
  function back() {
    if (step > 0) {
      setDir('back')
      setStep(step - 1)
    }
  }
  async function onSubmit(v: Values) {
    setBusy(true)
    const r = await submitLead(v)
    if (!r.ok) {
      toast.error(r.error)
      setBusy(false)
    } else {
      toast.success('Application received')
      router.push('/partners/thanks')
    }
  }

  // ---- step renderers ----
  function stepCompany() {
    return (
      <>
        <Eyebrow>About your company</Eyebrow>
        <H>
          Let&apos;s start with <Em>the basics.</Em>
        </H>
        <Sub>Takes ~2 minutes. No account needed yet — if it&apos;s a fit we&apos;ll send a private invite to onboard.</Sub>
        <FieldBox label="Company name" error={formState.errors.companyName?.message}>
          <Input placeholder="Northwind Print Co." {...register('companyName')} />
        </FieldBox>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldBox label="Legal name (if different)">
            <Input placeholder="Northwind Print Co. LLC" {...register('legalName')} />
          </FieldBox>
          <FieldBox label="Years in business">
            <Input placeholder="e.g. 8" {...register('yearsInBusiness')} />
          </FieldBox>
        </div>
      </>
    )
  }
  function stepCapabilities() {
    const svc = watch('serviceTypes') ?? []
    const cats = watch('productCategories') ?? []
    return (
      <>
        <Eyebrow>Capabilities</Eyebrow>
        <H>
          What can you <Em>make?</Em>
        </H>
        <Sub>Pick everything that applies — you can run several. This drives what we route to you.</Sub>
        <FieldBox label="Services you offer" error={formState.errors.serviceTypes?.message as string | undefined}>
          <Chips>
            {SERVICES.map(([v, l]) => (
              <Chip key={v} on={svc.includes(v)} onClick={() => toggle('serviceTypes', v)}>
                {l}
              </Chip>
            ))}
          </Chips>
        </FieldBox>
        <div className="mt-4">
          <FieldBox label="Product categories you produce">
            <Chips>
              {CATEGORIES.map(([v, l]) => (
                <Chip key={v} on={cats.includes(v)} onClick={() => toggle('productCategories', v)}>
                  {l}
                </Chip>
              ))}
            </Chips>
          </FieldBox>
        </div>
      </>
    )
  }
  function stepModel() {
    const models = watch('productModels') ?? []
    return (
      <>
        <Eyebrow>How you run</Eyebrow>
        <H>
          What kind of products <Em>do you offer?</Em>
        </H>
        <Sub>
          Pick all that apply — this tells us which creators to route to you. A small-batch white /
          private-label runner is our sweet spot.
        </Sub>
        <div className="space-y-2.5">
          {MODELS.map(([v, name, desc]) => {
            const on = models.includes(v)
            return (
              <button
                key={v}
                type="button"
                onClick={() => toggle('productModels', v)}
                aria-pressed={on}
                className={
                  'block w-full rounded-2xl border px-4 py-3.5 text-left transition-colors ' +
                  (on ? 'border-pink-500 bg-pink-50' : 'border-ink-200 bg-white hover:border-ink-300')
                }
              >
                <span className={'text-[14px] font-bold ' + (on ? 'text-pink-700' : 'text-ink-800')}>
                  {on ? '✓ ' : ''}
                  {name}
                </span>
                <span className={'mt-0.5 block text-[12px] ' + (on ? 'text-pink-700' : 'text-ink-500')}>
                  {desc}
                </span>
              </button>
            )
          })}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldBox label="Smallest run you'll take">
            <Input placeholder="e.g. 500 units" {...register('minRunUnits')} />
          </FieldBox>
          <FieldBox label="Rough monthly capacity">
            <Input placeholder="e.g. 50K units" {...register('monthlyCapacity')} />
          </FieldBox>
        </div>
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
        <Sub>
          Pick every one you hold — you&apos;ll upload the PDFs during onboarding. This tells us which
          categories you can safely serve.
        </Sub>
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
            className="flex min-h-[64px] w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm placeholder:text-ink-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            placeholder="A few brands or product types you've made — proof you've shipped."
            {...register('producedFor')}
          />
        </FieldBox>
        <FieldBox
          label="What does success on iLaunchify look like for you?"
          error={formState.errors.successDescription?.message}
        >
          <textarea
            className="flex min-h-[76px] w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm placeholder:text-ink-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            {...register('successDescription')}
          />
        </FieldBox>
      </>
    )
  }

  return (
    <div className="mx-auto max-w-[620px] px-5 pb-24 pt-8">
      <style>{`@keyframes appN{from{opacity:0;transform:translateX(28px) scale(.99)}to{opacity:1;transform:none}}@keyframes appB{from{opacity:0;transform:translateX(-28px) scale(.99)}to{opacity:1;transform:none}}`}</style>

      <div className="mb-1.5 flex items-center justify-between text-[12.5px] font-semibold text-ink-500">
        <span>Step {step + 1} of {total}</span>
        <span>{pct}%</span>
      </div>
      <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-ink-200">
        <div className="h-full rounded-full bg-pink-500 transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>

      <div
        key={step}
        style={{ animation: `${dir === 'next' ? 'appN' : 'appB'} .32s cubic-bezier(.22,.61,.36,1)` }}
        className="rounded-3xl border border-ink-200 bg-white p-7 shadow-[0_18px_50px_-28px_rgba(20,20,25,0.35)]"
      >
        {STEPS[step]!.render()}

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={back}
            disabled={step === 0}
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

// ---- small presentational helpers ----
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-pink-700">{children}</div>
  )
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
function FieldBox({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
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
        'rounded-full border px-3.5 py-2 text-[13.5px] font-semibold transition-colors ' +
        (on ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300')
      }
    >
      {on ? '✓ ' : ''}
      {children}
    </button>
  )
}
