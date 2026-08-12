'use client'

// Packaging system core-fields form, EDIT ONLY, used by /packaging/[id].
// Creation was retired from the catalog (Pavel 2026-08-03): new systems are
// born in the product builder's Step 4 packaging sheet. Surface CRUD lives in
// a separate component (SurfacesPanel).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Label } from '@ilaunchify/ui'
import { toast } from 'sonner'
import type {
  PackagingTopology,
  FlavorMode,
  FlavorPolicy,
} from '@ilaunchify/db'
import {
  TOPOLOGY_OPTIONS,
  FLAVOR_MODE_OPTIONS,
  FLAVOR_POLICY_OPTIONS,
} from './constants'
import { updatePackagingSystem } from './actions'

interface PackagingFormState {
  partnerName: string
  topology: PackagingTopology
  unitCount: string // string for input ergonomics; coerced to int on submit
  flavorMode: FlavorMode
  flavorPolicy: FlavorPolicy
  moq: string
  lengthMm: string
  widthMm: string
  heightMm: string
  maxWeightG: string
  grossWeightG: string
  casesPerLayer: string
  layersPerPallet: string
}

const BLANK: PackagingFormState = {
  partnerName: '',
  topology: 'SINGLE_CONTAINER',
  unitCount: '1',
  flavorMode: 'SINGLE',
  flavorPolicy: 'CREATOR_PICK',
  moq: '500',
  lengthMm: '',
  widthMm: '',
  heightMm: '',
  maxWeightG: '',
  grossWeightG: '',
  casesPerLayer: '',
  layersPerPallet: '',
}

interface PackagingFormProps {
  packagingSystemId: string
  initial?: Partial<PackagingFormState>
}

