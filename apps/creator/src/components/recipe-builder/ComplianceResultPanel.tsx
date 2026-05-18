'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import type { ComplianceResult } from '@ilaunchify/types'

interface ComplianceResultPanelProps {
  result: ComplianceResult | null
  errorMessage?: string
}

export function ComplianceResultPanel({ result, errorMessage }: ComplianceResultPanelProps) {
  if (errorMessage) {
    return (
      <Card className="border-amber-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Compliance check unavailable
          </CardTitle>
          <CardDescription>{errorMessage}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-zinc-500">
            Your recipe is saved. Re-save to retry — the check runs against the Python compliance
            service at <code>$COMPLIANCE_SERVICE_URL</code>.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (!result) return null

  const { outcome, violations, warnings, disclosures, rulePackVersion } = result

  const palette =
    outcome === 'PASSED'
      ? { border: 'border-green-300', icon: CheckCircle2, color: 'text-green-600', label: 'Compliant' }
      : outcome === 'PASSED_WITH_WARNINGS'
        ? { border: 'border-amber-300', icon: AlertTriangle, color: 'text-amber-600', label: 'Passed with warnings' }
        : { border: 'border-red-300', icon: AlertCircle, color: 'text-red-600', label: 'Not compliant' }

  const Icon = palette.icon

  return (
    <Card className={palette.border}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className={`h-4 w-4 ${palette.color}`} />
          {palette.label}
        </CardTitle>
        <CardDescription>
          Checked against <code>{rulePackVersion}</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {violations.length > 0 && (
          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase text-red-700">
              {violations.length} Blocking violation{violations.length === 1 ? '' : 's'}
            </h4>
            <ul className="space-y-2">
              {violations.map((v, i) => (
                <li key={i} className="rounded-md bg-red-50 p-2 text-sm">
                  <div className="font-medium text-red-900">{v.message}</div>
                  {v.cfrCitation && (
                    <div className="mt-0.5 text-xs text-red-700">{v.cfrCitation}</div>
                  )}
                  {v.suggestedFix && (
                    <div className="mt-1 text-xs text-zinc-700">
                      <span className="font-semibold">Fix:</span> {v.suggestedFix}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {warnings.length > 0 && (
          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase text-amber-700">
              {warnings.length} Warning{warnings.length === 1 ? '' : 's'}
            </h4>
            <ul className="space-y-2">
              {warnings.map((w, i) => (
                <li key={i} className="rounded-md bg-amber-50 p-2 text-sm">
                  <div className="font-medium">{w.message}</div>
                  {w.cfrCitation && (
                    <div className="mt-0.5 text-xs text-amber-700">{w.cfrCitation}</div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {disclosures.length > 0 && (
          <section>
            <h4 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-zinc-700">
              <Info className="h-3 w-3" />
              Required disclosures on label ({disclosures.length})
            </h4>
            <ul className="space-y-2">
              {disclosures.map((d) => (
                <li key={d.id} className="rounded-md bg-zinc-50 p-2 text-sm">
                  <div className="text-zinc-900">{d.text}</div>
                  <div className="mt-0.5 text-xs text-zinc-500">Placement: {d.placement}</div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {outcome === 'PASSED' && violations.length === 0 && warnings.length === 0 && (
          <p className="text-sm text-zinc-600">
            No violations or warnings. Continue to label design when ready.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
