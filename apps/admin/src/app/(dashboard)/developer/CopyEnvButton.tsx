'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

/** Copies an env-var NAME (never a value) to the clipboard. */
export function CopyEnvButton({ name }: { name: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(name)
          setCopied(true)
          setTimeout(() => setCopied(false), 1400)
        } catch {
          /* ignore */
        }
      }}
      title={`Copy ${name}`}
      className="inline-flex items-center text-ink-400 hover:text-ink-700"
    >
      {copied ? <Check className="h-3 w-3 text-success-600" /> : <Copy className="h-3 w-3" />}
    </button>
  )
}
