'use client'

// AiParserPanel — Mode 2 paste-to-recipe UI (Slice 3).
// Brief: docs/builds/ingredients-ai-parser-slice-3.md.
//
// Two steps, all staged in client state until the partner commits:
//   1. Provide source — paste textarea + Extract (PDF/photo are V1.1/V1.2,
//      shown disabled). Calls parseRecipeFromText (gate + rate-limit + Haiku).
//   2. Review extracted — per-line Accept / edit-weight / Skip, then
//      "Add N to recipe" → commitParsedSlots (writes slots via addIngredientSlot,
//      so Slice 1 banned-list enforcement fires automatically).

import { useState, useTransition } from 'react'
import { Button, Input } from '@ilaunchify/ui'
import { toast } from 'sonner'
import {
  Sparkles,
  Loader2,
  Check,
  AlertTriangle,
  Ban,
  FileUp,
  Camera,
  ArrowLeft,
} from 'lucide-react'
import type { ParsedLine } from '@ilaunchify/ai'
import { parseRecipeFromText, commitParsedSlots } from '../recipe-parser-actions'

interface AiParserPanelProps {
  productTemplateId: string
  onCommitted: () => void
  onCancel: () => void
}

interface ReviewLine extends ParsedLine {
  accepted: boolean
  weightInput: string
}

export function AiParserPanel({ productTemplateId, onCommitted, onCancel }: AiParserPanelProps) {
  const [step, setStep] = useState<'input' | 'review'>('input')
  const [rawText, setRawText] = useState('')
  const [lines, setLines] = useState<ReviewLine[]>([])
  const [isExtracting, startExtract] = useTransition()
  const [isCommitting, startCommit] = useTransition()

  function handleExtract() {
    if (!rawText.trim()) return
    startExtract(async () => {
      const res = await parseRecipeFromText(productTemplateId, rawText)
      if (!res.ok) {
        toast.error(errorToast(res.error, res))
        return
      }
      setLines(
        res.result.lines.map((l) => ({
          ...l,
          // Auto-accept confident matches; everything flagged starts unchecked.
          accepted: l.match !== null && !l.needsReview,
          weightInput: l.match?.estimatedWeightG != null ? String(l.match.estimatedWeightG) : '',
        })),
      )
      setStep('review')
    })
  }

  function patchLine(lineNumber: number, patch: Partial<ReviewLine>) {
    setLines((prev) => prev.map((l) => (l.lineNumber === lineNumber ? { ...l, ...patch } : l)))
  }

  // A line is committable when accepted, has a real match, and a positive weight.
  const committable = lines.filter(
    (l) => l.accepted && l.match && Number(l.weightInput) > 0,
  )

  function handleCommit() {
    if (committable.length === 0) return
    startCommit(async () => {
      const res = await commitParsedSlots(
        productTemplateId,
        committable.map((l) => ({
          ingredientId: l.match!.ingredientId,
          weightG: Number(l.weightInput),
          lineNumber: l.lineNumber,
        })),
      )
      if (!res.ok) {
        toast.error('Could not add the ingredients. Try again.')
        return
      }
      const failed = (res.results ?? []).filter((r) => !r.ok)
      const committed = (res.results ?? []).filter((r) => r.ok).length
      if (failed.length > 0) {
        // Most likely a banned ingredient blocked at commit time (Slice 1).
        toast.warning(
          `Added ${committed}. ${failed.length} blocked — likely on the banned list.`,
        )
      } else {
        toast.success(`Added ${committed} ingredient${committed === 1 ? '' : 's'} to the recipe.`)
      }
      onCommitted()
    })
  }

  // ---- Step 1: source ----
  if (step === 'input') {
    return (
      <div className="space-y-3 rounded-md border border-pink-200 bg-pink-50/40 p-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-pink-600" />
          <span className="text-sm font-semibold text-zinc-900">Parse with AI</span>
        </div>
        <p className="text-[12px] text-zinc-500">
          Paste your recipe or ingredient statement. We match each line against USDA,
          the curated library, and your private ingredients — you review before anything
          is added.
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr,180px]">
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={6}
            placeholder={'INGREDIENTS: Water, cane sugar, citric acid, natural flavor, sodium benzoate.'}
            disabled={isExtracting}
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-pink-400 focus:outline-none"
          />
          <div className="flex flex-col gap-2">
            <div
              title="PDF upload — coming in v1.1"
              className="flex cursor-not-allowed items-center gap-2 rounded-md border border-dashed border-zinc-200 bg-white/60 px-2.5 py-2 text-[11px] text-zinc-400"
            >
              <FileUp className="h-3.5 w-3.5" /> Drop a PDF
              <span className="ml-auto rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase">
                v1.1
              </span>
            </div>
            <div
              title="Photo capture — coming in v1.2"
              className="flex cursor-not-allowed items-center gap-2 rounded-md border border-dashed border-zinc-200 bg-white/60 px-2.5 py-2 text-[11px] text-zinc-400"
            >
              <Camera className="h-3.5 w-3.5" /> Snap a label
              <span className="ml-auto rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase">
                v1.2
              </span>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isExtracting}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleExtract}
            disabled={isExtracting || !rawText.trim()}
            className="bg-zinc-900 text-white hover:bg-zinc-800"
          >
            {isExtracting ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Extracting…
              </>
            ) : (
              <>
                <Sparkles className="mr-1.5 h-4 w-4" /> Extract
              </>
            )}
          </Button>
        </div>
      </div>
    )
  }

  // ---- Step 2: review ----
  const highConfidence = lines.filter((l) => l.match && !l.needsReview).length
  const toChoose = lines.filter((l) => l.needsReview && l.reviewReason !== 'banned').length
  const blocked = lines.filter((l) => l.reviewReason === 'banned').length

  return (
    <div className="space-y-3 rounded-md border border-pink-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setStep('input')}
          className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to paste
        </button>
        <span className="text-[12px] text-zinc-500">
          {lines.length} line{lines.length === 1 ? '' : 's'} · {highConfidence} high-confidence ·{' '}
          {toChoose} to review{blocked > 0 ? ` · ${blocked} blocked` : ''}
        </span>
      </div>

      <ul className="space-y-2">
        {lines.map((l) => (
          <ReviewRow key={l.lineNumber} line={l} onPatch={(p) => patchLine(l.lineNumber, p)} />
        ))}
      </ul>

      <div className="flex items-center justify-between gap-2 border-t border-zinc-100 pt-3">
        <span className="text-[12px] text-zinc-500">
          Ready to write <strong className="text-zinc-900">{committable.length}</strong> slot
          {committable.length === 1 ? '' : 's'}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isCommitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleCommit}
            disabled={isCommitting || committable.length === 0}
            className="bg-zinc-900 text-white hover:bg-zinc-800"
          >
            {isCommitting ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Adding…
              </>
            ) : (
              `Add ${committable.length} to recipe`
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ReviewRow({
  line,
  onPatch,
}: {
  line: ReviewLine
  onPatch: (patch: Partial<ReviewLine>) => void
}) {
  const banned = line.reviewReason === 'banned'
  const noMatch = line.match === null

  return (
    <li
      className={
        'rounded-md border p-2.5 ' +
        (banned
          ? 'border-red-200 bg-red-50/50'
          : line.needsReview
            ? 'border-amber-200 bg-amber-50/40'
            : 'border-zinc-200 bg-white')
      }
    >
      <div className="flex items-start gap-2.5">
        {/* Accept toggle — disabled when no match or banned. */}
        <button
          type="button"
          onClick={() => onPatch({ accepted: !line.accepted })}
          disabled={noMatch || banned}
          aria-pressed={line.accepted}
          aria-label={line.accepted ? 'Accepted — click to skip' : 'Skipped — click to accept'}
          className={
            'mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ' +
            (line.accepted
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : 'border-zinc-300 bg-white text-transparent') +
            (noMatch || banned ? ' cursor-not-allowed opacity-40' : ' hover:border-emerald-400')
          }
        >
          <Check className="h-3.5 w-3.5" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] text-zinc-700">
            <span className="text-zinc-400">“</span>
            {line.rawText}
            <span className="text-zinc-400">”</span>
          </div>

          {line.match ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-medium text-zinc-900">{line.match.name}</span>
              <SourcePill source={line.match.source} />
              <ConfidenceBadge value={line.match.confidence} />
            </div>
          ) : (
            <div className="mt-1 text-[12px] font-medium text-amber-700">
              No confident match — skip, or switch to Search &amp; build.
            </div>
          )}

          {line.needsReview && line.reviewReason && (
            <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-700">
              {banned ? <Ban className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {REVIEW_REASON_LABEL[line.reviewReason]}
            </div>
          )}
          {line.notes && <div className="mt-0.5 text-[11px] text-zinc-500">{line.notes}</div>}
        </div>

        {/* Weight (grams) — editable, only when there's a match to accept. */}
        {line.match && !banned && (
          <div className="flex flex-shrink-0 items-center gap-1">
            <Input
              type="number"
              min={0}
              step={0.1}
              value={line.weightInput}
              onChange={(e) => onPatch({ weightInput: e.target.value })}
              placeholder="g"
              className="w-20"
            />
            <span className="text-[11px] text-zinc-400">g</span>
          </div>
        )}
      </div>
    </li>
  )
}

