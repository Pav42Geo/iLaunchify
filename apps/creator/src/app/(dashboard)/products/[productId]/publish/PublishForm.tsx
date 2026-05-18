'use client'

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@ilaunchify/ui'
import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { publishProduct } from './actions'

interface Candidate {
  id: string
  name: string
  city: string | null
  state: string | null
  capabilities: Record<string, unknown>
}

interface Props {
  productId: string
  currentPriceCents: number
  manufacturers: Candidate[]
  printProviders: Candidate[]
}

export function PublishForm({ productId, currentPriceCents, manufacturers, printProviders }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [priceDollars, setPriceDollars] = useState(
    (currentPriceCents / 100).toFixed(2).replace(/\.00$/, ''),
  )
  const [inventory, setInventory] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const cents = Math.round(parseFloat(priceDollars) * 100)
      if (!Number.isFinite(cents) || cents <= 0) {
        toast.error('Set a price')
        return
      }
      const result = await publishProduct({
        productId,
        priceCents: cents,
        inventoryAvailable: inventory ? Number(inventory) : null,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Published! Visit your storefront.')
      router.push(`/products/${productId}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Price + inventory</CardTitle>
          <CardDescription>
            We&apos;ll automatically route orders to the best-fit partner at order time.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="price">Consumer price ($)</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              min="1"
              value={priceDollars}
              onChange={(e) => setPriceDollars(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv">Available inventory (optional)</Label>
            <Input
              id="inv"
              type="number"
              min="1"
              placeholder="Leave blank for unlimited"
              value={inventory}
              onChange={(e) => setInventory(e.target.value)}
              disabled={busy}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manufacturing candidates</CardTitle>
          <CardDescription>
            {manufacturers.length} active manufacturer(s) match your product category.
            Routing picks the best fit at order time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CandidateList candidates={manufacturers} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Print candidates</CardTitle>
          <CardDescription>
            {printProviders.length} active print provider(s) support your label die-cut.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CandidateList candidates={printProviders} />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? 'Publishing…' : 'Publish product'}
        </Button>
      </div>
    </form>
  )
}

function CandidateList({ candidates }: { candidates: Candidate[] }) {
  return (
    <ul className="space-y-2">
      {candidates.map((c) => {
        const moqMin = c.capabilities.moqMin as number | undefined
        const moqMax = c.capabilities.moqMax as number | undefined
        const leadDays =
          (c.capabilities.leadTimeStockDays as number | undefined) ??
          (c.capabilities.leadTimeDays as number | undefined)
        return (
          <li
            key={c.id}
            className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm"
          >
            <div>
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-zinc-500">
                {c.city && c.state ? `${c.city}, ${c.state}` : 'US'}
                {moqMin && ` · MOQ ${moqMin}${moqMax ? `–${moqMax}` : '+'}`}
                {leadDays && ` · ${leadDays}d lead`}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
