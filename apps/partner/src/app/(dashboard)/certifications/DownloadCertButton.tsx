'use client'

// Download-own-PDF button for a certificate row. Fetches a short-lived signed
// URL via getCertPdfUrl (ownership-checked + audited server-side) and opens it.

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Download } from 'lucide-react'
import { getCertPdfUrl } from './actions'

export function DownloadCertButton({ instanceId }: { instanceId: string }) {
  const [pending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      const res = await getCertPdfUrl(instanceId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      window.open(res.url, '_blank', 'noopener')
    })
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-900 transition-colors hover:bg-ink-50 disabled:opacity-50"
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      {pending ? 'Signing…' : 'Download'}
    </button>
  )
}
