// =============================================================================
// /admin/niches/rules — NicheRule auto-assignment editor
// =============================================================================
//
// Deterministic engine that pre-suggests niche assignments at product submit.
// Conditions are AND across rows, OR within values per row. isLocked=true
// rules guarantee the assignment (manufacturer cannot deselect).
//
// Surface: cream hero band + 4-card KPI strip + niche-grouped table with
// per-rule toggle/edit/delete. Add via side-panel form (RuleFormDialog).

import Link from 'next/link'
import {
  ArrowLeft,
  Workflow,
  CheckCircle2,
  Lock,
  Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { cn } from '@ilaunchify/ui'
import type { NicheRuleConditionKind } from '@ilaunchify/marketplace'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { RuleFormDialog, type OptionEntry } from './RuleFormDialog'
import { DeleteRuleButton, RuleActiveToggle } from './RuleRowControls'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Niche rules — Admin' }

const LABELING_TYPE_VALUES: OptionEntry[] = [
  { value: 'FOOD', label: 'Food' },
  { value: 'DIETARY_SUPPLEMENT', label: 'Dietary supplement' },
  { value: 'PET_PRODUCT', label: 'Pet product' },
  { value: 'OTC', label: 'OTC' },
  { value: 'COSMETIC', label: 'Cosmetic' },
]

const CONDITION_KIND_LABEL: Record<NicheRuleConditionKind, string> = {
  LABELING_TYPE: 'Labeling type',
  CATEGORY: 'Category',
  SUBCATEGORY: 'Subcategory',
  CERT_ATTACHED: 'Cert',
  LIFESTYLE_TAG: 'Lifestyle tag',
}

interface PersistedCondition {
  kind: NicheRuleConditionKind
  values: string[]
}

function parseConditions(raw: unknown): PersistedCondition[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({
      kind: (c.kind as NicheRuleConditionKind) ?? 'LABELING_TYPE',
      values: Array.isArray(c.values) ? (c.values as unknown[]).map(String) : [],
    }))
}

