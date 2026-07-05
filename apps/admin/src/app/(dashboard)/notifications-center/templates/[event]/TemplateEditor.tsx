'use client'

// Template editor client — draft form + token palette + live preview
// (EmailTemplatePreviewCard) + publish / rollback / revert / kill-switch /
// test-send. Preview refreshes via the previewTemplate server action so the
// rendering path is EXACTLY the send path (same resolver, same branding).

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { NotificationEvent } from '@ilaunchify/db'
import {
  EmailTemplatePreviewCard,
  TokenPaletteRow,
  type EmailTemplatePreviewContent,
} from '@ilaunchify/ui'
import {
  saveTemplateDraft,
  publishTemplate,
  rollbackTemplate,
  revertToCodeTemplate,
  setTemplateEnabled,
  previewTemplate,
  testSendTemplate,
  type TemplateDraftInput,
} from '../actions'

type CtaMode = 'AUTO' | 'CUSTOM' | 'NONE'

export interface TemplateRowView {
  enabled: boolean
  subjectOverride: string | null
  bodyMarkdown: string | null
  ctaMode: CtaMode
  ctaLabelOverride: string | null
  status: 'DRAFT' | 'PUBLISHED'
  version: number
}

export function TemplateEditor({
  event,
  tokens,
  row,
  versions,
  initialPreview,
}: {
  event: NotificationEvent
  tokens: string[]
  row: TemplateRowView | null
  versions: Array<{ version: number; publishedAt: string }>
  initialPreview: EmailTemplatePreviewContent
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [subject, setSubject] = useState(row?.subjectOverride ?? '')
  const [body, setBody] = useState(row?.bodyMarkdown ?? '')
  const [ctaMode, setCtaMode] = useState<CtaMode>(row?.ctaMode ?? 'AUTO')
  const [ctaLabel, setCtaLabel] = useState(row?.ctaLabelOverride ?? '')
  const [preview, setPreview] = useState<EmailTemplatePreviewContent>(initialPreview)
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)

  const customized = !!(subject || body || ctaMode !== 'AUTO')
  const live = row?.status === 'PUBLISHED'

  function draft(): TemplateDraftInput {
    return {
      event,
      subjectOverride: subject || null,
      bodyMarkdown: body || null,
      ctaMode,
      ctaLabelOverride: ctaLabel || null,
    }
  }

  function refreshPreview() {
    startTransition(async () => {
      const r = await previewTemplate(draft())
      if (r.ok) setPreview(r.preview)
      else toast.error(r.error)
    })
  }

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okMsg: string) {
    startTransition(async () => {
      const r = await fn()
      if (r.ok) {
        toast.success(okMsg)
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  function insertToken(t: string) {
    const el = bodyRef.current
    if (!el) {
      setBody((b) => b + t)
      return
    }
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? start
    setBody((b) => b.slice(0, start) + t + b.slice(end))
  }

  const inputCls =
    'mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200'
  const btn =
    'rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-50'

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr),minmax(0,6fr)]">
      {/* ---- Editor column -------------------------------------------------- */}
      <div className="space-y-4">
        <section className="rounded-2xl border border-ink-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-[15px] font-semibold text-ink-900">Body override</h2>
            <div className="flex items-center gap-2 text-[12px]">
              {live && (
                <span className="rounded bg-pink-50 px-1.5 py-0.5 text-[10.5px] font-medium text-pink-700">
                  Published v{row?.version}
                </span>
              )}
              {row && !live && customized && (
                <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-600">Draft</span>
              )}
            </div>
          </div>
          <p className="mt-1 text-[12px] text-ink-600">
            Leave a field empty to keep the code template's version of it. Body supports
            **bold**, [links](https://…), and blank-line paragraphs.
          </p>

          <label className="mt-4 block text-[12px] font-medium text-ink-700">
            Subject
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Code default" className={inputCls} />
          </label>
          <label className="mt-3 block text-[12px] font-medium text-ink-700">
            Body
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={7}
              placeholder="Code default"
              className={inputCls}
            />
          </label>
          <div className="mt-2">
            <div className="text-[11px] font-medium uppercase tracking-wide text-ink-500">Tokens</div>
            <TokenPaletteRow tokens={tokens} onInsert={insertToken} className="mt-1.5" />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="block text-[12px] font-medium text-ink-700">
              CTA button
              <select value={ctaMode} onChange={(e) => setCtaMode(e.target.value as CtaMode)} className={inputCls}>
                <option value="AUTO">Auto (event-appropriate label)</option>
                <option value="CUSTOM">Custom label</option>
                <option value="NONE">No button</option>
              </select>
            </label>
            {ctaMode === 'CUSTOM' && (
              <label className="block text-[12px] font-medium text-ink-700">
                CTA label
                <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} className={inputCls} />
              </label>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button type="button" disabled={pending} onClick={refreshPreview} className={`${btn} border border-ink-200 bg-white text-ink-700 hover:border-ink-400`}>
              Refresh preview
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => saveTemplateDraft(draft()), 'Draft saved')}
              className={`${btn} border border-ink-200 bg-white text-ink-700 hover:border-ink-400`}
            >
              Save draft
            </button>
            <button
              type="button"
              disabled={pending || !customized}
              onClick={() =>
                run(async () => {
                  const saved = await saveTemplateDraft(draft())
                  if (!saved.ok) return saved
                  return publishTemplate(event)
                }, 'Published — this override is now live')
              }
              className={`${btn} bg-ink-900 text-white hover:opacity-90`}
            >
              Publish
            </button>
            {row && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => revertToCodeTemplate(event), 'Reverted to the code template')}
                className={`${btn} text-danger-600 hover:bg-danger-50`}
              >
                Revert to code
              </button>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-ink-200 bg-white p-5">
          <h2 className="font-display text-[15px] font-semibold text-ink-900">Delivery</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() => setTemplateEnabled(event, !(row?.enabled ?? true)),
                  row?.enabled === false ? 'Email re-enabled for this event' : 'Email disabled for this event (in-app unaffected)')
              }
              className={`${btn} border ${row?.enabled === false ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400'}`}
            >
              {row?.enabled === false ? 'Email is OFF — turn on' : 'Turn email off for this event'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => testSendTemplate(draft()), 'Test email sent to your address')}
              className={`${btn} border border-ink-200 bg-white text-ink-700 hover:border-ink-400`}
            >
              Send me a test
            </button>
          </div>

          {versions.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] font-medium uppercase tracking-wide text-ink-500">Published versions</div>
              <ul className="mt-1.5 divide-y divide-ink-50 rounded-xl border border-ink-100">
                {versions.map((v) => (
                  <li key={v.version} className="flex items-center justify-between px-3 py-2 text-[12.5px]">
                    <span className="text-ink-800">
                      v{v.version}
                      <span className="ml-2 text-ink-400">
                        {new Date(v.publishedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={pending || (live && row?.version === v.version)}
                      onClick={() => run(() => rollbackTemplate(event, v.version), `Rolled back to v${v.version}`)}
                      className="text-[12px] font-medium text-ink-600 hover:text-ink-900 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                    >
                      {live && row?.version === v.version ? 'Live' : 'Roll back'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {/* ---- Preview column -------------------------------------------------- */}
      <EmailTemplatePreviewCard
        content={preview}
        source={customized ? 'customized' : 'default'}
        title="Preview (sample payload)"
      />
    </div>
  )
}
