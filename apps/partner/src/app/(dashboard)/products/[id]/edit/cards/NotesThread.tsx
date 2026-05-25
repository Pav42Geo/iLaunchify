'use client'

// Partner-side of the admin↔partner notes thread.
// Mirrors the admin UI from #133 but composes with authorType=PARTNER.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4.3 (⑩) + #132.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { Send } from 'lucide-react'
import type { NoteAuthor } from '@prisma/client'
import { postPartnerProductNote } from '../card-actions'

export interface NoteRow {
  id: string
  authorName: string
  authorType: NoteAuthor
  body: string
  createdAt: Date
}

interface NotesThreadProps {
  productTemplateId: string
  notes: NoteRow[]
  isDraft: boolean
}

export function NotesThread({ productTemplateId, notes, isDraft }: NotesThreadProps) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [isPending, startTransition] = useTransition()

  function post() {
    if (!body.trim()) return
    startTransition(async () => {
      const result = await postPartnerProductNote({ productTemplateId, body: body.trim() })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Note posted')
      setBody('')
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {notes.length === 0 ? (
        <p className="rounded border border-dashed border-zinc-200 px-3 py-2 text-xs text-zinc-500">
          No messages yet. Use this thread to ask admin questions or share context they should
          see during review.
        </p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li
              key={n.id}
              className={`rounded-md border px-3 py-2 text-sm ${
                n.authorType === 'ADMIN'
                  ? 'border-emerald-200 bg-emerald-50/50'
                  : 'border-zinc-200 bg-zinc-50'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  {n.authorType} · {n.authorName}
                </span>
                <span className="text-[10px] text-zinc-400">
                  {new Date(n.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-zinc-800">{n.body}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 border-t border-zinc-100 pt-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder='e.g. "Updated the cert PDF — please re-verify Section 4 of our application."'
          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
          disabled={!isDraft || isPending}
        />
        <Button
          size="sm"
          onClick={post}
          disabled={!isDraft || isPending || !body.trim()}
          className="w-full"
        >
          <Send className="mr-1.5 h-3.5 w-3.5" />
          {isPending ? 'Posting…' : 'Post note'}
        </Button>
        {!isDraft && (
          <p className="text-xs text-zinc-500">
            Read-only — this template is currently in admin review or published.
          </p>
        )}
      </div>
    </div>
  )
}
