import { redirect } from 'next/navigation'
import { auth } from '@ilaunchify/auth'

// Top-level route. Auth-aware redirect so guest prefetches from /signup or
// /login don't trigger the (dashboard)/layout.tsx's requireRole call —
// which logs a noisy JWTSessionError when there's no valid cookie.
//
//   Signed-in → /dashboard  ((dashboard) layout still validates the role)
//   Guest     → /login      (apps/marketing is the public surface)
//
// The try/catch on auth() swallows any malformed-cookie decode errors that
// might come from a prior session — instead of bubbling up to the user
// as a console error, we silently treat them as "no session".
export default async function RootPage() {
  let session
  try {
    session = await auth()
  } catch {
    session = null
  }
  if (session?.user) {
    redirect('/dashboard')
  }
  redirect('/login')
}