function SourcePill({ source }: { source: string }) {
  const label = source === 'USDA' ? 'USDA' : source === 'LIBRARY' ? 'Library' : 'Private'
  const cls =
    source === 'USDA'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : source === 'LIBRARY'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-zinc-100 text-zinc-700 border-zinc-200'
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${cls}`}
    >
      {label}
    </span>
  )
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const cls =
    value >= 0.85
      ? 'bg-emerald-100 text-emerald-800'
      : value >= 0.7
        ? 'bg-amber-100 text-amber-800'
        : 'bg-zinc-200 text-zinc-700'
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${cls}`}>{pct}%</span>
  )
}

const REVIEW_REASON_LABEL: Record<string, string> = {
  'low-confidence': 'Low confidence — double-check the match',
  'multi-ingredient-blend': 'Looks like a blend of several ingredients',
  'generic-fda-name': 'Generic FDA name — may need a specific ingredient',
  'no-match': 'No match found',
  banned: 'On the banned list — cannot be added',
}

function errorToast(
  error:
    | 'not-a-partner'
    | 'forbidden'
    | 'upgrade-required'
    | 'rate-limit-minute'
    | 'rate-limit-day'
    | 'cap-reached'
    | 'input-too-large'
    | 'parse-failed',
  res: { used?: number; cap?: number },
): string {
  switch (error) {
    case 'upgrade-required':
      return 'AI parsing is available on the Trusted and Premier partner tiers.'
    case 'rate-limit-minute':
      return "Slow down — you've parsed 10 recipes in the last minute. Try again shortly."
    case 'rate-limit-day':
      return "You've hit the daily parse limit (100). Resets at midnight UTC."
    case 'cap-reached':
      return `You've used ${res.used ?? '—'} of ${res.cap ?? '—'} monthly parses. Resets at the start of next month.`
    case 'input-too-large':
      return 'Your input is over 10KB. Split it into smaller sections.'
    case 'parse-failed':
      return "The AI couldn't extract this recipe. Try again, or switch to Search & build."
    default:
      return 'Something went wrong. Try again.'
  }
}
