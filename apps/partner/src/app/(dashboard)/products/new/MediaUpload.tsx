'use client'

// Product media — hero + up to 6 images + 1 video (8 total). Real R2 uploads via
// uploadProductMedia; resolves existing media on load. Rendered in GuidedBuilder's
// `.gb` scope (Basics step). Reuses .imgslot styles.
//
// Upload-before-draft (Pavel 2026-07-27): the card is ALWAYS available. Files
// picked before the draft exists are queued locally (instant object-URL preview,
// "Queued" badge) and auto-upload the moment the draft is created by the Basics
// autosave (name + category). The server action still needs a draft row: the R2
// key, the Asset owner and the hero/gallery/video columns all hang off
// ProductTemplate, so queuing client-side is the seam that keeps the action
// untouched. Queued files live in memory only: a reload before the draft saves
// drops them (previewed, never persisted), which the hint says explicitly.

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ImagePlus } from 'lucide-react'
import { loadMedia, uploadProductMedia, removeProductMedia, type MediaData, type MediaSlot } from './build-actions'
import { Section } from './_ui'

const IMG_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

interface PendingItem { id: string; slot: MediaSlot; file: File; preview: string }

export function MediaUpload({ draftId }: { draftId: string | null }) {
  const [media, setMedia] = useState<MediaData>({ hero: null, gallery: [], video: null })
  const [pending, setPending] = useState<PendingItem[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [, start] = useTransition()

  const refresh = useCallback(() => { if (draftId) void loadMedia(draftId).then(setMedia) }, [draftId])
  useEffect(() => { refresh() }, [refresh])

  /** Client-side mirror of the server checks so a queued file never fails late. */
  function validate(slot: MediaSlot, file: File): string | null {
    const isVideo = slot === 'video'
    if (isVideo ? !file.type.startsWith('video/') : !IMG_MIME.has(file.type)) {
      return isVideo ? 'Upload a video file (MP4/WebM).' : 'Upload a PNG, JPEG, WebP, or GIF.'
    }
    const MAX = isVideo ? 100 * 1024 * 1024 : 15 * 1024 * 1024
    if (file.size > MAX) return `File too large (max ${isVideo ? '100' : '15'} MB).`
    return null
  }

  function doUpload(slot: MediaSlot, file: File, key: string, id: string) {
    const fd = new FormData()
    fd.set('productTemplateId', id); fd.set('slot', slot); fd.set('file', file)
    setBusy(key)
    start(async () => {
      const r = await uploadProductMedia(fd); setBusy(null)
      if (!r.ok) { toast.error(r.error ?? 'Upload failed'); return }
      toast.success('Uploaded'); refresh()
    })
  }

  function up(slot: MediaSlot, file: File | undefined, key: string) {
    if (!file) return
    const bad = validate(slot, file)
    if (bad) { toast.error(bad); return }
    if (draftId) { doUpload(slot, file, key, draftId); return }
    // No draft yet: queue with a local preview; the effect below flushes the
    // queue automatically as soon as the Basics autosave creates the draft.
    setPending((p) => [...p, { id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, slot, file, preview: URL.createObjectURL(file) }])
  }

  function unqueue(id: string) {
    setPending((p) => {
      const item = p.find((x) => x.id === id)
      if (item) URL.revokeObjectURL(item.preview)
      return p.filter((x) => x.id !== id)
    })
  }

  // Flush the queue once the draft exists. Sequential on purpose: gallery
  // uploads read-modify-write galleryAssetIds, so parallel calls could drop one.
  const flushing = useRef(false)
  useEffect(() => {
    if (!draftId || pending.length === 0 || flushing.current) return
    flushing.current = true
    const items = pending
    void (async () => {
      let failed = 0
      for (const item of items) {
        setBusy(item.id)
        const fd = new FormData()
        fd.set('productTemplateId', draftId); fd.set('slot', item.slot); fd.set('file', item.file)
        const r = await uploadProductMedia(fd)
        if (!r.ok) { failed += 1; toast.error(r.error ?? 'Upload failed') }
        URL.revokeObjectURL(item.preview)
        setPending((p) => p.filter((x) => x.id !== item.id))
      }
      setBusy(null)
      flushing.current = false
      if (failed === 0) toast.success(items.length > 1 ? `${items.length} files uploaded` : 'Uploaded')
      refresh()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, pending.length])

  // Revoke any leftover previews on unmount.
  useEffect(() => () => { pending.forEach((p) => URL.revokeObjectURL(p.preview)) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function remove(slot: MediaSlot, assetId: string) {
    if (!draftId) return
    setBusy(assetId)
    start(async () => {
      const r = await removeProductMedia(draftId, slot, assetId); setBusy(null)
      if (!r.ok) { toast.error(r.error ?? 'Could not remove'); return }
      refresh()
    })
  }

  const pendingHero = pending.find((p) => p.slot === 'hero') ?? null
  const pendingVideo = pending.find((p) => p.slot === 'video') ?? null
  const pendingGallery = pending.filter((p) => p.slot === 'gallery')
  const galleryEmpty = Math.max(0, 6 - media.gallery.length - pendingGallery.length)

  return (
    <Section icon={ImagePlus} title="Media">
      {/* Hero */}
      <div style={{ position: 'relative', marginTop: 10 }}>
        {media.hero ? (
          <>
            <img src={media.hero.url} alt="Hero" className="imgfilled" style={{ aspectRatio: '16/10' }} />
            <button className="imgx" onClick={() => remove('hero', media.hero!.assetId)} disabled={busy === media.hero.assetId}>✕</button>
          </>
        ) : pendingHero ? (
          <>
            <img src={pendingHero.preview} alt="Hero (queued)" className="imgfilled queued" style={{ aspectRatio: '16/10' }} />
            <span className="imgq">{busy === pendingHero.id ? 'Uploading…' : 'Queued'}</span>
            <button className="imgx" onClick={() => unqueue(pendingHero.id)} disabled={busy === pendingHero.id}>✕</button>
          </>
        ) : (
          <label className="imgslot" style={{ aspectRatio: '16/10', background: '#f5e9ee', cursor: 'pointer' }}>
            <input type="file" accept="image/*" hidden onChange={(e) => up('hero', e.target.files?.[0], 'hero')} />
            {busy === 'hero' ? 'Uploading…' : '＋ Hero image'}
          </label>
        )}
      </div>

      {/* 6 images + video */}
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr', marginTop: 8 }}>
        {media.gallery.map((g) => (
          <div key={g.assetId} style={{ position: 'relative' }}>
            <img src={g.url} alt="" className="imgfilled" style={{ aspectRatio: 1 }} />
            <button className="imgx" onClick={() => remove('gallery', g.assetId)} disabled={busy === g.assetId}>✕</button>
          </div>
        ))}
        {pendingGallery.map((g) => (
          <div key={g.id} style={{ position: 'relative' }}>
            <img src={g.preview} alt="" className="imgfilled queued" style={{ aspectRatio: 1 }} />
            <span className="imgq">{busy === g.id ? '…' : 'Queued'}</span>
            <button className="imgx" onClick={() => unqueue(g.id)} disabled={busy === g.id}>✕</button>
          </div>
        ))}
        {Array.from({ length: galleryEmpty }).map((_, i) => (
          <label key={`e${i}`} className="imgslot" style={{ aspectRatio: 1, cursor: 'pointer' }}>
            <input type="file" accept="image/*" hidden onChange={(e) => up('gallery', e.target.files?.[0], `g${i}`)} />
            {busy === `g${i}` ? '…' : '＋'}
          </label>
        ))}
        {/* Video */}
        {media.video ? (
          <div style={{ position: 'relative' }}>
            <video src={media.video.url} className="imgfilled" style={{ aspectRatio: 1, objectFit: 'cover' }} muted />
            <button className="imgx" onClick={() => remove('video', media.video!.assetId)} disabled={busy === media.video.assetId}>✕</button>
          </div>
        ) : pendingVideo ? (
          <div style={{ position: 'relative' }}>
            <video src={pendingVideo.preview} className="imgfilled queued" style={{ aspectRatio: 1, objectFit: 'cover' }} muted />
            <span className="imgq">{busy === pendingVideo.id ? '…' : 'Queued'}</span>
            <button className="imgx" onClick={() => unqueue(pendingVideo.id)} disabled={busy === pendingVideo.id}>✕</button>
          </div>
        ) : (
          <label className="imgslot video" style={{ aspectRatio: 1, cursor: 'pointer' }}>
            <input type="file" accept="video/*" hidden onChange={(e) => up('video', e.target.files?.[0], 'video')} />
            {busy === 'video' ? '…' : '▶ Video'}
          </label>
        )}
      </div>
      <p className="tiny muted" style={{ marginTop: 8 }}>
        First image = marketplace hero · up to 6 photos + 1 video.
        {!draftId && pending.length > 0 && ' Queued files upload automatically once the draft saves (name + category). Keep this page open until then.'}
      </p>

      <style>{`
        .gb .imgfilled{width:100%;border-radius:12px;object-fit:cover;display:block;border:1px solid var(--ink-200)}
        .gb .imgfilled.queued{opacity:.8;border-style:dashed;border-color:var(--pink-100)}
        .gb .imgq{position:absolute;left:6px;bottom:6px;border-radius:999px;background:rgba(20,20,26,.65);color:#fff;font-size:10px;font-weight:600;padding:2px 8px;pointer-events:none}
        .gb .imgx{position:absolute;top:5px;right:5px;width:22px;height:22px;border-radius:50%;border:0;background:rgba(20,20,26,.6);color:#fff;font-size:11px;cursor:pointer;display:grid;place-items:center}
        .gb .imgx:hover{background:rgba(20,20,26,.85)} .gb .imgx:disabled{opacity:.5}
      `}</style>
    </Section>
  )
}
