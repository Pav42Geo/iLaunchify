// =============================================================================
// Partner Die-line Studio — server entry. Loads the die-line + renders the
// full-screen Studio shell. docs/DIELINE_FRAME_EDITOR_SPEC.md §7b.
// =============================================================================

import { notFound } from 'next/navigation'
import { loadDieline } from '../../../(dashboard)/packaging/dielines/actions'
import { DielineStudioShell } from './DielineStudioShell'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Die-line Studio' }

interface PageProps {
  params: Promise<{ dielineId: string }>
}

export default async function DielineStudioPage({ params }: PageProps) {
  const { dielineId } = await params
  const res = await loadDieline(dielineId)
  if (!res.ok) notFound()
  return <DielineStudioShell dieline={res.data} />
}
