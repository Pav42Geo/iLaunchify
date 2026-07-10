// Server-side role resolution for page eyebrows. Wraps role-skins' rolePrefix
// with a request-cached fetch of the acting partner's service types, so any
// dashboard page can render a role-aware eyebrow ("Co-packing · Certifications")
// without hardcoding "Manufacturing" or re-fetching services itself.
//
// React `cache()` dedupes the lookup within a single request, so multiple
// callers (page + sub-components) share one query.

import { cache } from 'react'
import { requireUser, getPartnerAccess } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { rolePrefix } from './role-skins'

/** The acting partner's service types (founder or teammate scope), or []. */
export const getPartnerServiceTypes = cache(async (): Promise<string[]> => {
  const user = await requireUser()
  const access = await getPartnerAccess(user.id)
  if (!access || access.serviceIds.length === 0) return []
  const svc = await prisma.partnerService.findMany({
    where: { id: { in: access.serviceIds } },
    select: { type: true },
  })
  return svc.map((s) => s.type as string)
})

/** Role-word eyebrow prefix for the acting partner ("Manufacturing", "Co-packing", …). */
export const getPartnerRoleWord = cache(async (): Promise<string> =>
  rolePrefix(await getPartnerServiceTypes()),
)
