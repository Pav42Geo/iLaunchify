'use client'

// Brand Palette Generator panel (Phase 1, docs/BRAND_PALETTE_GENERATOR.md).
//
// Coolors-style: pick a method + count, roll (button or spacebar), lock the colors you
// like and re-roll the rest, then save as a brand palette. Generation runs client-side
// via the pure @ilaunchify/ui color engine; only Save hits the server (tier-gated there
// too). Harmony methods beyond Auto are Builder+; Auto is free.

import { useState, useEffect, useCallback, useRef, useTransition } from 'react'
import { Lock, LockOpen, Shuffle, X, Upload, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  generatePalette,
  extractPalette,
  nearestColorName,
  readableTextOn,
  HARMONY_METHODS,
  type HarmonyMethod,
} from '@ilaunchify/ui'
import { generateAndSaveBrandPalette } from './actions'
import type { PaletteState } from './PalettesSection'

interface Props {
  brandId: string
  canHarmony: boolean
  /** Agency: may extract a palette from an image/logo. */
  canExtract?: boolean
  /** Resolved brand logo image URLs for "use my logo". */
  logoUrls?: string[]
  onSaved: (palette: PaletteState) => void
  onClose: () => void
}

export function PaletteGenerator({
  brandId,
  canHarmony,
  canExtract = false,
  logoUrls = [],
  onSaved,
  onClose,
}: Props) {
  const [method, setMethod] = useState<HarmonyMethod>('AUTO')
  const [count, setCount] = useState(5)
  const [colors, setColors] = useState<string[]>(() => generatePalette({ method: 'AUTO', count: 5 }))
  const [locked, setLocked] = useState<boolean[]>(() => Array(5).fill(false))
  const [name, setName] = useState('')
  const [saving, startSave] = useTransition()
  const [extracting, setExtracting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const roll = useCallback(() => {
    setColors((prev) => {
      const lockedArr = prev.map((c, i) => (locked[i] ? c : null))
      return generatePalette({ method, count, locked: lockedArr })
    })
  }, [method, count, locked])

  // Re-fit arrays when count changes.
  useEffect(() => {
    setColors((prev) => {
      const lockedArr = prev.slice(0, count).map((c, i) => (locked[i] ? c : null))
      while (lockedArr.length < count) lockedArr.push(null)
      return generatePalette({ method, count, locked: lockedArr })
    })
    setLocked((prev) => {
      const next = prev.slice(0, count)
      while (next.length < count) next.push(false)
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count])

  // Re-roll unlocked when method changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { roll() }, [method])

  // Spacebar to generate (ignore when typing in the name field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()
      roll()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [roll])

  function toggleLock(i: number) {
    setLocked((prev) => prev.map((v, idx) => (idx === i ? !v : v)))
  }

  function loadImage(src: string, cors: boolean): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      if (cors) img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('image load failed'))
      img.src = src
    })
  }

  async function runExtract(src: File | string) {
    if (!canExtract) {
      toast.error('Extracting a palette from an image is an Agency feature.')
      return
    }
    setExtracting(true)
    let objectUrl: string | null = null
    try {
      const url = typeof src === 'string' ? src : (objectUrl = URL.createObjectURL(src))
      const img = await loadImage(url, typeof src === 'string')
      const max = 160
      const scale = Math.min(1, max / Math.max(img.width || max, img.height || max))
      const w = Math.max(1, Math.round((img.width || max) * scale))
      const h = Math.max(1, Math.round((img.height || max) * scale))
      const cv = document.createElement('canvas')
      cv.width = w
      cv.height = h
      const ctx = cv.getContext('2d')
      if (!ctx) throw new Error('no canvas context')
      ctx.drawImage(img, 0, 0, w, h)
      const data = ctx.getImageData(0, 0, w, h).data // throws if tainted
      const cols = extractPalette(data, { count, dropBackground: true })
      if (cols.length < 2) {
        toast.error('Couldn’t read enough colors from that image.')
        return
      }
      const next = [...cols]
      while (next.length < count) next.push(cols[next.length % cols.length] as string)
      setColors(next.slice(0, count))
      setLocked(Array(count).fill(false))
    } catch {
      toast.error('Couldn’t read that image — try uploading the file directly.')
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setExtracting(false)
    }
  }

  function save() {
    startSave(async () => {
      const res = await generateAndSaveBrandPalette({ brandId, method, name, colors })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      onSaved(res.palette as PaletteState)
      toast.success('Palette saved')
      onClose()
    })
  }

  return (
    <div className="rounded-md border border-ink-200 bg-ink-50/60 p-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[12px] font-bold uppercase tracking-[0.05em] text-ink-700">
          Generate a palette
        </span>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-400 hover:text-ink-700">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Color columns */}
      <div className="flex gap-1.5">
        {colors.map((hex, i) => {
          const text = readableTextOn(hex)
          return (
            <div
              key={i}
              className="relative flex h-28 flex-1 flex-col items-center justify-end overflow-hidden rounded-md border border-ink-200"
              style={{ background: hex }}
            >
              <button
                type="button"
                onClick={() => toggleLock(i)}
                aria-label={locked[i] ? 'Unlock color' : 'Lock color'}
                className="absolute right-1 top-1 rounded-full p-1 transition-opacity"
                style={{ color: text }}
              >
                {locked[i] ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5 opacity-60" />}
              </button>
              <span className="mb-2 px-1 text-center text-[10px] font-mono font-semibold" style={{ color: text }}>
                {hex.replace('#', '')}
                <span className="mt-0.5 block text-[8.5px] font-sans font-normal opacity-80">
                  {nearestColorName(hex)}
                </span>
              </span>
            </div>
          )
        })}
      </div>

      {/* Controls */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={roll}
          className="inline-flex items-center gap-1.5 rounded-md bg-ink-900 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-black"
        >
          <Shuffle className="h-3.5 w-3.5" /> Generate
        </button>
        <span className="text-[11px] text-ink-400">or press space</span>

        <div className="ml-auto flex items-center gap-1.5">
          <label className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">Colors</label>
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="h-8 rounded-md border border-ink-300 px-1.5 text-[12.5px] focus:border-pink-500 focus:outline-none"
          >
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Method */}
      <div className="mt-2.5">
        <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">Method</span>
        <div className="flex flex-wrap gap-1.5">
          {HARMONY_METHODS.map((m) => {
            const locked = m.pro && !canHarmony
            const active = method === m.value
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => (locked ? toast.error('Harmony methods are a Builder feature — Auto is free.') : setMethod(m.value))}
                aria-pressed={active}
                className={
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors ' +
                  (active
                    ? 'border-pink-500 bg-pink-50 text-pink-700'
                    : locked
                      ? 'border-ink-200 bg-white text-ink-400'
                      : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400')
                }
              >
                {m.label}
                {locked && (
                  <span className="rounded bg-ink-100 px-1 text-[8px] font-bold uppercase tracking-wider text-ink-500">
                    Pro
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Extract from image (Agency) */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">
          Extract from image
        </span>
        {!canExtract && (
          <span className="rounded bg-ink-100 px-1 text-[8px] font-bold uppercase tracking-wider text-ink-500">
            Agency
          </span>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void runExtract(f)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          disabled={extracting}
          onClick={() => (canExtract ? fileRef.current?.click() : runExtract(''))}
          className="inline-flex items-center gap-1 rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-700 hover:border-pink-400 hover:text-pink-700 disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" /> {extracting ? 'Reading…' : 'Upload image'}
        </button>
        {logoUrls.length > 0 && (
          <button
            type="button"
            disabled={extracting}
            onClick={() => runExtract(logoUrls[0] as string)}
            className="inline-flex items-center gap-1 rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-700 hover:border-pink-400 hover:text-pink-700 disabled:opacity-50"
          >
            <ImageIcon className="h-3.5 w-3.5" /> Use my logo
          </button>
        )}
      </div>

      {/* Save */}
      <div className="mt-3 flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Palette name (optional)"
          maxLength={40}
          className="h-9 flex-1 rounded-md border border-ink-300 px-2.5 text-[13px] focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/15"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="h-9 rounded-md bg-pink-600 px-4 text-[13px] font-semibold text-white hover:bg-pink-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save as palette'}
        </button>
      </div>
    </div>
  )
}
