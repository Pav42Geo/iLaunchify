// Admin Academy — new topic (ACADEMY_SPEC §8). Pick the audience + name; the
// topic is created in DRAFT and you land in the editor to fill the rest.

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireRole } from '@ilaunchify/auth'
import { NewCategoryForm } from './NewCategoryForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New topic — Academy' }

export default async function NewCategoryPage() {
  await requireRole('ADMIN')
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <Link href="/academy/categories" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-pink-700 hover:text-pink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 focus-visible:rounded">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to topics
        </Link>
        <h1 className="mt-3 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">New topic</h1>
        <p className="mt-1 max-w-xl text-[13px] text-ink-600">Choose which academy this topic belongs to and give it a name. It starts as a draft — you can set its icon, description, and order next.</p>
      </div>
      <NewCategoryForm />
    </div>
  )
}
