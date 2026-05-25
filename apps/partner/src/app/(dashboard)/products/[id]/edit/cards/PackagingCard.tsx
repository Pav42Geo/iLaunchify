'use client'

// Packaging editor card — link partner's ACTIVE PackagingSystem rows to this
// template + per-link base price + lead time.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §6 + §4.3 (④) + #132.
//
// V1 ships add/remove + basePriceCents + leadTimeDays inline editing.
// pricingTiers JSON (volume tier discounts) + surfaceOverrides (per-product
// die-line override) ship in a follow-up.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Label } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { Plus, Trash2, Box } from 'lucide-react'
import {
  addPackagingLink,
  updatePackagingLink,
  removePackagingLink,
} from '../card-actions'

export interface PackagingLinkRow {
  packagingSystemId: string
  name: string
  topology: string
  unitCount: number
  basePriceCents: number
  leadTimeDays: number
}

export interface AvailablePackagingOption {
  id: string
  name: string
  topology: string
  unitCount: number
  moq: number
}

interface PackagingCardProps {
  productTemplateId: string
  initialLinks: PackagingLinkRow[]
  availableOptions: AvailablePackagingOption[]
  isDraft: boolean
}

export function PackagingCard({
  productTemplateId,
  initialLinks,
  availableOptions,
  isDraft,
}: PackagingCardProps) {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)

  // Filter the picker to only show packaging the partner hasn't already linked.
  const linkedIds = new Set(initialLinks.map((l) => l.packagingSystemId))
  const pickable = availableOptions.filter((o) => !linkedIds.has(o.id))

  function refresh() {
    router.refresh()
  }

  return (
    <div className="space-y-3">
      {initialLinks.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
          No packaging linked yet. Pick at least one before submitting.
        </div>
      ) : (
        <ul className="space-y-2">
          {initialLinks.map((link) => (
            <PackagingLinkItem
              key={link.packagingSystemId}
              productTemplateId={productTemplateId}
              link={link}
              isDraft={isDraft}
              canRemove={initialLinks.length > 1}
              onChange={refresh}
            />
          ))}
        </ul>
      )}

      {showAdd ? (
        <AddPackagingForm
          productTemplateId={productTemplateId}
          options={pickable}
          onCancel={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            refresh()
          }}
        />
      ) : isDraft && pickable.length > 0 ? (
        <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Link packaging
        </Button>
      ) : isDraft && pickable.length === 0 ? (
        <p className="text-xs text-zinc-500">
          You&apos;ve linked all your ACTIVE packaging.{' '}
          <a href="/packaging/new" className="text-emerald-700 underline">
            Add more to your catalog
          </a>{' '}
          to keep going.
        </p>
      ) : null}

      <p className="text-xs text-zinc-500">
        💡 Each link is one SKU offered to creators (16oz jar at $4.50, 32oz jar at $7.50, etc).
        Per-volume tier discounts ship in a follow-up.
      </p>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Linked packaging item (with inline price + lead-time editor)
// -----------------------------------------------------------------------------

