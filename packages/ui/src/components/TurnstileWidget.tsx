'use client'
// Cloudflare Turnstile widget (H5 A4 — docs/A4_TURNSTILE_BUILD_SPEC_2026-07-11.md §2).
//
// Reusable across all four auth apps. Loads Cloudflare's api.js once (module-level,
// explicit-render mode), renders the widget into a div, and hands the token to the
// parent via onToken(token). Expiry/error → onToken(null) so the parent can gate its
// submit on a live token.
//
// Feature-gated: renders NOTHING when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset, so
// unconfigured dev/preview simply shows no widget (the server verifier then skips too).

import * as React from 'react'

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface TurnstileRenderOptions {
  sitekey: string
  callback: (token: string) => void
  'expired-callback'?: () => void
  'error-callback'?: () => void
  theme?: 'auto' | 'light' | 'dark'
}

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: TurnstileRenderOptions) => string
      remove: (id: string) => void
      reset: (id?: string) => void
    }
  }
}

// Load the Cloudflare script exactly once per page, shared across every widget instance.
let scriptPromise: Promise<void> | null = null
function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)
    if (existing) {
      if (window.turnstile) return resolve()
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('turnstile script failed to load')))
      return
    }
    const s = document.createElement('script')
    s.src = SCRIPT_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('turnstile script failed to load'))
    document.head.appendChild(s)
  })
  return scriptPromise
}

export interface TurnstileWidgetProps {
  /** Called with the token on success, or null on expiry/error (so the parent re-gates). */
  onToken: (token: string | null) => void
  className?: string
}

export function TurnstileWidget({ onToken, className }: TurnstileWidgetProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const widgetIdRef = React.useRef<string | null>(null)
  // Hold the latest onToken in a ref so the render effect can stay mount-only (no
  // re-render/re-mount of the widget when the parent passes a new callback identity).
  const onTokenRef = React.useRef(onToken)
  React.useEffect(() => {
    onTokenRef.current = onToken
  }, [onToken])

  React.useEffect(() => {
    if (!SITE_KEY || !containerRef.current) return
    let cancelled = false
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return
        if (widgetIdRef.current) return // guard React StrictMode double-invoke
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          callback: (token) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
          theme: 'auto',
        })
      })
      .catch(() => onTokenRef.current(null))
    return () => {
      cancelled = true
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch {
          /* already gone */
        }
        widgetIdRef.current = null
      }
    }
  }, [])

  if (!SITE_KEY) return null
  return <div ref={containerRef} className={className} />
}
