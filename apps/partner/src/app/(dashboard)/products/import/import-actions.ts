'use server'

// Bulk CSV import — create a DRAFT product per row by reusing the SAME server
// actions the guided builder uses (createDraftShell → updateBasics →
// saveProduction), so every draft gets the partner's default seeding, domain
// validation, and audit for free. No new persistence logic.

import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { createDraftShell, updateBasics, saveProduction } from '../new/build-actions'

export interface ImportRow {
  name: string
  subcategoryId: string
  familyCode?: string | null
  description?: string | null
  countryOfOrigin?: string | null
  leadTimeRepeatDays?: number | null
  leadTimeFirstRunDays?: number | null
  moqMin?: number | null
  orderIncrement?: number | null
  monthlyCapacity?: number | null
  shelfLifeDays?: number | null
  netContentValue?: number | null
  netContentUnit?: string | null
}

export interface ImportResult { ok: boolean; name: string; id?: string; error?: string }

const MAX_ROWS = 200

export async function bulkImportProducts(
  rows: ImportRow[],
): Promise<{ ok: true; results: ImportResult[] } | { ok: false; error: string }> {
  try {
    const user = await requireUser()
    const partner = await prisma.partner.findUnique({ where: { userId: user.id }, select: { id: true } })
    if (!partner) return { ok: false, error: 'Partner profile not found.' }
    if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: 'Nothing to import.' }
    if (rows.length > MAX_ROWS) return { ok: false, error: `Too many rows — import up to ${MAX_ROWS} at a time.` }

    const results: ImportResult[] = []
    for (const row of rows) {
      const name = (row.name ?? '').trim()
      if (name.length < 2) { results.push({ ok: false, name: name || '(blank)', error: 'Missing product name.' }); continue }
      if (!row.subcategoryId) { results.push({ ok: false, name, error: 'No category resolved for this row.' }); continue }

      const created = await createDraftShell({ name, subcategoryId: row.subcategoryId })
      if (!created.ok) { results.push({ ok: false, name, error: created.error }); continue }
      const id = created.data.id

      // Template-level optional fields (best-effort; a field failure shouldn't
      // discard an already-created draft).
      const basics: Record<string, unknown> = {}
      if (row.familyCode != null) basics.familyCode = row.familyCode
      if (row.description != null) basics.description = row.description
      if (row.countryOfOrigin != null) basics.countryOfOrigin = row.countryOfOrigin
      if (row.leadTimeRepeatDays != null) basics.leadTimeRepeatDays = row.leadTimeRepeatDays
      if (row.leadTimeFirstRunDays != null) basics.leadTimeFirstRunDays = row.leadTimeFirstRunDays
      if (Object.keys(basics).length) {
        try { await updateBasics(id, basics) } catch { /* non-fatal */ }
      }

      // Variant-level production fields — only when the import mapped at least
      // one. Required fields filled with sensible defaults.
      const hasProd =
        row.moqMin != null || row.orderIncrement != null || row.monthlyCapacity != null ||
        row.shelfLifeDays != null || row.netContentValue != null || (row.netContentUnit?.trim() ?? '') !== ''
      if (hasProd) {
        try {
          await saveProduction(id, {
            fulfillmentMode: 'BULK_PRODUCTION',
            moqMin: row.moqMin ?? 500,
            orderIncrement: row.orderIncrement ?? 1,
            monthlyCapacity: row.monthlyCapacity ?? null,
            shelfLifeDays: row.shelfLifeDays ?? null,
            lotTracking: true,
            netContentValue: row.netContentValue ?? null,
            netContentUnit: row.netContentUnit ?? null,
          })
        } catch { /* non-fatal */ }
      }

      results.push({ ok: true, name, id })
    }

    return { ok: true, results }
  } catch (err) {
    console.error('[bulkImportProducts] failed:', err)
    return { ok: false, error: `Import failed: ${(err as Error).message}` }
  }
}
