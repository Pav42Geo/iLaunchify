// Phase H2 — read-only display of the structured changeRequest payload
// the partner filed (or that's pending on a CHANGES_REQUESTED dispatch
// they're awaiting creator action on).

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { AlertOctagon } from 'lucide-react'

interface ChangeRequest {
  flaggedFields: string[]
  partnerNote: string
  suggestedAlternatives?: Record<string, string>
  requestedAt: string
}

interface Props {
  changeRequest: ChangeRequest | null
  status: string
}

const FIELD_LABEL: Record<string, string> = {
  quantity: 'Quantity',
  substrate: 'Substrate',
  packagingMaterial: 'Packaging material',
  finishes: 'Finishes',
  shipTo: 'Ship-to',
  leadTime: 'Lead time',
  other: 'Other',
}

export function ChangeRequestCard({ changeRequest, status }: Props) {
  if (!changeRequest || status !== 'CHANGES_REQUESTED') return null
  return (
    <Card className="border-warning-200 bg-warning-50/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-warning-900">
          <AlertOctagon className="h-4 w-4" />
          Awaiting creator adjustment
        </CardTitle>
        <CardDescription>
          You flagged {changeRequest.flaggedFields.length}{' '}
          {changeRequest.flaggedFields.length === 1 ? 'field' : 'fields'} on{' '}
          {new Date(changeRequest.requestedAt).toLocaleString()}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-widest text-warning-700">
            Flagged fields
          </p>
          <div className="flex flex-wrap gap-1.5">
            {changeRequest.flaggedFields.map((f) => (
              <span
                key={f}
                className="inline-flex rounded-full bg-warning-200 px-2 py-0.5 text-[10.5px] font-semibold text-warning-900"
              >
                {FIELD_LABEL[f] ?? f}
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-widest text-warning-700">
            Your note
          </p>
          <p className="rounded border border-warning-200 bg-white p-2 text-[13px] leading-snug text-ink-700">
            {changeRequest.partnerNote}
          </p>
        </div>
        {Object.keys(changeRequest.suggestedAlternatives ?? {}).length > 0 && (
          <div>
            <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-widest text-warning-700">
              Suggested alternatives
            </p>
            <ul className="space-y-0.5 text-[12.5px]">
              {Object.entries(changeRequest.suggestedAlternatives ?? {}).map(([k, v]) => (
                <li key={k}>
                  <span className="font-medium text-ink-700">{FIELD_LABEL[k] ?? k}:</span>{' '}
                  <span className="text-ink-600">{v}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
