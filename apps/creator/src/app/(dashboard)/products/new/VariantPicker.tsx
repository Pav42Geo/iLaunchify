'use client'

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { createDraftFromTemplate } from './actions'

const PACKING_LABELS: Record<string, string> = {
  SINGLE_FLAVOR_SINGLE_PACK: 'Single pack',
  SINGLE_FLAVOR_MULTIPACK: 'Multipack',
  MULTI_FLAVOR_MIXED_PACK: 'Mixed-flavor bag',
  MULTI_FLAVOR_COMPARTMENT_PACK: 'Compartment',
  MULTI_FLAVOR_INDIVIDUAL_IN_OUTER: 'Variety pack',
  CUSTOMIZABLE_PICK_N: 'Customer pick',
  SAMPLER_MINI: 'Sampler',
  SUBSCRIPTION_ROTATING: 'Subscription',
  GIFT_PREMIUM: 'Gift pack',
  VALUE_BULK_SINGLE: 'Bulk',
  VALUE_BULK_VARIETY: 'Variety bulk',
  SEASONAL_LIMITED: 'Seasonal',
  PAIRING_FUNCTIONAL: 'Pairing',
  RETAIL_COUNTER_DISPLAY: 'Retail display',
  REFILL_ECO: 'Refill / eco',
}

interface Variant {
  id: string
  flavor: string | null
  containerFormat: string
  servingsPerContainer: number
  servingSizeDesc: string
  packingType: string
  innerPacksPerOuter: number
  customerPicksCount: number | null
  subscriptionInterval: string | null
  assortmentFlavors: Array<{ flavor: string; qty: number }> | null
  moqMin: number
  moqMax: number
  leadTimeDays: number
  dieCutName: string | null
}

export function VariantPicker({
  templateId,
  brandId,
  marketId,
  templateName,
  variants,
}: {
  templateId: string
  brandId: string
  marketId: string
  templateName: string
  variants: Variant[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleContinue() {
    if (!selected) {
      toast.error('Pick a variant first')
      return
    }
    setBusy(true)
    try {
      const result = await createDraftFromTemplate({
        templateId,
        variantId: selected,
        brandId,
        marketId,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Draft created')
      router.push(`/products/${result.productId}/customize`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {variants.map((v) => {
          const isSelected = selected === v.id
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setSelected(v.id)}
              className={`text-left transition-all ${
                isSelected ? 'ring-2 ring-brand-primary' : 'hover:bg-zinc-50'
              }`}
            >
              <Card className={isSelected ? 'border-brand-primary' : ''}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {v.flavor ? `${v.flavor} — ${v.containerFormat}` : v.containerFormat}
                  </CardTitle>
                  <CardDescription>
                    {v.servingsPerContainer} servings · {v.servingSizeDesc}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex flex-wrap gap-1">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs">
                      {PACKING_LABELS[v.packingType] ?? v.packingType}
                    </span>
                    {v.innerPacksPerOuter > 1 && (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs">
                        {v.innerPacksPerOuter}-pack
                      </span>
                    )}
                    {v.customerPicksCount && (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                        Consumer picks {v.customerPicksCount}
                      </span>
                    )}
                    {v.subscriptionInterval && (
                      <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-700">
                        {v.subscriptionInterval}
                      </span>
                    )}
                  </div>
                  {v.assortmentFlavors && v.assortmentFlavors.length > 0 && (
                    <p className="text-xs text-zinc-600">
                      Includes:{' '}
                      {v.assortmentFlavors.map((a) => `${a.flavor} ×${a.qty}`).join(', ')}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2 text-xs text-zinc-500">
                    <div>MOQ {v.moqMin.toLocaleString()}–{v.moqMax.toLocaleString()}</div>
                    <div>Lead {v.leadTimeDays}d</div>
                  </div>
                  {v.dieCutName && (
                    <p className="text-xs text-zinc-500">Label format: {v.dieCutName}</p>
                  )}
                </CardContent>
              </Card>
            </button>
          )
        })}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleContinue} disabled={!selected || busy}>
          {busy ? 'Creating draft…' : 'Continue to customize →'}
        </Button>
      </div>
    </div>
  )
}
