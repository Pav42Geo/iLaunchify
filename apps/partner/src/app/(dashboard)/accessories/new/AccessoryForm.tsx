'use client'

// C7.j — new-accessory form. Posts multipart FormData (image upload) to the
// createAccessory server action. Applicable-packaging multi-select scopes which
// of the partner's packaging systems this accessory pairs with (optional).

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Upload } from 'lucide-react'
import { Button } from '@ilaunchify/ui'
import { createAccessory } from '../actions'

const CATEGORIES = [
  ['SPOON', 'Spoon / dipper'],
  ['RIBBON', 'Ribbon'],
  ['TAG', 'Hangtag / neck tag'],
  ['INSERT', 'Recipe / brand insert'],
  ['CAP_COVER', 'Cap cover'],
  ['TISSUE', 'Branded tissue'],
  ['WAX_SEAL', 'Wax seal'],
  ['STICKER_PACK', 'Sticker pack'],
  ['OTHER', 'Other'],
] as const

export function AccessoryForm({
  packagingSystems,
}: {
  packagingSystems: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [preview, setPreview] = React.useState<string | null>(null)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await createAccessory(fd)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Accessory submitted for review')
      router.push('/accessories')
      router.refresh()
    })
  }

  const field = 'w-full rounded-md border border-ink-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200'
  const label = 'block text-xs font-semibold uppercase tracking-wide text-ink-500 mb-1'

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={label}>Name</label>
          <input name="name" required placeholder="Laser-engraved wooden honey dipper" className={field} />
        </div>

        <div>
          <label className={label}>Category</label>
          <select name="category" required defaultValue="" className={field}>
            <option value="" disabled>
              Pick a category…
            </option>
            {CATEGORIES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={label}>Price per unit (USD)</label>
          <input
            name="pricePerUnit"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="1.20"
            className={field}
          />
        </div>

        <div>
          <label className={label}>MOQ</label>
          <input name="moq" type="number" min="1" defaultValue={1} className={field} />
        </div>

        <div>
          <label className={label}>Lead time (days)</label>
          <input name="leadTimeDays" type="number" min="0" defaultValue={0} className={field} />
        </div>

        <div className="sm:col-span-2">
          <label className={label}>Description</label>
          <textarea
            name="description"
            required
            rows={3}
            placeholder="Food-safe maple, 4 inch, optional engraving."
            className={field}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={label}>Image (PNG / JPEG / WebP, max 10 MB)</label>
          <div className="flex items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-ink-300 px-3 py-2 text-sm hover:bg-ink-50">
              <Upload className="h-4 w-4" /> Choose image
              <input
                name="imageFile"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                required
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  setPreview(f ? URL.createObjectURL(f) : null)
                }}
              />
            </label>
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="h-12 w-12 rounded-md border border-ink-200 object-cover" />
            )}
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" name="isCustomizable" className="h-4 w-4 rounded border-ink-300" />
            Customizable (engraving text, color, etc.)
          </label>
        </div>

        {packagingSystems.length > 0 && (
          <div className="sm:col-span-2">
            <label className={label}>Applies to packaging (optional)</label>
            <div className="flex flex-wrap gap-2">
              {packagingSystems.map((p) => (
                <label
                  key={p.id}
                  className="inline-flex items-center gap-1.5 rounded-md border border-ink-300 px-2.5 py-1 text-sm"
                >
                  <input type="checkbox" name="applicableOfferingIds" value={p.id} className="h-3.5 w-3.5" />
                  {p.name}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={pending} className="bg-ink-900 hover:bg-ink-700">
          {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Submit for review
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/accessories')}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
