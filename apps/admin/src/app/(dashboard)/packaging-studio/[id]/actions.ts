'use server'

// PackagingType hub — inline mutations. Set the container's default die-cut + toggle status.
// catalog:write-gated + audited. Additive; no schema change.

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

type PtDelegate = { update: (a: unknown) => Promise<unknown> }
const pt = () => (prisma as unknown as { packagingType?: PtDelegate }).packagingType ?? null

export async function setPackagingTypeDefaultDieCut(id: string, dieCutTemplateId: string | null): Promise<Result> {
  const admin = await requireCapability('catalog:write')
  const done = await pt()?.update({ where: { id }, data: { defaultDieCutTemplateId: dieCutTemplateId } }).catch(() => null)
  if (done === null || done === undefined) return { ok: false, error: 'Could not set the default die-cut.' }
  await logAuditAs(admin, { entityType: 'PackagingType', entityId: id, action: 'packaging.default-die-cut', payload: { dieCutTemplateId } })
  revalidatePath(`/packaging-studio/${id}`)
  return { ok: true }
}

export async function setPackagingTypeStatus(id: string, status: 'ACTIVE' | 'DEPRECATED'): Promise<Result> {
  const admin = await requireCapability('catalog:write')
  const done = await pt()?.update({ where: { id }, data: { status } }).catch(() => null)
  if (done === null || done === undefined) return { ok: false, error: 'Could not update status.' }
  await logAuditAs(admin, { entityType: 'PackagingType', entityId: id, action: 'packaging.status', payload: { status } })
  revalidatePath(`/packaging-studio/${id}`)
  return { ok: true }
}
