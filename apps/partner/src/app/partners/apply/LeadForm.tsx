'use client'

import { Button, Input, Label } from '@ilaunchify/ui'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { submitLead } from './actions'

const SERVICE_OPTIONS = [
  { value: 'MANUFACTURING', label: 'Manufacturing' },
  { value: 'COPACKING', label: 'Co-packing' },
  { value: 'LABEL_PRINTING', label: 'Label printing' },
  { value: 'WAREHOUSE', label: 'Fulfillment / warehouse' },
] as const

const LeadSchema = z.object({
  companyName: z.string().min(2, 'Company name required').max(120),
  legalName: z.string().max(120).optional().or(z.literal('')),
  contactName: z.string().min(2).max(80),
  email: z.string().email(),
  phone: z.string().max(30).optional().or(z.literal('')),
  website: z.string().url('Must be a valid URL').max(200).optional().or(z.literal('')),
  serviceTypes: z
    .array(z.enum(['MANUFACTURING', 'COPACKING', 'LABEL_PRINTING', 'WAREHOUSE']))
    .min(1, 'Select at least one service you offer'),
  monthlyCapacity: z.string().max(80),
  certifications: z.string().max(200),
  successDescription: z.string().min(20, 'A few words on what success looks like').max(800),
})
type LeadValues = z.infer<typeof LeadSchema>
export type LeadServiceType = LeadValues['serviceTypes'][number]

export function LeadForm({ defaultServiceTypes = [] }: { defaultServiceTypes?: LeadServiceType[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const form = useForm<LeadValues>({
    resolver: zodResolver(LeadSchema),
    defaultValues: {
      companyName: '',
      legalName: '',
      contactName: '',
      email: '',
      phone: '',
      website: '',
      serviceTypes: defaultServiceTypes,
      monthlyCapacity: '',
      certifications: '',
      successDescription: '',
    },
  })

  const selected = form.watch('serviceTypes')

  function toggleService(v: LeadServiceType) {
    const cur = form.getValues('serviceTypes')
    form.setValue('serviceTypes', cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v], {
      shouldValidate: true,
    })
  }

  async function onSubmit(values: LeadValues) {
    setBusy(true)
    try {
      const result = await submitLead(values)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Application received')
      router.push('/partners/thanks')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Company name" id="companyName" error={form.formState.errors.companyName?.message}>
          <Input id="companyName" {...form.register('companyName')} disabled={busy} />
        </Field>
        <Field label="Legal name (if different)" id="legalName">
          <Input id="legalName" {...form.register('legalName')} disabled={busy} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Your name" id="contactName" error={form.formState.errors.contactName?.message}>
          <Input id="contactName" {...form.register('contactName')} disabled={busy} />
        </Field>
        <Field label="Email" id="email" error={form.formState.errors.email?.message}>
          <Input id="email" type="email" {...form.register('email')} disabled={busy} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Phone (optional)" id="phone">
          <Input id="phone" {...form.register('phone')} disabled={busy} />
        </Field>
        <Field label="Website" id="website" error={form.formState.errors.website?.message}>
          <Input id="website" placeholder="https://" {...form.register('website')} disabled={busy} />
        </Field>
      </div>

      <Field
        label="What can you do?"
        id="serviceTypes"
        hint="Select all that apply — you can run several."
        error={form.formState.errors.serviceTypes?.message as string | undefined}
      >
        <div className="flex flex-wrap gap-2">
          {SERVICE_OPTIONS.map((o) => {
            const on = selected.includes(o.value)
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggleService(o.value)}
                disabled={busy}
                aria-pressed={on}
                className={
                  'rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:opacity-60 ' +
                  (on
                    ? 'border-pink-500 bg-pink-50 text-pink-700'
                    : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300')
                }
              >
                {on ? '✓ ' : ''}
                {o.label}
              </button>
            )
          })}
        </div>
      </Field>

      <Field label="Monthly capacity" id="monthlyCapacity" hint="e.g. 50K units / month, 200 SKUs">
        <Input id="monthlyCapacity" {...form.register('monthlyCapacity')} disabled={busy} />
      </Field>

      <Field
        label="Certifications"
        id="certifications"
        hint="FDA, cGMP, USDA Organic, kosher, halal, ISO 22000…"
      >
        <Input id="certifications" {...form.register('certifications')} disabled={busy} />
      </Field>

      <Field
        label="What does success on iLaunchify look like for you?"
        id="successDescription"
        error={form.formState.errors.successDescription?.message}
      >
        <textarea
          id="successDescription"
          className="flex min-h-[76px] w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm placeholder:text-ink-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
          {...form.register('successDescription')}
          disabled={busy}
        />
      </Field>

      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'Submitting…' : 'Submit application'}
      </Button>
    </form>
  )
}

function Field({
  label,
  id,
  children,
  hint,
  error,
}: {
  label: string
  id: string
  children: React.ReactNode
  hint?: string
  error?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-ui-caption text-ink-500">{hint}</p>}
      {error && <p className="text-ui-caption text-danger-600">{error}</p>}
    </div>
  )
}
