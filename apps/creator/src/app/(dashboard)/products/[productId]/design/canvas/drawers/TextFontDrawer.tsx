'use client'

// TextFontDrawer — Canva-style font picker as a left-rail drawer
// (DS-66f). Opens when the user clicks the font name in the
// TextFormatToolbar. Replaces whichever rail-tool drawer is currently
// active.
//
// Rich layout:
//   - Sticky header with search box
//   - Mood-chip strip (Elegant / Modern / Retro / Geometric / Rounded ...)
//   - Document fonts — currently used on canvas
//   - Brand fonts — pinned to the active brand
//   - Recently used — local-storage backed
//   - Popular fonts — full catalog sorted by popularity
//
// Each row lazy-loads its font via IntersectionObserver so opening the
// drawer doesn't trigger 120 simultaneous network requests.

import * as React from 'react'
import { Check, Pin, Search, Sparkles, X } from 'lucide-react'
import {
  loadFont,
  isFontLoaded,
  FONT_CATALOG,
  FONT_CATEGORIES,
  findFontInCatalog,
  type BrandCanvasAssets,
  type FabricCanvas,
  type FabricObject,
  type FontCategory,
  type FontEntry,
} from '@ilaunchify/ui'

interface Props {
  canvas: FabricCanvas | null
  active: FabricObject
  brandAssets: BrandCanvasAssets
  onClose: () => void
  /** Optional: pin the given family to the active brand. */
  onPin?: (family: string) => void | Promise<void>
}

const PREVIEW_TEXT = 'AaBbCc 123'
const RECENT_KEY = 'ilaunchify_design_studio_recent_fonts'
const MAX_RECENT = 8

/** Quick-access mood chips. Each maps to a tag in the catalog. */
const MOOD_CHIPS: Array<{ label: string; tag: string }> = [
  { label: 'Modern', tag: 'modern' },
  { label: 'Editorial', tag: 'editorial' },
  { label: 'Retro', tag: 'retro' },
  { label: 'Geometric', tag: 'geometric' },
  { label: 'Rounded', tag: 'rounded' },
  { label: 'Classical', tag: 'classical' },
  { label: 'Casual', tag: 'casual' },
  { label: 'Bold', tag: 'bold' },
  { label: 'Tech', tag: 'tech' },
]

