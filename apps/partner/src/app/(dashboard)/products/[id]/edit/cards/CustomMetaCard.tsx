'use client'

// Partner-supplied key/value pairs (max 10) for product metadata that
// doesn't fit the standard fields. Persisted to ProductTemplate.customMeta JSON.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4.3 (⑧) + #132.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Label } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { saveCustomMeta } from '../card-actions'

export interface CustomMetaRow {
  key: string
  value: string
}

interface CustomMetaCardProps {
  productTemplateId: string
  initial: CustomMetaRow[]
  isDraft: boolean
}

const MAX_ROWS = 10

export function CustomMetaCard({ productTemplateId, initial, isDraft }: CustomMetaCardProps) {
  const router = useRouter()
  const [rows, setRows] = useState<CustomMetaRow[]>(initial.length > 0 ? initial : [])
  const [isPending, startTransition] = useTransition()
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  function persist(next: CustomMetaRow[]) {
    setRows(next)
    setSaveStatus('saving')
    startTransition(async () => {
      const result = await saveCustomMeta({ productTemplateId, customMeta: next })
      if (!result.ok) {
        setSaveStatus('error')
        toast.error(result.error)
        return
      }
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 1500)
      router.refresh()
    })
  }

  function update(i: number, field: 'key' | 'value', v: string) {
    const next = rows.slice()
    if (next[i]) next[i] = { ...next[i], [field]: v }
    setRows(next)
  }

  function commit() {
    persist(rows)
  }

  function addRow() {
    if (rows.length >= MAX_ROWS) return
    setRows([...rows, { key: '', value: '' }])
  }

  function removeRow(i: number) {
    persist(rows.filter((_, idx) => idx !== i))
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-500">
          No custom meta fields. Add up to {MAX_ROWS} key/value pairs for product attributes
          that don&apos;t fit the standard schema (e.g., bottle color, batch ID, regional SKU).
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row, i) => (
            <li key={i} className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs uppercase tracking-wider text-zinc-500">Key</Label>
                <Input
                  value={row.key}
                  onChange={(e) => update(i, 'key', e.target.value)}
                  onBlur={commit}
                  placeholder="e.g. bottleColor"
                  disabled={!isDraft || isPending}
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs uppercase tracking-wider text-zinc-500">Value</Label>
                <Input
                  value={row.value}
                  onChange={(e) => update(i, 'value', e.target.value)}
                  onBlur={commit}
                  placeholder="e.g. amber"
                  disabled={!isDraft || isPending}
                />
              </div>
              {isDraft && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRow(i)}
                  disabled={isPending}
                  className="text-red-600 hover:bg-red-50"
                  aria-label="Remove row"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between">
        {isDraft && rows.length < MAX_ROWS && (
          <Button variant="outline" size="sm" onClick={addRow} disabled={isPending}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add field
          </Button>
        )}
        {saveStatus !== 'idle' && (
          <span className="text-xs text-zinc-500">
            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : '⚠ Save failed'}
          </span>
        )}
      </div>
    </div>
  )
}
