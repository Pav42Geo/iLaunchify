// =============================================================================
// Admin — Label-format preset detail (read-only LabelFormatRule)
// =============================================================================
//
// The LabelFormatRule composite PK is [format, labelingType]. The list-row link
// encodes it as `<format>~<labelingType>`; here we split on `~` and findUnique
// against the composite key. 404 if not found / malformed. Read-only — these
// are seed-curated presets.

import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { cn } from '@ilaunchify/ui'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  ExternalLink,
  Columns3,
  Layers,
  Rows3,
  Check,
  Minus,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { LabelFormat, LabelingType, PanelOrientation } from '@ilaunchify/db'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Label-format preset — Admin' }

const ACRONYMS = new Set(['FDA', 'USDA', 'AAFCO', 'OTC'])
function humanizeFormat(format: string): string {
  return format
    .split('_')
    .map((part) => (ACRONYMS.has(part) ? part : part.charAt(0) + part.slice(1).toLowerCase()))
    .join(' ')
}

const LABELING_TYPE_LABEL: Record<string, string> = {
  FOOD: 'Food — Nutrition Facts',
  DIETARY_SUPPLEMENT: 'Dietary Supplement — Supplement Facts',
  PET_PRODUCT: 'Pet Product — AAFCO Guaranteed Analysis',
  OTC: 'OTC — Drug Facts',
  COSMETIC: 'Cosmetic',
}

const ORIENTATION_LABEL: Record<string, string> = {
  VERTICAL: 'Vertical',
  HORIZONTAL: 'Horizontal',
  TABULAR: 'Tabular',
  LINEAR: 'Linear',
}

interface PageProps {
  params: Promise<{ key: string }>
}

export default async function LabelFormatDetailPage({ params }: PageProps) {
  await requireRole(['ADMIN'])

  const { key } = await params
  const decoded = decodeURIComponent(key)
  const sep = decoded.indexOf('~')
  if (sep === -1) notFound()
  const format = decoded.slice(0, sep)
  const labelingType = decoded.slice(sep + 1)
  if (!format || !labelingType) notFound()

  const rule = await prisma.labelFormatRule
    .findUnique({
      where: {
        format_labelingType: {
          format: format as LabelFormat,
          labelingType: labelingType as LabelingType,
        },
      },
    })
    .catch(() => null)

  if (!rule) notFound()

  const formatLabel = humanizeFormat(rule.format)
  const ecfrUrl = `https://www.ecfr.gov/search?search[query]=${encodeURIComponent(rule.cfrCitation)}`

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/label-formats"
          className="mb-2 inline-flex items-center gap-1 text-[12.5px] text-ink-500 hover:text-ink-700 focus-visible:outline-none focus-visible:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to label templates
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[26px] font-bold tracking-[-0.02em] text-ink-900">
            {formatLabel}
          </h1>
          <span className="inline-flex items-center rounded-full border border-ink-200 bg-zinc-50 px-2.5 py-0.5 text-[11px] font-medium text-ink-600">
            {LABELING_TYPE_LABEL[rule.labelingType] ?? rule.labelingType}
          </span>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-500">
          <code className="rounded border border-ink-200 bg-zinc-50 px-1.5 py-[1px] font-mono text-[11px] text-ink-600">
            {rule.format}
          </code>
          <span>·</span>
          <code className="font-mono text-[12px] text-ink-700">{rule.cfrCitation}</code>
          <a
            href={ecfrUrl}
            className="inline-flex items-center gap-1 text-pink-700 hover:text-pink-800"
          >
            <ExternalLink className="h-3 w-3" /> Look up on eCFR
          </a>
        </p>
      </div>

      {/* Dimensional thresholds */}
      <section className="rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-500">
          Dimensional thresholds
        </h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
          <Stat label="Min surface area" value={`${Number(rule.minSurfaceAreaSqIn)} sq in`} />
          <Stat label="Min label width" value={`${Number(rule.minLabelWidthMm)} mm`} />
          <Stat label="Min label height" value={`${Number(rule.minLabelHeightMm)} mm`} />
          <Stat label="Min font size" value={`${Number(rule.minFontSizePt)} pt`} />
          <Stat label="Min header font size" value={`${Number(rule.minHeaderFontSizePt)} pt`} />
          <Stat
            label="Panel orientation"
            value={ORIENTATION_LABEL[rule.panelOrientation as PanelOrientation] ?? rule.panelOrientation}
          />
        </dl>
      </section>

      {/* Capabilities */}
      <section className="rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-500">
          Column capabilities
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <CapRow icon={Columns3} label="Multi-column" enabled={rule.supportsMultiColumn} />
          <CapRow icon={Layers} label="Aggregate" enabled={rule.supportsAggregate} />
          <CapRow icon={Rows3} label="Dual-column" enabled={rule.supportsDualColumn} />
        </div>
      </section>

      {/* Preference + notes */}
      <section className="rounded-2xl border border-ink-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-500">
            Preference score
          </h2>
          <span className="font-display text-[20px] font-bold tabular-nums text-ink-900">
            {rule.preferenceScore}
          </span>
        </div>
        {rule.notes && (
          <p className="mt-3 border-t border-ink-100 pt-3 text-[13px] leading-relaxed text-ink-700">
            {rule.notes}
          </p>
        )}
      </section>

      <p className="text-[11.5px] text-ink-400">
        This preset is seed-curated and read-only. Editable per-category defaults and a live
        sample render are planned follow-ons.
      </p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-500">
        {label}
      </dt>
      <dd className="mt-0.5 font-display text-[16px] font-semibold tabular-nums text-ink-900">
        {value}
      </dd>
    </div>
  )
}

function CapRow({
  icon: Icon,
  label,
  enabled,
}: {
  icon: LucideIcon
  label: string
  enabled: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[12.5px] font-medium',
        enabled
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-ink-200 bg-zinc-50 text-ink-400',
      )}
    >
      <Icon className={cn('h-4 w-4', enabled ? 'text-emerald-600' : 'text-ink-300')} />
      <span className="flex-1">{label}</span>
      {enabled ? <Check className="h-4 w-4 text-emerald-600" /> : <Minus className="h-4 w-4 text-ink-300" />}
    </div>
  )
}
