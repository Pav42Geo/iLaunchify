import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { ChevronLeft } from 'lucide-react'
import { PhraseForm } from '../PhraseForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Edit phrase — Admin' }

export default async function EditPhrasePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(['ADMIN'])
  const { id } = await params
  const phrase = await prisma.mandatoryPhrase.findUnique({ where: { id } }).catch(() => null)
  if (!phrase) notFound()

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/mandatory-phrases"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800"
        >
          <ChevronLeft className="h-4 w-4" /> Mandatory phrases
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">{phrase.title}</h1>
        <p className="mt-0.5 font-mono text-[12px] text-zinc-400">{phrase.slug}</p>
      </div>
      <PhraseForm
        mode="edit"
        initial={{
          id: phrase.id,
          title: phrase.title,
          body: phrase.body,
          category: phrase.category,
          requirement: phrase.requirement,
          labelingTypes: phrase.labelingTypes,
          cfrCitation: phrase.cfrCitation,
          appliesWhen: phrase.appliesWhen,
          isActive: phrase.isActive,
        }}
      />
    </div>
  )
}
