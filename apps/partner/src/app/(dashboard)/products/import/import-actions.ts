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
  // When set, the row's category had no iLaunchify match: import under the resolved
  // (default) subcategory but flag the draft for admin category review, carrying the
  // manufacturer's own category text as the suggestion.
  suggestedCategoryName?: string | null
  // Partner-private external references for their own tracking (ERP id, warehouse
  // code, …). Reference-only; never used by platform logic.
  manufacturerRefs?: { label: string; value: string }[] | null
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

      // Category review: the row's category had no iLaunchify match → it imported
      // under the default subcategory, but flag it so an admin can re-file it,
      // carrying the manufacturer's own category text. Cast-guarded (the columns
      // post-date the generated client until the Mac db push). Best-effort.
      const extra: Record<string, unknown> = {}
      const suggested = (row.suggestedCategoryName ?? '').trim()
      if (suggested) { extra.needsCategoryReview = true; extra.suggestedCategoryName = suggested.slice(0, 120) }
      // Partner-private external references — keep at most 8, trim label/value.
      const refs = (row.manufacturerRefs ?? [])
        .filter((r) => r && typeof r.value === 'string' && r.value.trim() !== '')
        .slice(0, 8)
        .map((r) => ({ label: (r.label || 'Reference').trim().slice(0, 40), value: r.value.trim().slice(0, 120) }))
      if (refs.length) extra.manufacturerRefs = refs
      if (Object.keys(extra).length) {
        try {
          await (prisma as unknown as {
            productTemplate: { update: (a: unknown) => Promise<unknown> }
          }).productTemplate.update({ where: { id }, data: extra })
        } catch { /* non-fatal — draft still created */ }
      }

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

// -----------------------------------------------------------------------------
// Optional .xlsx parsing — server-side, behind a guarded dynamic import so the
// build never depends on the package. Ready the moment `pnpm add xlsx` runs;
// until then .xlsx uploads get a friendly "export to CSV" message. CSV parsing
// stays client-side. The variable specifier (typed `string`) keeps TS from
// resolving the module at compile time.
// -----------------------------------------------------------------------------

export async function parseSpreadsheet(
  base64: string,
): Promise<{ ok: true; headers: string[]; rows: string[][] } | { ok: false; error: string }> {
  try {
    const specifier: string = 'xlsx'
    let XLSX: {
      read: (data: unknown, opts: unknown) => { SheetNames: string[]; Sheets: Record<string, unknown> }
      utils: { sheet_to_json: (ws: unknown, opts: unknown) => unknown[][] }
    }
    try {
      XLSX = (await import(specifier)) as never
    } catch {
      return { ok: false, error: 'Excel support isn’t installed yet — export your sheet to CSV, or have an admin add the “xlsx” package.' }
    }
    const buf = Buffer.from(base64, 'base64')
    const wb = XLSX.read(buf, { type: 'buffer' })
    const first = wb.SheetNames[0]
    if (!first) return { ok: false, error: 'That workbook has no sheets.' }
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[first], { header: 1, blankrows: false, defval: '' })
    const headers = (aoa.shift() ?? []).map((x) => String(x ?? '').trim())
    const rows = aoa.map((r) => r.map((x) => String(x ?? '')))
    return { ok: true, headers, rows }
  } catch (e) {
    return { ok: false, error: `Could not read the spreadsheet: ${(e as Error).message}` }
  }
}
