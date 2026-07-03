// Role-specific document-track checklist — Partner Role Accounts P0
// (docs/PARTNER_ROLE_ACCOUNTS.md §4.1). Rendered above the DOCUMENTS
// SectionReview as a context block (same pattern as BusinessContext /
// CapabilitiesContext): the reviewer sees exactly which documents this
// partner's ROLE requires, what's been uploaded against each, and expiry
// state — instead of eyeballing a flat file list.
//
// Requirement semantics: REQUIRED gates verification; CONDITIONAL is judged
// by the reviewer (the partner saw the same condition note); OPTIONAL is
// informational. Docs sharing a PartnerFileKind (several CERTIFICATE rows)
// show the same file pool — the labels say what to look for.

import { CheckCircle2, XCircle, CircleDashed, Clock3 } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import type { DocRequirement } from '@ilaunchify/db'

interface FileLite {
  id: string
  sectionType: string
  kind: string
  originalFilename: string
  uploadedAt: Date
  expiresAt: Date | null
}

const LEVEL_CHIP: Record<string, string> = {
  REQUIRED: 'bg-danger-50 text-danger-700',
  CONDITIONAL: 'bg-warning-50 text-warning-700',
  OPTIONAL: 'bg-ink-100 text-ink-600',
}

export function DocTrackChecklist({
  track,
  files,
  now = new Date(),
}: {
  track: DocRequirement[]
  files: FileLite[]
  now?: Date
}) {
  const docs = track.filter((d) => d.sectionType === 'DOCUMENTS' || d.sectionType === 'BUSINESS')
  if (docs.length === 0) return null

  return (
    <div className="rounded-2xl border border-ink-200 bg-white">
      <header className="border-b border-ink-200 bg-[var(--bg-hero)] px-5 py-3">
        <h3 className="font-display text-[14px] font-semibold text-ink-900">
          Role document track
        </h3>
        <p className="text-[12px] text-ink-600">
          Requirements derive from this partner&apos;s service types (§4.1). Conditional rows are
          your judgment call — the partner saw the same condition.
        </p>
      </header>
      <ul className="divide-y divide-ink-50">
        {docs.map((d) => {
          const matched = files.filter((f) => f.sectionType === d.sectionType && f.kind === d.kind)
          const hasFiles = matched.length > 0
          const expired = matched.some((f) => f.expiresAt && f.expiresAt < now)
          const missingRequired = d.requirement === 'REQUIRED' && !hasFiles
          return (
            <li key={d.key} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
              {missingRequired ? (
                <XCircle className="h-4 w-4 shrink-0 text-danger-500" aria-hidden="true" />
              ) : expired ? (
                <Clock3 className="h-4 w-4 shrink-0 text-warning-600" aria-hidden="true" />
              ) : hasFiles ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success-500" aria-hidden="true" />
              ) : (
                <CircleDashed className="h-4 w-4 shrink-0 text-ink-300" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium text-ink-900">{d.label}</span>
                  <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium uppercase', LEVEL_CHIP[d.requirement])}>
                    {d.requirement === 'CONDITIONAL' ? 'If applicable' : d.requirement.toLowerCase()}
                  </span>
                </div>
                {d.conditionNote && (
                  <p className="text-[11.5px] text-ink-500">{d.conditionNote}</p>
                )}
              </div>
              <div className="text-right text-[11.5px] text-ink-500">
                {hasFiles ? (
                  <>
                    <span className="tabular-nums">{matched.length}</span> file{matched.length === 1 ? '' : 's'}
                    {matched.some((f) => f.expiresAt) && (
                      <span className={cn('block', expired ? 'font-medium text-danger-600' : '')}>
                        {expired ? 'EXPIRED — ' : 'expires '}
                        {matched
                          .filter((f) => f.expiresAt)
                          .map((f) => f.expiresAt!.toLocaleDateString())
                          .join(', ')}
                      </span>
                    )}
                  </>
                ) : (
                  <span className={missingRequired ? 'font-medium text-danger-600' : ''}>
                    {missingRequired ? 'Missing' : 'Not uploaded'}
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