export function PackagingForm({ packagingSystemId, initial }: PackagingFormProps) {
  const router = useRouter()
  const [state, setState] = useState<PackagingFormState>({ ...BLANK, ...initial })
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function patch<K extends keyof PackagingFormState>(key: K, value: PackagingFormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const payload = {
      partnerName: state.partnerName,
      topology: state.topology,
      unitCount: parseInt(state.unitCount, 10) || 1,
      flavorMode: state.flavorMode,
      flavorPolicy: state.flavorPolicy,
      moq: parseInt(state.moq, 10) || 0,
      dimensions:
        state.lengthMm || state.widthMm || state.heightMm
          ? {
              lengthMm: state.lengthMm ? parseFloat(state.lengthMm) : null,
              widthMm: state.widthMm ? parseFloat(state.widthMm) : null,
              heightMm: state.heightMm ? parseFloat(state.heightMm) : null,
            }
          : null,
      maxWeightG: state.maxWeightG ? parseInt(state.maxWeightG, 10) : null,
      grossWeightG: state.grossWeightG ? parseInt(state.grossWeightG, 10) : null,
      casesPerLayer: state.casesPerLayer ? parseInt(state.casesPerLayer, 10) : null,
      layersPerPallet: state.layersPerPallet ? parseInt(state.layersPerPallet, 10) : null,
    }

    startTransition(async () => {
      const result = await updatePackagingSystem(packagingSystemId, payload)
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success('Saved')
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-ink-200 bg-white p-6">
      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="partnerName" className="text-sm font-medium text-ink-900">
          Internal name <RequiredBadge />
        </Label>
        <Input
          id="partnerName"
          value={state.partnerName}
          onChange={(e) => patch('partnerName', e.target.value)}
          placeholder="e.g. 16oz wide-mouth HDPE jar"
          required
          disabled={isPending}
        />
        <p className="text-ui-caption text-ink-500">
          Just for you and admin — creators see a curated display name (or this as fallback).
        </p>
      </div>

      {/* Topology */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-ink-900">Topology</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {TOPOLOGY_OPTIONS.map((opt) => {
            const selected = state.topology === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => patch('topology', opt.value)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  selected
                    ? 'border-ink-900 bg-ink-900/[0.04] ring-1 ring-ink-900'
                    : 'border-ink-200 bg-white hover:border-ink-400'
                }`}
                disabled={isPending}
              >
                <div className="font-medium text-ink-900">{opt.label}</div>
                <div className="mt-0.5 text-ui-caption text-ink-500">{opt.hint}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Unit count + MOQ */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="unitCount" className="text-sm font-medium text-ink-900">
            Units per pack
          </Label>
          <Input
            id="unitCount"
            type="number"
            min={1}
            value={state.unitCount}
            onChange={(e) => patch('unitCount', e.target.value)}
            disabled={isPending}
          />
          <p className="text-ui-caption text-ink-500">
            How many inner containers ship as one packaging unit (1 for a single jar).
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="moq" className="text-sm font-medium text-ink-900">
            MOQ (units)
          </Label>
          <Input
            id="moq"
            type="number"
            min={1}
            value={state.moq}
            onChange={(e) => patch('moq', e.target.value)}
            disabled={isPending}
          />
          <p className="text-ui-caption text-ink-500">Minimum order quantity for a single creator batch.</p>
        </div>
      </div>

      {/* Flavor mode + policy */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-sm font-medium text-ink-900">Flavor mode</Label>
          {FLAVOR_MODE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex items-start gap-2 rounded-md border border-ink-200 p-2 text-sm transition-colors hover:bg-ink-50"
            >
              <input
                type="radio"
                checked={state.flavorMode === opt.value}
                onChange={() => patch('flavorMode', opt.value)}
                disabled={isPending}
                className="mt-1 accent-[var(--control-accent)]"
              />
              <div>
                <div className="font-medium text-ink-900">{opt.label}</div>
                <div className="text-ui-caption text-ink-500">{opt.hint}</div>
              </div>
            </label>
          ))}
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium text-ink-900">Flavor policy</Label>
          {FLAVOR_POLICY_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex items-start gap-2 rounded-md border border-ink-200 p-2 text-sm transition-colors hover:bg-ink-50"
            >
              <input
                type="radio"
                checked={state.flavorPolicy === opt.value}
                onChange={() => patch('flavorPolicy', opt.value)}
                disabled={isPending}
                className="mt-1 accent-[var(--control-accent)]"
              />
              <div>
                <div className="font-medium text-ink-900">{opt.label}</div>
                <div className="text-ui-caption text-ink-500">{opt.hint}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Dimensions */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-ink-900">Dimensions (mm, optional)</Label>
        <div className="grid grid-cols-3 gap-3">
          <Input
            type="number"
            min={0}
            placeholder="Length"
            value={state.lengthMm}
            onChange={(e) => patch('lengthMm', e.target.value)}
            disabled={isPending}
          />
          <Input
            type="number"
            min={0}
            placeholder="Width"
            value={state.widthMm}
            onChange={(e) => patch('widthMm', e.target.value)}
            disabled={isPending}
          />
          <Input
            type="number"
            min={0}
            placeholder="Height"
            value={state.heightMm}
            onChange={(e) => patch('heightMm', e.target.value)}
            disabled={isPending}
          />
        </div>
        <p className="text-ui-caption text-ink-500">Used for shipping calculations and label dimension fit.</p>
      </div>

      {/* Max weight */}
      <div className="space-y-1.5">
        <Label htmlFor="maxWeightG" className="text-sm font-medium text-ink-900">
          Max contents weight (grams, optional)
        </Label>
        <Input
          id="maxWeightG"
          type="number"
          min={0}
          value={state.maxWeightG}
          onChange={(e) => patch('maxWeightG', e.target.value)}
          disabled={isPending}
        />
      </div>

      {/* Pallet logistics (Ti-Hi) — authored once here, inherited by every product
          that uses this packaging. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="grossWeightG" className="text-sm font-medium text-ink-900">Gross weight (g, optional)</Label>
          <Input id="grossWeightG" type="number" min={0} value={state.grossWeightG} onChange={(e) => patch('grossWeightG', e.target.value)} disabled={isPending} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="casesPerLayer" className="text-sm font-medium text-ink-900">Cases per layer (Ti)</Label>
          <Input id="casesPerLayer" type="number" min={0} value={state.casesPerLayer} onChange={(e) => patch('casesPerLayer', e.target.value)} disabled={isPending} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="layersPerPallet" className="text-sm font-medium text-ink-900">Layers per pallet (Hi)</Label>
          <Input id="layersPerPallet" type="number" min={0} value={state.layersPerPallet} onChange={(e) => patch('layersPerPallet', e.target.value)} disabled={isPending} />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={isPending} className="bg-ink-900 hover:bg-ink-700">
          {isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}

function RequiredBadge() {
  return (
    <span className="ml-1 text-[10px] font-medium uppercase tracking-wider text-danger-600">
      Required
    </span>
  )
}
