'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Label } from '@ilaunchify/ui'
import { Scale } from 'lucide-react'
import { respondToOrderDispute } from './actions'

const CATEGORY_LABEL: Record<string, string> = {
  DAMAGED: 'Damaged',
  NOT_AS_DESCRIBED: 'Not as described',
  NOT_DELIVERED: 'Not delivered',
  QUALITY: 'Quality',
  OTHER: 'Other',
}

export function DisputeResponsePanel({
  disputeId,
  category,
  description,
  existingResponse,
}: {
  disputeId: string
  category: string
  description: string
  existingResponse: string | null
}) {
  const router = useRouter()
  const [response, setResponse] = useState('')
  const [busy, start] = useTransition()

  function submit() {
    if (response.trim().length < 5) {
      toast.error('Please add a brief response (5+ characters).')
      return
    }
    start(async () => {
      const r = await respondToOrderDispute({ disputeId, response: response.trim() })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success('Your response was sent to the admin reviewing this dispute.')
      router.refresh()
    })
  }

  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-amber-900">
          <Scale className="h-4 w-4 text-amber-700" /> A creator disputed this order
        </CardTitle>
        <CardDescription>
          {CATEGORY_LABEL[category] ?? category} — an admin is reviewing it. Add your side so they
          have the full picture before deciding.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border border-ink-200 bg-ink-50/60 px-3 py-2 text-[12.5px] text-ink-700">
          <span className="font-semibold text-ink-800">Creator&apos;s report:</span> {description}
        </div>

        {existingResponse ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-900">
            <span className="font-semibold">Your response (sent):</span> {existingResponse}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="space-y-1.5">
              <Label htmlFor="disputeResponse">Your response *</Label>
              <textarea
                id="disputeResponse"
                rows={3}
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                maxLength={2000}
                placeholder="Explain your side — what you produced, QC results, shipping records, etc."
                className="block w-full rounded-md border border-ink-300 px-3 py-2 text-sm"
              />
              <p className="text-[10.5px] text-ink-500">{response.length}/2000 · you can respond once</p>
            </div>
            <Button onClick={submit} disabled={busy} className="bg-amber-600 hover:bg-amber-700">
              Send response to admin
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
