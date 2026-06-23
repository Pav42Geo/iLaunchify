'use client'

// Topic editor body. Name, description, icon key (resolved to a Lucide icon on
// the public grid — string only, never a component prop across the RSC boundary),
// and home-grid order. Explicit Save; server action imported directly.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save, Loader2 } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import { saveCategory } from '../../../admin-actions'

interface CategoryData {
  id: string
  name: string
  description: string
  iconKey: string
  order: number
}

export function CategoryEditor({ category }: { category: CategoryData }) {
  const router = useRouter()
  const [form, setForm] = useState({
    name: category.name,
    description: category.description,
    iconKey: category.iconKey,
    order: category.order.toString(),
  })
  const [saving, start] = useTransition()

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function save() {
    if (!form.name.trim()) return toast.error('Name is required.')
    const order = parseInt(form.order || '0', 10)
    start(async () => {
      const res = await saveCategory({
        id: category.id,
        name: form.name,
        description: form.description || null,
        iconKey: form.iconKey || null,
        order: Number.isFinite(order) ? order : 0,
      })
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Topic saved.')
      router.refresh()
    })
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Section title="Topic">
        <Field label="Name"><Input value={form.name} onChange={(v) => set('name', v)} /></Field>
        <Field label="Description" hint="Optional — shown under the topic on the academy home grid.">
          <Textarea value={form.description} onChange={(v) => set('description', v)} rows={3} />
        </Field>
      </Section>

      <Section title="Display" subtitle="How the topic appears on the public academy home grid.">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Icon key" hint="Lucide name, e.g. rocket, palette, shield-check.">
            <Input value={form.iconKey} onChange={(v) => set('iconKey', v)} placeholder="rocket" />
          </Field>
          <Field label="Order" hint="Lower shows first within its academy.">
            <Input value={form.order} onChange={(v) => set('order', v)} type="number" />
          </Field>
        </div>
      </Section>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save topic
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
  return <textarea value={value} rows={rows ?? 3} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, 'h-auto py-2 leading-relaxed')} />
}
