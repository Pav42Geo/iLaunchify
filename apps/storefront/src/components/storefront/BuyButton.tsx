'use client'

import { Button } from '@ilaunchify/ui'
import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { addToCart } from '@/actions/cart'

interface BuyButtonProps {
  brandId: string
  brandHandle: string
  productId: string
  isOutOfStock: boolean
  maxQuantity: number | null
}

export function BuyButton({ brandId, brandHandle, productId, isOutOfStock, maxQuantity }: BuyButtonProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [quantity, setQuantity] = useState(1)

  const cap = maxQuantity ?? 99

  async function handleAddToCart() {
    setBusy(true)
    try {
      const result = await addToCart({ brandId, productId, quantity })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Added to cart')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleBuyNow() {
    setBusy(true)
    try {
      const result = await addToCart({ brandId, productId, quantity })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      router.push(`/${brandHandle}/cart`)
    } finally {
      setBusy(false)
    }
  }

  if (isOutOfStock) {
    return (
      <Button disabled className="w-full" size="lg">
        Sold out
      </Button>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label htmlFor="qty" className="text-sm">Quantity:</label>
        <select
          id="qty"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          disabled={busy}
          className="rounded-brand border border-zinc-300 bg-white px-2 py-1 text-sm"
        >
          {Array.from({ length: Math.min(cap, 12) }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={handleAddToCart}
          disabled={busy}
        >
          Add to cart
        </Button>
        <Button
          className="flex-1"
          onClick={handleBuyNow}
          disabled={busy}
        >
          Buy now
        </Button>
      </div>
    </div>
  )
}
