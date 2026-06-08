// DEPRECATED 2026-06-07 — the Blank/Clone/Starter chooser was replaced by the
// single turnkey flow at /products/new. This stub redirects any old links or
// bookmarks. Safe to `git rm` this folder once confirmed.
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function NewProductCloneRedirect() {
  redirect('/products/new')
}
