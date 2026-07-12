'use client'

// Portfolio grid — 1:1 with the prototype's #p-portfolio panel: published
// tiles (image or deterministic brand gradient + big word) + the dashed
// "Add work" tile opening an inline composer (title · caption · optional
// image). Publish toggle, reorder arrows, delete per tile.

import { useRef, useState, useTransition } from 'react'
import { cn } from '@ilaunchify/ui'
import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Loader2, Plus, Trash2 } from 'lucide-react'
import {
  createPortfolioItem,
  deletePortfolioItem,
  movePortfolioItem,
  setPortfolioItemPublished,
} from './actions'

export interface PortfolioItemVM {
  id: string
  title: string
  meta: string | null
  imageUrl: string | null
  published: boolean
}

const TILE_GRADIENTS = [
  'linear-gradient(150deg, var(--pink-500), var(--pink-900))',
  'linear-gradient(150deg, var(--ink-800), var(--ink-600))',
  'linear-gradient(150deg, var(--neon-500), var(--neon-600))',
  'linear-gradient(150deg, var(--info-500), var(--info-700))',
  'linear-gradient(150deg, var(--pink-300), var(--pink-700))',
  'linear-gradient(150deg, var(--ink-600), var(--ink-900))',
]

export function PortfolioClient({ items }: { items: PortfolioItemVM[] }) {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [meta, setMeta] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const submit = () => {
    setError(null)
    const fd = new FormData()
    fd.set('title', title)
    fd.set('meta', meta)
    if (file) fd.set('file', file)
    startTransition(async () => {
      const res = await createPortfolioItem(fd)
      if (res.ok) {
        setAdding(false)
        setTitle('')
        setMeta('')
        setFile(null)
      } else setError(res.error)
    })
  }

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => (
          <div
            key={item.id}
            className={cn(
              'overflow-hidden rounded-xl border border-ink-200 transition-all hover:border-ink-300 hover:shadow-md',
              !item.published && 'opacity-60',
            )}
          >
            <div
              className="grid h-[120px] place-items-center"
              style={
                item.imageUrl
                  ? { background: `center / cover url(${item.imageUrl})` }
                  : { background: TILE_GRADIENTS[i % TILE_GRADIENTS.length] }
              }
            >
              {!item.imageUrl && (
                <span className="rounded-lg bg-ink-900/15 px-3 py-2 font-display text-[15px] font-extrabold text-white">
                  {item.title.split(' ')[0]?.toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-ink-900">{item.title}</div>
                <div className="truncate text-[11px] text-ink-500">
                  {item.published ? 'Published' : 'Hidden'}
                  {item.meta ? ` · ${item.meta}` : ''}
                </div>
              </div>
              <TileButton
                label={item.published ? 'Hide' : 'Publish'}
                onClick={() =>
                  startTransition(() => setPortfolioItemPublished(item.id, !item.published))
                }
              >
                {item.published ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </TileButton>
              <TileButton
                label="Move up"
                disabled={i === 0}
                onClick={() => startTransition(() => movePortfolioItem(item.id, 'up'))}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </TileButton>
              <TileButton
                label="Move down"
                disabled={i === items.length - 1}
                onClick={() => startTransition(() => movePortfolioItem(item.id, 'down'))}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </TileButton>
              <TileButton
                label="Delete"
                onClick={() => startTransition(() => deletePortfolioItem(item.id))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </TileButton>
            </div>
          </div>
        ))}

        {/* Add work tile / composer */}
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="grid min-h-[170px] cursor-pointer place-items-center rounded-xl border border-dashed border-ink-300 transition-colors hover:border-pink-300 hover:bg-pink-50/30"
          >
            <span className="text-center text-ink-500">
              <Plus className="mx-auto h-[26px] w-[26px] text-pink-500" />
              <span className="mt-1.5 block text-[13px] font-semibold">Add work</span>
            </span>
          </button>
        ) : (
          <div className="rounded-xl border border-pink-200 bg-pink-50/30 p-4">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="Title — e.g. Collagen elixir"
              className="mb-2 w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-[13px] focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/15"
            />
            <input
              value={meta}
              onChange={(e) => setMeta(e.target.value)}
              maxLength={80}
              placeholder="Caption — e.g. Beverage · shrink-sleeve"
              className="mb-2 w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-[13px] focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/15"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-700 hover:bg-ink-50"
            >
              <ImagePlus className="h-3.5 w-3.5" />
              {file ? file.name.slice(0, 24) : 'Tile image (optional)'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {error && <p className="mb-2 text-[12px] font-semibold text-danger-500">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submit}
                disabled={pending || !title.trim()}
                className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-black disabled:opacity-40"
              >
                {pending && <Loader2 className="h-3 w-3 animate-spin" />}
                Add to portfolio
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false)
                  setError(null)
                }}
                className="rounded-full border border-ink-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-700 hover:bg-ink-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      <p className="mt-4 text-[12px] text-ink-500">
        Up to 12 tiles. Tiles without an image get a brand gradient with the first word of the
        title — exactly how they&rsquo;ll render on your public profile.
      </p>
    </div>
  )
}

function TileButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-7 w-7 flex-none place-items-center rounded-full border border-ink-200 bg-white text-ink-500 transition-colors hover:border-ink-300 hover:text-ink-900 disabled:opacity-30"
    >
      {children}
    </button>
  )
}
