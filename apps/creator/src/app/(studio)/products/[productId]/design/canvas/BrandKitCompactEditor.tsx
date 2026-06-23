'use client'

// Compact brand-kit editors for the Studio Brand drawer (~360px). Purpose-built for
// the tight rail — NOT the wide profile sections. They call the same proven server
// actions (uploadLogoVariant / setBrandColors / setBrandFonts / setBrandTagline), so
// edits persist identically. Colors use a real picker ("+" → native color input + hex).

import * as React from 'react'
import { Upload, X, Plus, Search, Check, Trash2, Globe, Sparkles } from 'lucide-react'
import {
  uploadLogoVariant,
  removeLogoVariant,
  setBrandColors,
  setBrandFonts,
  setBrandTagline,
  uploadBrandFont,
  removeBrandFont,
  type LogoVariant,
} from '@/app/(dashboard)/brands/[brandId]/assets/actions'
import { loadCustomFont } from '@ilaunchify/ui'
import type { StudioAssetSummary, StudioFontOption, StudioCustomFont } from './brand-edit-actions'
import { applyBrandKitFromUrl } from './brand-kit-builder'

// ================================================================ Build from website
export function BuildFromWebsite({ brandId, onDone }: { brandId: string; onDone: () => void }) {
  const [open, setOpen] = React.useState(false)
  const [url, setUrl] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [msg, setMsg] = React.useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  async function run() {
    if (url.trim().length < 4) return
    setBusy(true)
    setMsg(null)
    const res = await applyBrandKitFromUrl(brandId, url)
    setBusy(false)
    if (res.ok) {
      const bits = [
        res.colorsApplied > 0 ? `${res.colorsApplied} color${res.colorsApplied === 1 ? '' : 's'}` : null,
        res.logoApplied ? 'logo' : null,
      ].filter(Boolean)
      setMsg({ kind: 'ok', text: `Imported ${bits.join(' + ')} from ${res.sourceUrl}.` })
      setUrl('')
      setOpen(false)
      onDone()
    } else {
      setMsg({ kind: 'err', text: res.error })
    }
  }

  return (
    <div className="rounded-lg border border-pink-200 bg-pink-50/40 p-2.5">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 text-left text-[12.5px] font-semibold text-pink-800"
        >
          <Sparkles className="h-4 w-4" /> Build from website
          <span className="ml-auto rounded-full bg-pink-100 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-pink-700">beta</span>
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-pink-700">
            <Globe className="h-3.5 w-3.5" /> Pull logo + colors from a site
          </div>
          <div className="relative">
            <input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') run()
                if (e.key === 'Escape') setOpen(false)
              }}
              placeholder="yourbrand.com"
              spellCheck={false}
              className="w-full rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={run}
              disabled={busy || url.trim().length < 4}
              className="flex-1 rounded-md bg-ink-900 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-ink-700 disabled:opacity-50"
            >
              {busy ? 'Importing…' : 'Import'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-ink-300 px-3 py-1.5 text-[12px] font-semibold text-ink-700 hover:bg-ink-50"
            >
              Cancel
            </button>
          </div>
          <p className="text-[10px] text-ink-400">Best-effort: pulls the site icon + theme colors. Review and tweak below.</p>
        </div>
      )}
      {msg && (
        <p className={`mt-2 text-[10.5px] ${msg.kind === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</p>
      )}
    </div>
  )
}

const HEX = /^#[0-9a-fA-F]{6}$/

// ============================================================================ Logos
const LOGO_SLOTS: { key: LogoVariant; label: string }[] = [
  { key: 'PRIMARY', label: 'Primary' },
  { key: 'ICON', label: 'Icon' },
  { key: 'HORIZONTAL', label: 'Lockup' },
]

export function LogosCompact({
  brandId,
  initial,
  onChanged,
}: {
  brandId: string
  initial: { primary: StudioAssetSummary | null; icon: StudioAssetSummary | null; horizontal: StudioAssetSummary | null }
  onChanged: () => void
}) {
  const byKey: Record<LogoVariant, StudioAssetSummary | null> = {
    PRIMARY: initial.primary,
    ICON: initial.icon,
    HORIZONTAL: initial.horizontal,
  }
  const [busy, setBusy] = React.useState<LogoVariant | null>(null)
  const [err, setErr] = React.useState<string | null>(null)

  async function upload(variant: LogoVariant, file: File) {
    setErr(null)
    setBusy(variant)
    const fd = new FormData()
    fd.set('brandId', brandId)
    fd.set('variant', variant)
    fd.set('file', file)
    const res = await uploadLogoVariant(fd)
    setBusy(null)
    if (!res.ok) setErr(res.error)
    else onChanged()
  }

  async function remove(variant: LogoVariant) {
    setBusy(variant)
    const res = await removeLogoVariant({ brandId, variant })
    setBusy(null)
    if (!res.ok) setErr(res.error)
    else onChanged()
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {LOGO_SLOTS.map(({ key, label }) => {
          const asset = byKey[key]
          const isBusy = busy === key
          return (
            <div key={key} className="space-y-1">
              <div className="group relative aspect-square overflow-hidden rounded-md border border-ink-200 bg-ink-50">
                {asset?.publicUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset.publicUrl} alt={label} className="absolute inset-1 h-[calc(100%-0.5rem)] w-[calc(100%-0.5rem)] object-contain" />
                    <button
                      type="button"
                      onClick={() => remove(key)}
                      aria-label={`Remove ${label}`}
                      className="absolute right-0.5 top-0.5 hidden h-4 w-4 items-center justify-center rounded-full bg-white/90 text-ink-500 shadow-sm hover:text-red-600 group-hover:flex"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </>
                ) : asset ? (
                  <span className="absolute inset-0 flex items-center justify-center text-emerald-600"><Check className="h-4 w-4" /></span>
                ) : (
                  <label className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center text-ink-400 hover:text-pink-600">
                    <Upload className="h-4 w-4" />
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) upload(key, f)
                        e.currentTarget.value = ''
                      }}
                    />
                  </label>
                )}
                {isBusy && <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-[10px] font-semibold text-ink-600">…</span>}
              </div>
              <div className="text-center text-[9.5px] font-semibold uppercase tracking-wide text-ink-500">{label}</div>
            </div>
          )
        })}
      </div>
      {err && <p className="text-[10.5px] text-red-600">{err}</p>}
    </div>
  )
}

// =========================================================================== Colors
function ColorPopover({
  value,
  onApply,
  onRemove,
  onClose,
}: {
  value: string
  onApply: (hex: string) => void
  onRemove?: () => void
  onClose: () => void
}) {
  const [hex, setHex] = React.useState(value || '#000000')
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])
  const valid = HEX.test(hex)
  return (
    <div ref={ref} className="absolute left-0 top-9 z-40 w-44 rounded-lg border border-ink-200 bg-white p-2 shadow-lg">
      <input
        type="color"
        value={valid ? hex : '#000000'}
        onChange={(e) => setHex(e.target.value.toUpperCase())}
        className="h-9 w-full cursor-pointer rounded border border-ink-200 bg-white p-0.5"
      />
      <input
        value={hex}
        onChange={(e) => setHex(e.target.value.toUpperCase())}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && valid) onApply(hex)
        }}
        placeholder="#RRGGBB"
        spellCheck={false}
        className="mt-1.5 w-full rounded border border-ink-200 px-2 py-1 font-mono text-[12px] uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
      />
      <div className="mt-1.5 flex gap-1.5">
        <button
          type="button"
          onClick={() => valid && onApply(hex)}
          disabled={!valid}
          className="flex-1 rounded bg-ink-900 py-1 text-[11px] font-semibold text-white hover:bg-ink-700 disabled:opacity-40"
        >
          Apply
        </button>
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label="Remove color" className="rounded border border-ink-200 px-2 text-ink-500 hover:text-red-600">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function Swatch({ color, label, open, onToggle }: { color: string | null; label?: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={color ?? 'Set color'}
      className={`relative h-8 w-8 rounded-md border ${open ? 'border-pink-400 ring-2 ring-pink-200' : 'border-ink-200'} ${color ? 'shadow-sm' : 'border-dashed bg-white'}`}
      style={color ? { backgroundColor: color } : undefined}
    >
      {!color && <Plus className="absolute inset-0 m-auto h-3.5 w-3.5 text-ink-400" />}
      {label && <span className="sr-only">{label}</span>}
    </button>
  )
}

export function ColorsCompact({
  brandId,
  initial,
}: {
  brandId: string
  initial: { colorPrimary: string | null; colorSecondary: string | null; colorAccent: string | null; brandSwatches: string[] }
}) {
  const [primary, setPrimary] = React.useState(initial.colorPrimary)
  const [secondary, setSecondary] = React.useState(initial.colorSecondary)
  const [accent, setAccent] = React.useState(initial.colorAccent)
  const [extras, setExtras] = React.useState<string[]>(initial.brandSwatches)
  const [openKey, setOpenKey] = React.useState<string | null>(null)
  const [err, setErr] = React.useState<string | null>(null)

  async function persist(next: { p: string | null; s: string | null; a: string | null; e: string[] }) {
    setErr(null)
    const res = await setBrandColors({
      brandId,
      colorPrimary: next.p,
      colorSecondary: next.s,
      colorAccent: next.a,
      brandSwatches: next.e,
    })
    if (!res.ok) setErr(res.error)
  }

  const named: { key: 'primary' | 'secondary' | 'accent'; label: string; value: string | null; set: (v: string | null) => void }[] = [
    { key: 'primary', label: 'Primary', value: primary, set: setPrimary },
    { key: 'secondary', label: 'Secondary', value: secondary, set: setSecondary },
    { key: 'accent', label: 'Accent', value: accent, set: setAccent },
  ]

  function snapshot(over: Partial<{ p: string | null; s: string | null; a: string | null; e: string[] }>) {
    return { p: primary, s: secondary, a: accent, e: extras, ...over }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        {named.map((n) => (
          <div key={n.key} className="relative space-y-1">
            <Swatch color={n.value} label={n.label} open={openKey === n.key} onToggle={() => setOpenKey(openKey === n.key ? null : n.key)} />
            <div className="text-center text-[9.5px] font-semibold uppercase tracking-wide text-ink-500">{n.label}</div>
            {openKey === n.key && (
              <ColorPopover
                value={n.value ?? '#000000'}
                onClose={() => setOpenKey(null)}
                onRemove={n.value ? () => { n.set(null); persist(snapshot({ [n.key === 'primary' ? 'p' : n.key === 'secondary' ? 's' : 'a']: null })); setOpenKey(null) } : undefined}
                onApply={(hex) => {
                  n.set(hex)
                  persist(snapshot({ [n.key === 'primary' ? 'p' : n.key === 'secondary' ? 's' : 'a']: hex }))
                  setOpenKey(null)
                }}
              />
            )}
          </div>
        ))}
      </div>

      <div>
        <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wide text-ink-400">Extra swatches</div>
        <div className="flex flex-wrap gap-2">
          {extras.map((c, i) => (
            <div key={`${c}-${i}`} className="relative">
              <Swatch color={c} open={openKey === `e${i}`} onToggle={() => setOpenKey(openKey === `e${i}` ? null : `e${i}`)} />
              {openKey === `e${i}` && (
                <ColorPopover
                  value={c}
                  onClose={() => setOpenKey(null)}
                  onRemove={() => { const e = extras.filter((_, j) => j !== i); setExtras(e); persist(snapshot({ e })); setOpenKey(null) }}
                  onApply={(hex) => { const e = extras.map((x, j) => (j === i ? hex : x)); setExtras(e); persist(snapshot({ e })); setOpenKey(null) }}
                />
              )}
            </div>
          ))}
          {extras.length < 2 && (
            <div className="relative">
              <Swatch color={null} open={openKey === 'new'} onToggle={() => setOpenKey(openKey === 'new' ? null : 'new')} />
              {openKey === 'new' && (
                <ColorPopover
                  value="#000000"
                  onClose={() => setOpenKey(null)}
                  onApply={(hex) => { const e = [...extras, hex].slice(0, 2); setExtras(e); persist(snapshot({ e })); setOpenKey(null) }}
                />
              )}
            </div>
          )}
        </div>
      </div>
      {err && <p className="text-[10.5px] text-red-600">{err}</p>}
    </div>
  )
}

// ============================================================================ Fonts
export function FontsCompact({
  brandId,
  selected,
  catalog,
  customFonts = [],
  canUploadCustomFonts = false,
}: {
  brandId: string
  selected: string[]
  catalog: StudioFontOption[]
  customFonts?: StudioCustomFont[]
  canUploadCustomFonts?: boolean
}) {
  const [ids, setIds] = React.useState<string[]>(selected)
  const [query, setQuery] = React.useState('')
  const [err, setErr] = React.useState<string | null>(null)
  // Local custom-font list (the Studio drawer has no easy server refresh — append on
  // upload, drop on delete). Maps ref → family for chip display + selection.
  const [customs, setCustoms] = React.useState<StudioCustomFont[]>(customFonts)
  const [upName, setUpName] = React.useState('')
  const [upFile, setUpFile] = React.useState<File | null>(null)
  const [upLicense, setUpLicense] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)

  const byId = React.useMemo(() => {
    const m = new Map<string, { family: string }>(catalog.map((f) => [f.id, { family: f.family }]))
    for (const c of customs) m.set(c.ref, { family: c.family })
    return m
  }, [catalog, customs])

  // Register uploaded fonts so chips/previews render in their real face.
  React.useEffect(() => {
    for (const c of customs) if (c.webUrl) void loadCustomFont(c.family, c.webUrl)
  }, [customs])

  async function persist(next: string[]) {
    setErr(null)
    const res = await setBrandFonts({ brandId, brandFontIds: next })
    if (!res.ok) setErr(res.error)
  }
  function add(id: string) {
    if (ids.includes(id) || ids.length >= 3) return
    const next = [...ids, id]
    setIds(next)
    persist(next)
  }
  function remove(id: string) {
    const next = ids.filter((x) => x !== id)
    setIds(next)
    persist(next)
  }

  async function onUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!upFile) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.set('brandId', brandId)
      fd.set('family', upName)
      fd.set('licenseAttested', upLicense ? 'true' : 'false')
      fd.set('file', upFile)
      const res = await uploadBrandFont(fd)
      if (!res.ok) {
        setErr(res.error)
        return
      }
      // Append locally; webUrl unknown client-side until reopen — name shows immediately.
      setCustoms((prev) => [
        { ref: `custom:${res.fontId}`, id: res.fontId, family: res.family, webUrl: null },
        ...prev,
      ])
      setUpName('')
      setUpFile(null)
      setUpLicense(false)
      setErr(null)
    } finally {
      setUploading(false)
    }
  }

  async function deleteCustom(c: StudioCustomFont) {
    const res = await removeBrandFont({ brandId, fontId: c.id })
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setCustoms((prev) => prev.filter((x) => x.ref !== c.ref))
    setIds((prev) => prev.filter((x) => x !== c.ref))
  }

  const results = catalog
    .filter((f) => !ids.includes(f.id) && f.family.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 30)

  return (
    <div className="space-y-2">
      {ids.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {ids.map((id) => {
            const f = byId.get(id)
            return (
              <span key={id} className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white py-0.5 pl-2 pr-1 text-[12px] text-ink-800" style={f ? { fontFamily: f.family } : undefined}>
                {f?.family ?? id}
                <button type="button" onClick={() => remove(id)} aria-label="Remove font" className="text-ink-400 hover:text-red-600"><X className="h-3 w-3" /></button>
              </span>
            )
          })}
        </div>
      )}

      {/* Your uploaded fonts + upload (Slice 2b). */}
      <div className="rounded-md border border-ink-100 bg-ink-50/50 p-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-500">
          Your brand fonts
        </div>
        {customs.length > 0 && (
          <div className="mb-1.5 space-y-1">
            {customs.map((c) => {
              const isSel = ids.includes(c.ref)
              return (
                <div key={c.ref} className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => (isSel ? remove(c.ref) : add(c.ref))}
                    className="flex min-w-0 items-center gap-1 text-left"
                  >
                    {isSel && <Check className="h-3 w-3 flex-shrink-0 text-emerald-600" />}
                    <span className="truncate text-[12px] text-ink-800" style={{ fontFamily: c.family }}>
                      {c.family}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteCustom(c)}
                    aria-label={`Delete ${c.family}`}
                    className="text-ink-400 hover:text-red-600"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
        {canUploadCustomFonts ? (
          <form onSubmit={onUpload} className="space-y-1.5">
            <input
              value={upName}
              onChange={(e) => setUpName(e.target.value)}
              placeholder="Font name"
              disabled={uploading}
              className="w-full rounded border border-ink-200 bg-white px-2 py-1 text-[11.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            />
            <input
              type="file"
              accept=".woff2,.woff,.ttf,.otf"
              onChange={(e) => setUpFile(e.target.files?.[0] ?? null)}
              disabled={uploading}
              className="w-full text-[10.5px] text-ink-600 file:mr-1.5 file:rounded file:border file:border-ink-200 file:bg-white file:px-1.5 file:py-0.5 file:text-[10.5px]"
            />
            <label className="flex items-start gap-1 text-[10px] text-ink-500">
              <input type="checkbox" checked={upLicense} onChange={(e) => setUpLicense(e.target.checked)} disabled={uploading} className="mt-0.5" />
              <span>I have the right to use &amp; embed this font.</span>
            </label>
            <button
              type="submit"
              disabled={uploading || !upFile || !upName.trim() || !upLicense}
              className="inline-flex items-center gap-1 rounded-md bg-ink-900 px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-40"
            >
              <Upload className="h-3 w-3" /> {uploading ? 'Uploading…' : 'Upload a font'}
            </button>
          </form>
        ) : (
          <p className="text-[10.5px] text-ink-500">
            Upload your own fonts on <strong>Builder</strong> &amp; <strong>Agency</strong> plans.
          </p>
        )}
      </div>
      {ids.length < 3 ? (
        <>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Add a font…"
              className="w-full rounded-md border border-ink-200 bg-white py-1.5 pl-7 pr-2 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            />
          </div>
          <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border border-ink-100 p-1">
            {results.length === 0 ? (
              <p className="px-2 py-2 text-[11px] text-ink-400">No matches.</p>
            ) : (
              results.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => add(f.id)}
                  className="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-pink-50"
                >
                  <span className="text-[12.5px] text-ink-800" style={{ fontFamily: f.family }}>{f.family}</span>
                  <span className="text-[9px] uppercase tracking-wide text-ink-400">{f.weight}{f.style !== 'Normal' ? ` · ${f.style}` : ''}</span>
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        <p className="text-[10.5px] text-ink-400">Up to 3 brand fonts. Remove one to add another.</p>
      )}
      {err && <p className="text-[10.5px] text-red-600">{err}</p>}
    </div>
  )
}

// ========================================================================== Tagline
export function TaglineCompact({ brandId, initial }: { brandId: string; initial: string | null }) {
  const [tagline, setTagline] = React.useState(initial ?? '')
  const [err, setErr] = React.useState<string | null>(null)
  async function commit() {
    if (tagline === (initial ?? '')) return
    const res = await setBrandTagline({ brandId, tagline })
    if (!res.ok) setErr(res.error)
  }
  return (
    <div className="space-y-1">
      <input
        value={tagline}
        onChange={(e) => setTagline(e.target.value)}
        onBlur={commit}
        maxLength={120}
        placeholder="Your brand line…"
        className="w-full rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
      />
      <div className="text-right text-[10px] text-ink-400">{tagline.length} / 120</div>
      {err && <p className="text-[10.5px] text-red-600">{err}</p>}
    </div>
  )
}
