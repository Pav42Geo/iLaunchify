'use client'

// P1 — client-side PostHog provider. Initializes posthog-js once (browser only)
// and makes the client available to the tree. No-op when NEXT_PUBLIC_POSTHOG_KEY
// is unset: children render unwrapped so the app works identically without a key
// (mirrors the server DSN-guard). See docs/ANALYTICS_P1_POSTHOG_WIRING.md §4.
//
// person_profiles: 'identified_only' matches the server sink's phantom-person
// suppression — only identified users (post identifyClient) get person profiles.

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { useEffect, type ReactNode } from 'react'

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!KEY) return
    // guard double-init across fast-refresh / remounts
    if (!(posthog as unknown as { __loaded?: boolean }).__loaded) {
      posthog.init(KEY, {
        api_host: HOST,
        person_profiles: 'identified_only',
        capture_pageview: true,
        capture_pageleave: true,
      })
    }
  }, [])

  if (!KEY) return <>{children}</>
  return <PHProvider client={posthog}>{children}</PHProvider>
}
