'use client'

// Voice & Tone tab — Jungian archetype + 3 sliders + tone words + banned words.
// Per docs/BRAND_IDENTITY_STUDIO.md §6 + #165.

import { useState, useTransition } from 'react'
import { Button, Input, Label } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { MessageCircle, Plus, X } from 'lucide-react'
import type { BrandArchetype } from '@prisma/client'
import { saveBrandVoice } from '../actions'

const ARCHETYPES: Array<{ value: BrandArchetype; label: string; description: string }> = [
  { value: 'HERO', label: 'Hero', description: 'Courage, mastery, triumph. Athletic gear, performance supps.' },
  { value: 'SAGE', label: 'Sage', description: 'Wisdom, truth, knowledge. Functional supplements, biotech.' },
  { value: 'CAREGIVER', label: 'Caregiver', description: 'Service, generosity. Wellness, baby/family.' },
  { value: 'EXPLORER', label: 'Explorer', description: 'Freedom, discovery. Outdoor, adventure foods.' },
  { value: 'CREATOR', label: 'Creator', description: 'Imagination, self-expression. Artisan, craft.' },
  { value: 'JESTER', label: 'Jester', description: 'Fun, joy, irreverence. Snacks, gummies, kids.' },
  { value: 'EVERYMAN', label: 'Everyman', description: 'Belonging, realism. Mass-market staples.' },
  { value: 'INNOCENT', label: 'Innocent', description: 'Purity, simplicity. Organic, baby foods.' },
  { value: 'LOVER', label: 'Lover', description: 'Intimacy, beauty, pleasure. Beauty supps, indulgence.' },
  { value: 'MAGICIAN', label: 'Magician', description: 'Transformation, vision. Wellness with results.' },
  { value: 'OUTLAW', label: 'Outlaw', description: 'Rebellion, freedom. Disruptive niche brands.' },
  { value: 'RULER', label: 'Ruler', description: 'Control, status, premium. Luxury supplements.' },
]

interface VoiceToneTabProps {
  brandId: string
  initial: {
    archetype: BrandArchetype | null
    formality: number | null
    playfulness: number | null
    warmth: number | null
    notes: string | null
    writingToneWords: string[]
    brandKeywords: string[]
    bannedWords: string[]
    personaDescription: string | null
  }
}

