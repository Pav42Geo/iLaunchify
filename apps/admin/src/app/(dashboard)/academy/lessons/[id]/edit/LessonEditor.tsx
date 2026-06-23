'use client'

// Lesson editor body. Type toggle (VIDEO/ARTICLE) reveals the right fields:
// VIDEO → provider + asset id + duration + transcript; ARTICLE → MDX body.
// Explicit Save; server action imported directly (RPC-safe).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save, Loader2, PlaySquare, FileText } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import type { AcademyLessonType, AcademyVideoProvider } from '@ilaunchify/db'
import { saveLesson } from '../../../admin-actions'

const PROVIDERS: { value: AcademyVideoProvider; label: string }[] = [
  { value: 'MUX', label: 'Mux' },
  { value: 'YOUTUBE', label: 'YouTube' },
  { value: 'VIMEO', label: 'Vimeo' },
  { value: 'CLOUDFLARE', label: 'Cloudflare Stream' },
  { value: 'SELF', label: 'Self-hosted' },
]

interface LessonData {
  id: string
  title: string
  type: AcademyLessonType
  summary: string
  bodyMdx: string
  durationSeconds: number | null
  videoProvider: AcademyVideoProvider | null
  videoAssetId: string
}

export function LessonEditor({ lesson }: { lesson: LessonData }) {
  const router = useRouter()
  const [form, setForm] = useState({
    title: lesson.title,
    type: lesson.type === 'INTERACTIVE' ? 'VIDEO' : lesson.type, // INTERACTIVE is V1.1; edit as VIDEO
    summary: lesson.summary,
    bodyMdx: lesson.bodyMdx,
    minutes: lesson.durationSeconds ? Math.round(lesson.durationSeconds / 60).toString() : '',
    seconds: lesson.durationSeconds ? (lesson.durationSeconds % 60).toString() : '',
    videoProvider: (lesson.videoProvider ?? 'MUX') as AcademyVideoProvider,
    videoAssetId: lesson.videoAssetId,
  })
  const [saving, start] = useTransition()
  const isVideo = form.type === 'VIDEO'

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function save() {
    const m = parseInt(form.minutes || '0', 10) || 0
    const s = parseInt(form.seconds || '0', 10) || 0
    const duration = isVideo ? m * 60 + s : null
    start(async () => {
      const res = await saveLesson({
        id: lesson.id,
        title: form.title,
        type: form.type as AcademyLessonType,
        summary: form.summary || null,
        bodyMdx: form.bodyMdx || null,
        durationSeconds: duration && duration > 0 ? duration : null,
        videoProvider: isVideo ? form.videoProvider : null,
        videoAssetId: isVideo ? form.videoAssetId || null : null,
      })
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Lesson saved.')
      router.refresh()
    })
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Section title="Lesson">
        <Field label="Title"><Input value={form.title} onChange={(v) => set('title', v)} /></Field>

        <Field label="Type">
          <div className="flex gap-2">
            {(['VIDEO', 'ARTICLE'] as const).map((t) => {
              const Icon = t === 'VIDEO' ? PlaySquare : FileText
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => set('type', t)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2',
                    form.type === t ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" /> {t === 'VIDEO' ? 'Video' : 'Article'}
                </button>
              )
            })}
          </div>
        </Field>

        <Field label="Summary" hint="One line shown in the curriculum + on cards."><Input value={form.summary} onChange={(v) => set('summary', v)} /></Field>
      </Section>

      {isVideo && (
        <Section title="Video" subtitle="V1 hosts on Mux; other providers are escape hatches.">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Provider"><Select value={form.videoProvider} onChange={(v) => set('videoProvider', v as AcademyVideoProvider)} options={PROVIDERS} /></Field>
            <Field label="Asset / video ID"><Input value={form.videoAssetId} onChange={(v) => set('videoAssetId', v)} placeholder="Mux playback ID…" /></Field>
          </div>
          <Field label="Duration">
            <div className="flex items-center gap-2">
              <Input value={form.minutes} onChange={(v) => set('minutes', v)} type="number" placeholder="min" />
              <span className="text-ink-400">:</span>
              <Input value={form.seconds} onChange={(v) => set('seconds', v)} type="number" placeholder="sec" />
            </div>
          </Field>
          <Field label="Transcript" hint="Captions/transcript are required on every video (WCAG AA)."><Textarea value={form.bodyMdx} onChange={(v) => set('bodyMdx', v)} rows={6} /></Field>
        </Section>
      )}

      {!isVideo && (
        <Section title="Article body" subtitle="MDX. Powers explainers + the dated updates feed.">
          <Field label="Body (MDX)"><Textarea value={form.bodyMdx} onChange={(v) => set('bodyMdx', v)} rows={12} /></Field>
        </Section>
      )}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save lesson
      </button>
    </div>
  )
}

// — primitives (local; client-safe) ——————————————————————————————————————————
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5">
      <h2 className="font-display text-[15px] font-bold text-ink-900">{title}</h2>
      {subtitle && <p className="mt-0.5 text-[12px] text-ink-500">{subtitle}</p>}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  )
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-700">{label}</span>
      {hint && <span className="ml-2 text-[11px] font-normal normal-case text-ink-400">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  )
}
const inputCls = 'h-9 w-full rounded-lg border border-ink-200 bg-white px-3 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200'
function Input({ value, onChange, placeholder, type }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <input type={type ?? 'text'} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputCls} />
}
function Textarea({ value, onChange, rows }: { value: string; onChange: (v: string) => void; rows?: number }) {
  return <textarea value={value} rows={rows ?? 3} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, 'h-auto py-2 font-mono text-[12.5px] leading-relaxed')} />
}
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, 'cursor-pointer')}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
