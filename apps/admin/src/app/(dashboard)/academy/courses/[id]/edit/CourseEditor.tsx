'use client'

// Course editor body — metadata + SEO form (explicit Save) + lesson manager
// (reorder via up/down, quick-add, deep-link to each lesson editor). Server
// actions are imported directly (RPC-safe); no Prisma reaches the client.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Link from 'next/link'
import { Save, Plus, ChevronUp, ChevronDown, Loader2, PlaySquare, FileText, Pencil } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import type { AcademyLevel, AcademyLessonType, AcademyStatus } from '@ilaunchify/db'
import { saveCourse, addLesson, reorderLessons } from '../../../admin-actions'

const LEVELS: { value: AcademyLevel; label: string }[] = [
  { value: 'BEGINNER', label: 'Beginner' },
  { value: 'INTERMEDIATE', label: 'Intermediate' },
  { value: 'ADVANCED', label: 'Advanced' },
]

const STATUS_DOT: Record<AcademyStatus, string> = {
  DRAFT: 'bg-zinc-400', IN_REVIEW: 'bg-amber-500', PUBLISHED: 'bg-emerald-500', ARCHIVED: 'bg-rose-500',
}

interface LessonRow {
  id: string
  title: string
  slug: string
  type: AcademyLessonType
  status: AcademyStatus
  durationSeconds: number | null
  order: number
}

interface CourseData {
  id: string
  title: string
  subtitle: string
  summary: string
  level: AcademyLevel
  categoryId: string | null
  heroImageUrl: string
  estimatedMinutes: number | null
  metaTitle: string
  metaDescription: string
  ogImageUrl: string
  tags: string[]
}

