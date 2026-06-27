'use client'

// Product media — hero + up to 6 images + 1 video (8 total). Real R2 uploads via
// uploadProductMedia; resolves existing media on load. Rendered in GuidedBuilder's
// `.gb` scope (Basics step). Reuses .imgslot styles.

import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { loadMedia, uploadProductMedia, removeProductMedia, type MediaData, type MediaSlot } from './build-actions'

export function MediaUpload({ draftId }: { draftId: string | null }) {
  const [media, setMedia] = useState<MediaData>({ hero: null, gallery: [], video: null })
  const [busy, setBusy] = useState<string | null>(null)
  const [, start] = useTransition()

  const refresh = useCallback(() => { if (draftId) void loadMedia(draftId).then(setMedia) }, [draftId])
  useEffect(() => { refresh() }, [refresh])

  function up(slot: MediaSlot, file: File | undefined, key: string) {
    if (!file || !draftId) return
    const fd = new FormData()
    fd.set('productTemplateId', draftId); fd.set('slot', slot); fd.set('file', file)
    setBusy(key)
    start(async () => {
      const r = await uploadProductMedia(fd); setBusy(null)
      if (!r.ok) { toast.error(r.error ?? 'Upload failed'); return }
      toast.success('Uploaded'); refresh()
    })
  }
  function remove(slot: MediaSlot, assetId: string) {
    if (!draftId) return
    setBusy(assetId)
    start(async () => {
      const r = await removeProductMedia(draftId, slot, assetId); setBusy(null)
      if (!r.ok) { toast.error(r.error ?? 'Could not remove'); return }
      refresh()
    })
  }

  const galleryEmpty = Math.max(0, 6 - media.gallery.length)

  if (!draftId) {
    return (
      <div className="card">
        <div className="eyebrow">Media</div>
        <p className="tiny muted" style={{ marginTop: 8 }}>Save the draft (name + category) to upload media.</p>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="eyebrow">Media</div>

      {/* Hero */}
      <div style={{ position: 'relative', marginTop: 10 }}>
        {media.hero ? (
          <>
            <img src={media.hero.url} alt="Hero" className="imgfilled" style={{ aspectRatio: '16/10' }} />
            <button className="imgx" onClick={() => remove('hero', media.hero!.assetId)} disabled={busy === media.hero.assetId}>✕</button>
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
        ) : (
          <label className="imgslot video" style={{ aspectRatio: 1, cursor: 'pointer' }}>
            <input type="file" accept="video/*" hidden onChange={(e) => up('video', e.target.files?.[0], 'video')} />
            {busy === 'video' ? '…' : '▶ Video'}
          </label>
        )}
      </div>
      <p className="tiny muted" style={{ marginTop: 8 }}>First image = marketplace hero · up to 6 photos + 1 video.</p>

      <style>{`
        .gb .imgfilled{width:100%;border-radius:12px;object-fit:cover;display:block;border:1px solid var(--ink-200)}
        .gb .imgx{position:absolute;top:5px;right:5px;width:22px;height:22px;border-radius:50%;border:0;background:rgba(20,20,26,.6);color:#fff;font-size:11px;cursor:pointer;display:grid;place-items:center}
        .gb .imgx:hover{background:rgba(20,20,26,.85)} .gb .imgx:disabled{opacity:.5}
      `}</style>
    </div>
  )
}
