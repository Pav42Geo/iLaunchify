'use client'

import * as React from 'react'
import { Search, Clock, TrendingUp, CornerDownLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { productGradient } from '@ilaunchify/ui'
import { highlightSegments } from '@/lib/marketplace-search'
import type { NavItem, UseMarketplaceSearch } from './useMarketplaceSearch'

/**
 * MarketplaceSearchResults — the presentational body shared by the inline
 * dropdown (theme="light") and the ⌘K palette (theme="dark"). Renders the
 * federated sections (products / jump-to chips / suggestions), the empty
 * state (recent + trending + browse) and the zero-result state, driven
 * entirely by the useMarketplaceSearch hook. The host owns the surrounding
 * panel/overlay chrome + the input.
 */

type Theme = 'light' | 'dark'

interface Tone {
  header: string
  headerCount: string
  divider: string
  rowActive: string
  rowHover: string
  productName: string
  productNiche: string
  metaMuted: string
  priceMuted: string
  chipIdle: string
  chipActive: string
  suggestText: string
  suggestStrong: string
  icon: string
  mark: string
  footer: string
  kbd: string
  skeleton: string
  zeroTitle: string
  zeroText: string
  didYou: string
  clearBtn: string
}

const TONES: Record<Theme, Tone> = {
  light: {
    header: 'text-ink-500',
    headerCount: 'text-ink-300',
    divider: 'bg-ink-100',
    rowActive: 'bg-ink-100',
    rowHover: 'hover:bg-ink-50',
    productName: 'text-ink-900',
    productNiche: 'text-pink-700',
    metaMuted: 'text-ink-500',
    priceMuted: 'text-ink-300',
    chipIdle: 'border-ink-200 bg-white text-ink-700 hover:border-pink-500 hover:text-pink-700',
    chipActive: 'border-pink-500 bg-pink-50 text-pink-700',
    suggestText: 'text-ink-700',
    suggestStrong: 'text-ink-900',
    icon: 'text-ink-400',
    mark: 'bg-[linear-gradient(transparent_55%,rgba(181,255,61,0.6)_55%)] text-ink-900',
    footer: 'border-ink-100 bg-ink-50/70 text-ink-500',
    kbd: 'border-ink-200 bg-white text-ink-500',
    skeleton: 'bg-ink-100',
    zeroTitle: 'text-ink-900',
    zeroText: 'text-ink-500',
    didYou: 'text-pink-700',
    clearBtn: 'text-ink-400 hover:text-pink-700',
  },
  dark: {
    header: 'text-white/40',
    headerCount: 'text-white/25',
    divider: 'bg-white/10',
    rowActive: 'bg-white/10',
    rowHover: 'hover:bg-white/5',
    productName: 'text-white',
    productNiche: 'text-neon-500',
    metaMuted: 'text-white/50',
    priceMuted: 'text-white/40',
    chipIdle: 'border-white/15 bg-white/[0.06] text-white/80 hover:border-neon-500 hover:text-neon-500',
    chipActive: 'border-neon-500 bg-neon-500/10 text-neon-500',
    suggestText: 'text-white/80',
    suggestStrong: 'text-white',
    icon: 'text-white/40',
    mark: 'bg-[linear-gradient(transparent_55%,rgba(181,255,61,0.35)_55%)] text-neon-500',
    footer: 'border-white/10 bg-white/[0.03] text-white/50',
    kbd: 'border-white/15 bg-white/[0.06] text-white/60',
    skeleton: 'bg-white/10',
    zeroTitle: 'text-white',
    zeroText: 'text-white/55',
    didYou: 'text-neon-500',
    clearBtn: 'text-white/40 hover:text-neon-500',
  },
}

function Highlight({ text, query, markClass }: { text: string; query: string; markClass: string }) {
  const segs = highlightSegments(text, query)
  return (
    <>
      {segs.map((s, i) =>
        s.hit ? (
          <mark key={i} className={`rounded-[2px] ${markClass}`}>
            {s.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{s.text}</React.Fragment>
        ),
      )}
    </>
  )
}

function TierBadge({ badge, theme }: { badge: 'TRUSTED' | 'PREMIER' | null; theme: Theme }) {
  if (!badge) return null
  const premier = badge === 'PREMIER'
  const cls = premier
    ? theme === 'dark'
      ? 'bg-ink-800 text-neon-500'
      : 'bg-ink-900 text-neon-500'
    : theme === 'dark'
      ? 'bg-pink-500/20 text-pink-300'
      : 'bg-pink-50 text-pink-700'
  return (
    <span className={`shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-bold tracking-[0.03em] ${cls}`}>
      {premier ? 'Premier' : 'Trusted'}
    </span>
  )
}

function gradientFor(key: string): string {
  return (productGradient as Record<string, string>)[key] ?? productGradient.pink
}

function Kbd({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${tone.kbd}`}>
      {children}
    </span>
  )
}

function RowButton({
  item,
  tone,
  active,
  setActive,
  children,
}: {
  item: NavItem
  tone: Tone
  active: number
  setActive: (i: number) => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      data-idx={item.index}
      role="option"
      aria-selected={active === item.index}
      onMouseEnter={() => setActive(item.index)}
      onClick={item.run}
      className={`mx-1.5 flex w-[calc(100%-12px)] items-center gap-3 rounded-xl px-3 py-2.5 text-left ${
        active === item.index ? tone.rowActive : tone.rowHover
      }`}
    >
      {children}
    </button>
  )
}

function ChipButton({
  item,
  tone,
  active,
  setActive,
  children,
}: {
  item: NavItem
  tone: Tone
  active: number
  setActive: (i: number) => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      data-idx={item.index}
      role="option"
      aria-selected={active === item.index}
      onMouseEnter={() => setActive(item.index)}
      onClick={item.run}
      className={`inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-[13px] font-medium transition-colors ${
        active === item.index ? tone.chipActive : tone.chipIdle
      }`}
    >
      {children}
    </button>
  )
}

function ProductRow({
  item,
  tone,
  theme,
  active,
  setActive,
  query,
}: {
  item: NavItem
  tone: Tone
  theme: Theme
  active: number
  setActive: (i: number) => void
  query: string
}) {
  const p = item.product!
  return (
    <button
      type="button"
      data-idx={item.index}
      role="option"
      aria-selected={active === item.index}
      onMouseEnter={() => setActive(item.index)}
      onClick={item.run}
      className={`mx-1.5 flex w-[calc(100%-12px)] items-center gap-3.5 rounded-xl px-3 py-2 text-left ${
        active === item.index ? tone.rowActive : tone.rowHover
      }`}
    >
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[11px] text-[24px] leading-none"
        style={{ background: gradientFor(p.gradient) }}
      >
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span aria-hidden>{p.icon}</span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[14.5px] font-semibold ${tone.productName}`}>
          <Highlight text={p.title} query={query} markClass={tone.mark} />
        </span>
        <span className={`mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] ${tone.metaMuted}`}>
          <span className={`font-semibold ${tone.productNiche}`}>
            <Highlight text={p.niche} query={query} markClass={tone.mark} />
          </span>
          {p.tags[0] && (
            <>
              <span className={tone.priceMuted}>·</span>
              <span className="truncate">{p.tags[0]}</span>
            </>
          )}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className={`block text-[14px] font-bold ${tone.productName}`}>
          ${p.pricePerUnit.toFixed(2)}
          <span className={`text-[11px] font-medium ${tone.priceMuted}`}>/unit</span>
        </span>
        <span className={`mt-0.5 block text-[11.5px] ${tone.metaMuted}`}>
          MOQ {p.minUnits.toLocaleString()} · {p.leadTimeDays}d
        </span>
      </span>
      <TierBadge badge={p.badge} theme={theme} />
    </button>
  )
}

/**
 * ProductMiniCard — compact card for the "Popular right now" horizontal
 * carousel (Amazon "keep shopping for" pattern): thumbnail on top, name + price
 * below. Fixed width so cards line up and scroll horizontally.
 */
function ProductMiniCard({
  item,
  tone,
  active,
  setActive,
}: {
  item: NavItem
  tone: Tone
  active: number
  setActive: (i: number) => void
}) {
  const p = item.product!
  const on = active === item.index
  return (
    <button
      type="button"
      data-idx={item.index}
      role="option"
      aria-selected={on}
      onMouseEnter={() => setActive(item.index)}
      onClick={item.run}
      className={`shrink-0 w-[132px] snap-start rounded-xl p-1.5 text-left transition-colors ${
        on ? tone.rowActive : tone.rowHover
      }`}
    >
      <span
        className="flex h-[100px] w-full items-center justify-center overflow-hidden rounded-lg text-[30px] leading-none"
        style={{ background: gradientFor(p.gradient) }}
      >
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span aria-hidden>{p.icon}</span>
        )}
      </span>
      <span className={`mt-1.5 block min-h-[32px] text-[12.5px] font-semibold leading-tight line-clamp-2 ${tone.productName}`}>
        {p.title}
      </span>
      <span className={`mt-1 block text-[12.5px] font-bold ${tone.productName}`}>
        ${p.pricePerUnit.toFixed(2)}
        <span className={`text-[10.5px] font-medium ${tone.priceMuted}`}>/unit</span>
      </span>
    </button>
  )
}

