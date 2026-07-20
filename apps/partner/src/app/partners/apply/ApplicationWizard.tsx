'use client'

// Adaptive, service-composed application (docs/PARTNER_APPLICATION_ADAPTIVE_2026-07.md).
// The middle steps are the UNION of the question cards for the services the
// applicant selects — a 3PL never sees "what products do you make?". Card/survey
// shell from the approved prototype.

import { forwardRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Input, TurnstileWidget, FormField, FieldRow } from '@ilaunchify/ui'
import { ContainerCategory, StructuralPackType, DieCutCategory, StorageClass, FcVasJobType } from '@ilaunchify/db'
import { MANUFACTURING_PROCESS_OPTIONS } from '@ilaunchify/types'
import { CertificatePicker, type CertPickerOption } from '@/components/CertificatePicker'
import { submitLead } from './actions'

// Turnstile is only enforced when a site key is present (feature-gated). (H5 A4)
const TURNSTILE_ON = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

const Schema = z.object({
  companyName: z.string().min(2, 'Company name required').max(120),
  legalName: z.string().max(120).optional().or(z.literal('')),
  yearsInBusiness: z.string().max(20).optional().or(z.literal('')),
  // Company location (carries forward to onboarding via Partner columns) + light
  // scale signals for triage.
  country: z.string().max(4).default('US'),
  regionCode: z.string().max(8).optional().or(z.literal('')),
  city: z.string().max(80).optional().or(z.literal('')),
  facilityCount: z.string().max(12).optional().or(z.literal('')),
  companySize: z.string().max(16).optional().or(z.literal('')),
  entityType: z.string().max(20).optional().or(z.literal('')),
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

// WAREHOUSE (3PL/FC) removed from SELF-SERVE application (Pavel 2026-07-13):
// the Fulfillment Center network is a curated, admin-contracted program — 3PLs
// come in via admin Logistics → Fulfillment Centers, never this wizard. The
// zod enum still accepts WAREHOUSE so previously saved drafts don't break.
const SERVICE_ORDER: ServiceT[] = ['MANUFACTURING', 'COPACKING', 'LABEL_PRINTING']
const SERVICE: Record<ServiceT, { label: string; sub: string }> = {
  MANUFACTURING: { label: 'Manufacturing', sub: 'Make, fill & pack your own product' },
  COPACKING: { label: 'Co-packing', sub: "Fill & pack OTHER brands' products" },
  LABEL_PRINTING: { label: 'Packaging printing', sub: 'Labels · sleeves · cartons · flexible' },
  WAREHOUSE: { label: 'Fulfillment (3PL)', sub: 'Store · pick · pack · ship' },
}

const MFG_CATEGORIES: [string, string][] = [
  ['FOOD', 'Food'],
  ['BEVERAGE_FUNCTIONAL', 'Beverage'],
  ['SUPPLEMENT', 'Supplement'],
  ['COSMETIC', 'Cosmetic'],
  ['PET', 'Pet'],
  // OTC is a real label domain but not live yet — offered here purely to gauge
  // interest (stored as a triage signal, never routed). See DomainSetting.
  ['OTC', 'OTC drug'],
]
const MODELS: [string, string, string][] = [
  ['white', 'White-label products', 'Your existing product, their label — fastest, lowest MOQ'],
  ['private', 'Private-label products', 'Your base formula, customized under their brand'],
  ['custom', 'Fully custom products', 'Bespoke formulation built from their spec'],
]
const ALLERGEN_OPTIONS = [
  'Dedicated allergen-free facility',
  'Shared lines + allergen control plan',
  'No allergen program',
]
const RD_OPTIONS = [
  'In-house R&D / formulation',
  'We tweak an existing base',
  'Bring a finished, tested recipe',
]

// Real platform enums = the full list (nothing to seed — an enum is complete by
// definition). Labels are display-only; stored values are the enum members.
type Opt = { value: string; label: string }
const prettify = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
const enumOpts = (e: Record<string, string>, labels: Record<string, string> = {}): Opt[] =>
  Object.values(e).map((v) => ({ value: v, label: labels[v] ?? prettify(v) }))

// Mirrors the FillProcess enum (packages/db) — the #1 co-packer capability
// signal. Not imported so the app typechecks before db:generate; values are the
// real enum members. Keep in sync with the enum.
const COPACK_PROCESS_OPTS: Opt[] = [
  { value: 'GRAVITY_FILL', label: 'Gravity fill' },
  { value: 'OVERFLOW_FILL', label: 'Overflow (level) fill' },
  { value: 'PISTON_FILL', label: 'Piston / pump fill' },
  { value: 'PRESSURE_VACUUM_FILL', label: 'Pressure / vacuum fill' },
  { value: 'NET_WEIGH_FILL', label: 'Net-weight fill' },
  { value: 'HOT_FILL', label: 'Hot fill' },
  { value: 'COLD_FILL', label: 'Cold / ambient fill' },
  { value: 'ASEPTIC_FILL', label: 'Aseptic fill' },
  { value: 'CARBONATED_FILL', label: 'Carbonated / counter-pressure fill' },
  { value: 'TUNNEL_PASTEURIZATION', label: 'Tunnel pasteurization' },
  { value: 'RETORT_STERILIZATION', label: 'Retort / canning' },
  { value: 'HPP', label: 'High-pressure processing (HPP)' },
  { value: 'AUGER_FILL', label: 'Auger (screw) fill' },
  { value: 'VOLUMETRIC_CUP_FILL', label: 'Volumetric cup fill' },
  { value: 'VFFS_BAGGING', label: 'Vertical form-fill-seal' },
  { value: 'STICK_SACHET_FILL', label: 'Stick-pack / sachet fill' },
  { value: 'VISCOUS_PASTE_CREAM_FILL', label: 'Paste / cream / gel fill' },
  { value: 'HOT_POUR_FILL', label: 'Hot-pour fill' },
  { value: 'DEPOSITING', label: 'Depositing (gummies / confection)' },
  { value: 'TUBE_FILLING', label: 'Tube fill & seal' },
  { value: 'TABLET_COMPRESSION', label: 'Tablet compression' },
  { value: 'CAPSULE_FILLING', label: 'Two-piece capsule filling' },
  { value: 'SOFTGEL_ENCAPSULATION', label: 'Softgel encapsulation' },
  { value: 'COUNT_AND_BOTTLE', label: 'Count & bottle' },
  { value: 'BLISTER_PACKING', label: 'Blister packing' },
  { value: 'AIRLESS_PUMP_FILL', label: 'Airless-pump fill' },
  { value: 'AEROSOL_FILL', label: 'Aerosol fill' },
  { value: 'ROLL_ON_FILL', label: 'Roll-on fill' },
  { value: 'COMPACT_PRESSING', label: 'Compact / pan pressing' },
]

const CONTAINER_FORMAT_OPTS = enumOpts(ContainerCategory, { STICK_PACK: 'Stick pack', OTHER: 'Other' })
const PACK_TYPE_OPTS = enumOpts(StructuralPackType, {
  SINGLE_UNIT: 'Single unit',
  MULTI_UNIT_SAME: 'Multipack (same flavor)',
  MULTI_FLAVOR_MIXED: 'Mixed variety',
  MULTI_FLAVOR_COMPARTMENT: 'Compartment variety',
  PER_FLAVOR_IN_OUTER: 'Per-flavor in outer',
  CUSTOMIZABLE_PICK_N: 'Pick-your-mix',
})
const PRINT_WHAT_OPTS = enumOpts(DieCutCategory)
// Packaging-relevant print methods with proper names. Mirrors PrintProcess enum
// values — not imported so the app typechecks before db:generate. Keep in sync.
// (laser / sublimation / 3D / large-format / engraving excluded — not packaging.)
const PRINT_METHOD_OPTS: Opt[] = [
  { value: 'FLEXO', label: 'Flexography' },
  { value: 'OFFSET', label: 'Offset lithography' },
  { value: 'GRAVURE', label: 'Rotogravure' },
  { value: 'DIGITAL', label: 'Digital (inkjet / toner)' },
  { value: 'LED_UV', label: 'LED UV' },
  { value: 'SCREEN', label: 'Screen printing' },
  { value: 'LETTERPRESS', label: 'Letterpress' },
]
const STORAGE_OPTS = enumOpts(StorageClass, {
  AMBIENT: 'Ambient', PROTECT_HEAT: 'Heat-protected', CHILLED: 'Chilled', FROZEN: 'Frozen',
})
const VAS_OPTS = enumOpts(FcVasJobType, {
  RELABEL: 'Relabel', KITTING: 'Kitting', LIGHT_ASSEMBLY: 'Light assembly',
  BAGGING_BUNDLING: 'Bagging / bundling', DISPLAY_BUILDS: 'Display builds', REWORK: 'Rework',
})
const MFG_PROCESS_OPTS: Opt[] = MANUFACTURING_PROCESS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))

