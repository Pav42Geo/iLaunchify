'use client'

import * as React from 'react'
import { cn } from '../lib/utils'
import { SectionLabel } from './SectionLabel'

/**
 * EmailTemplatePreviewCard — live preview panel for the admin Templates editor
 * (docs/EMAIL_NOTIFICATION_CENTER.md — admin surfaces; checklist D).
 * Shows what `resolveNotificationContent` produced: subject line, the branded
 * HTML email (sandboxed iframe), the plaintext part, and the in-app rendering —
 * plus a click-to-insert token palette for the editor.
 *
 * Presentational: the host calls the resolver (with sample payload + DRAFT
 * override + `preview: true`) and passes the result in. No network, no resolver
 * import — @ilaunchify/ui stays dependency-free.
 */

export interface EmailTemplatePreviewContent {
  subject: string
  html: string
  text: string
  inApp?: { title: string; body: string }
}

export interface EmailTemplatePreviewCardProps {
  content: EmailTemplatePreviewContent
  /** 'code default' vs 'customized' chip, mirroring the Templates list. */
  source?: 'default' | 'customized' | null
  title?: string
  className?: string
  /** Iframe height for the email tab. */
  emailHeightPx?: number
}

type Tab = 'email' | 'text' | 'inapp'

export function EmailTemplatePreviewCard({
  content,
  source = null,
  title = 'Preview',
  className,
  emailHeightPx = 480,
}: EmailTemplatePreviewCardProps) {
  const [tab, setTab] = React.useState<Tab>('email')
  const tabs: Array<{ id: Tab; label: string; show: boolean }> = [
    { id: 'email', label: 'Email', show: true },
    { id: 'text', label: 'Plain text', show: true },
    { id: 'inapp', label: 'In-app', show: !!content.inApp },
  ]

  return (
    <section
      className={cn(
        'rounded-[var(--card-radius)] border border-[var(--card-border)] bg-[var(--bg-surface)] p-4',
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SectionLabel>{title}</SectionLabel>
          {source && (
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-medium',
                source === 'customized' ? 'bg-pink-50 text-pink-700' : 'bg-ink-100 text-ink-600',
              )}
            >
              {source === 'customized' ? 'Customized' : 'Code default'}
            </span>
          )}
        </div>
        <div role="tablist" aria-label="Preview format" className="flex gap-1">
          {tabs
            .filter((t) => t.show)
            .map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[length:var(--fs-xs)] font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500',
                  tab === t.id ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100',
                )}
              >
                {t.label}
              </button>
            ))}
        </div>
      </div>

      <div className="mb-3 rounded-lg border border-ink-200 bg-[var(--bg-hero)] px-3 py-2">
        <div className="text-[length:var(--fs-xs)] uppercase tracking-wide text-ink-500">Subject</div>
        <div className="mt-0.5 text-[length:var(--fs-sm)] font-medium text-ink-900">
          {content.subject}
        </div>
      </div>

      {tab === 'email' && (
        <iframe
          title="Email preview"
          sandbox=""
          srcDoc={content.html}
          className="w-full rounded-lg border border-ink-200 bg-white"
          style={{ height: emailHeightPx }}
        />
      )}
      {tab === 'text' && (
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-ink-200 bg-[var(--bg-hero)] p-3 text-[length:var(--fs-sm)] leading-6 text-ink-800">
          {content.text}
        </pre>
      )}
      {tab === 'inapp' && content.inApp && (
        <div className="rounded-lg border border-ink-200 p-3">
          <div className="flex items-start gap-2.5">
            <span aria-hidden className="mt-1 block h-2 w-2 shrink-0 rounded-full bg-pink-500" />
            <div className="min-w-0">
              <div className="text-[length:var(--fs-sm)] font-medium text-ink-900">
                {content.inApp.title}
              </div>
              <div className="mt-0.5 text-[length:var(--fs-sm)] text-ink-600">{content.inApp.body}</div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * TokenPaletteRow — click-to-insert `{{token}}` chips for the template editor.
 * Host feeds `tokenPaletteForEvent(event)` and inserts at the caret onInsert.
 */
export function TokenPaletteRow({
  tokens,
  onInsert,
  className,
}: {
  tokens: readonly string[]
  onInsert?: (token: string) => void
  className?: string
}) {
  if (tokens.length === 0) {
    return (
      <p className={cn('text-[length:var(--fs-xs)] text-ink-500', className)}>
        This event has no payload variables.
      </p>
    )
  }
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {tokens.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onInsert?.(`{{${t}}}`)}
          title={`Insert {{${t}}}`}
          className={cn(
            'rounded-md border border-ink-200 bg-[var(--bg-hero)] px-2 py-0.5 font-mono text-[11px] text-ink-700',
            'hover:border-pink-500 hover:text-pink-700',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500',
          )}
        >
          {`{{${t}}}`}
        </button>
      ))}
    </div>
  )
}
