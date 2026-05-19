'use client'

// Production order placement form.
// Creator picks: quantity, ship-to destination (own address OR a WAREHOUSE
// partner), enters address details, sees a cost breakdown, then submits.
// On submit → server action returns Stripe Checkout URL → redirect.

import { useState, useTransition } from 'react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ilaunchify/ui'
import { toast } from 'sonner'
import { Truck, Warehouse, CreditCard, Loader2 } from 'lucide-react'
import { createProductionOrder } from './actions'

interface WarehousePartner {
  id: string
  partnerName: string
  city: string | null
  state: string | null
}

interface OrderFormProps {
  productId: string
  productName: string
  variantMoqMin: number
  variantMoqMax: number
  unitCostCents: number              // production cost per unit (subtotal / qty)
  platformFeeBps: number             // basis points (500 = 5%)
  warehouses: WarehousePartner[]
  defaultShipTo: {
    contactName: string
    contactPhone: string | null
    line1: string | null
    line2: string | null
    city: string | null
    state: string | null
    postalCode: string | null
    country: string | null
  }
}

export function OrderForm({
  productId,
  productName,
  variantMoqMin,
  variantMoqMax,
  unitCostCents,
  platformFeeBps,
  warehouses,
  defaultShipTo,
}: OrderFormProps) {
  const [isPending, startTransition] = useTransition()
  const [quantity, setQuantity] = useState(variantMoqMin)
  const [shipToType, setShipToType] = useState<'CREATOR_ADDRESS' | 'WAREHOUSE_PARTNER'>(
    'CREATOR_ADDRESS',
  )
  const [warehouseId, setWarehouseId] = useState<string | undefined>(warehouses[0]?.id)
  const [contactName, setContactName] = useState(defaultShipTo.contactName ?? '')
  const [contactPhone, setContactPhone] = useState(defaultShipTo.contactPhone ?? '')
  const [line1, setLine1] = useState(defaultShipTo.line1 ?? '')
  const [line2, setLine2] = useState(defaultShipTo.line2 ?? '')
  const [city, setCity] = useState(defaultShipTo.city ?? '')
  const [state, setState] = useState(defaultShipTo.state ?? '')
  const [postal, setPostal] = useState(defaultShipTo.postalCode ?? '')
  const [country, setCountry] = useState(defaultShipTo.country ?? 'US')

  // Cost preview (matches server-side calculation)
  const subtotalCents = unitCostCents * quantity
  const platformFeeCents = Math.floor(subtotalCents * (platformFeeBps / 10000))
  const totalCents = subtotalCents + platformFeeCents

  const qtyValid = quantity >= variantMoqMin && quantity <= variantMoqMax
  const addressValid =
    shipToType === 'WAREHOUSE_PARTNER'
      ? !!warehouseId
      : !!(contactName && line1 && city && postal && country)

  function fmt(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!qtyValid) {
      toast.error(`Quantity must be ${variantMoqMin}–${variantMoqMax}`)
      return
    }
    if (!addressValid) {
      toast.error('Fill in the ship-to details')
      return
    }
    startTransition(async () => {
      const res = await createProductionOrder({
        productId,
        quantity,
        shipToType,
        shipToPartnerServiceId: shipToType === 'WAREHOUSE_PARTNER' ? warehouseId ?? null : null,
        // For WAREHOUSE shipments, the partner picker controls the address — we
        // pass a dummy here; server uses partner's address. For V1 we still
        // require these as label info (recipient name = partner name).
        shipToContactName:
          shipToType === 'WAREHOUSE_PARTNER'
            ? warehouses.find((w) => w.id === warehouseId)?.partnerName ?? 'Warehouse partner'
            : contactName,
        shipToContactPhone: contactPhone || undefined,
        shipToAddressLine1: shipToType === 'WAREHOUSE_PARTNER' ? 'See warehouse on file' : line1,
        shipToAddressLine2: shipToType === 'WAREHOUSE_PARTNER' ? undefined : line2 || undefined,
        shipToCity: shipToType === 'WAREHOUSE_PARTNER' ? '—' : city,
        shipToState: shipToType === 'WAREHOUSE_PARTNER' ? undefined : state || undefined,
        shipToPostalCode: shipToType === 'WAREHOUSE_PARTNER' ? '—' : postal,
        shipToCountry: country,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Redirecting to Stripe…')
      window.location.href = res.checkoutUrl
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Production quantity</CardTitle>
          <CardDescription>
            MOQ range for this variant: {variantMoqMin.toLocaleString()}–
            {variantMoqMax.toLocaleString()} units.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min={variantMoqMin}
                max={variantMoqMax}
                step={Math.max(1, Math.floor(variantMoqMin / 10))}
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 0)}
                disabled={isPending}
                className="w-32"
              />
            </div>
            <p className="pb-2 text-xs text-zinc-500">
              {fmt(unitCostCents)} × {quantity.toLocaleString()} ={' '}
              <span className="font-medium text-zinc-700">{fmt(subtotalCents)}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Where should we ship?</CardTitle>
          <CardDescription>
            Choose to receive at your own warehouse or have iLaunchify deliver to a connected
            warehouse partner.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setShipToType('CREATOR_ADDRESS')}
              className={`flex items-start gap-3 rounded-md border p-3 text-left transition-colors ${
                shipToType === 'CREATOR_ADDRESS'
                  ? 'border-brand-primary bg-brand-primary/5'
                  : 'border-zinc-200 hover:border-zinc-300'
              }`}
            >
              <Truck className="mt-0.5 h-5 w-5 shrink-0 text-zinc-500" />
              <div>
                <div className="text-sm font-medium">My warehouse</div>
                <div className="text-xs text-zinc-500">Ship finished goods to my address</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setShipToType('WAREHOUSE_PARTNER')}
              disabled={warehouses.length === 0}
              className={`flex items-start gap-3 rounded-md border p-3 text-left transition-colors disabled:opacity-50 ${
                shipToType === 'WAREHOUSE_PARTNER'
                  ? 'border-brand-primary bg-brand-primary/5'
                  : 'border-zinc-200 hover:border-zinc-300'
              }`}
            >
              <Warehouse className="mt-0.5 h-5 w-5 shrink-0 text-zinc-500" />
              <div>
                <div className="text-sm font-medium">Warehouse partner</div>
                <div className="text-xs text-zinc-500">
                  {warehouses.length === 0
                    ? 'No warehouse partners onboarded yet'
                    : `${warehouses.length} option${warehouses.length === 1 ? '' : 's'} available`}
                </div>
              </div>
            </button>
          </div>

          {shipToType === 'WAREHOUSE_PARTNER' ? (
            <div className="space-y-1.5">
              <Label>Warehouse partner</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.partnerName}
                      {w.city ? ` · ${w.city}${w.state ? `, ${w.state}` : ''}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-zinc-500">
                The warehouse partner stores your inventory after production. When end buyers
                order on your external channels (Shopify etc.), the partner ships to them.
                That fulfillment leg is outside iLaunchify.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="contactName">Recipient name</Label>
                  <Input
                    id="contactName"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contactPhone">Phone (optional)</Label>
                  <Input
                    id="contactPhone"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    disabled={isPending}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="line1">Address line 1</Label>
                <Input
                  id="line1"
                  required
                  value={line1}
                  onChange={(e) => setLine1(e.target.value)}
                  disabled={isPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="line2">Address line 2 (optional)</Label>
                <Input
                  id="line2"
                  value={line2}
                  onChange={(e) => setLine2(e.target.value)}
                  disabled={isPending}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="postal">Postal code</Label>
                  <Input
                    id="postal"
                    required
                    value={postal}
                    onChange={(e) => setPostal(e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    required
                    maxLength={2}
                    value={country}
                    onChange={(e) => setCountry(e.target.value.toUpperCase())}
                    disabled={isPending}
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cost breakdown</CardTitle>
          <CardDescription>You'll be charged through Stripe Checkout next.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-600">Production subtotal</dt>
              <dd className="font-mono">{fmt(subtotalCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-600">
                Platform fee ({(platformFeeBps / 100).toFixed(2)}%)
              </dt>
              <dd className="font-mono">{fmt(platformFeeCents)}</dd>
            </div>
            <div className="flex justify-between border-t border-zinc-200 pt-1 font-semibold">
              <dt>Total</dt>
              <dd className="font-mono">{fmt(totalCents)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending || !qtyValid || !addressValid} size="lg">
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirecting to Stripe…
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-4 w-4" /> Pay {fmt(totalCents)} & place order
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
