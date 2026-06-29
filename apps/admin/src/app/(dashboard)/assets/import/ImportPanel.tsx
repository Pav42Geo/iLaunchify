'use client'

// C7 — bulk JSON import UI. Pick a family, paste JSON, preview the shape, import.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { CheckCircle2, AlertTriangle, FileJson } from 'lucide-react'
import {
  importPackagingSymbols,
  importLabelingSymbols,
  importCertificateVariants,
  type ImportSummary,
} from './actions'

type Family = 'packaging' | 'labeling' | 'certificate'

const SAMPLES: Record<Family, string> = {
  packaging: JSON.stringify(
    [
      {
        slug: 'pet-1',
        name: 'PET (1)',
        family: 'RESIN_CODE',
        description: 'Polyethylene terephthalate resin identification code.',
        applicableSubstrates: ['rigid'],
        applicableMaterials: ['PET'],
        applicableMarkets: ['us'],
        requirement: 'RECOMMENDED',
        requiredWhen: 'Required in CA for rigid plastic containers ≥ 16 oz.',
        variants: [{ label: 'Mono', approvedColorSpec: '#000000', minWidthMm: 6 }],
      },
    ],
    null,
    2,
  ),
  labeling: JSON.stringify(
    [
      {
        slug: 'distributed-by',
        name: 'Distributed by',
        family: 'ATTRIBUTION',
        description: 'Distributor attribution statement.',
        applicableCategorySlugs: ['beverages', 'supplements'],
        applicableMarkets: ['us'],
        requirement: 'REQUIRED',
        requiredCoText: 'Distributed by {company}, {city}, {state} {zip}',
        variants: [{ label: 'Text', notes: 'Set in body font, ≥ 6pt.' }],
      },
    ],
    null,
    2,
  ),
  certificate: JSON.stringify(
    [
      {
        certificateTypeSlug: 'usda-organic',
        variants: [
          { kind: 'COLOR', label: 'Color', approvedColorSpec: 'PMS 348C / #00843D', minWidthMm: 12, clearSpaceFactor: 0.25 },
          { kind: 'BLACK_WHITE', label: 'Black & White', minWidthMm: 12 },
        ],
      },
    ],
    null,
    2,
  ),
}

const FAMILY_LABEL: Record<Family, string> = {
  packaging: 'Packaging symbols',
  labeling: 'Labeling symbols',
  certificate: 'Certificate variants',
}

export function ImportPanel() {
  const router = useRouter()
  const [family, setFamily] = useState<Family>('packaging')
  const [json, setJson] = useState('')
  const [result, setResult] = useState<ImportSummary | null>(null)
  const [isPending, startTransition] = useTransition()

  function run() {
    setResult(null)
    startTransition(async () => {
      const fn =
        family === 'packaging'
          ? importPackagingSymbols
          : family === 'labeling'
            ? importLabelingSymbols
            : importCertificateVariants
      const res = await fn(json)
      setResult(res)
      if (res.ok && res.errors.length === 0) {
        toast.success(`Imported — ${res.created} created, ${res.updated} updated, ${res.variantsCreated} variants`)
      } else if (res.created + res.updated + res.variantsCreated > 0) {
        toast.warning(`Imported with ${res.errors.length} issue(s)`)
      } else {
        toast.error('Nothing imported — see errors')
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4 rounded-lg border border-ink-200 bg-white p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink-700">Asset family:</span>
        {(['packaging', 'labeling', 'certificate'] as Family[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              setFamily(f)
              setResult(null)
            }}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              family === f ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
            }`}
          >
            {FAMILY_LABEL[f]}
          </button>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => setJson(SAMPLES[family])}
          disabled={isPending}
        >
          <FileJson className="mr-1.5 h-3.5 w-3.5" /> Load sample
        </Button>
      </div>

      <p className="text-ui-caption text-ink-500">
        Upsert by {family === 'certificate' ? 'certificateTypeSlug (variants appended by label)' : 'slug'}. Existing rows are
        updated; variants are appended when their label is new. Bad rows are skipped and reported — good rows still import.
      </p>

      <textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        rows={16}
        spellCheck={false}
        placeholder={`Paste a JSON array for ${FAMILY_LABEL[family]}…`}
        className="w-full rounded-md border border-ink-200 bg-ink-50 px-3 py-2 font-mono text-xs text-ink-800 focus:border-ink-400 focus:outline-none"
        disabled={isPending}
      />

      <div className="flex items-center justify-between">
        <span className="text-ui-caption text-ink-400">{json.length.toLocaleString()} chars</span>
        <Button onClick={run} disabled={isPending || !json.trim()} className="bg-success-600 hover:bg-success-700">
          {isPending ? 'Importing…' : `Import ${FAMILY_LABEL[family]}`}
        </Button>
      </div>

      {result && (
        <div className="space-y-2 rounded-md border border-ink-200 bg-ink-50 p-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ui-body">
            <Stat label="Created" value={result.created} />
            <Stat label="Updated" value={result.updated} />
            <Stat label="Variants" value={result.variantsCreated} />
            <Stat label="Skipped" value={result.skipped} tone={result.skipped ? 'warn' : undefined} />
          </div>
          {result.errors.length > 0 ? (
            <div className="space-y-1">
              <p className="flex items-center gap-1 text-xs font-semibold text-warning-700">
                <AlertTriangle className="h-3.5 w-3.5" /> {result.errors.length} issue(s):
              </p>
              <ul className="max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-ui-caption text-warning-800">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="flex items-center gap-1 text-ui-caption font-medium text-success-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> No errors.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className={`font-display text-lg font-bold ${tone === 'warn' ? 'text-warning-700' : 'text-ink-900'}`}>{value}</span>
      <span className="text-ui-caption text-ink-500">{label}</span>
    </span>
  )
}
