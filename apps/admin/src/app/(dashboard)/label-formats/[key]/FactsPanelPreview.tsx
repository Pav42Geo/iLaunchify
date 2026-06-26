'use client'

// Live sample render of the facts panel for this preset. Fabric is loaded via a
// dynamic import INSIDE the effect so it never executes during SSR (Fabric needs
// the DOM). The disposer frees the canvas on unmount / prop change.

import * as React from 'react'

export function FactsPanelPreview({
  labelingType,
  format,
}: {
  labelingType: string
  format: string
}) {
  const ref = React.useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'error'>('loading')

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    let cancelled = false
    let handle: { dispose: () => void } | null = null

    setStatus('loading')
    import('@ilaunchify/ui')
      .then(({ renderFactsPreview }) =>
        renderFactsPreview(el, { labelingType, format, width: 360, height: 440 }),
      )
      .then((h) => {
        if (cancelled) {
          h.dispose()
          return
        }
        handle = h
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
      handle?.dispose()
    }
  }, [labelingType, format])

  return (
    <div className="relative flex justify-center rounded-xl border border-ink-200 bg-[#f6f6f4] p-4">
      {status === 'loading' && (
        <span className="absolute inset-0 flex items-center justify-center text-[12px] text-ink-400">
          Rendering sample…
        </span>
      )}
      {status === 'error' && (
        <span className="absolute inset-0 flex items-center justify-center text-[12px] text-danger-500">
          Couldn’t render this format.
        </span>
      )}
      <canvas
        ref={ref}
        width={360}
        height={440}
        className={status === 'ready' ? 'max-w-full' : 'max-w-full opacity-0'}
      />
    </div>
  )
}