export function TextFontDrawer({
  canvas,
  active,
  brandAssets,
  onClose,
  onPin,
}: Props) {
  const [query, setQuery] = React.useState('')
  const [category, setCategory] = React.useState<FontCategory | 'all'>('all')
  const [moodTag, setMoodTag] = React.useState<string | null>(null)
  const [recents, setRecents] = React.useState<string[]>(() => readRecents())

  const text = active as unknown as {
    fontFamily?: string
    set: (k: string | object, v?: unknown) => void
  }
  const currentFamily = text.fontFamily ?? 'Inter'

  const brandFontFamilies = brandAssets.fonts.map((f) => f.family)

  async function applyFont(family: string) {
    if (!canvas) return
    const entry = findFontInCatalog(family)
    await loadFont(family, entry?.weights)
    text.set({ fontFamily: family })
    canvas.fire('object:modified', { target: active })
    canvas.requestRenderAll()
    const next = [family, ...recents.filter((r) => r !== family)].slice(
      0,
      MAX_RECENT,
    )
    setRecents(next)
    writeRecents(next)
  }

  // Build the filtered list.
  const filtered = React.useMemo(
    () => filterFonts(FONT_CATALOG, query, category, moodTag),
    [query, category, moodTag],
  )

  // Sections — document fonts come from canvas; brand from brandAssets;
  // recents from localStorage.
  const documentFamilies = React.useMemo(() => collectDocumentFonts(canvas), [canvas])

  const recentFamilies = recents.filter(
    (r) =>
      r !== currentFamily &&
      !brandFontFamilies.includes(r) &&
      !documentFamilies.includes(r) &&
      (!query || r.toLowerCase().includes(query.toLowerCase())) &&
      (category === 'all' || findFontInCatalog(r)?.category === category) &&
      (!moodTag || findFontInCatalog(r)?.tags?.includes(moodTag)),
  )

  return (
    <aside className="flex w-[400px] flex-col border-r border-ink-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
        <h2 className="text-base font-semibold text-ink-900">Font</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close font drawer"
          className="rounded p-1 text-ink-500 hover:bg-ink-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Sticky search + chips */}
      <div className="sticky top-0 z-10 bg-white border-b border-ink-100 px-4 pt-3 pb-2.5 space-y-2.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try 'Modern' or 'Open Sans'"
            autoFocus
            className="w-full h-9 pl-8 pr-7 text-[12.5px] border border-ink-200 rounded-md focus:outline-none focus:border-pink-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-400 hover:text-ink-900 hover:bg-ink-100"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Category tabs */}
        <div className="flex items-center gap-1 overflow-x-auto -mx-1 px-1">
          <Chip
            label="All"
            active={category === 'all'}
            onClick={() => setCategory('all')}
          />
          {FONT_CATEGORIES.map((c) => (
            <Chip
              key={c.key}
              label={c.label}
              active={category === c.key}
              onClick={() => setCategory(c.key)}
            />
          ))}
        </div>

        {/* Mood chips — secondary refinement */}
        <div className="flex items-center gap-1 overflow-x-auto -mx-1 px-1">
          {MOOD_CHIPS.map((m) => (
            <MoodChip
              key={m.tag}
              label={m.label}
              active={moodTag === m.tag}
              onClick={() =>
                setMoodTag((current) => (current === m.tag ? null : m.tag))
              }
            />
          ))}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {documentFamilies.length > 0 && (
          <Section title="Document fonts">
            {documentFamilies.map((f) => (
              <FontRow
                key={`doc-${f}`}
                family={f}
                selected={f === currentFamily}
                onPick={applyFont}
                onPin={onPin}
              />
            ))}
          </Section>
        )}

        {brandFontFamilies.length > 0 && (
          <Section title="Brand fonts">
            {brandFontFamilies.map((f) => (
              <FontRow
                key={`brand-${f}`}
                family={f}
                selected={f === currentFamily}
                onPick={applyFont}
                onPin={onPin}
                pinned
              />
            ))}
          </Section>
        )}

        {!brandFontFamilies.length && (
          <BrandFontsEmpty />
        )}

        {recentFamilies.length > 0 && (
          <Section title="Recently used">
            {recentFamilies.slice(0, 6).map((f) => (
              <FontRow
                key={`recent-${f}`}
                family={f}
                selected={f === currentFamily}
                onPick={applyFont}
                onPin={onPin}
              />
            ))}
          </Section>
        )}

        <Section title="Popular fonts">
          {filtered.map((f) => (
            <FontRow
              key={f.family}
              family={f.family}
              selected={f.family === currentFamily}
              onPick={applyFont}
              onPin={onPin}
            />
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-[11.5px] text-ink-500">
              No fonts match{' '}
              {[
                query && `"${query}"`,
                category !== 'all' && category,
                moodTag,
              ]
                .filter(Boolean)
                .join(' · ')}
              .
            </div>
          )}
        </Section>

        <div className="px-4 py-3 text-[10px] text-ink-500 flex items-center gap-1.5 border-t border-ink-100">
          <Sparkles className="h-3 w-3 text-pink-500" />
          <span>{FONT_CATALOG.length} fonts · loaded on demand from Bunny</span>
        </div>
      </div>
    </aside>
  )
}

// ============================================================================
// FontRow — IntersectionObserver-gated font loader (matches FontPicker)
// ============================================================================

