'use server'

// Roles & Permissions (docs/ADMIN_RBAC.md P5). SUPER_ADMIN-only (users:admin):
// grant/revoke a capability for one admin role. SUPER_ADMIN is not editable
// (always all capabilities). Every change is audited.

import {
  requireCapability,
  ALL_CAPABILITIES,
  resolveCapabilities,
  type AdminRole,
  type Capability,
} from '@ilaunchify/auth'
import { setRoleCapability, setRoleCapabilities } from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

const EDITABLE_ROLES: AdminRole[] = ['SUPPORT_AGENT', 'SUPPORT_LEAD', 'BILLING_ADMIN']

export async function setRoleCapabilityAction(input: {
  role: AdminRole
  capability: Capability
  enabled: boolean
}): Promise<Result> {
  const actor = await requireCapability('users:admin')

  if (!EDITABLE_ROLES.includes(input.role)) {
    return { ok: false, error: 'That role is not editable (Super admin always has all access).' }
  }
  if (!(ALL_CAPABILITIES as string[]).includes(input.capability)) {
    return { ok: false, error: 'Unknown capability.' }
  }

  await setRoleCapability(input.role, input.capability, input.enabled)

  await logAuditAs(actor, {
    entityType: 'AdminRole',
    entityId: input.role,
    action: input.enabled ? 'ROLE_CAPABILITY_GRANTED' : 'ROLE_CAPABILITY_REVOKED',
    toValue: input.capability,
  })

  revalidatePath('/roles')
  return { ok: true }
}

/**
 * Replace a role's whole capability set with its suggested preset bundle
 * (docs/ADMIN_RBAC.md role matrix). One click — overwrites whatever the role
 * currently holds. Super admin is never editable. Audited.
 */
export async function applyRolePresetAction(input: { role: AdminRole }): Promise<Result> {
  const actor = await requireCapability('users:admin')

  if (!EDITABLE_ROLES.includes(input.role)) {
    return { ok: false, error: 'That role is not editable (Super admin always has all access).' }
  }

  const preset = resolveCapabilities(input.role) // concrete list for non-super roles
  await setRoleCapabilities(input.role, preset)

  await logAuditAs(actor, {
    entityType: 'AdminRole',
    entityId: input.role,
    action: 'ROLE_PRESET_APPLIED',
    toValue: preset.join(', '),
  })

  revalidatePath('/roles')
  return { ok: true }
}
