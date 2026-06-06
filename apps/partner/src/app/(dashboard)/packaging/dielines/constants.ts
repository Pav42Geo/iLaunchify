// Slice C9 Phase 1 — labels + helpers for the partner packaging-dielines surface.
// Keep DielineStatus / DielineFileFormat in sync with packages/db/prisma/schema.prisma.

import type { DielineStatus, DielineFileFormat } from '@ilaunchify/db'

export const DIELINE_STATUS_LABELS: Record<DielineStatus, { label: string; cls: string }> = {
  UPLOADED: { label: 'Uploaded', cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  PARSED: { label: 'Parsed', cls: 'bg-sky-100 text-sky-800 ring-sky-200' },
  PARTNER_CONFIRMED: {
    label: 'Confirmed',
    cls: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  },
  ADMIN_VERIFIED: { label: 'Admin verified', cls: 'bg-violet-100 text-violet-800 ring-violet-200' },
  ACTIVE: { label: 'Active', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  ARCHIVED: { label: 'Archived', cls: 'bg-zinc-100 text-zinc-500 ring-zinc-200' },
}

// File extension → DielineFileFormat. Used to validate uploads + infer the
// originalFileFormat column.
export const DIELINE_EXT_TO_FORMAT: Record<string, DielineFileFormat> = {
  ai: 'AI',
  pdf: 'PDF',
  svg: 'SVG',
  dxf: 'DXF',
}

export const ALLOWED_DIELINE_EXTENSIONS = Object.keys(DIELINE_EXT_TO_FORMAT)

export function dielineFormatFromFilename(filename: string): DielineFileFormat | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return DIELINE_EXT_TO_FORMAT[ext] ?? null
}

export function dielineStatusLabel(s: DielineStatus): string {
  return DIELINE_STATUS_LABELS[s]?.label ?? s
}

/** Dielines eligible to bind to an offering: live + spec-confirmed. */
export const OFFERING_ELIGIBLE_DIELINE_STATUSES: DielineStatus[] = ['ACTIVE', 'PARTNER_CONFIRMED']
