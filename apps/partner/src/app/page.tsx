import { redirect } from 'next/navigation'
import { auth } from '@ilaunchify/auth'
import { marketingUrl } from '@/lib/marketing-url'

// Top-level route on the partner app. Auth-aware so guest prefetches from
// /signup or /login don't trigger any dashboard layout's requireRole call
// — which would log a JWTSessionError on stale or missing cookies.
//
//   Signed-in partner → /dashboard
//   Guest             → apps/marketing/business (the public partner landing)
//
// The try/catch on auth() swallows malformed-cookie decode errors silently
// instead of bubbling them up to the console.
export default async function PartnersIndex() {
  let session
  try {
    session = await auth()
  } catch {
    session = null
  }
  if (session?.user) {
    redirect('/dashboard')
  }
  redirect(marketingUrl('/business'))
}