function PackagingLinkItem({
  productTemplateId,
  link,
  isDraft,
  canRemove,
  onChange,
}: {
  productTemplateId: string
  link: PackagingLinkRow
  isDraft: boolean
  canRemove: boolean
  onChange: () => void
}) {
  const [priceDollars, setPriceDollars] = useState((link.basePriceCents / 100).toFixed(2))
  const [leadTimeDays, setLeadTimeDays] = useState(String(link.leadTimeDays))
  const [isPending, startTransition] = useTransition()

  function saveField(field: 'price' | 'leadTime') {
    return () => {
      if (field === 'price') {
        const dollars = parseFloat(priceDollars)
        if (!Number.isFinite(dollars) || dollars < 0.01) {
          toast.error('Base price must be > $0.')
          setPriceDollars((link.basePriceCents / 100).toFixed(2))
          return
        }
        const cents = Math.round(dollars * 100)
        if (cents === link.basePriceCents) return
        startTransition(async () => {
          const result = await updatePackagingLink({
            productTemplateId,
            packagingSystemId: link.packagingSystemId,
            basePriceCents: cents,
          })
          if (!result.ok) {
            toast.error(result.error)
            return
          }
          onChange()
        })
      } else {
        const days = parseInt(leadTimeDays, 10)
        if (!Number.isFinite(days) || days < 0) {
          toast.error('Lead time must be ≥ 0.')
          setLeadTimeDays(String(link.leadTimeDays))
          return
        }
        if (days === link.leadTimeDays) return
        startTransition(async () => {
          const result = await updatePackagingLink({
            productTemplateId,
            packagingSystemId: link.packagingSystemId,
            leadTimeDays: days,
          })
          if (!result.ok) {
            toast.error(result.error)
            return
          }
          onChange()
        })
      }
    }
  }

  function remove() {
    if (!canRemove) {
      toast.error('Templates need at least one packaging link.')
      return
    }
    if (!confirm(`Unlink "${link.name}"?`)) return
    startTransition(async () => {
      const result = await removePackagingLink({
        productTemplateId,
        packagingSystemId: link.packagingSystemId,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onChange()
    })
  }

  return (
    <li className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="flex items-start gap-3">
        <Box className="mt-0.5 h-4 w-4 flex-shrink-0 text-zinc-500" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-zinc-900">{link.name}</div>
          <div className="mt-0.5 text-xs text-zinc-500">
            {humanizeTopology(link.topology)} · {link.unitCount} unit
            {link.unitCount === 1 ? '' : 's'} per pack
          </div>
        </div>
        {isDraft && canRemove && (
          <Button
            variant="ghost"
            size="sm"
            onClick={remove}
            disabled={isPending}
            className="text-red-600 hover:bg-red-50"
            aria-label={`Unlink ${link.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-zinc-500">
            Base price (USD)
          </Label>
          <div className="flex items-stretch overflow-hidden rounded-md border border-zinc-300">
            <span className="flex items-center bg-zinc-50 px-3 text-sm text-zinc-500">$</span>
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={priceDollars}
              onChange={(e) => setPriceDollars(e.target.value)}
              onBlur={saveField('price')}
              disabled={!isDraft || isPending}
              className="block w-full bg-white px-3 py-2 text-sm focus:outline-none"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-zinc-500">
            Lead time (days)
          </Label>
          <Input
            type="number"
            min={0}
            value={leadTimeDays}
            onChange={(e) => setLeadTimeDays(e.target.value)}
            onBlur={saveField('leadTime')}
            disabled={!isDraft || isPending}
          />
        </div>
      </div>
    </li>
  )
}

// -----------------------------------------------------------------------------
// Add packaging form (picker + initial price + lead time)
// -----------------------------------------------------------------------------

function AddPackagingForm({
  productTemplateId,
  options,
  onCancel,
  onAdded,
}: {
  productTemplateId: string
  options: AvailablePackagingOption[]
  onCancel: () => void
  onAdded: () => void
}) {
  const [packagingSystemId, setPackagingSystemId] = useState(options[0]?.id ?? '')
  const [priceDollars, setPriceDollars] = useState('')
  const [leadTimeDays, setLeadTimeDays] = useState('30')
  const [isPending, startTransition] = useTransition()

  function add() {
    if (!packagingSystemId) return
    const dollars = parseFloat(priceDollars)
    if (!Number.isFinite(dollars) || dollars <= 0) {
      toast.error('Set a base price > $0.')
      return
    }
    startTransition(async () => {
      const result = await addPackagingLink({
        productTemplateId,
        packagingSystemId,
        basePriceCents: Math.round(dollars * 100),
        leadTimeDays: parseInt(leadTimeDays, 10) || 30,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onAdded()
    })
  }

  return (
    <div className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50/40 p-3">
      <div className="space-y-1">
        <Label className="text-xs uppercase tracking-wider text-zinc-500">
          Packaging system
        </Label>
        <select
          value={packagingSystemId}
          onChange={(e) => setPackagingSystemId(e.target.value)}
          disabled={isPending}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} — {humanizeTopology(o.topology)} · {o.unitCount} unit
              {o.unitCount === 1 ? '' : 's'} · MOQ {o.moq.toLocaleString()}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-zinc-500">
            Base price (USD)
          </Label>
          <div className="flex items-stretch overflow-hidden rounded-md border border-zinc-300">
            <span className="flex items-center bg-zinc-50 px-3 text-sm text-zinc-500">$</span>
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={priceDollars}
              onChange={(e) => setPriceDollars(e.target.value)}
              disabled={isPending}
              placeholder="4.50"
              className="block w-full bg-white px-3 py-2 text-sm focus:outline-none"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-zinc-500">
            Lead time (days)
          </Label>
          <Input
            type="number"
            min={0}
            value={leadTimeDays}
            onChange={(e) => setLeadTimeDays(e.target.value)}
            disabled={isPending}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={add}
          disabled={isPending || !packagingSystemId || !priceDollars}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {isPending ? 'Linking…' : 'Link packaging'}
        </Button>
      </div>
    </div>
  )
}

function humanizeTopology(t: string): string {
  return t
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