function FontRow({
  family,
  selected,
  onPick,
  onPin,
  pinned,
}: {
  family: string
  selected: boolean
  onPick: (family: string) => void | Promise<void>
  onPin?: (family: string) => void | Promise<void>
  pinned?: boolean
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = React.useState(() => isFontLoaded(family))

  React.useEffect(() => {
    if (loaded || !ref.current) return
    const el = ref.current
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const entry = findFontInCatalog(family)
            loadFont(family, entry?.weights).then(() => setLoaded(true))
            io.disconnect()
            break
          }
        }
      },
      { rootMargin: '120px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [family, loaded])

  return (
    <div
      ref={ref}
      className={
        'group flex items-center justify-between gap-2 px-4 py-2 cursor-pointer transition-colors ' +
        (selected ? 'bg-pink-50' : 'hover:bg-ink-50')
      }
      onClick={() => onPick(family)}
      role="option"
      aria-selected={selected}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {selected ? (
          <Check className="h-3.5 w-3.5 text-pink-700 flex-shrink-0" />
        ) : pinned ? (
          <Pin className="h-3 w-3 text-pink-500 flex-shrink-0" />
        ) : (
          <span className="w-3.5 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div
            className="text-[18px] leading-tight text-ink-900 truncate"
            style={loaded ? { fontFamily: `"${family}"` } : undefined}
          >
            {family}
          </div>
          <div
            className="text-[11px] leading-tight text-ink-500 truncate mt-0.5"
            style={loaded ? { fontFamily: `"${family}"` } : undefined}
          >
            {PREVIEW_TEXT}
          </div>
        </div>
      </div>
      {onPin && !pinned && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            void onPin(family)
          }}
          aria-label={`Pin ${family} to brand`}
          title="Pin to brand"
          className="opacity-0 group-hover:opacity-100 rounded p-1 text-ink-400 hover:text-pink-600 hover:bg-pink-50 transition-opacity"
        >
          <Pin className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

// ============================================================================
// Sections + chips
// ============================================================================

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
        {title}
      </div>
      {children}
    </section>
  )
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'rounded-full px-3 py-1 text-[11.5px] font-semibold transition-colors whitespace-nowrap flex-shrink-0 ' +
        (active
          ? 'bg-ink-900 text-white'
          : 'bg-white text-ink-700 border border-ink-200 hover:border-ink-400')
      }
    >
      {label}
    </button>
  )
}

function MoodChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'rounded-md px-2.5 py-1 text-[10.5px] font-semibold transition-colors whitespace-nowrap flex-shrink-0 border ' +
        (active
          ? 'bg-pink-50 text-pink-700 border-pink-300'
          : 'bg-white text-ink-600 border-ink-200 hover:border-ink-400')
      }
    >
      {label}
    </button>
  )
}

function BrandFontsEmpty() {
  return (
    <section className="mx-4 my-3 rounded-md border border-dashed border-ink-300 bg-ink-50/60 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-600">
        Brand fonts
      </div>
      <p className="mt-1 text-[11px] text-ink-600 leading-[1.4]">
        Pin a font to your brand to lock it across every product. Hover any
        font row and click the pin icon.
      </p>
    </section>
  )
}

// ============================================================================
// Helpers
// ============================================================================

function filterFonts(
  catalog: ReadonlyArray<FontEntry>,
  query: string,
  category: FontCategory | 'all',
  moodTag: string | null,
): FontEntry[] {
  const q = query.toLowerCase().trim()
  let list: FontEntry[] = catalog.filter(
    (f) => category === 'all' || f.category === category,
  )
  if (moodTag) {
    list = list.filter((f) => f.tags?.includes(moodTag))
  }
  if (q) {
    list = list.filter(
      (f) =>
        f.family.toLowerCase().includes(q) ||
        f.tags?.some((t) => t.toLowerCase().includes(q)),
    )
  }
  list.sort((a, b) => {
    const pa = a.popularity ?? 0
    const pb = b.popularity ?? 0
    if (pa !== pb) return pb - pa
    return a.family.localeCompare(b.family)
  })
  return list
}

function collectDocumentFonts(canvas: FabricCanvas | null): string[] {
  if (!canvas) return []
  const set = new Set<string>()
  for (const obj of canvas.getObjects()) {
    const f = (obj as { fontFamily?: string }).fontFamily
    if (f) set.add(f)
  }
  return Array.from(set).sort()
}

function readRecents(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : []
  } catch {
    return []
  }
}

function writeRecents(list: string[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list))
  } catch {
    // localStorage disabled / full — silently skip.
  }
}
