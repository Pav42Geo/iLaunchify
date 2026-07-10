'use client'

// Co-creation Brief Builder — two doors + wizard + live manufacturer preview.
// UX contract: iLaunchify-cocreation-demo.html screen ① (repo root). The live
// preview renders ONLY public-projection fields — the private formula/notes
// visibly stay out of it, which is the trust story of the whole flow.

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Textarea, Label, Chip } from '@ilaunchify/ui'
import { postBrief } from './actions'

export interface NicheOption {
  slug: string
  name: string
  icon: string
}
export interface CategoryOption {
  id: string
  name: string
  icon: string | null
}

/** Demo-aligned claim vocabulary (prototype CLAIM_POOL). */
const CLAIM_POOL = [
  'High-protein',
  'No added sugar',
  'Vegan',
  'Functional',
  'Clean-label',
  'Low-sugar',
  'Keto',
  'Gluten-free',
  'Adaptogenic',
  'Electrolytes',
  'Organic',
  'Nootropic',
] as const

interface IngredientRow {
  name: string
  amount: string
  note: string
}

export function BriefBuilderClient({
  niches,
  categories,
  creatorName,
  creatorHandle,
}: {
  niches: NicheOption[]
  categories: CategoryOption[]
  creatorName: string
  creatorHandle: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [posted, setPosted] = useState<string | null>(null) // briefId after success

  // Door: null = door screen; 'recipe' | 'idea' = wizard.
  const [door, setDoor] = useState<'recipe' | 'idea' | null>(null)

  const [title, setTitle] = useState('')
  const [nicheSlug, setNicheSlug] = useState(niches[0]?.slug ?? '')
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [claims, setClaims] = useState<Set<string>>(new Set())
  const [formulationMode, setFormulationMode] = useState<'CREATOR_PROVIDED' | 'MAKER_FORMULATES'>(
    'MAKER_FORMULATES',
  )
  const [ingredients, setIngredients] = useState<IngredientRow[]>([{ name: '', amount: '', note: '' }])
  const [keyIngredients, setKeyIngredients] = useState('')
  const [privateNotes, setPrivateNotes] = useState('')
  const [targetVolume, setTargetVolume] = useState('')
  const [budgetLow, setBudgetLow] = useState('')
  const [budgetHigh, setBudgetHigh] = useState('')
  const [timelineWeeks, setTimelineWeeks] = useState('')

  const niche = useMemo(() => niches.find((n) => n.slug === nicheSlug), [niches, nicheSlug])
  const category = useMemo(() => categories.find((c) => c.id === categoryId), [categories, categoryId])

  const completeness = useMemo(() => {
    let n = 0
    if (title.trim().length >= 3) n++
    if (categoryId) n++
    if (claims.size > 0) n++
    if (targetVolume) n++
    if (budgetLow || budgetHigh) n++
    return Math.round((n / 5) * 100)
  }, [title, categoryId, claims, targetVolume, budgetLow, budgetHigh])

  function pickDoor(d: 'recipe' | 'idea') {
    setDoor(d)
    setFormulationMode(d === 'recipe' ? 'CREATOR_PROVIDED' : 'MAKER_FORMULATES')
  }

  function toggleClaim(c: string) {
    setClaims((prev) => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })
  }

  function setIng(i: number, field: keyof IngredientRow, value: string) {
    setIngredients((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)))
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await postBrief({
        origin: door === 'recipe' ? 'HAVE_RECIPE' : 'HAVE_IDEA',
        title: title.trim(),
        nicheSlug,
        categoryId,
        claims: [...claims],
        formulationMode,
        targetVolume: targetVolume ? Number(targetVolume) : null,
        budgetLow: budgetLow ? Number(budgetLow) : null,
        budgetHigh: budgetHigh ? Number(budgetHigh) : null,
        timelineWeeks: timelineWeeks ? Number(timelineWeeks) : null,
        ingredients: ingredients.filter((r) => r.name.trim()),
        keyIngredients: keyIngredients.trim(),
        privateNotes: privateNotes.trim(),
      })
      if (res.ok) setPosted(res.briefId)
      else setError(res.error)
    })
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (posted) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-ink-200 bg-white p-10 text-center">
        <div className="text-4xl">🚀</div>
        <h2 className="mt-3 font-display text-ui-title">Brief posted!</h2>
        <p className="mt-2 text-ui-body text-ink-500">
          “{title}” is live in the manufacturer pool — fit-matched, verified makers in{' '}
          {niche?.name ?? 'your niche'} can now raise their hand. Interest usually starts within
          hours; you review every one, then pick your partner.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="ghost" onClick={() => router.push('/products')}>
            Back to products
          </Button>
          <Button variant="pink" onClick={() => router.push(`/briefs/${posted}/interests`)}>
            Review interested makers →
          </Button>
        </div>
      </div>
    )
  }

  // ── Door screen ────────────────────────────────────────────────────────────
  if (!door) {
    return (
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="font-display text-ui-display">
          Create your own <em className="font-serif italic text-pink-700">product</em>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-ui-body text-ink-500">
          Two ways in — both end with your branded product made by a vetted iLaunchify
          manufacturer, under your control. Pick where you’re starting from.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => pickDoor('recipe')}
            className="group rounded-3xl border border-ink-200 bg-white p-8 text-left transition hover:-translate-y-0.5 hover:border-pink-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            <div className="text-3xl">🧪</div>
            <h3 className="mt-3 font-display text-ui-subhead">I have a recipe</h3>
            <p className="mt-1 text-ui-caption text-ink-500">
              You’ve got a formula or the key ingredients dialed in. Post it privately and get it
              made your way.
            </p>
            <div className="mt-4 text-ui-caption font-semibold text-pink-700 group-hover:underline">
              Start with my formula →
            </div>
          </button>
          <button
            type="button"
            onClick={() => pickDoor('idea')}
            className="group rounded-3xl border border-ink-200 bg-white p-8 text-left transition hover:-translate-y-0.5 hover:border-pink-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            <div className="text-3xl">💡</div>
            <h3 className="mt-3 font-display text-ui-subhead">I have an idea</h3>
            <p className="mt-1 text-ui-caption text-ink-500">
              You know what you want to create but not how to make it. We’ll match a maker to
              formulate it — you approve every step.
            </p>
            <div className="mt-4 text-ui-caption font-semibold text-pink-700 group-hover:underline">
              Start with my idea →
            </div>
          </button>
        </div>
        <p className="mt-6 text-ui-caption text-ink-500">
          🔒 Your recipe &amp; targets stay private. The public brief shows only your{' '}
          <em>intent</em> — never your secret formula.
        </p>
      </div>
    )
  }

  // ── Wizard + live preview ──────────────────────────────────────────────────
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      {/* Form column */}
      <div className="space-y-6">
        <div>
          <div className="text-ui-caption font-semibold text-pink-700">
            {door === 'recipe' ? '🧪 Recipe path' : '💡 Idea path'} · your brief
          </div>
          <h1 className="mt-1 font-display text-ui-title">Build your product brief</h1>
          <p className="mt-1 text-ui-caption text-ink-500">
            iLaunchify routes it to fit-matched, verified manufacturers in your niche.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="brief-niche">Creator niche</Label>
            <select
              id="brief-niche"
              value={nicheSlug}
              onChange={(e) => setNicheSlug(e.target.value)}
              className="mt-1 w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-ui-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            >
              {niches.map((n) => (
                <option key={n.slug} value={n.slug}>
                  {n.icon} {n.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="brief-category">Product category</Label>
            <select
              id="brief-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-ui-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon ? `${c.icon} ` : ''}
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <Label htmlFor="brief-title">Product name</Label>
          <Input
            id="brief-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Passion-fruit Protein Water"
            className="mt-1"
          />
        </div>

        <div>
          <Label>Must-have claims</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {CLAIM_POOL.map((c) => (
              <Chip key={c} active={claims.has(c)} onClick={() => toggleClaim(c)}>
                {claims.has(c) ? `✓ ${c}` : c}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <Label>How do you want to formulate?</Label>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {(
              [
                ['CREATOR_PROVIDED', '🧪 I have the formula', 'Share your recipe privately with the maker you pick.'],
                ['MAKER_FORMULATES', '🤝 Help me create it', 'A matched maker formulates it — you approve each version.'],
              ] as const
            ).map(([mode, label, desc]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFormulationMode(mode)}
                className={`rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${
                  formulationMode === mode
                    ? 'border-pink-500 bg-pink-50'
                    : 'border-ink-200 bg-white hover:border-ink-400'
                }`}
              >
                <div className="text-ui-body font-semibold">{label}</div>
                <div className="mt-1 text-ui-caption text-ink-500">{desc}</div>
              </button>
            ))}
          </div>
        </div>

        {formulationMode === 'CREATOR_PROVIDED' ? (
          <div>
            <Label>
              Your formula <span className="font-normal text-ink-500">— private</span>
            </Label>
            <div className="mt-2 space-y-2">
              {ingredients.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={row.name}
                    onChange={(e) => setIng(i, 'name', e.target.value)}
                    placeholder="Ingredient"
                    className="flex-1"
                  />
                  <Input
                    value={row.amount}
                    onChange={(e) => setIng(i, 'amount', e.target.value)}
                    placeholder="Amount"
                    className="w-28"
                  />
                  <Input
                    value={row.note}
                    onChange={(e) => setIng(i, 'note', e.target.value)}
                    placeholder="Note"
                    className="w-32"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ingredient ${i + 1}`}
                    onClick={() => setIngredients((rows) => rows.filter((_, idx) => idx !== i))}
                  >
                    ✕
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIngredients((rows) => [...rows, { name: '', amount: '', note: '' }])}
              >
                ＋ Add ingredient
              </Button>
            </div>
            <p className="mt-2 rounded-xl bg-ink-50 px-3 py-2 text-ui-caption text-ink-700">
              🔒 <b>Kept secret.</b> Your formula is never in the public brief — revealed only
              inside the private room after NDA.
            </p>
          </div>
        ) : (
          <div>
            <Label htmlFor="brief-keying">Key ingredients you’d like (optional)</Label>
            <Input
              id="brief-keying"
              value={keyIngredients}
              onChange={(e) => setKeyIngredients(e.target.value)}
              placeholder="e.g. Passion-fruit, plant or whey protein, no added sugar"
              className="mt-1"
            />
            <p className="mt-2 rounded-xl bg-pink-50 px-3 py-2 text-ui-caption text-pink-700">
              🤝 <b>No recipe needed.</b> Describe what you want; matched makers propose a
              formulation and you approve — or request changes — on every version.
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="brief-volume">Target volume (units)</Label>
            <Input
              id="brief-volume"
              type="number"
              min={1}
              value={targetVolume}
              onChange={(e) => setTargetVolume(e.target.value)}
              placeholder="5000"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="brief-budget-low">Budget / unit ($)</Label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                id="brief-budget-low"
                type="number"
                min={0}
                step="0.01"
                value={budgetLow}
                onChange={(e) => setBudgetLow(e.target.value)}
                placeholder="1.20"
              />
              <span className="text-ink-500">–</span>
              <Input
                aria-label="Budget high"
                type="number"
                min={0}
                step="0.01"
                value={budgetHigh}
                onChange={(e) => setBudgetHigh(e.target.value)}
                placeholder="1.80"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="brief-timeline">Timeline (weeks)</Label>
            <Input
              id="brief-timeline"
              type="number"
              min={1}
              value={timelineWeeks}
              onChange={(e) => setTimelineWeeks(e.target.value)}
              placeholder="8"
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="brief-notes">
            Private notes for your selected maker{' '}
            <span className="font-normal text-ink-500">— optional, never public</span>
          </Label>
          <Textarea
            id="brief-notes"
            value={privateNotes}
            onChange={(e) => setPrivateNotes(e.target.value)}
            placeholder="Taste targets, texture, benchmark products…"
            className="mt-1"
          />
        </div>

        {error ? (
          <p className="rounded-xl bg-danger-50 px-3 py-2 text-ui-caption text-danger-700" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => setDoor(null)}>
            ← Change door
          </Button>
          <span className="flex-1" />
          <Button variant="primary" size="lg" onClick={submit} disabled={isPending}>
            {isPending ? 'Posting…' : '🚀 Post to manufacturers'}
          </Button>
        </div>
      </div>

      {/* Live preview column — PUBLIC PROJECTION ONLY (staged reveal §9). */}
      <aside className="lg:border-l lg:border-ink-200 lg:pl-8">
        <div className="text-ui-caption font-semibold">👁 Manufacturer preview</div>
        <p className="mt-1 text-ui-caption text-ink-500">How your brief appears in the pool</p>
        <div className="mt-4 overflow-hidden rounded-3xl border border-ink-200 bg-white">
          <div className="h-24 bg-pink-50" aria-hidden />
          <div className="p-5">
            <h3 className="font-display text-ui-subhead">{title.trim() || 'Untitled product'}</h3>
            <p className="mt-1 text-ui-caption text-ink-500">
              {creatorName}
              {creatorHandle ? ` · ${creatorHandle}` : ''} · {niche?.icon} {niche?.name}
            </p>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              {(
                [
                  ['Volume', targetVolume || '—'],
                  ['Budget', budgetLow || budgetHigh ? `$${budgetLow || '?'}–${budgetHigh || '?'}` : '—'],
                  ['Timeline', timelineWeeks ? `${timelineWeeks} wk` : '—'],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-xl bg-ink-50 px-2 py-2">
                  <dt className="text-[11px] uppercase tracking-wide text-ink-500">{label}</dt>
                  <dd className="text-ui-caption font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {claims.size ? (
                [...claims].map((c) => (
                  <span
                    key={c}
                    className="rounded-full bg-pink-50 px-2.5 py-1 text-[11px] font-semibold text-pink-700"
                  >
                    ✓ {c}
                  </span>
                ))
              ) : (
                <span className="text-ui-caption text-ink-500">add claims →</span>
              )}
            </div>
            <p className="mt-3 text-ui-caption text-ink-500">
              Category: {category?.name ?? '—'}
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-ink-200 bg-white p-4">
          <div className="text-ui-caption text-ink-700">
            Brief completeness · {completeness}%
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
            <div className="h-full rounded-full bg-pink-500" style={{ width: `${completeness}%` }} />
          </div>
          <p className="mt-3 text-ui-caption text-ink-500">
            🔒 Your {formulationMode === 'CREATOR_PROVIDED' ? 'formula' : 'private notes'} are not
            in this preview — makers see them only after you select one and the NDA is signed.
          </p>
        </div>
      </aside>
    </div>
  )
}
