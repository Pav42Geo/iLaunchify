'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Send } from 'lucide-react'
import { replyTicketAction } from '../actions'

export function ReplyForm({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [pending, start] = useTransition()

  function send() {
    const text = body.trim()
    if (!text) {
      toast.error('Reply cannot be empty.')
      return
    }
    start(async () => {
      const res = await replyTicketAction({ ticketId, body: text })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Reply sent.')
      setBody('')
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
      <div className="mt-2 flex justify-end">
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
