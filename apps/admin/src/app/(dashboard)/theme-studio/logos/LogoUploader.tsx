'use client'

// One logo slot: live preview (on a light or dark checkerboard depending on the
// variant), an upload control, and a remove button. Uses the server actions in
// ./actions; refreshes the route on success.

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { uploadPlatformLogo, deletePlatformLogo } from './actions'
import type { LogoKind, LogoVariant } from '@ilaunchify/db'

export function LogoSlot({
  kind,
  variant,
  currentUrl,
}: {
  kind: LogoKind
  variant: LogoVariant
  currentUrl: string | null
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const dark = variant === 'dark'

  function onPick(file: File | undefined) {
    if (!file) return
    setError(null)
    const fd = new FormData()
    fd.set('kind', kind)
    fd.set('variant', variant)
    fd.set('file', file)
    start(async () => {
      const res = await uploadPlatformLogo(fd)
      if (!res.ok) setError(res.error)
      else router.refresh()
    })
  }

  function onRemove() {
    setError(null)
    start(async () => {
      const res = await deletePlatformLogo(kind, variant)
      if (!res.ok) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="rounded-2xl border border-ink-200 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[length:var(--fs-2xs)] font-semibold uppercase tracking-wide text-ink-600">{variant}</span>
        {currentUrl && (
          <button
            type="button"
            onClick={onRemove}
            disabled={pending}
            className="text-[length:var(--fs-2xs)] font-medium text-ink-500 hover:text-pink-700 disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </div>

      {/* Preview surface */}
      <div
        className="mt-2 flex h-24 items-center justify-center rounded-xl border"
        style={{
          background: dark ? '#15161A' : '#FFFFFF',
          borderColor: dark ? '#2A2C33' : 'var(--color-ink-200, #E5E2DC)',
        }}
      >
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currentUrl} alt={`${kind} ${variant} logo`} className="max-h-16 max-w-[85%] object-contain" />
        ) : (
          <span className="text-[length:var(--fs-2xs)]" style={{ color: dark ? '#6B6E78' : '#9C9890' }}>
            No {variant} logo yet
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="mt-2 w-full rounded-pill border border-ink-300 bg-white px-3 py-1.5 text-[length:var(--fs-xs)] font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-50"
      >
        {pending ? 'Uploading…' : currentUrl ? 'Replace' : 'Upload'}
      </button>

      {error && <p className="mt-1.5 text-[length:var(--fs-2xs)] text-pink-700">{error}</p>}
    </div>
  )
}
