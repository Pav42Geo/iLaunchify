'use client'

import { Button, Input, Label } from '@ilaunchify/ui'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { saveCompany } from './actions'

const Schema = z.object({
  companyName: z.string().min(2).max(120),
  legalName: z.string().min(2).max(120),
  websiteUrl: z.string().url().max(200).optional().or(z.literal('')),
  contactPhone: z.string().max(30).optional().or(z.literal('')),
  addressLine1: z.string().min(2).max(120),
  addressLine2: z.string().max(120).optional().or(z.literal('')),
  city: z.string().min(2).max(80),
  state: z.string().min(2).max(40),
  postalCode: z.string().min(3).max(20),
  country: z.string().min(2).max(40),
})
type Values = z.infer<typeof Schema>

export function CompanyForm({ partnerId, initial }: { partnerId: string; initial: Values }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const form = useForm<Values>({ resolver: zodResolver(Schema), defaultValues: initial })

  async function onSubmit(values: Values) {
    setBusy(true)
    try {
      const result = await saveCompany({ partnerId, ...values })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Company details saved')
      router.push('/onboarding/service')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="companyName" label="Company name" error={form.formState.errors.companyName?.message}>
          <Input id="companyName" {...form.register('companyName')} disabled={busy} />
        </Field>
        <Field id="legalName" label="Legal name" error={form.formState.errors.legalName?.message}>
          <Input id="legalName" {...form.register('legalName')} disabled={busy} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="websiteUrl" label="Website">
          <Input id="websiteUrl" placeholder="https://" {...form.register('websiteUrl')} disabled={busy} />
        </Field>
        <Field id="contactPhone" label="Phone">
          <Input id="contactPhone" {...form.register('contactPhone')} disabled={busy} />
        </Field>
      </div>

      <Field id="addressLine1" label="Address line 1" error={form.formState.errors.addressLine1?.message}>
        <Input id="addressLine1" {...form.register('addressLine1')} disabled={busy} />
      </Field>
      <Field id="addressLine2" label="Address line 2 (optional)">
        <Input id="addressLine2" {...form.register('addressLine2')} disabled={busy} />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Field id="city" label="City" error={form.formState.errors.city?.message}>
          <Input id="city" {...form.register('city')} disabled={busy} />
        </Field>
        <Field id="state" label="State" error={form.formState.errors.state?.message}>
          <Input id="state" placeholder="CA" maxLength={2} {...form.register('state')} disabled={busy} />
        </Field>
        <Field id="postalCode" label="ZIP" error={form.formState.errors.postalCode?.message}>
          <Input id="postalCode" {...form.register('postalCode')} disabled={busy} />
        </Field>
        <Field id="country" label="Country" error={form.formState.errors.country?.message}>
          <Input id="country" {...form.register('country')} disabled={busy} />
        </Field>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save & continue'}</Button>
      </div>
    </form>
  )
}

function Field({ id, label, children, error }: { id: string; label: string; children: React.ReactNode; error?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
