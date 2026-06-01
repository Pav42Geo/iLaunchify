import { redirect } from 'next/navigation'
import { auth } from '@ilaunchify/auth'

// Top-level route. Auth-aware redirect so guest prefetches don't trigger
// the (dashboard)/layout.tsx requireRole call — which would log a noisy
// JWTSessionError when there's no valid cookie.
//
//   Signed-in ADMIN → /dashboard  ((dashboard) layout still validates the role)
//   Otherwise       → /login
export default async function AdminRoot() {
  const session = await auth()
  if (session?.user?.role === 'ADMIN') redirect('/dashboard')
  redirect('/login')
}
