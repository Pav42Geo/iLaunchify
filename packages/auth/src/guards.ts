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
    redirect('/login?error=unauthorized')
  }
  return user
}
