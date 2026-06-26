'use client'

// Route-segment error boundary for the admin app. Readable error page +
// dev message/stack instead of the "missing required error components" loop.

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[admin] route error:', error)
  }, [error])

  const isDev = process.env.NODE_ENV === 'development'

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-ink-700">Something went wrong</p>
      <h1 className="mt-3 max-w-xl font-display text-2xl font-bold text-ink-900">This page hit an unexpected error.</h1>
      <p className="mt-2 max-w-md text-[14px] text-ink-500">Try again in a moment, or check the server logs for detail.</p>
      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-ink-900 px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        >
          Try again
        </button>
        <a
          href="/"
          className="rounded-full border border-ink-200 bg-white px-5 py-2.5 text-[14px] font-semibold text-ink-800 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        >
          Back to home
        </a>
      </div>
      {isDev && (
        <div className="mt-8 w-full max-w-2xl text-left">
          <p className="mb-1 text-[12px] font-bold uppercase tracking-wider text-ink-700">Dev error detail</p>
          <pre className="overflow-x-auto rounded-xl border border-ink-200 bg-ink-50 p-4 text-[12px] leading-relaxed text-ink-800">
            {error.message}
            {error.digest ? `\n\ndigest: ${error.digest}` : ''}
            {error.stack ? `\n\n${error.stack}` : ''}
          </pre>
        </div>
      )}
    </div>
  )
}
