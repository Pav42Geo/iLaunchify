// Slice C9 Phase 1 — labels + helpers for the partner packaging-dielines surface.
// Keep DielineStatus / DielineFileFormat in sync with packages/db/prisma/schema.prisma.

import type { DielineStatus, DielineFileFormat } from '@ilaunchify/db'

export const DIELINE_STATUS_LABELS: Record<DielineStatus, { label: string; cls: string }> = {
  UPLOADED: { label: 'Uploaded', cls: 'bg-ink-100 text-ink-700 ring-ink-200' },
  PARSED: { label: 'Parsed', cls: 'bg-info-100 text-info-800 ring-info-200' },
  PARTNER_CONFIRMED: {
    label: 'Confirmed',
    cls: 'bg-info-100 text-info-800 ring-info-200',
  },
  ADMIN_VERIFIED: { label: 'Admin verified', cls: 'bg-info-100 text-info-800 ring-info-200' },
  ACTIVE: { label: 'Active', cls: 'bg-success-100 text-success-800 ring-success-200' },
  ARCHIVED: { label: 'Archived', cls: 'bg-ink-100 text-ink-500 ring-ink-200' },
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
