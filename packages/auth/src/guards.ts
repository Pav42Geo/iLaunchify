// Server-side guards for route handlers + server components.
// Throws a redirect (Next.js convention) if access fails.

import { redirect } from 'next/navigation'
import { auth } from './config'
import type { Role } from './types'

export async function requireSession() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }
  return session
}

export async function requireUser() {
  const session = await requireSession()
  return session.user
}

export async function requireRole(allowed: Role | Role[]) {
  const user = await requireUser()
  const allow = Array.isArray(allowed) ? allowed : [allowed]
  if (!allow.includes(user.role)) {
    // Scope wall UX (Shared Design Workspace C5, 2026-07-13): a DESIGNER is a
    // real, signed-in account whose entire surface is their invited design
    // workspaces — bouncing them to /login would loop a valid session. Send
    // them to their home instead. (Creator-app route; in apps without it this
    // 404s rather than loops, which is the safer failure.)
    if (user.role === 'DESIGNER') redirect('/designer')
    redirect('/login?error=unauthorized')
  }
  return user
}
