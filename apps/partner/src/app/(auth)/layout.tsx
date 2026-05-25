import type { ReactNode } from 'react'

// Pass-through layout. Each auth page owns its own page chrome:
//   - /login centers a Card on a neutral background (header in page.tsx).
//   - /signup uses a full-viewport two-column marketing+form layout.
// Keeping this layout minimal avoids the previous max-w-md clamp that
// was breaking the signup grid.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
