'use client'

import Link from 'next/link'
import { Button } from '@ilaunchify/ui'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { formatCents } from '@/lib/cart'
import { removeFromCart, updateCartItemQuantity } from '@/actions/cart'

interface CartLineProps {
  brandHandle: string
  item: {
    id: string
    productId: string
    productName: string
    productSlug: string
    unitPriceCents: number
    quantity: number
    inventoryAvailable: number | null
  }
}

export function CartLine({ brandHandle, item }: CartLineProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function changeQuantity(newQty: number) {
    setBusy(true)
    try {
      const r = await updateCartItemQuantity({ cartItemId: item.id, quantity: newQty })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await removeFromCart({ cartItemId: item.id })
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const cap = Math.min(item.inventoryAvailable ?? 99, 99)

  return (
    <div className="flex items-center gap-4 rounded-brand border border-zinc-200 bg-white p-4">
      <div className="flex-1">
        <Link
          href={`/${brandHandle}/${item.productSlug}`}
          className="font-medium hover:underline"
        >
          {item.productName}
        </Link>
        <div className="mt-1 text-sm text-brand-secondary">
          {formatCents(item.unitPriceCents)} each
        </div>
      </div>

      <select
        value={item.quantity}
        onChange={(e) => changeQuantity(Number(e.target.value))}
        disabled={busy}
        className="rounded-brand border border-zinc-300 bg-white px-2 py-1 text-sm"
      >
        {Array.from({ length: cap }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>

      <div className="w-20 text-right font-semibold">
        {formatCents(item.unitPriceCents * item.quantity)}
      </div>

      <Button variant="ghost" size="icon" onClick={remove} disabled={busy} aria-label="Remove">
        <Trash2 className="h-4 w-4 text-brand-secondary" />
      </Button>
    </div>
  )
}
