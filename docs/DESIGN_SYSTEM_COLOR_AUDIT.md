# Design System — Color Audit (2026-06-25)

Triggered by: "I see brown-ish color on top of the tables that isn't from my mood board."
Scope: every `.tsx`/`.ts` file in `apps/*` + `packages/ui/src`. Counts are utility-class
occurrences (`bg-…`, `text-…`, `border-…`, `ring-…`, `from/to/via-…`, `divide-…`, `fill/stroke-…`).

---

## 1. The headline

Your design system **already has the right tokens** — they're just not being used.

| Color intent | Token that exists | Times the **token** is used | Times a **raw Tailwind** color is used instead |
|---|---|---|---|
| Success | `success-50/500` | **15** | `emerald` **869** + `green` 24 = **893** |
| Warning | `warning-50/500` | **8** | `amber` **858** + `orange` 8 = **866** |
| Danger | `danger-50/500` | **9** | `rose` **544** + `red` 248 = **792** |
| Info | `info-50/500` | **5** | `sky` **282** + `blue` 208 + `indigo` 13 = **503** |
| Neutral | `ink-50…900` ✅ (used 8,389×) | — | `zinc` **762** + `gray` 1 = **763** |
| Unassigned | *(none)* | — | `violet` **74**, `teal` 6, `purple` 3 |

**Off-palette total: ~3,900 occurrences. Semantic-token total: 37.**

So the four semantic tokens (`success / warning / danger / info`) are effectively dead —
99% of the time the same meaning is spelled in raw Tailwind (`emerald`, `amber`, `rose`,
`sky`, `zinc`). That is the root cause of "I keep seeing off things": **color never flowed
from one source.** The header work this week unified *structure*; this is the *color* half.

This is the honest answer to your earlier question — the brown was **not** a decision from
the hero research. The hero work didn't touch color at all. The brown predates it.

---

## 2. What the brown actually is (two layers)

**Layer 1 — raw `amber`.** 858 uses of `bg/text/border-amber-*` for "warning" states
(status pills, KPI cards, callouts). `amber-50`/`amber-100` are warm tan — that's the band
you see between the white header and the table on list/detail pages. Heaviest pages:

```
36  admin/products/[id]            28  admin/orders/[orderId]        17  admin/ingredients
32  admin/partners/[partnerId]     28  creator/.../ExportModal       16  admin/products/[id]/ProductReviewer
18  admin/products (list)          13  partner/products/new/PackagingStudioStep
```

**Layer 2 — the `warning` token itself is muddy.** Even where the token *is* used,
`--warning-500 = rgb(176 122 10)` (dark mustard) and `--warning-50 = rgb(251 239 211)`
(pale tan). So just swapping `amber → warning` would still look brownish. The token needs a
**retune** to sit next to pink `#FF2E63` / neon `#B5FF3D` / ink without reading as mud.

---

## 3. Where the mess lives (fix priority)

| Location | emerald | amber | zinc | rose | sky | red | verdict |
|---|---|---|---|---|---|---|---|
| `packages/ui/src` (shared components) | 37 | 31 | 12 | 40 | 16 | 3 | **clean** — library mostly uses tokens already |
| `apps/admin` | 480 | 430 | 732 | 396 | 187 | 92 | **worst** (~2,300) — esp. neutral `zinc` table chrome |
| `apps/partner` | 170 | 211 | 10 | 72 | 67 | 74 | ~600 |
| `apps/creator` | 178 | 170 | 7 | 36 | 12 | 79 | ~480 |
| `apps/marketing` | 4 | 16 | 1 | 0 | 0 | 0 | ~20 |

Good news: the **component library is already disciplined**. The debt is in app pages,
and it's mechanical (raw family → matching token). `admin` is the bulk, and `zinc` (762,
neutral table headers/dividers) is the single biggest chunk — it should all be `ink`.

---

## 4. Proposed fix — make color flow from one source (for your approval)

**Step A — Lock the semantic mapping** (no ambiguity, one rule):

| Raw family in use | → Brand token |
|---|---|
| `emerald`, `green` | `success` |
| `amber`, `orange`, `yellow` | `warning` |
| `rose`, `red` | `danger` |
| `sky`, `blue`, `indigo` | `info` |
| `zinc`, `gray`, `slate`, `neutral`, `stone` | `ink` |
| `violet`, `purple`, `teal` | **decision needed** — give them a real role (e.g. a 5th "accent/AI/premium" token) or fold into an existing one |

**Step B — Retune the tokens so they fit the mood board** (this kills the brown). Starting
proposal — **needs your sign-off**, these are directions not final:

| Token | Today | Problem | Proposed direction |
|---|---|---|---|
| `warning-500` | `rgb(176 122 10)` mustard | reads brown | brighter honey/amber, e.g. `#C8780A`→`#E08A00` range (less mud, more energy) |
| `warning-50` | `rgb(251 239 211)` tan | the "brown band" | cleaner warm cream, e.g. `#FFF6E6` |
| `success-500` | `rgb(30 124 74)` | fine, slightly flat | keep, or nudge toward a green that doesn't clash with neon `#B5FF3D` |
| `danger-500` | `rgb(179 54 54)` | fine | keep (distinct from brand pink) |
| `info-500` | `rgb(31 77 143)` | fine | keep |

Because every token is a single channel var in `theme.css`, retuning is **one edit per token**
and it re-themes the whole platform (light/cream/dark surfaces all read the same channel).

**Step C — Sweep the apps** (token-by-token, app-by-app, typecheck after each), highest-debt
first: admin `zinc→ink` (762), then `amber→warning`, `emerald→success`, `rose/red→danger`,
`sky/blue→info`. ~3,900 edits, but each is a find-replace within a known mapping, verifiable
by typecheck + a "no raw color families" grep guard at the end.

**Step D — Add a guard so it can't regress.** An ESLint rule (or a CI grep) that fails on
`bg-amber-*`, `text-emerald-*`, `bg-zinc-*`, etc. in `apps/*`, forcing future code onto tokens.
*This* is what "controls it forever" — not a one-time cleanup, but a fence.

---

## 5. Recommendation

Do **B first, then A+C+D**. Retuning `warning` (and confirming the others) immediately kills
the brown you're seeing, even before the big sweep — because the ~37 token usages + the new
swept ones all read the corrected value. Then the sweep makes it consistent and the lint guard
makes it permanent.

Open decisions for you:
1. **Approve the retuned `warning` color** (and any tweak to success/danger/info). I can show
   you swatches against pink/neon/ink before committing.
2. **Decide what `violet`/`teal` mean** — real semantic role, or remove.
3. **Sweep scope** — all four apps, or admin-only first (where you noticed it)?
