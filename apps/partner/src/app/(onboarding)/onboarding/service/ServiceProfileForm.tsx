'use client'

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ilaunchify/ui'
import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { saveServiceProfile } from './actions'

interface Props {
  serviceId: string
  serviceType: 'MANUFACTURING' | 'LABEL_PRINTING' | 'COPACKING'
  disclosureLevel: 'FULL' | 'CITY_STATE' | 'ANONYMOUS'
  initial: Record<string, unknown>
  /** Where to navigate after a successful save. Defaults to the onboarding documents step. */
  redirectAfterSave?: string
  /** Button label. Defaults to the onboarding wording. */
  submitLabel?: string
  successMessage?: string
}

export function ServiceProfileForm({
  serviceId,
  serviceType,
  disclosureLevel: initialDisclosure,
  initial,
  redirectAfterSave = '/onboarding/documents',
  submitLabel = 'Save & continue',
  successMessage = 'Service profile saved',
}: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [disclosure, setDisclosure] = useState(initialDisclosure)

  // Per-type state. Defaults pulled from initial.capabilities (if any).
  const [moqMin, setMoqMin] = useState((initial.moqMin as number) ?? 500)
  const [moqMax, setMoqMax] = useState((initial.moqMax as number) ?? 5000)
  const [leadStock, setLeadStock] = useState((initial.leadTimeStockDays as number) ?? 28)
  const [leadCustom, setLeadCustom] = useState((initial.leadTimeCustomDays as number) ?? 70)
  const [leadTimeDays, setLeadTimeDays] = useState((initial.leadTimeDays as number) ?? 7)
  const [categories, setCategories] = useState<string[]>(
    Array.isArray(initial.categories) ? (initial.categories as string[]) : [],
  )
  const [certs, setCerts] = useState<string>(
    Array.isArray(initial.certifications) ? (initial.certifications as string[]).join(', ') : '',
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const capabilities: Record<string, unknown> = { type: serviceType }
      const certifications = certs
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      if (serviceType === 'MANUFACTURING') {
        Object.assign(capabilities, {
          categories,
          moqMin,
          moqMax,
          leadTimeStockDays: leadStock,
          leadTimeCustomDays: leadCustom,
          certifications,
          containerFormats: initial.containerFormats ?? [],
          fillTypes: initial.fillTypes ?? [],
        })
      } else if (serviceType === 'COPACKING') {
        Object.assign(capabilities, {
          containerFormats: initial.containerFormats ?? [],
          fillTypes: initial.fillTypes ?? [],
          moqMin,
          moqMax,
          leadTimeDays,
          certifications,
        })
      } else {
        // LABEL_PRINTING
        Object.assign(capabilities, {
          preferredFormats: ['PDF_X1A'],
          bleedMm: 3.0,
          trimMarks: true,
          registrationMarks: false,
          totalInkLimitPct: 300,
          supportedMaterials: initial.supportedMaterials ?? [],
          moqMin,
          leadTimeDays,
        })
      }

      const result = await saveServiceProfile({ serviceId, capabilities, disclosureLevel: disclosure })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(successMessage)
      router.push(redirectAfterSave)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Disclosure preference */}
      <div className="space-y-1.5">
        <Label>How should your name appear on labels?</Label>
        <Select value={disclosure} onValueChange={(v) => setDisclosure(v as typeof disclosure)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ANONYMOUS">Anonymous — &quot;Manufactured for [Brand] in the USA&quot;</SelectItem>
            <SelectItem value="CITY_STATE">City + State — &quot;Manufactured for [Brand] in San Jose, CA&quot;</SelectItem>
            <SelectItem value="FULL">Full — &quot;Manufactured by Acme Foods, San Jose, CA&quot;</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-zinc-500">
          You can override this per-order at routing time.
        </p>
      </div>

      {/* MOQ */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="moqMin">MOQ minimum (units)</Label>
          <Input
            id="moqMin"
            type="number"
            min={1}
            value={moqMin || ''}
            onChange={(e) => setMoqMin(Number(e.target.value))}
            disabled={busy}
          />
        </div>
        {serviceType !== 'LABEL_PRINTING' && (
          <div className="space-y-1.5">
            <Label htmlFor="moqMax">MOQ maximum (units)</Label>
            <Input
              id="moqMax"
              type="number"
              min={1}
              value={moqMax || ''}
              onChange={(e) => setMoqMax(Number(e.target.value))}
              disabled={busy}
            />
          </div>
        )}
      </div>

      {/* Lead time */}
      {serviceType === 'MANUFACTURING' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="leadStock">Lead time — stock formulations (days)</Label>
            <Input
              id="leadStock"
              type="number"
              min={1}
              value={leadStock || ''}
              onChange={(e) => setLeadStock(Number(e.target.value))}
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="leadCustom">Lead time — custom (days)</Label>
            <Input
              id="leadCustom"
              type="number"
              min={1}
              value={leadCustom || ''}
              onChange={(e) => setLeadCustom(Number(e.target.value))}
              disabled={busy}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="leadTime">Lead time (days)</Label>
          <Input
            id="leadTime"
            type="number"
            min={1}
            value={leadTimeDays || ''}
            onChange={(e) => setLeadTimeDays(Number(e.target.value))}
            disabled={busy}
          />
        </div>
      )}

      {/* Categories (manufacturing only) */}
      {serviceType === 'MANUFACTURING' && (
        <div className="space-y-1.5">
          <Label>Categories you produce</Label>
          <div className="flex flex-wrap gap-2">
            {['FOOD', 'BEVERAGE_FUNCTIONAL', 'SUPPLEMENT'].map((c) => {
              const on = categories.includes(c)
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategories(on ? categories.filter((x) => x !== c) : [...categories, c])}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    on ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 text-zinc-700'
                  }`}
                >
                  {c}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Certifications */}
      <div className="space-y-1.5">
        <Label htmlFor="certs">Certifications (comma-separated)</Label>
        <Input
          id="certs"
          value={certs}
          onChange={(e) => setCerts(e.target.value)}
          placeholder="FDA, GMP, USDA_ORGANIC, KOSHER"
          disabled={busy}
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
