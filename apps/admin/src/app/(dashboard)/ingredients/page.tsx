// #140 — Admin ingredient verification queue.
//
// Lists every SELF_ATTESTED partner-private Ingredient sorted by
// promotion priority (echo count + usage). Per-row actions to verify
// in place or promote to the shared Curated Library via the inline
// PromoteForm.

import { FlaskConical, Sparkles, Building2, FileText, AlertTriangle } from 'lucide-react'
import {
  listIngredientCandidates,
  type IngredientCandidate,
} from './actions'
import { IngredientRowActions } from './IngredientRowActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Ingredient queue — Admin' }

export default async function IngredientsPage() {
  const candidates = await listIngredientCandidates()

  const totalCount = candidates.length
  const highEcho = candidates.filter((c) => c.echoCount >= 2).length

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-end justify-between gap-3 bg-[#F3EFE8] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.06em] text-zinc-500">
              Ingredient queue
            </p>
            <h1 className="mt-0.5 font-display text-2xl font-semibold tracking-tight text-zinc-900">
              Partner-private ingredients
            </h1>
            <p className="mt-1 max-w-2xl text-[12.5px] text-zinc-600">
              SELF_ATTESTED ingredients flow into production immediately —
              admin reviews this queue to absorb cross-partner repeats
              into the shared library and to flag anything that needs CoA
              follow-up. <span className="font-semibold">Not blocking:</span>{' '}
              partners are already using these rows.
            </p>
          </div>
          <div className="flex gap-2 text-[12px]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-2.5 py-[3px] text-[11px] font-medium text-zinc-700">
              <FlaskConical className="h-3 w-3" />
              {totalCount} pending
            </span>
            {highEcho > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-pink-200 bg-pink-50 px-2.5 py-[3px] text-[11px] font-medium text-pink-700">
                <Sparkles className="h-3 w-3" />
                {highEcho} promotion candidates
              </span>
            )}
          </div>
        </div>
      </header>

      {candidates.length === 0 ? <EmptyState /> : <Table rows={candidates} />}
    </div>
  )
}

// =============================================================================
// Table
// =============================================================================

function Table({ rows }: { rows: IngredientCandidate[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <table className="w-full text-[12.5px]">
        <thead className="bg-zinc-50/60 text-[10.5px] uppercase tracking-[0.06em] text-zinc-500">
          <tr>
            <Th className="w-[36%]">Ingredient</Th>
            <Th>Owner</Th>
            <Th className="text-right">Signals</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((r) => (
            <Row key={r.id} row={r} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Row({ row: r }: { row: IngredientCandidate }) {
  const isPromotionCandidate = r.echoCount >= 2
  return (
    <tr className={isPromotionCandidate ? 'bg-pink-50/30' : ''}>
      <td className="px-4 py-3 align-top">
        <p className="font-semibold text-zinc-900">
          {r.internalName ?? r.name}
        </p>
        {r.labelDeclarationName &&
          r.labelDeclarationName !== r.internalName &&
          r.labelDeclarationName !== r.name && (
            <p className="mt-0.5 text-[11.5px] text-zinc-500">
              Label name:{' '}
              <span className="italic">&ldquo;{r.labelDeclarationName}&rdquo;</span>
            </p>
          )}
        {r.allergenFlags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {r.allergenFlags.map((a) => (
              <span
                key={a}
                className="inline-flex rounded-full bg-amber-100 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wider text-amber-800"
              >
                {a}
              </span>
            ))}
          </div>
        )}
        {r.bioengineeredStatus !== 'NOT_APPLICABLE' && (
          <p className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider text-amber-800">
            <AlertTriangle className="h-2.5 w-2.5" />
            {r.bioengineeredStatus.replace(/_/g, ' ').toLowerCase()}
          </p>
        )}
      </td>
      <td className="px-4 py-3 align-top text-[12px] text-zinc-700">
        <p className="inline-flex items-center gap-1.5">
          <Building2 className="h-3 w-3 text-zinc-400" />
          {r.ownerPartnerName ?? '—'}
        </p>
        <p className="mt-0.5 text-[10.5px] text-zinc-500">
          {new Date(r.createdAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      </td>
      <td className="px-4 py-3 text-right align-top">
        <div className="inline-flex flex-col items-end gap-1">
          <span
            className={
              'inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-wider ' +
              (isPromotionCandidate
                ? 'bg-pink-100 text-pink-700'
                : 'bg-zinc-100 text-zinc-700')
            }
          >
            {r.echoCount}× echo
          </span>
          <span className="text-[11px] tabular-nums text-zinc-600">
            {r.usageCount} {r.usageCount === 1 ? 'recipe' : 'recipes'}
          </span>
          {r.coaFileId && (
            <span className="inline-flex items-center gap-1 text-[10.5px] text-zinc-500">
              <FileText className="h-2.5 w-2.5" /> CoA uploaded
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-right align-top">
        <IngredientRowActions
          ingredientId={r.id}
          internalName={r.internalName ?? r.name}
          existingLabelDeclarationName={r.labelDeclarationName}
          existingBioengineeredStatus={
            r.bioengineeredStatus as
              | 'NOT_APPLICABLE'
              | 'BIOENGINEERED'
              | 'DERIVED_FROM_BIOENGINEERED'
          }
        />
      </td>
    </tr>
  )
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <th
      className={
        'px-4 py-2.5 text-left font-semibold ' + (className ?? '')
      }
    >
      {children}
    </th>
  )
}

// =============================================================================
// Empty state
// =============================================================================

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/40 px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
      >
        <FlaskConical className="h-5 w-5" />
      </span>
      <h2 className="mt-3 font-display text-lg font-semibold text-zinc-900">
        Queue clear
      </h2>
      <p className="mx-auto mt-1 max-w-[440px] text-[13px] text-zinc-600">
        No SELF_ATTESTED partner-private ingredients waiting for review.
        New entries surface here as partners create them.
      </p>
    </div>
  )
}
