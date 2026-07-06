'use client'

// Branding form + live shell preview (server-action rendered — the preview
// path IS the send path). Props avoid importing @ilaunchify/notifications in
// the client bundle (the package index pulls prisma/resend).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { saveBranding, previewBranding, type BrandingInput } from './actions'

interface BrandingView extends BrandingInput {}

export function BrandingForm({
  initial,
  initialPreviewHtml,
  placementLogoUrl = null,
}: {
  initial: BrandingView
  initialPreviewHtml: string
  /** Theme Studio 'Email header' placement logo — the fallback when Logo URL is empty. */
  placementLogoUrl?: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState<BrandingView>(initial)
  const [previewHtml, setPreviewHtml] = useState(initialPreviewHtml)

  function set<K extends keyof BrandingView>(key: K, value: BrandingView[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function refreshPreview() {
    startTransition(async () => {
      const r = await previewBranding(form)
      setPreviewHtml(r.html)
    })
  }

  function save() {
    startTransition(async () => {
      const r = await saveBranding(form)
      if (r.ok) {
        toast.success('Branding saved — every email uses it from the next send')
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  const inputCls =
    'mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200'
  const label = 'block text-[12px] font-medium text-ink-700'

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr),minmax(0,6fr)]">
      <section className="rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="font-display text-[15px] font-semibold text-ink-900">Global chrome</h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Brand name
            <input value={form.brandName} onChange={(e) => set('brandName', e.target.value)} className={inputCls} />
          </label>
          <label className={label}>
            Logo URL (https, optional)
            <input
              value={form.logoUrl ?? ''}
              onChange={(e) => set('logoUrl', e.target.value || null)}
              placeholder={placementLogoUrl ? 'Using the Theme Studio logo' : 'Text header when empty'}
              className={inputCls}
            />
            <span className="mt-1 block text-[11px] font-normal text-ink-500">
              {placementLogoUrl ? (
                <>
                  Empty = the{' '}
                  <a href="/theme-studio/logos" className="text-pink-700 underline underline-offset-2">
                    Theme Studio “Email header” logo
                  </a>{' '}
                  (currently set). Fill this only to override it for emails.
                </>
              ) : (
                <>
                  Empty = text header. Tip: upload a logo in{' '}
                  <a href="/theme-studio/logos" className="text-pink-700 underline underline-offset-2">
                    Theme Studio → Logos
                  </a>{' '}
                  and emails pick it up automatically (needs R2_PUBLIC_BASE_URL for a stable URL).
                </>
              )}
            </span>
          </label>
          <label className={label}>
            Accent color
            <div className="mt-1 flex items-center gap-2">
              <input type="color" value={form.accentHex} onChange={(e) => set('accentHex', e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-ink-200" aria-label="Accent color picker" />
              <input value={form.accentHex} onChange={(e) => set('accentHex', e.target.value)} className={`${inputCls} mt-0`} />
            </div>
          </label>
          <label className={label}>
            Ink (text) color
            <div className="mt-1 flex items-center gap-2">
              <input type="color" value={form.inkHex} onChange={(e) => set('inkHex', e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-ink-200" aria-label="Ink color picker" />
              <input value={form.inkHex} onChange={(e) => set('inkHex', e.target.value)} className={`${inputCls} mt-0`} />
            </div>
          </label>
        </div>

        <label className={`${label} mt-3`}>
          Footer text (address / legal line, optional)
          <textarea value={form.footerText ?? ''} onChange={(e) => set('footerText', e.target.value || null)} rows={2} className={inputCls} />
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Unsubscribe link text
            <input value={form.unsubscribeText} onChange={(e) => set('unsubscribeText', e.target.value)} className={inputCls} />
          </label>
          <label className={label}>
            Preferences link text
            <input value={form.preferencesText} onChange={(e) => set('preferencesText', e.target.value)} className={inputCls} />
          </label>
        </div>
        <label className={`${label} mt-3`}>
          Preference center URL
          <input value={form.preferenceCenterUrl ?? ''} onChange={(e) => set('preferenceCenterUrl', e.target.value || null)} placeholder="https://app.ilaunchify.com/settings/notifications" className={inputCls} />
        </label>

        {/* Header nav links (Stage 4) — Amazon-style row under the logo, per audience */}
        <div className="mt-4">
          <div className="text-[12px] font-medium text-ink-700">Header nav links (max 4 per audience)</div>
          <p className="mt-0.5 text-[11px] text-ink-500">
            Slim link row under the logo — e.g. creator: My orders / Products / Support. Preview
            shows the creator set.
          </p>
          {(['creator', 'partner', 'admin'] as const).map((aud) => {
            const rows = form.headerLinks?.[aud] ?? []
            const setRows = (next: Array<{ label: string; url: string }>) =>
              set('headerLinks', { ...(form.headerLinks ?? {}), [aud]: next })
            return (
              <div key={aud} className="mt-2 rounded-xl border border-ink-100 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-ink-500">{aud}</span>
                  {rows.length < 4 && (
                    <button
                      type="button"
                      onClick={() => setRows([...rows, { label: '', url: '' }])}
                      className="text-[11.5px] font-medium text-pink-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                    >
                      + Add link
                    </button>
                  )}
                </div>
                {rows.map((l, i) => (
                  <div key={i} className="mt-2 flex gap-2">
                    <input
                      value={l.label}
                      onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))}
                      placeholder="Label"
                      maxLength={30}
                      className={`${inputCls} mt-0 w-36`}
                    />
                    <input
                      value={l.url}
                      onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, url: e.target.value } : r)))}
                      placeholder="https://…"
                      className={`${inputCls} mt-0 flex-1`}
                    />
                    <button
                      type="button"
                      onClick={() => setRows(rows.filter((_, j) => j !== i))}
                      aria-label={`Remove ${aud} link ${i + 1}`}
                      className="shrink-0 rounded-lg border border-ink-200 px-2 text-[12px] text-ink-500 hover:border-danger-600 hover:text-danger-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className={label}>
            From name
            <input value={form.fromName ?? ''} onChange={(e) => set('fromName', e.target.value || null)} placeholder="iLaunchify" className={inputCls} />
          </label>
          <label className={label}>
            Reply-to email
            <input value={form.replyToEmail ?? ''} onChange={(e) => set('replyToEmail', e.target.value || null)} placeholder="support@ilaunchify.com" className={inputCls} />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={refreshPreview}
            className="rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-[12px] font-medium text-ink-700 hover:border-ink-400 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            Refresh preview
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={save}
            className="rounded-full bg-ink-900 px-4 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            Save branding
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="font-display text-[15px] font-semibold text-ink-900">Preview</h2>
        <p className="mt-1 text-[12px] text-ink-600">
          A sample notification inside your chrome — the body itself comes from each event's template.
        </p>
        <iframe
          title="Branding preview"
          sandbox=""
          srcDoc={previewHtml}
          className="mt-3 w-full rounded-lg border border-ink-200 bg-white"
          style={{ height: 560 }}
        />
      </section>
    </div>
  )
}