export default async function NicheRulesPage() {
  await requireRole(['ADMIN'])

  const [
    niches,
    rules,
    totalCount,
    activeCount,
    lockedCount,
    categoryOptions,
    subcategoryOptions,
    lifestyleTagOptions,
    certOptions,
  ] = await Promise.all([
    prisma.niche.findMany({
      orderBy: [{ displayOrder: 'asc' }],
      select: { id: true, name: true, slug: true, iconEmoji: true, accentHex: true },
    }),
    prisma.nicheRule.findMany({
      orderBy: [{ niche: { displayOrder: 'asc' } }, { weight: 'desc' }, { slug: 'asc' }],
      select: {
        id: true,
        slug: true,
        nicheId: true,
        description: true,
        weight: true,
        isActive: true,
        isLocked: true,
        conditions: true,
        niche: {
          select: { id: true, name: true, slug: true, iconEmoji: true, accentHex: true },
        },
      },
    }),
    prisma.nicheRule.count(),
    prisma.nicheRule.count({ where: { isActive: true } }),
    prisma.nicheRule.count({ where: { isLocked: true } }),
    prisma.category.findMany({
      orderBy: [{ mainCategory: 'asc' }, { displayOrder: 'asc' }, { name: 'asc' }],
      select: { slug: true, name: true, mainCategory: true },
    }),
    prisma.subcategory.findMany({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: { slug: true, name: true, category: { select: { name: true } } },
    }),
    prisma.lifestyleTag.findMany({
      orderBy: [{ group: 'asc' }, { displayOrder: 'asc' }, { name: 'asc' }],
      select: { slug: true, name: true, group: true },
    }),
    prisma.certificateType.findMany({
      orderBy: [{ name: 'asc' }],
      select: { slug: true, name: true },
    }),
  ])

  // Group rules by niche for the rendered table groups.
  const rulesByNiche = new Map<string, typeof rules>()
  for (const r of rules) {
    const list = rulesByNiche.get(r.nicheId) ?? []
    list.push(r)
    rulesByNiche.set(r.nicheId, list)
  }

  // Count conditions by kind for the KPI mini-summary card.
  const conditionKindCounts: Record<NicheRuleConditionKind, number> = {
    LABELING_TYPE: 0,
    CATEGORY: 0,
    SUBCATEGORY: 0,
    CERT_ATTACHED: 0,
    LIFESTYLE_TAG: 0,
  }
  for (const r of rules) {
    for (const c of parseConditions(r.conditions)) {
      conditionKindCounts[c.kind] = (conditionKindCounts[c.kind] ?? 0) + 1
    }
  }

  const formOptions = {
    LABELING_TYPE: LABELING_TYPE_VALUES,
    CATEGORY: categoryOptions.map((c) => ({
      value: c.slug,
      label: c.name,
      group: c.mainCategory,
    })) satisfies OptionEntry[],
    SUBCATEGORY: subcategoryOptions.map((s) => ({
      value: s.slug,
      label: s.name,
      group: s.category.name,
    })) satisfies OptionEntry[],
    CERT_ATTACHED: certOptions.map((c) => ({
      value: c.slug,
      label: c.name,
    })) satisfies OptionEntry[],
    LIFESTYLE_TAG: lifestyleTagOptions.map((t) => ({
      value: t.slug,
      label: t.name,
      group: t.group,
    })) satisfies OptionEntry[],
  }

  return (
    <div className="space-y-6">
      <Header
        total={totalCount}
        active={activeCount}
        locked={lockedCount}
        conditionKindCounts={conditionKindCounts}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/niches"
          className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-600 hover:text-ink-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to niches
        </Link>
        <RuleFormDialog
          niches={niches.map((n) => ({ id: n.id, name: n.name, slug: n.slug }))}
          options={formOptions}
          trigger="create-pill"
        />
      </div>

      <div className="space-y-6">
        {niches.map((n) => {
          const list = rulesByNiche.get(n.id) ?? []
          const accent = n.accentHex || '#FF2E63'
          return (
            <section
              key={n.id}
              className="overflow-hidden rounded-2xl border border-ink-200 bg-white"
            >
              <div className="flex items-center gap-3 bg-ink-50/70 px-5 py-3">
                <span
                  aria-hidden="true"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[16px]"
                  style={{
                    backgroundColor: `${accent}1A`,
                    color: accent,
                  }}
                >
                  {n.iconEmoji ?? '·'}
                </span>
                <div className="flex-1">
                  <p className="font-display text-[14px] font-semibold text-ink-900">
                    {n.name}
                  </p>
                  <p className="text-[11px] text-ink-500">{n.slug}</p>
                </div>
                <span className="inline-flex min-w-[28px] items-center justify-center rounded-full bg-ink-100 px-2 text-[10.5px] font-semibold tabular-nums text-ink-700">
                  {list.length}
                </span>
              </div>

              {list.length === 0 ? (
                <p className="px-5 py-6 text-center text-[12.5px] italic text-ink-500">
                  No rules in this niche yet. Use "Add rule" to create one.
                </p>
              ) : (
                <table className="w-full text-left text-[13px]">
                  <thead className="text-[12px] uppercase tracking-[0.06em] text-ink-700">
                    <tr>
                      <th scope="col" className="px-4 py-2.5">Slug</th>
                      <th scope="col" className="px-4 py-2.5">Description</th>
                      <th scope="col" className="px-4 py-2.5">Conditions</th>
                      <th scope="col" className="px-4 py-2.5 tabular-nums">Weight</th>
                      <th scope="col" className="px-4 py-2.5">Status</th>
                      <th scope="col" className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {list.map((r) => {
                      const parsed = parseConditions(r.conditions)
                      return (
                        <tr key={r.id} className="hover:bg-pink-50/20">
                          <td className="px-4 py-3 align-top">
                            <code className="rounded bg-ink-50 px-1.5 py-0.5 text-[11px] text-ink-700">
                              {r.slug}
                            </code>
                          </td>
                          <td className="px-4 py-3 align-top text-ink-900">
                            {r.description}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex flex-wrap gap-1">
                              {parsed.map((c, idx) => (
                                <span
                                  key={`${r.id}-${idx}`}
                                  className="inline-flex items-center gap-1 rounded-full bg-ink-50 px-2 py-0.5 text-[10.5px] text-ink-700"
                                >
                                  <span className="font-bold uppercase tracking-[0.05em] text-ink-700">
                                    {CONDITION_KIND_LABEL[c.kind]}:
                                  </span>
                                  <span className="truncate max-w-[200px]">
                                    {c.values.join(', ')}
                                  </span>
                                </span>
                              ))}
                              {parsed.length === 0 && (
                                <span className="text-[11px] italic text-ink-400">none</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top tabular-nums text-ink-900">
                            {r.weight}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex items-center gap-2">
                              <RuleActiveToggle ruleId={r.id} isActive={r.isActive} />
                              {r.isLocked && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-warning-200 bg-warning-50 px-1.5 py-0.5 text-[10px] font-semibold text-warning-900">
                                  <Lock className="h-2.5 w-2.5" /> Locked
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex items-center justify-end gap-1.5">
                              <RuleFormDialog
                                niches={niches.map((nn) => ({ id: nn.id, name: nn.name, slug: nn.slug }))}
                                options={formOptions}
                                existing={{
                                  id: r.id,
                                  slug: r.slug,
                                  nicheId: r.nicheId,
                                  description: r.description,
                                  weight: r.weight,
                                  isLocked: r.isLocked,
                                  isActive: r.isActive,
                                  conditions: parsed,
                                }}
                                trigger="edit-icon"
                              />
                              <DeleteRuleButton
                                ruleId={r.id}
                                slug={r.slug}
                                isLocked={r.isLocked}
                              />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Header — cream band + 4-card KPI strip
// -----------------------------------------------------------------------------

function Header({
  total,
  active,
  locked,
  conditionKindCounts,
}: {
  total: number
  active: number
  locked: number
  conditionKindCounts: Record<NicheRuleConditionKind, number>
}) {
  return (
    <>
      <AdminPageHeader
        eyebrow="Marketplace · Niches · Auto-suggest rules"
        title="Niche auto-assignment rules"
        description="These rules run at product submission to pre-suggest niche assignments. Manufacturer can confirm or edit; admin can override during review."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Total rules" value={total} icon={Workflow} tone="sky" />
        <KpiCard label="Active" value={active} icon={CheckCircle2} tone="emerald" />
        <KpiCard label="Locked" value={locked} icon={Lock} tone="amber" />
        <ConditionMixCard counts={conditionKindCounts} />
      </div>
    </>
  )
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  icon: LucideIcon
  tone: 'pink' | 'amber' | 'emerald' | 'sky'
}) {
  const iconTone: Record<'pink' | 'amber' | 'emerald' | 'sky', string> = {
    pink: 'bg-pink-100 text-pink-700',
    amber: 'bg-warning-100 text-warning-700',
    emerald: 'bg-success-100 text-success-700',
    sky: 'bg-info-100 text-info-700',
  }
  return (
    <div
      className={cn(
        'rounded-2xl border border-ink-200 bg-white px-4 py-3.5',
        'transition-shadow hover:shadow-[0_4px_18px_-8px_rgba(0,0,0,0.18)]',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center rounded-xl',
            iconTone[tone]!,
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="flex-1">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">
            {label}
          </p>
          <p className="font-display text-[22px] font-bold leading-none text-ink-900">
            {value.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  )
}

function ConditionMixCard({
  counts,
}: {
  counts: Record<NicheRuleConditionKind, number>
}) {
  const rows: Array<{ kind: NicheRuleConditionKind; label: string }> = [
    { kind: 'LABELING_TYPE', label: 'Labeling type' },
    { kind: 'CATEGORY', label: 'Category' },
    { kind: 'SUBCATEGORY', label: 'Subcategory' },
    { kind: 'CERT_ATTACHED', label: 'Cert' },
    { kind: 'LIFESTYLE_TAG', label: 'Lifestyle tag' },
  ]
  return (
    <div className="rounded-2xl border border-ink-200 bg-white px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-pink-100 text-pink-700">
          <Sparkles className="h-[14px] w-[14px]" />
        </span>
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">
          By condition kind
        </p>
      </div>
      <ul className="space-y-0.5 text-[11.5px]">
        {rows.map(({ kind, label }) => (
          <li key={kind} className="flex items-center justify-between">
            <span className="text-ink-600">{label}</span>
            <span className="font-semibold tabular-nums text-ink-900">
              {counts[kind] ?? 0}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