export function VoiceToneTab({ brandId, initial }: VoiceToneTabProps) {
  const [archetype, setArchetype] = useState<BrandArchetype | null>(initial.archetype)
  const [formality, setFormality] = useState<number>(initial.formality ?? 3)
  const [playfulness, setPlayfulness] = useState<number>(initial.playfulness ?? 3)
  const [warmth, setWarmth] = useState<number>(initial.warmth ?? 3)
  const [notes, setNotes] = useState(initial.notes ?? '')
  const [toneWords, setToneWords] = useState<string[]>(initial.writingToneWords)
  const [keywords, setKeywords] = useState<string[]>(initial.brandKeywords)
  const [banned, setBanned] = useState<string[]>(initial.bannedWords)
  const [persona, setPersona] = useState(initial.personaDescription ?? '')
  const [isPending, startTransition] = useTransition()
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  function commit(patch: Parameters<typeof saveBrandVoice>[0]) {
    setSaveStatus('saving')
    startTransition(async () => {
      const result = await saveBrandVoice(patch)
      if (!result.ok) {
        setSaveStatus('error')
        toast.error(result.error)
        return
      }
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 1500)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <MessageCircle className="h-4 w-4 text-zinc-500" />
          Voice & Tone
        </h3>
        <SaveIndicator status={saveStatus} pending={isPending} />
      </div>

      {/* Archetype */}
      <section className="space-y-2">
        <Label className="text-sm font-medium text-zinc-900">Brand archetype</Label>
        <p className="text-xs text-zinc-500">
          Jungian archetype — your brand&apos;s fundamental personality. Drives copy generation
          + design choices downstream.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {ARCHETYPES.map((a) => {
            const isSelected = archetype === a.value
            return (
              <button
                key={a.value}
                type="button"
                onClick={() => {
                  setArchetype(a.value)
                  commit({ brandId, voiceArchetype: a.value })
                }}
                disabled={isPending}
                className={`rounded-md border p-2 text-left transition-colors ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-zinc-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/30'
                }`}
              >
                <div className="text-sm font-semibold text-zinc-900">{a.label}</div>
                <div className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500">{a.description}</div>
              </button>
            )
          })}
        </div>
      </section>

      {/* Sliders */}
      <section className="space-y-3">
        <Label className="text-sm font-medium text-zinc-900">Tone dials (1-5)</Label>
        <Slider
          label="Formal ↔ Casual"
          leftLabel="Formal"
          rightLabel="Casual"
          value={formality}
          onChange={(v) => {
            setFormality(v)
            commit({ brandId, voiceFormality: v })
          }}
          disabled={isPending}
        />
        <Slider
          label="Serious ↔ Playful"
          leftLabel="Serious"
          rightLabel="Playful"
          value={playfulness}
          onChange={(v) => {
            setPlayfulness(v)
            commit({ brandId, voicePlayfulness: v })
          }}
          disabled={isPending}
        />
        <Slider
          label="Cool ↔ Warm"
          leftLabel="Cool"
          rightLabel="Warm"
          value={warmth}
          onChange={(v) => {
            setWarmth(v)
            commit({ brandId, voiceWarmth: v })
          }}
          disabled={isPending}
        />
      </section>

      {/* Tone words */}
      <WordListField
        label="Tone words (max 4)"
        hint="Adjectives that describe your voice. E.g., 'confident, witty, grounded'."
        placeholder="e.g. confident"
        values={toneWords}
        max={4}
        onChange={(v) => {
          setToneWords(v)
          commit({ brandId, writingToneWords: v })
        }}
        disabled={isPending}
      />

      <WordListField
        label="Brand keywords (~3-7)"
        hint="Words you want associated with your brand — feeds AI copy generation."
        placeholder="e.g. sustainable"
        values={keywords}
        max={10}
        onChange={(v) => {
          setKeywords(v)
          commit({ brandId, brandKeywords: v })
        }}
        disabled={isPending}
      />

      <WordListField
        label="Banned words"
        hint="Words that should never appear in your copy. Linted on product descriptions + label callouts."
        placeholder="e.g. cheap"
        values={banned}
        max={20}
        onChange={(v) => {
          setBanned(v)
          commit({ brandId, bannedWords: v })
        }}
        disabled={isPending}
      />

      {/* Persona description */}
      <section className="space-y-2">
        <Label className="text-sm font-medium text-zinc-900">Persona description</Label>
        <p className="text-xs text-zinc-500">
          ~150-word paragraph describing your target audience. Used by the AI copywriter +
          design suggestions to keep everything on-brand.
        </p>
        <textarea
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          onBlur={() => commit({ brandId, personaDescription: persona })}
          rows={4}
          placeholder="e.g. Sarah, 32, urban Brooklyn. Recently quit her corporate marketing job to focus on wellness. Reads Goop and listens to Tim Ferriss. Buys at Erewhon when she can, Whole Foods otherwise. Skeptical of mass-market wellness but will pay $40 for a supplement she trusts…"
          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
          disabled={isPending}
        />
      </section>

      {/* Notes */}
      <section className="space-y-2">
        <Label className="text-sm font-medium text-zinc-900">Voice notes (free form)</Label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => commit({ brandId, voiceNotes: notes })}
          rows={3}
          placeholder='e.g. "Never use exclamation marks. Avoid corporate-speak. Always lead with the science when claiming efficacy."'
          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
          disabled={isPending}
        />
      </section>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Slider primitive
// -----------------------------------------------------------------------------

function Slider({
  label,
  leftLabel,
  rightLabel,
  value,
  onChange,
  disabled,
}: {
  label: string
  leftLabel: string
  rightLabel: string
  value: number
  onChange: (v: number) => void
  disabled: boolean
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-500">{leftLabel}</span>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          disabled={disabled}
          className="flex-1 accent-emerald-500"
        />
        <span className="text-xs text-zinc-500">{rightLabel}</span>
        <span className="w-6 text-right text-xs font-semibold text-zinc-900">{value}</span>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Word-list editor (tag-style)
// -----------------------------------------------------------------------------

function WordListField({
  label,
  hint,
  placeholder,
  values,
  max,
  onChange,
  disabled,
}: {
  label: string
  hint: string
  placeholder: string
  values: string[]
  max: number
  onChange: (v: string[]) => void
  disabled: boolean
}) {
  const [draft, setDraft] = useState('')

  function add() {
    const v = draft.trim()
    if (!v) return
    if (values.includes(v)) {
      setDraft('')
      return
    }
    if (values.length >= max) {
      toast.error(`Max ${max} entries.`)
      return
    }
    onChange([...values, v])
    setDraft('')
  }

  return (
    <section className="space-y-2">
      <Label className="text-sm font-medium text-zinc-900">{label}</Label>
      <p className="text-xs text-zinc-500">{hint}</p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((w) => (
          <span
            key={w}
            className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs"
          >
            {w}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== w))}
              disabled={disabled}
              aria-label={`Remove ${w}`}
              className="text-zinc-400 hover:text-red-600"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      {values.length < max && (
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
            placeholder={placeholder}
            disabled={disabled}
            className="max-w-xs"
          />
          <Button type="button" variant="outline" size="sm" onClick={add} disabled={disabled || !draft.trim()}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add
          </Button>
        </div>
      )}
    </section>
  )
}

function SaveIndicator({
  status,
  pending,
}: {
  status: 'idle' | 'saving' | 'saved' | 'error'
  pending: boolean
}) {
  if (status === 'idle' && !pending) return null
  const text = pending ? 'Saving…' : status === 'saved' ? '✓ Saved' : status === 'error' ? '⚠ Save failed' : ''
  const cls = pending ? 'text-zinc-500' : status === 'saved' ? 'text-emerald-600' : status === 'error' ? 'text-red-600' : ''
  return <span className={`text-xs ${cls}`}>{text}</span>
}
