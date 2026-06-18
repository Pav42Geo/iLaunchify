'use client'

// Global error boundary — catches errors in the ROOT layout itself. Renders its
// own <html>/<body> with inline styles so it works even if the app CSS or a
// shared package failed.

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[partner] global error:', error)
  }, [error])

  const isDev = process.env.NODE_ENV === 'development'

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#fff', color: '#1A1A1A' }}>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#8A8A8A', margin: 0 }}>Application error</p>
          <h1 style={{ marginTop: 12, fontSize: 24, fontWeight: 700 }}>Something went wrong.</h1>
          <p style={{ marginTop: 8, maxWidth: 420, fontSize: 14, color: '#6B6B6B' }}>Please try again. If it persists, contact ilaunchify@gmail.com.</p>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 24, borderRadius: 999, background: '#1A1A1A', color: '#fff', border: 'none', padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Try again
          </button>
          {isDev && (
            <pre style={{ marginTop: 32, maxWidth: 680, width: '100%', textAlign: 'left', overflowX: 'auto', borderRadius: 12, border: '1px solid #E5E5E5', background: '#FAFAFA', padding: 16, fontSize: 12, lineHeight: 1.6 }}>
              {error.message}
              {error.digest ? `\n\ndigest: ${error.digest}` : ''}
              {error.stack ? `\n\n${error.stack}` : ''}
            </pre>
          )}
        </div>
      </body>
    </html>
  )
}
