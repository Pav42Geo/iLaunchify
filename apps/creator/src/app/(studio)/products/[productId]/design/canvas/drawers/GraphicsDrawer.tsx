'use client'

// Track D / D4 — Studio Graphics drawer (Iconify icon library).
//
// Search the key-less Iconify CDN + drop any icon onto the canvas as a vector
// group (crisp at any scale). Previews are served straight from the Iconify
// SVG endpoint; the placed icon is recolored via the ?color= param.

import * as React from 'react'
import { Search, Loader2, Sparkles } from 'lucide-react'
import { addIconFromUrl, type FabricCanvas } from '@ilaunchify/ui'
import { searchIcons, type IconHit } from '../graphics-actions'
import { ICON_COLLECTIONS } from '../graphics-collections'

const INK_HEX = '0F1116'

function iconSvgUrl(id: string, heightPx: number, colorHex = INK_HEX): string {
  const [prefix, name] = id.split(':')
  return `https://api.iconify.design/${prefix}/${name}.svg?height=${heightPx}&color=%23${colorHex}`
}

export function GraphicsDrawer({ canvas }: { canvas: FabricCanvas | null }) {
  const [query, setQuery] = React.useState('')
  const [hits, setHits] = React.useState<IconHit[]>([])
  const [loading, setLoading] = React.useState(false)
  const [adding, setAdding] = React.useState<string | null>(null)

  React.useEffect(() => {
    const term = query.trim()
    if (!term) {
      setHits([])
      setLoading(false)
      return
    }
    setLoading(true)
    let alive = true
    const id = setTimeout(() => {
      searchIcons(term, 48)
        .then((r) => {
          if (alive) setHits(r)
        })
        .finally(() => {
          if (alive) setLoading(false)
        })
    }, 300)
    return () => {
      alive = false
      clearTimeout(id)
    }
  }, [query])

  async function addById(id: string) {
    if (!canvas) return
    setAdding(id)
    try {
      await addIconFromUrl(canvas, iconSvgUrl(id, 200), { sizePx: 96 })
    } finally {
      setAdding(null)
    }
  }

  const IconButton = ({ id }: { id: string }) => (
    <button
      type="button"
      onClick={() => addById(id)}
      disabled={!canvas || adding === id}
      title={id}
      className="flex aspect-square items-center justify-center rounded-md border border-ink-200 p-2 hover:border-pink-400 hover:bg-pink-50/40 disabled:opacity-50"
    >
      {adding === id ? (
        <Loader2 className="h-4 w-4 animate-spin text-ink-400" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconSvgUrl(id, 40)}
          alt={id}
          loading="lazy"
          className="h-full w-full object-contain"
        />
      )}
    </button>
  )

  return (
    <div className="space-y-3">
      <p className="text-[12px] leading-[1.45] text-ink-500">
        Thousands of open-source icons (Iconify). Click one to drop it on your label as a vector.
      </p>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search icons — leaf, flame, heart…"
          className="w-full rounded-md border border-ink-200 py-1.5 pl-8 pr-2.5 text-[12.5px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
      </div>

      {!query.trim() ? (
        // Curated CPG/supplement collections (no search needed).
        <div className="space-y-3">
          {ICON_COLLECTIONS.map((col) => (
            <section key={col.label}>
              <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-ink-700">
                {col.label}
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {col.icons.map((id) => (
                  <IconButton key={id} id={id} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 py-6 text-[12px] text-ink-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
        </div>
      ) : hits.length === 0 ? (
        <p className="py-6 text-center text-[11.5px] italic text-ink-400">
          No icons for “{query}”. Try a simpler word.
        </p>
      ) : (
        <div className="grid grid-cols-5 gap-1.5">
          {hits.map((h) => (
            <IconButton key={h.id} id={h.id} />
          ))}
        </div>
      )}

      <p className="flex items-center gap-1 pt-1 text-[10.5px] text-ink-400">
        <Sparkles className="h-3 w-3" /> Stock photos (Unsplash / Pexels) land in a later release.
      </p>
    </div>
  )
}