type Detail = Record<string, string[] | string>

export function ApplicationWizard({
  defaultServiceTypes = [],
  certOptions = [],
  regions = [],
}: {
  defaultServiceTypes?: ServiceT[]
  certOptions?: CertPickerOption[]
  regions?: { code: string; name: string }[]
}) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState<'next' | 'back'>('next')
  const [busy, setBusy] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [stepError, setStepError] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, Detail>>({})

  const form = useForm<Values>({
    resolver: zodResolver(Schema),
    defaultValues: {
      companyName: '',
      legalName: '',
      yearsInBusiness: '',
      country: 'US',
      regionCode: '',
      city: '',
      facilityCount: '',
      companySize: '',
      entityType: '',
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
  // Per-step validator for data held in `details` (outside react-hook-form).
  const STEPS: {
    fields: (keyof Values)[]
    render: () => React.ReactNode
    validate?: () => string | null
  }[] = [
    { fields: ['companyName'], render: stepCompany },
    { fields: ['serviceTypes'], render: stepServices },
    ...activeServices.map((s) => ({
      fields: [] as (keyof Values)[],
      render: () => stepService(s),
      // Manufacturing must declare at least one product category (routing key).
      validate:
        s === 'MANUFACTURING'
          ? () => (arr('MANUFACTURING', 'categories').length > 0 ? null : 'Pick at least one product category.')
          : undefined,
    })),
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
    const err = STEPS[cur]!.validate?.()
    if (err) {
      setStepError(err)
      return
    }
    setStepError(null)
    if (!last) {
      setDir('next')
      setStep(cur + 1)
    } else {
      handleSubmit(onSubmit)()
    }
  }
  function back() {
    setStepError(null)
    if (cur > 0) {
      setDir('back')
      setStep(cur - 1)
    }
  }
  async function onSubmit(values: Values) {
    setBusy(true)
    const serviceDetails: Record<string, unknown> = {}
    for (const s of activeServices) serviceDetails[s] = details[s] ?? {}
    const r = await submitLead({ ...values, serviceDetails, turnstileToken: turnstileToken ?? undefined })
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
    const isUS = watch('country') === 'US'
    return (
      <>
        <Eyebrow>About your company</Eyebrow>
        <H>
          Let&apos;s start with <Em>the basics.</Em>
        </H>
        <Sub>Takes ~2 minutes. No account needed yet — if it&apos;s a fit we&apos;ll invite you to onboard.</Sub>
        <FieldBox label="Company name" error={formState.errors.companyName?.message} star>
          <Input placeholder="Northwind Co." {...register('companyName')} />
        </FieldBox>
        <FieldRow cols={2}>
          <FieldBox label="Legal name (if different)">
            <Input placeholder="Northwind Co. LLC" {...register('legalName')} />
          </FieldBox>
          <FieldBox label="Years in business" star>
            <Input placeholder="e.g. 8" {...register('yearsInBusiness')} />
          </FieldBox>
        </FieldRow>
        {/* Location — carries forward to onboarding; drives proximity matching +
            region diversity. State list is your real Region data. */}
        <FieldRow cols={3}>
          <FieldBox label="Country">
            <ApplySelect
              {...register('country', {
                onChange: (e) => {
                  if (e.target.value !== 'US') setValue('regionCode', '')
                },
              })}
            >
              <option value="US">United States</option>
              <option value="CA">Canada</option>
              <option value="OTHER">Other</option>
            </ApplySelect>
          </FieldBox>
          <FieldBox label="State / region" star>
            <ApplySelect {...register('regionCode')} disabled={!isUS}>
              <option value="">{isUS ? 'Select…' : 'US only at launch'}</option>
              {isUS &&
                regions.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
            </ApplySelect>
          </FieldBox>
          <FieldBox label="City">
            <Input placeholder="Columbus" {...register('city')} />
          </FieldBox>
        </FieldRow>
        <FieldRow cols={3}>
          <FieldBox label="Production facilities" star>
            <ApplySelect {...register('facilityCount')}>
              <option value="">Select…</option>
              <option value="1">1</option>
              <option value="2-3">2–3</option>
              <option value="4+">4+</option>
            </ApplySelect>
          </FieldBox>
          <FieldBox label="Company size">
            <ApplySelect {...register('companySize')}>
              <option value="">Select…</option>
              <option value="1-10">1–10</option>
              <option value="11-50">11–50</option>
              <option value="51-200">51–200</option>
              <option value="200+">200+</option>
            </ApplySelect>
          </FieldBox>
          <FieldBox label="Business entity">
            <ApplySelect {...register('entityType')}>
              <option value="">Select…</option>
              <option value="LLC">LLC</option>
              <option value="C_CORP">C-Corp</option>
              <option value="S_CORP">S-Corp</option>
              <option value="SOLE_PROP">Sole proprietor</option>
              <option value="OTHER">Other</option>
            </ApplySelect>
          </FieldBox>
        </FieldRow>
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
        <FieldRow cols={2}>
          <FieldBox label="Your name" error={formState.errors.contactName?.message} star>
            <Input placeholder="Jane Doe" {...register('contactName')} />
          </FieldBox>
          <FieldBox label="Work email" error={formState.errors.email?.message} star>
            <Input type="email" placeholder="you@company.com" {...register('email')} />
          </FieldBox>
        </FieldRow>
        <FieldRow cols={2}>
          <FieldBox label="Phone (optional)">
            <Input {...register('phone')} />
          </FieldBox>
          <FieldBox label="Website" error={formState.errors.website?.message} star>
            <Input placeholder="https://" {...register('website')} />
          </FieldBox>
        </FieldRow>
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
          star
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
          What products do you <Em>make?</Em>
        </H>
        <Sub>This is the heart of it — how you build for a brand decides which orders route to you.</Sub>
        <FieldBox label="What kind of products do you offer? (pick any)">
          <div className="space-y-2.5">
            {MODELS.map(([v, l, d]) => (
              <SelectCard
                key={v}
                on={arr(k, 'models').includes(v)}
                onClick={() => toggleDetail(k, 'models', v)}
                title={l}
                desc={d}
              />
            ))}
          </div>
        </FieldBox>
        <FieldBox label="Product categories" star>
          <Chips>
            {MFG_CATEGORIES.map(([v, l]) => (
              <Chip key={v} on={arr(k, 'categories').includes(v)} onClick={() => toggleDetail(k, 'categories', v)}>
                {l}
              </Chip>
            ))}
          </Chips>
        </FieldBox>
        <FieldBox label="Processes you run">
          <PickSelect
            placeholder="Add a process…"
            options={MFG_PROCESS_OPTS}
            selected={arr(k, 'processes')}
            onToggle={(v) => toggleDetail(k, 'processes', v)}
          />
        </FieldBox>
        <FieldBox label="Do you develop recipes, or fill finished ones?">
          <Chips>
            {RD_OPTIONS.map((o) => (
              <Chip key={o} on={str(k, 'rd') === o} onClick={() => setDetail(k, 'rd', o)}>
                {o}
              </Chip>
            ))}
          </Chips>
        </FieldBox>
        <FieldRow cols={2}>
          <FieldBox label="Smallest batch you'll run">
            <Input placeholder="e.g. 500 units" value={str(k, 'batchMin')} onChange={(e) => setDetail(k, 'batchMin', e.target.value)} />
          </FieldBox>
          <FieldBox label="Largest batch (ceiling)">
            <Input placeholder="e.g. 250,000 units" value={str(k, 'batchMax')} onChange={(e) => setDetail(k, 'batchMax', e.target.value)} />
          </FieldBox>
        </FieldRow>
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
        <Sub>The processes you run tell us what you can actually make — that&apos;s what matters most.</Sub>
        <FieldBox label="Fill & process types you run">
          <PickSelect
            placeholder="Add a fill / process…"
            options={COPACK_PROCESS_OPTS}
            selected={arr(k, 'processes')}
            onToggle={(v) => toggleDetail(k, 'processes', v)}
          />
        </FieldBox>
        <FieldBox label="Container formats you fill">
          <PickSelect
            placeholder="Add a container…"
            options={CONTAINER_FORMAT_OPTS}
            selected={arr(k, 'formats')}
            onToggle={(v) => toggleDetail(k, 'formats', v)}
          />
        </FieldBox>
        <FieldBox label="Pack types you assemble">
          <PickSelect
            placeholder="Add a pack type…"
            options={PACK_TYPE_OPTS}
            selected={arr(k, 'packTypes')}
            onToggle={(v) => toggleDetail(k, 'packTypes', v)}
          />
        </FieldBox>
        <FieldBox label="Allergen handling">
          <Chips>
            {ALLERGEN_OPTIONS.map((o) => (
              <Chip key={o} on={str(k, 'allergen') === o} onClick={() => setDetail(k, 'allergen', o)}>
                {o}
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
        <FieldRow cols={2}>
          <FieldBox label="Smallest run you'll take">
            <Input placeholder="e.g. 1,000 units" value={str(k, 'minRun')} onChange={(e) => setDetail(k, 'minRun', e.target.value)} />
          </FieldBox>
          <FieldBox label="Largest run (ceiling)">
            <Input placeholder="e.g. 500,000 units" value={str(k, 'maxRun')} onChange={(e) => setDetail(k, 'maxRun', e.target.value)} />
          </FieldBox>
        </FieldRow>
        <FieldBox label="Current capacity utilization (%)">
          <Input placeholder="e.g. 70" value={str(k, 'utilization')} onChange={(e) => setDetail(k, 'utilization', e.target.value)} />
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
          <PickSelect
            placeholder="Add a packaging format…"
            options={PRINT_WHAT_OPTS}
            selected={arr(k, 'prints')}
            onToggle={(v) => toggleDetail(k, 'prints', v)}
          />
        </FieldBox>
        <FieldBox label="Print methods">
          <PickSelect
            placeholder="Add a print method…"
            options={PRINT_METHOD_OPTS}
            selected={arr(k, 'methods')}
            onToggle={(v) => toggleDetail(k, 'methods', v)}
          />
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
          <PickSelect
            placeholder="Add a storage class…"
            options={STORAGE_OPTS}
            selected={arr(k, 'storage')}
            onToggle={(v) => toggleDetail(k, 'storage', v)}
          />
        </FieldBox>
        <FieldBox label="Value-added services">
          <PickSelect
            placeholder="Add a value-added service…"
            options={VAS_OPTS}
            selected={arr(k, 'vas')}
            onToggle={(v) => toggleDetail(k, 'vas', v)}
          />
        </FieldBox>
        <FieldRow cols={2}>
          <FieldBox label="Rough capacity">
            <Input placeholder="e.g. 500 pallets" value={str(k, 'capacity')} onChange={(e) => setDetail(k, 'capacity', e.target.value)} />
          </FieldBox>
          <FieldBox label="Location (city / state)">
            <Input placeholder="Columbus, OH" value={str(k, 'location')} onChange={(e) => setDetail(k, 'location', e.target.value)} />
          </FieldBox>
        </FieldRow>
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
        {stepError && (
          <p className="mt-4 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-[12.5px] font-medium text-danger-700">
            {stepError}
          </p>
        )}
        {/* Turnstile on the final step only — gates the actual lead submission. (H5 A4) */}
        {last && (
          <div className="mt-5">
            <TurnstileWidget onToken={setTurnstileToken} />
          </div>
        )}
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
            disabled={busy || (last && TURNSTILE_ON && !turnstileToken)}
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
// Compact dropdown multi-select → removable chips (saves space on long lists).
function PickSelect({
  options,
  selected,
  onToggle,
  placeholder = 'Add…',
}: {
  options: Opt[]
  selected: string[]
  onToggle: (v: string) => void
  placeholder?: string
}) {
  const available = options.filter((o) => !selected.includes(o.value))
  const labelFor = (v: string) => options.find((o) => o.value === v)?.label ?? v
  return (
    <div className="space-y-2">
      <select
        value=""
        disabled={available.length === 0}
        onChange={(e) => {
          if (e.target.value) onToggle(e.target.value)
        }}
        className="w-full rounded-xl border-[1.5px] border-ink-200 bg-white px-3 py-2.5 text-[13.5px] text-ink-700 focus:border-pink-500 focus:outline-none disabled:opacity-50"
      >
        <option value="">{available.length === 0 ? 'All added' : placeholder}</option>
        {available.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full border border-pink-500 bg-pink-50 px-3 py-1.5 text-[13px] font-semibold text-pink-700"
            >
              {labelFor(v)}
              <button
                type="button"
                onClick={() => onToggle(v)}
                aria-label={`Remove ${labelFor(v)}`}
                className="text-pink-400 hover:text-pink-700"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
const ApplySelect = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function ApplySelect(props, ref) {
    return (
      <select
        ref={ref}
        {...props}
        className="w-full rounded-xl border-[1.5px] border-ink-200 bg-white px-3 py-2.5 text-[13.5px] text-ink-700 focus:border-pink-500 focus:outline-none"
      />
    )
  },
)
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
function FieldBox({
  label,
  error,
  star,
  children,
}: {
  label: string
  error?: string
  /** Pink * — required or strongly recommended field (unified with onboarding). */
  star?: boolean
  children: React.ReactNode
}) {
  // Thin wrapper over the shared FormField — keeps the apply-specific prop name
  // (`star`) and the mb-4 rhythm; all label/alignment logic lives in FormField.
  return (
    <FormField label={label} error={error} required={star} className="mb-4">
      {children}
    </FormField>
  )
}
function SelectCard({
  on,
  onClick,
  title,
  desc,
}: {
  on: boolean
  onClick: () => void
  title: string
  desc: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={
        'flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors ' +
        (on ? 'border-pink-500 bg-pink-50' : 'border-ink-200 bg-white hover:border-ink-300')
      }
    >
      <span
        aria-hidden="true"
        className={
          'mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border text-[11px] font-bold ' +
          (on ? 'border-pink-500 bg-pink-500 text-white' : 'border-ink-300 bg-white text-transparent')
        }
      >
        ✓
      </span>
      <span className="min-w-0">
        <span className={'block text-[15px] font-bold ' + (on ? 'text-pink-800' : 'text-ink-900')}>{title}</span>
        <span className="mt-0.5 block text-[13px] leading-[1.45] text-ink-500">{desc}</span>
      </span>
    </button>
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
