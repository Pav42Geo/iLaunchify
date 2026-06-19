'use server'

// Version-history actions for the partner product-builder draft (EditSnapshot,
// entityType = 'PRODUCT_TEMPLATE_DRAFT'). The full draft is serialized via the
// existing loadDraft() reader (which is ownership-checked), so a snapshot is a
// complete InitialDraft document. Retention/coalesce handled in @ilaunchify/db.
//
// RESTORE is intentionally NOT here yet: re-applying an InitialDraft spans ~10
// child tables and must compose the tested per-collection writers in
// build-actions transactionally — a follow-up so a buggy rewrite can't destroy a
// draft. History records + lists now; the drawer shows it read-only on the
// builder. See docs/VERSION_HISTORY.md §Builder.

import { createSnapshot, listSnapshots, type SnapshotKind, type SnapshotMeta } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { loadDraft } from './build-actions'

/** Snapshot the current draft into history. AUTO = throttled background (coalesced); MILESTONE = pinned. */
export async function snapshotDraft(
  templateId: string,
  kind: SnapshotKind = 'AUTO',
  label?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await requireUser()
    const draft = await loadDraft(templateId) // ownership-checked; null when not owned/found
    if (!draft) return { ok: false, error: 'Draft not found' }
    await createSnapshot({
      entityType: 'PRODUCT_TEMPLATE_DRAFT',
      entityId: templateId,
      snapshot: draft as unknown,
      kind,
      label: label ?? null,
      createdById: user.id,
    })
    return { ok: true }
  } catch (err) {
    console.warn('[builder/snapshotDraft] failed:', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Snapshot failed' }
  }
}

/** List draft version-history metadata (newest first) for the drawer. */
export async function listDraftSnapshots(templateId: string): Promise<SnapshotMeta[]> {
  const draft = await loadDraft(templateId) // ownership gate
  if (!draft) return []
  return listSnapshots('PRODUCT_TEMPLATE_DRAFT', templateId)
}
