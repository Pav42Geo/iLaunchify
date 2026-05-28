import type { ReactNode } from 'react'

/**
 * (auth) layout — minimal pass-through.
 *
 * Each auth page owns its own layout: signup uses a 2-column split with a
 * dark marketing panel on the left, login centers a card on cream. Wrapping
 * here would force them all into the same shape.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-cream">{children}</div>
}
