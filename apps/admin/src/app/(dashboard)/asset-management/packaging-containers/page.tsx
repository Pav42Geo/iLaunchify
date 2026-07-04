// Container Die-lines was folded into the Die-cut Templates module as its "Container
// assignments" tab (2026-07-04, docs/DIE_CUT_TEMPLATES_MODULE.md). This route now redirects
// there so old links keep working; the die-cut + domain pickers live in that tab.

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function PackagingContainersPage() {
  redirect('/asset-management/die-cut-templates?tab=containers')
}
