// Design Studio (Admin mode) — Die-line Curation surface. Curation is a canvas (Fabric)
// concern, so it lives here rather than in the three.js Packaging Studio. Reached from the
// admin app via the /go/dieline-studio bridge (establishes the creator session first).

import { requireCapability } from '@ilaunchify/auth'
import { loadDielineLibrary } from './loader'
import { DielineLibraryClient } from './DielineLibraryClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Die-line Curation — Admin' }

export default async function DielineCurationPage() {
  await requireCapability('catalog:write')
  const data = await loadDielineLibrary()
  return <DielineLibraryClient data={data} />
}
