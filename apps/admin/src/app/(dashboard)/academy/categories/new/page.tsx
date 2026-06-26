// Admin Academy — new topic (ACADEMY_SPEC §8). Pick the audience + name; the
// topic is created in DRAFT and you land in the editor to fill the rest.

import { requireRole } from '@ilaunchify/auth'
import { AdminDetailHeader } from '@/components/AdminDetailHeader'
import { NewCategoryForm } from './NewCategoryForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New topic — Academy' }

export default async function NewCategoryPage() {
  await requireRole('ADMIN')
  return (
    <div className="space-y-6">
      <AdminDetailHeader
        backHref="/academy/categories"
        backLabel="Back to topics"
        title="New topic"
      />
      <p className="max-w-xl text-[13px] text-ink-600">Choose which academy this topic belongs to and give it a name. It starts as a draft — you can set its icon, description, and order next.</p>
      <NewCategoryForm />
    </div>
  )
}
