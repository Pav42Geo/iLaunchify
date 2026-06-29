import Link from 'next/link'
import { requireRole } from '@ilaunchify/auth'
import { ChevronLeft } from 'lucide-react'
import { PhraseForm } from '../PhraseForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New phrase — Admin' }

export default async function NewPhrasePage() {
  await requireRole(['ADMIN'])
  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/mandatory-phrases"
          className="inline-flex items-center gap-1 text-ui-body text-ink-500 hover:text-ink-800"
        >
          <ChevronLeft className="h-4 w-4" /> Mandatory phrases
        </Link>
        <h1 className="mt-1 text-ui-title text-ink-900">New mandatory phrase</h1>
      </div>
      <PhraseForm
        mode="create"
        initial={{
          title: '',
          body: '',
          category: '',
          requirement: 'MANDATORY',
          labelingTypes: [],
          cfrCitation: null,
          appliesWhen: null,
          isActive: true,
        }}
      />
    </div>
  )
}