export function CourseEditor({
  course,
  categories,
  lessons: initialLessons,
}: {
  course: CourseData
  categories: { id: string; name: string }[]
  lessons: LessonRow[]
}) {
  const router = useRouter()
  const [form, setForm] = useState({
    title: course.title,
    subtitle: course.subtitle,
    summary: course.summary,
    level: course.level,
    categoryId: course.categoryId ?? '',
    heroImageUrl: course.heroImageUrl,
    estimatedMinutes: course.estimatedMinutes?.toString() ?? '',
    metaTitle: course.metaTitle,
    metaDescription: course.metaDescription,
    ogImageUrl: course.ogImageUrl,
    tags: course.tags.join(', '),
  })
  const [lessons, setLessons] = useState<LessonRow[]>(initialLessons)
  const [newLesson, setNewLesson] = useState({ title: '', type: 'VIDEO' as AcademyLessonType })
  const [saving, startSave] = useTransition()
  const [reordering, startReorder] = useTransition()
  const [adding, startAdd] = useTransition()

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function save() {
    startSave(async () => {
      const res = await saveCourse({
        id: course.id,
        title: form.title,
        subtitle: form.subtitle,
        summary: form.summary,
        level: form.level,
        categoryId: form.categoryId || null,
        heroImageUrl: form.heroImageUrl || null,
        estimatedMinutes: form.estimatedMinutes ? Math.max(0, parseInt(form.estimatedMinutes, 10) || 0) : null,
        metaTitle: form.metaTitle || null,
        metaDescription: form.metaDescription || null,
        ogImageUrl: form.ogImageUrl || null,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      })
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Course saved.')
      router.refresh()
    })
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...lessons]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    setLessons(next)
    startReorder(async () => {
      const res = await reorderLessons({ courseId: course.id, orderedIds: next.map((l) => l.id) })
      if (!res.ok) {
        toast.error(res.error)
        setLessons(lessons) // revert
      }
    })
  }

  function add() {
    if (!newLesson.title.trim()) return toast.error('Enter a lesson title.')
    startAdd(async () => {
      const res = await addLesson({ courseId: course.id, title: newLesson.title, type: newLesson.type })
      if (!res.ok) { toast.error(res.error); return }
      router.push(`/academy/lessons/${res.data.id}/edit`)
    })
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,360px]">
      {/* Main column — metadata + SEO */}
      <div className="space-y-6">
        <Section title="Course details">
          <Field label="Title"><Input value={form.title} onChange={(v) => set('title', v)} /></Field>
          <Field label="Subtitle" hint="One short line under the title."><Input value={form.subtitle} onChange={(v) => set('subtitle', v)} /></Field>
          <Field label="Summary" hint="Shown on the course card + header. Required.">
            <Textarea value={form.summary} onChange={(v) => set('summary', v)} rows={3} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Level">
              <Select value={form.level} onChange={(v) => set('level', v as AcademyLevel)} options={LEVELS.map((l) => ({ value: l.value, label: l.label }))} />
            </Field>
            <Field label="Topic">
              <Select value={form.categoryId} onChange={(v) => set('categoryId', v)} options={[{ value: '', label: '— none —' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Estimated minutes"><Input value={form.estimatedMinutes} onChange={(v) => set('estimatedMinutes', v)} type="number" /></Field>
            <Field label="Tags" hint="Comma-separated."><Input value={form.tags} onChange={(v) => set('tags', v)} /></Field>
          </div>
          <Field label="Hero image URL"><Input value={form.heroImageUrl} onChange={(v) => set('heroImageUrl', v)} placeholder="https://…" /></Field>
        </Section>

        <Section title="SEO" subtitle="Per-page metadata for the public course page. Indexed only once published.">
          <Field label="Meta title"><Input value={form.metaTitle} onChange={(v) => set('metaTitle', v)} /></Field>
          <Field label="Meta description"><Textarea value={form.metaDescription} onChange={(v) => set('metaDescription', v)} rows={2} /></Field>
          <Field label="OG image URL"><Input value={form.ogImageUrl} onChange={(v) => set('ogImageUrl', v)} placeholder="https://…" /></Field>
        </Section>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save changes
        </button>
      </div>

      {/* Right rail — lessons */}
      <aside className="space-y-3">
        <div className="rounded-2xl border border-ink-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-[15px] font-bold text-ink-900">Lessons</h2>
            <span className="text-[11px] text-ink-500">{lessons.length} {reordering && '· saving…'}</span>
          </div>

          <ol className="mt-3 space-y-1.5">
            {lessons.map((l, i) => {
              const Icon = l.type === 'VIDEO' ? PlaySquare : FileText
              return (
                <li key={l.id} className="flex items-center gap-2 rounded-lg border border-ink-100 px-2.5 py-2">
                  <span className="flex flex-col">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || reordering} className="text-ink-400 hover:text-ink-700 disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === lessons.length - 1 || reordering} className="text-ink-400 hover:text-ink-700 disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
                  </span>
                  <Icon className="h-4 w-4 shrink-0 text-ink-400" />
                  <Link href={`/academy/lessons/${l.id}/edit`} className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink-900 hover:text-pink-700">{l.title}</Link>
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT[l.status])} title={l.status} />
                  <Link href={`/academy/lessons/${l.id}/edit`} className="text-ink-400 hover:text-pink-600"><Pencil className="h-3.5 w-3.5" /></Link>
                </li>
              )
            })}
            {lessons.length === 0 && <li className="rounded-lg border border-dashed border-ink-200 px-3 py-4 text-center text-[12px] text-ink-500">No lessons yet.</li>}
          </ol>

          <div className="mt-3 space-y-2 border-t border-ink-100 pt-3">
            <Input value={newLesson.title} onChange={(v) => setNewLesson((n) => ({ ...n, title: v }))} placeholder="New lesson title…" />
            <div className="flex gap-2">
              <Select value={newLesson.type} onChange={(v) => setNewLesson((n) => ({ ...n, type: v as AcademyLessonType }))} options={[{ value: 'VIDEO', label: 'Video' }, { value: 'ARTICLE', label: 'Article' }]} />
              <button type="button" onClick={add} disabled={adding} className="inline-flex items-center gap-1.5 rounded-full bg-pink-500 px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-pink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:opacity-50">
                {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}

// — small form primitives ————————————————————————————————————————————————————
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
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">{label}</span>
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
  return <textarea value={value} rows={rows ?? 3} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, 'h-auto py-2 leading-relaxed')} />
}
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, 'cursor-pointer')}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
