'use client'

import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ilaunchify/ui'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createProduct } from './actions'

const FormSchema = z.object({
  name: z.string().min(2, 'At least 2 characters').max(80),
  category: z.enum(['FOOD', 'BEVERAGE_FUNCTIONAL', 'SUPPLEMENT']),
  description: z.string().max(500).optional().or(z.literal('')),
})
type FormValues = z.infer<typeof FormSchema>

export function NewProductForm({ brandId, marketId }: { brandId: string; marketId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { name: '', category: 'SUPPLEMENT', description: '' },
  })

  async function onSubmit(values: FormValues) {
    setBusy(true)
    try {
      const result = await createProduct({ ...values, brandId, marketId })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Product created')
      router.push(`/products/${result.productId}/recipe`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" placeholder="e.g. Daily Greens Powder" {...form.register('name')} disabled={busy} />
        {form.formState.errors.name && (
          <p className="text-xs text-red-600">{form.formState.errors.name.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Category</Label>
        <Select
          value={form.watch('category')}
          onValueChange={(v) => form.setValue('category', v as FormValues['category'])}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="SUPPLEMENT">Supplement</SelectItem>
            <SelectItem value="FOOD">Food</SelectItem>
            <SelectItem value="BEVERAGE_FUNCTIONAL">Functional beverage</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-zinc-500">
          Determines which rule pack the compliance engine uses (FDA food vs. supplements).
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description (optional)</Label>
        <Input id="description" placeholder="Short description for your storefront" {...form.register('description')} disabled={busy} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Continue to recipe'}</Button>
      </div>
    </form>
  )
}