/**
 * PopularCarousel — horizontal mini-card row with edge fades + scroll arrows.
 * Arrows and the fade on each side appear only when there's more to scroll that
 * way, so a short row shows neither. Edge padding keeps cards off the panel edge.
 */
function PopularCarousel({
  items,
  tone,
  theme,
  active,
  setActive,
}: {
  items: NavItem[]
  tone: Tone
  theme: Theme
  active: number
  setActive: (i: number) => void
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = React.useState(false)
  const [canRight, setCanRight] = React.useState(false)

  const update = React.useCallback(() => {
    const el = ref.current
    if (!el) return
    setCanLeft(el.scrollLeft > 4)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  React.useEffect(() => {
    update()
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [update, items.length])

  const scrollByDir = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * 264, behavior: 'smooth' })

  const fadeFrom = theme === 'dark' ? 'from-ink-900' : 'from-white'
  const arrowCls =
    theme === 'dark'
      ? 'bg-ink-800 text-white border-white/15 hover:bg-ink-700'
      : 'bg-white text-ink-700 border-ink-200 hover:bg-ink-50'

  return (
    <div className="relative">
      <div
        ref={ref}
        onScroll={update}
        className="flex snap-x gap-2 overflow-x-auto scroll-smooth px-[18px] pb-2 pt-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => (
          <ProductMiniCard key={item.product!.slug} item={item} tone={tone} active={active} setActive={setActive} />
        ))}
      </div>

      {canLeft && (
        <>
          <div className={`pointer-events-none absolute bottom-0 left-0 top-0 w-10 bg-gradient-to-r ${fadeFrom} to-transparent`} />
          <button
            type="button"
            aria-label="Scroll left"
            onClick={() => scrollByDir(-1)}
            className={`absolute left-1.5 top-[54px] z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border shadow-sm transition-colors ${arrowCls}`}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </>
      )}
      {canRight && (
        <>
          <div className={`pointer-events-none absolute bottom-0 right-0 top-0 w-10 bg-gradient-to-l ${fadeFrom} to-transparent`} />
          <button
            type="button"
            aria-label="Scroll right"
            onClick={() => scrollByDir(1)}
            className={`absolute right-1.5 top-[54px] z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border shadow-sm transition-colors ${arrowCls}`}
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </>
      )}
    </div>
  )
}

