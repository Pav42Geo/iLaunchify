'use client'

// Co-creation Brief Builder — two doors + wizard + live manufacturer preview.
// UX contract: design/co-creation-demo.html screen ① matched 1:1 (Pavel
// 2026-07-10) INSIDE the token system — APP-UI type scale (text-ui-*), s-*
// spacing, token radii/shadows, palette classes only. App header/nav untouched.
// The live preview renders ONLY public-projection fields (staged reveal §9).

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Textarea, Label, BRIEF_CLAIM_POOL, nicheGradientKey } from '@ilaunchify/ui'
import { productGradient, type ProductGradient } from '@ilaunchify/ui/tokens'
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

interface IngredientRow {
  name: string
  amount: string
  note: string
}

/** Demo `.field label` — token uppercase label style. */
const LABEL_CLS = 'text-ui-label uppercase text-ink-600'

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
  const [posted, setPosted] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

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
  const gradient = productGradient[nicheGradientKey(nicheSlug)]

  const completeness = useMemo(() => {
    let n = 0
    if (title.trim().length >= 3) n++
    if (categoryId) n++
    if (claims.size > 0) n++
    if (targetVolume) n++
    if (budgetLow || budgetHigh) n++
    return Math.round((n / 5) * 100)
  }, [title, categoryId, claims, targetVolume, budgetLow, budgetHigh])

  function flash(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2400)
  }

  function pickDoor(d: 'recipe' | 'idea') {
    setDoor(d)
    setFormulationMode(d === 'recipe' ? 'CREATOR_PROVIDED' : 'MAKER_FORMULATES')
    flash(d === 'recipe' ? 'Recipe path — your formula stays private 🔒' : 'Idea path — we’ll guide you 💡')
  }

  function toggleClaim(c: string) {
    setClaims((prev) => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })
  }

  // NOTE: the demo's "✨ Suggest claims / Benchmark" assist buttons are V1.5
  // AI brief-assist (spec §3) — deliberately NOT rendered until they're wired
  // to a real service (no canned/hardcoded behavior; Pavel 2026-07-10).

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

  const toastEl = toast ? (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-ink-900 px-s-4 py-s-3 text-ui-caption font-semibold text-white shadow-xl">
      {toast}
    </div>
  ) : null

  // ── Success screen (demo bbPost, inline panel) ─────────────────────────────
  if (posted) {
    const routed: ProductGradient[] = ['purple', 'pink', 'lime', 'sky', 'coral']
    return (
      <div className="mx-auto max-w-md rounded-xl border border-ink-200 bg-white p-s-6 text-center shadow-lg">
        <div className="mx-auto mb-s-3 flex h-16 w-16 items-center justify-center rounded-pill bg-pink-50 text-3xl">
          🚀
        </div>
        <h2 className="font-display text-ui-title">Brief posted!</h2>
        <p className="mt-s-1 text-ui-caption text-ink-500">
          “{title}” is live in the manufacturer pool — routed to fit-matched, verified makers in{' '}
          <b>{niche?.name ?? 'your niche'}</b>.
        </p>
        <div className="mb-s-2 mt-s-4 flex justify-center">
          {routed.map((g, i) => (
            <span
              key={g}
              className={`flex h-8 w-8 items-center justify-center rounded-pill border-2 border-white text-ui-value ${i > 0 ? '-ml-2' : ''}`}
              style={{ background: productGradient[g] }}
            >
              🏭
            </span>
          ))}
        </div>
        <p className="text-ui-caption text-ink-500">
          Interest usually starts within hours. Review each one, then pick your partner.
        </p>
        <div className="mt-s-5 flex justify-center gap-s-2">
          <Button variant="ghost" onClick={() => router.push('/products')}>
            Back to products
          </Button>
          <Button variant="pink" size="lg" onClick={() => router.push(`/briefs/${posted}/interests`)}>
            Review interested makers →
          </Button>
        </div>
      </div>
    )
  }

  // ── Door screen (demo .door) ───────────────────────────────────────────────
  if (!door) {
    return (
      <div className="px-s-6 pb-s-8 pt-s-7 text-center">
        <h1 className="font-display text-ui-display">
          Create your own <em className="font-serif italic font-medium text-pink-700">product</em>
        </h1>
        <p className="mx-auto mb-s-7 mt-s-2 max-w-xl text-ui-body text-ink-500">
          Two ways in — both end with your branded product made by a vetted iLaunchify
          manufacturer, under your control. Pick where you’re starting from.
        </p>
        <div className="mx-auto grid max-w-3xl gap-s-4 sm:grid-cols-2">
          {(
            [
              ['recipe', '🧪', 'bg-pink-50', 'I have a recipe', 'You’ve got a formula or the key ingredients dialed in. Post it privately and get it made your way.', 'Start with my formula →'],
              ['idea', '💡', 'bg-ink-100', 'I have an idea', 'You know what you want to create but not how to make it. We’ll match a maker to formulate it — you approve every step.', 'Start with my idea →'],
            ] as const
          ).map(([d, em, emBg, h, p, go]) => (
            <button
              key={d}
              type="button"
              onClick={() => pickDoor(d)}
              className="rounded-xl border border-ink-200 bg-white p-s-5 text-left transition duration-base ease-out-quart hover:-translate-y-1 hover:border-pink-500 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            >
              <div className={`mb-s-3 flex h-12 w-12 items-center justify-center rounded-lg text-2xl ${emBg}`}>
                {em}
              </div>
              <h3 className="font-display text-ui-section">{h}</h3>
              <p className="mb-s-3 mt-s-1 min-h-12 text-ui-caption text-ink-500">{p}</p>
              <div className="flex gap-s-1 text-ui-caption font-bold text-pink-700">{go}</div>
            </button>
          ))}
        </div>
        <p className="mt-s-5 text-ui-caption text-ink-500">
          🔒 Your recipe &amp; targets stay private. The public brief shows only your{' '}
          <em className="font-serif italic text-pink-700">intent</em> — never your secret formula.
        </p>
        {toastEl}
      </div>
    )
  }

  // ── Wizard + live preview (demo .split) ────────────────────────────────────
  return (
    <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
      <div className="grid lg:grid-cols-[1fr_340px]">
        {/* Form column */}
        <div className="p-s-5">
          <div className="text-ui-label uppercase text-pink-700">
            {door === 'recipe' ? '🧪 Recipe path' : '💡 Idea path'} · your brief
          </div>
          <h2 className="mt-s-1 font-display text-ui-title">Build your product brief</h2>
          <p className="mb-s-5 text-ui-caption text-ink-500">
            iLaunchify routes it to fit-matched, verified manufacturers in your niche.
          </p>

          {/* Niche bar */}
          <div className="mb-s-4 flex items-center gap-s-2 rounded-lg border border-ink-200 bg-ink-50 px-s-3 py-s-2 text-ui-caption text-ink-600">
            <span className="text-ui-section">{niche?.icon}</span>
            <b>Niche:</b> {niche?.name}
            <span className="text-ink-500">· surfaces niche-matched makers</span>
          </div>

          <div className="mb-s-4 flex gap-s-3">
            <div className="flex-1">
              <Label htmlFor="brief-niche" className={LABEL_CLS}>
                Creator niche
              </Label>
              <select
                id="brief-niche"
                value={nicheSlug}
                onChange={(e) => setNicheSlug(e.target.value)}
                className="mt-s-1 w-full rounded-md border border-ink-300 bg-white px-s-3 py-s-2 text-ui-body focus-visible:border-pink-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500/20"
              >
                {niches.map((n) => (
                  <option key={n.slug} value={n.slug}>
                    {n.icon} {n.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <Label htmlFor="brief-category" className={LABEL_CLS}>
                Product category
              </Label>
              <select
                id="brief-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="mt-s-1 w-full rounded-md border border-ink-300 bg-white px-s-3 py-s-2 text-ui-body focus-visible:border-pink-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500/20"
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

          <div className="mb-s-4">
            <Label htmlFor="brief-title" className={LABEL_CLS}>
              Product name
            </Label>
            <Input
              id="brief-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Passion-fruit Protein Water"
              className="mt-s-1"
            />
          </div>

          <div className="mb-s-4">
            <Label className={LABEL_CLS}>Must-have claims</Label>
            <div className="mt-s-1 flex flex-wrap gap-s-2">
              {BRIEF_CLAIM_POOL.map((c) => {
                const on = claims.has(c)
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleClaim(c)}
                    className={`rounded-pill border px-s-3 py-s-1 text-ui-caption font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${
                      on
                        ? 'border-pink-500 bg-pink-500 text-white'
                        : 'border-ink-300 bg-white text-ink-600 hover:text-ink-900'
                    }`}
                  >
                    {on ? `✓ ${c}` : c}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mb-s-4">
            <Label className={LABEL_CLS}>How do you want to formulate?</Label>
            <div className="mt-s-1 flex gap-s-3">
              {(
                [
                  ['CREATOR_PROVIDED', '🧪 I have the formula', 'Share your recipe privately with the maker you pick.'],
                  ['MAKER_FORMULATES', '🤝 Help me create it', 'A matched maker formulates it — you approve each version.'],
                ] as const
              ).map(([mode, label, desc]) => {
                const on = formulationMode === mode
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setFormulationMode(mode)}
                    className={`flex-1 rounded-lg border p-s-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${
                      on ? 'border-pink-500 bg-pink-50' : 'border-ink-200 bg-white hover:border-ink-400'
                    }`}
                  >
                    <div className="mb-s-1 flex items-center gap-s-2 text-ui-caption font-bold">
                      <span
                        aria-hidden
                        className={`h-4 w-4 flex-none rounded-pill border-2 ${
                          on ? 'border-pink-500 bg-pink-500 shadow-[inset_0_0_0_2.5px_#fff]' : 'border-ink-300'
                        }`}
                      />
                      {label}
                    </div>
                    <div className="text-ui-caption text-ink-500">{desc}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {formulationMode === 'CREATOR_PROVIDED' ? (
            <div className="mb-s-4">
              <Label className={LABEL_CLS}>
                Your formula <span className="font-normal normal-case tracking-normal text-ink-500">— private</span>
              </Label>
              <div className="mt-s-1">
                {ingredients.map((row, i) => (
                  <div key={i} className="mb-s-2 flex gap-s-2">
                    <Input
                      value={row.name}
                      onChange={(e) => setIng(i, 'name', e.target.value)}
                      placeholder="Ingredient"
                      className="flex-[2]"
                    />
                    <Input
                      value={row.amount}
                      onChange={(e) => setIng(i, 'amount', e.target.value)}
                      placeholder="Amount"
                      className="flex-1"
                    />
                    <Input
                      value={row.note}
                      onChange={(e) => setIng(i, 'note', e.target.value)}
                      placeholder="Note"
                      className="flex-[2]"
                    />
                    <button
                      type="button"
                      aria-label={`Remove ingredient ${i + 1}`}
                      onClick={() => setIngredients((rows) => rows.filter((_, idx) => idx !== i))}
                      className="px-s-1 text-ui-subhead text-ink-400 hover:text-ink-900"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setIngredients((rows) => [...rows, { name: '', amount: '', note: '' }])}
                  className="text-ui-caption font-bold text-pink-700 hover:underline"
                >
                  ＋ Add ingredient
                </button>
              </div>
              <div className="mt-s-3 flex gap-s-2 rounded-lg border border-success-200 bg-success-50 px-s-3 py-s-2 text-ui-caption text-success-700">
                🔒
                <div>
                  <b>Kept secret.</b> Your formula is never in the public brief — revealed only
                  inside the private room after NDA.
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-s-4">
              <Label htmlFor="brief-keying" className={LABEL_CLS}>
                Key ingredients you’d like (optional)
              </Label>
              <Input
                id="brief-keying"
                value={keyIngredients}
                onChange={(e) => setKeyIngredients(e.target.value)}
                placeholder="e.g. Passion-fruit, plant or whey protein, no added sugar"
                className="mt-s-1"
              />
              <div className="mt-s-3 flex gap-s-2 rounded-lg border border-pink-200 bg-pink-50 px-s-3 py-s-2 text-ui-caption text-pink-700">
                🤝
                <div>
                  <b>No recipe needed.</b> Describe what you want; matched makers propose a
                  formulation and you approve — or request changes — on every version.
                </div>
              </div>
            </div>
          )}

          <div className="mb-s-1 flex gap-s-3">
            <div className="flex-1">
              <Label htmlFor="brief-volume" className={LABEL_CLS}>
                Target volume
              </Label>
              <Input
                id="brief-volume"
                type="number"
                min={1}
                value={targetVolume}
                onChange={(e) => setTargetVolume(e.target.value)}
                placeholder="units"
                className="mt-s-1"
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="brief-budget-low" className={LABEL_CLS}>
                Budget / unit
              </Label>
              <div className="mt-s-1 flex items-center gap-s-1">
                <Input
                  id="brief-budget-low"
                  type="number"
                  min={0}
                  step="0.01"
                  value={budgetLow}
                  onChange={(e) => setBudgetLow(e.target.value)}
                  placeholder="$ low"
                />
                <span className="text-ink-400">–</span>
                <Input
                  aria-label="Budget high"
                  type="number"
                  min={0}
                  step="0.01"
                  value={budgetHigh}
                  onChange={(e) => setBudgetHigh(e.target.value)}
                  placeholder="$ high"
                />
              </div>
            </div>
            <div className="flex-1">
              <Label htmlFor="brief-timeline" className={LABEL_CLS}>
                Timeline
              </Label>
              <Input
                id="brief-timeline"
                type="number"
                min={1}
                value={timelineWeeks}
                onChange={(e) => setTimelineWeeks(e.target.value)}
                placeholder="weeks"
                className="mt-s-1"
              />
            </div>
          </div>
          <div className="mt-s-4">
            <Label htmlFor="brief-notes" className={LABEL_CLS}>
              Private notes{' '}
              <span className="font-normal normal-case tracking-normal text-ink-500">
                — for your selected maker only
              </span>
            </Label>
            <Textarea
              id="brief-notes"
              value={privateNotes}
              onChange={(e) => setPrivateNotes(e.target.value)}
              placeholder="Taste targets, texture, benchmark products…"
              className="mt-s-1"
            />
          </div>

          {error ? (
            <p className="mt-s-3 rounded-lg bg-danger-50 px-s-3 py-s-2 text-ui-caption text-danger-700" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-s-5 flex items-center gap-s-2 border-t border-ink-100 pt-s-4">
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
        <aside className="border-t border-ink-200 bg-ink-50 p-s-4 lg:border-l lg:border-t-0">
          <div className="text-ui-label uppercase text-ink-500">👁 Manufacturer preview</div>
          <p className="mb-s-3 mt-s-1 text-ui-caption text-ink-500">How your brief appears in the pool</p>

          <div className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
            <div className="h-24" style={{ background: gradient }} aria-hidden />
            <div className="p-s-4">
              <h3 className="font-display text-ui-subhead">{title.trim() || 'Untitled product'}</h3>
              <p className="text-ui-caption text-ink-500">
                {creatorName}
                {creatorHandle ? ` · ${creatorHandle}` : ''} · {niche?.icon} {niche?.name}
              </p>
              <dl className="my-s-2 flex flex-wrap gap-s-1">
                {(
                  [
                    ['Volume', targetVolume ? Number(targetVolume).toLocaleString() : '—'],
                    ['Budget', budgetLow || budgetHigh ? `$${budgetLow || '?'}–${budgetHigh || '?'}` : '—'],
                    ['Timeline', timelineWeeks ? `${timelineWeeks} wk` : '—'],
                  ] as const
                ).map(([l, v]) => (
                  <div key={l} className="min-w-16 rounded-md border border-ink-100 bg-ink-50 px-s-2 py-s-1">
                    <dt className="text-ui-label uppercase text-ink-500">{l}</dt>
                    <dd className="text-ui-value">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap gap-s-1">
                {claims.size ? (
                  [...claims].map((c) => (
                    <span
                      key={c}
                      className="rounded-pill bg-pink-50 px-s-2 py-s-1 text-ui-label normal-case tracking-normal text-pink-700"
                    >
                      ✓ {c}
                    </span>
                  ))
                ) : (
                  <span className="text-ui-caption text-ink-500">add claims →</span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-s-3 rounded-lg border border-ink-200 bg-white px-s-3 py-s-2 text-ui-caption text-ink-600">
            <b>Est. reach:</b> fit-matched, verified makers in {niche?.name ?? 'your niche'}.
            <div className="mt-s-1 text-ink-500">Brief completeness · {completeness}%</div>
            <div className="mt-s-1 h-1.5 overflow-hidden rounded-pill bg-ink-200">
              <div className="h-full bg-pink-500 transition-[width]" style={{ width: `${completeness}%` }} />
            </div>
            <p className="mt-s-2 text-ink-500">
              🔒 Your {formulationMode === 'CREATOR_PROVIDED' ? 'formula' : 'private notes'} are not
              in this preview — makers see them only after you select one and the NDA is in place.
            </p>
          </div>
        </aside>
      </div>
      {toastEl}
    </div>
  )
}
