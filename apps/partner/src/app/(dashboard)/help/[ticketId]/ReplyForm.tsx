'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Send, Paperclip, X } from 'lucide-react'
import { replyTicketAction, uploadTicketAttachments } from '../actions'

export function ReplyForm({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()

  function addFiles(list: FileList | null) {
    if (!list) return
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, 5))
    if (fileRef.current) fileRef.current.value = ''
  }

  function send() {
    const text = body.trim()
    if (!text && files.length === 0) {
      toast.error('Add a message or an attachment.')
      return
    }
    start(async () => {
      let attachments: { key: string; name: string; mimeType: string; size: number }[] = []
      if (files.length > 0) {
        const fd = new FormData()
        fd.set('ticketId', ticketId)
        files.forEach((f) => fd.append('files', f))
        const up = await uploadTicketAttachments(fd)
        if (!up.ok) {
          toast.error(up.error)
          return
        }
        attachments = up.attachments
      }
      const res = await replyTicketAction({ ticketId, body: text, attachments })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Reply sent.')
      setBody('')
      setFiles([])
      router.refresh()
    })
  }

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder="Add a reply…"
        className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[13.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
      />

      {files.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-ink-50 px-2.5 py-1 text-[11.5px] text-ink-700">
              <Paperclip className="h-3 w-3 text-ink-400" />
              <span className="max-w-[160px] truncate">{f.name}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="text-ink-400 hover:text-danger-600">
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1 text-[11.5px] font-medium text-ink-500 hover:text-ink-800"
        >
          <Paperclip className="h-3.5 w-3.5" /> Attach
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="application/pdf,image/png,image/jpeg,image/webp,image/gif,text/plain"
          onChange={(e) => addFiles(e.target.files)}
          className="hidden"
        />
        <button
          type="button"
          onClick={send}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" /> Send reply
        </button>
      </div>
    </div>
  )
}