export function MarketplaceSearchResults({
  search,
  theme,
}: {
  search: UseMarketplaceSearch
  theme: Theme
}) {
  const tone = TONES[theme]
  const { trimmed, isEmpty, loading, results, active, setActive, clearRecent, groups, hasResults, showZero } = search
  const { products, recentProductItems, jumpTo, suggestions, recentItems, trendingItems, browseItems } = groups

  const header = (label: string, right?: React.ReactNode) => (
    <div className={`flex items-center justify-between px-[18px] pb-1.5 pt-3.5 text-[11px] font-bold uppercase tracking-[0.08em] ${tone.header}`}>
      <span>{label}</span>
      {right}
    </div>
  )

  return (
    <>
      {/* EMPTY STATE */}
      {isEmpty && (
        <div className="pb-2">
          {recentProductItems.length > 0 && (
            <>
              {header('Recently viewed')}
              <PopularCarousel items={recentProductItems} tone={tone} theme={theme} active={active} setActive={setActive} />
              <div className={`mx-[18px] my-2 h-px ${tone.divider}`} />
            </>
          )}

          {products.length > 0 && (
            <>
              {header(search.popularLabel ?? 'Popular right now')}
              <PopularCarousel items={products} tone={tone} theme={theme} active={active} setActive={setActive} />
              <div className={`mx-[18px] my-2 h-px ${tone.divider}`} />
            </>
          )}

          {recentItems.length > 0 && (
            <>
              {header(
                'Recent',
                <button
                  type="button"
                  onClick={clearRecent}
                  className={`cursor-pointer text-[11px] font-semibold normal-case tracking-normal ${tone.clearBtn}`}
                >
                  Clear
                </button>,
              )}
              {recentItems.map((item) => (
                <RowButton key={`r-${item.label}`} item={item} tone={tone} active={active} setActive={setActive}>
                  <Clock className={`h-4 w-4 shrink-0 ${tone.icon}`} strokeWidth={2} />
                  <span className={`flex-1 truncate text-[14px] ${tone.suggestText}`}>{item.label}</span>
                  <CornerDownLeft className={`h-3.5 w-3.5 ${tone.icon}`} strokeWidth={2} />
                </RowButton>
              ))}
              <div className={`mx-[18px] my-2 h-px ${tone.divider}`} />
            </>
          )}

          {header('Trending searches')}
          <div className="flex flex-wrap gap-2 px-[18px] pb-3 pt-0.5">
            {trendingItems.map((item) => (
              <ChipButton key={`t-${item.label}`} item={item} tone={tone} active={active} setActive={setActive}>
                <TrendingUp className="h-3.5 w-3.5 text-pink-500" strokeWidth={2.25} />
                {item.label}
              </ChipButton>
            ))}
          </div>

          {header('Browse by niche')}
          <div className="flex flex-wrap gap-2 px-[18px] pb-3 pt-0.5">
            {browseItems.map((item) => (
              <ChipButton key={`b-${item.niche!.slug}`} item={item} tone={tone} active={active} setActive={setActive}>
                <span className="text-[15px] leading-none">{item.niche!.icon}</span>
                {item.niche!.name}
              </ChipButton>
            ))}
          </div>
        </div>
      )}

      {/* LOADING */}
      {!isEmpty && loading && !hasResults && (
        <div className="p-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3.5 px-3.5 py-2.5">
              <div className={`h-12 w-12 shrink-0 animate-pulse rounded-[11px] ${tone.skeleton}`} />
              <div className="flex-1 space-y-2">
                <div className={`h-3.5 w-2/5 animate-pulse rounded ${tone.skeleton}`} />
                <div className={`h-2.5 w-3/5 animate-pulse rounded ${tone.skeleton}`} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* RESULTS */}
      {hasResults && (
        <div className="pb-1">
          {products.length > 0 && (
            <>
              {header('Products', <span className={tone.headerCount}>{products.length}</span>)}
              {products.map((item) => (
                <ProductRow key={item.product!.slug} item={item} tone={tone} theme={theme} active={active} setActive={setActive} query={trimmed} />
              ))}
            </>
          )}

          {jumpTo.length > 0 && (
            <>
              {products.length > 0 && <div className={`mx-[18px] my-2 h-px ${tone.divider}`} />}
              {header('Jump to')}
              <div className="flex flex-wrap gap-2 px-[18px] pb-3 pt-0.5">
                {jumpTo.map((item) => {
                  const meta = item.category ?? item.niche!
                  return (
                    <ChipButton key={`${item.type}-${meta.slug}`} item={item} tone={tone} active={active} setActive={setActive}>
                      <span className="text-[15px] leading-none">{item.category?.icon ?? item.niche!.icon}</span>
                      <Highlight text={meta.name} query={trimmed} markClass={tone.mark} />
                    </ChipButton>
                  )
                })}
              </div>
            </>
          )}

          {suggestions.length > 0 && (
            <>
              <div className={`mx-[18px] my-1 h-px ${tone.divider}`} />
              {suggestions.map((item) => (
                <RowButton key={`s-${item.label}`} item={item} tone={tone} active={active} setActive={setActive}>
                  <Search className={`h-4 w-4 shrink-0 ${tone.icon}`} strokeWidth={2} />
                  <span className={`flex-1 truncate text-[14px] ${tone.suggestText}`}>
                    Search for “<span className={`font-semibold ${tone.suggestStrong}`}>{item.label}</span>”
                  </span>
                  <CornerDownLeft className={`h-3.5 w-3.5 ${tone.icon}`} strokeWidth={2} />
                </RowButton>
              ))}
            </>
          )}
        </div>
      )}

      {/* ZERO STATE */}
      {showZero && (
        <div className="px-6 pb-8 pt-7 text-center">
          <div className="text-[32px]">🔍</div>
          <h3 className={`mt-2.5 text-[16px] font-bold ${tone.zeroTitle}`}>No products match “{trimmed}”</h3>
          <p className={`mt-1 text-[13px] ${tone.zeroText}`}>Try a broader term or a different format.</p>
          {results?.didYouMean && (
            <p className={`mt-3.5 text-[13px] ${tone.suggestText}`}>
              Did you mean{' '}
              <button
                type="button"
                onClick={() => search.setValue(results.didYouMean!)}
                className={`font-semibold underline ${tone.didYou}`}
              >
                {results.didYouMean}
              </button>
              ?
            </p>
          )}
        </div>
      )}

      {/* FOOTER */}
      {(hasResults || isEmpty || showZero) && (
        <div className={`sticky bottom-0 flex items-center justify-between border-t px-[18px] py-2.5 text-[12px] backdrop-blur ${tone.footer}`}>
          <div className="flex gap-3.5">
            <span className="flex items-center gap-1.5"><Kbd tone={tone}>↑↓</Kbd> navigate</span>
            <span className="flex items-center gap-1.5"><Kbd tone={tone}>↵</Kbd> select</span>
            <span className="hidden items-center gap-1.5 sm:flex"><Kbd tone={tone}>esc</Kbd> close</span>
          </div>
          <span className="hidden sm:inline">Typo-tolerant</span>
        </div>
      )}
    </>
  )
}
