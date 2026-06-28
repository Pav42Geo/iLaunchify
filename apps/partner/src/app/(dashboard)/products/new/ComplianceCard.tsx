'use client'

// Builder Compliance scan card (consolidation — Review step). Mirrors the
// editor: the structural checks we can run live; the full FDA scan pends (#131).
// Rendered in GuidedBuilder's `.gb` scope.

import { useCallback, useEffect, useState } from 'react'
import { loadComplianceChecks, type ComplianceCheck } from './build-actions'
import { ShieldCheck } from 'lucide-react'

function Mark({ status }: { status: ComplianceCheck['status'] }) {
  if (status === 'ok') return <span style={{ color: '#1D9E75', fontWeight: 700 }}>✓</span>
  if (status === 'fail') return <span style={{ color: '#e24b4a', fontWeight: 700 }}>✕</span>
  return <span className="muted" style={{ fontSize: 11 }}>⋯</span>
}

export function ComplianceCard({ draftId }: { draftId: string | null }) {
  const [checks, setChecks] = useState<ComplianceCheck[]>([])
  const refresh = useCallback(() => { if (draftId) void loadComplianceChecks(draftId).then(setChecks) }, [draftId])
  useEffect(() => { refresh() }, [refresh])

  const fails = checks.filter((c) => c.status === 'fail').length

  return (
    <div className="card">
      <div className="section-title"><span className="ic"><ShieldCheck size={16} strokeWidth={2} /></span> Compliance scan
        {checks.length > 0 && <span className={`pill ${fails ? 'amber' : 'green'}`} style={{ marginLeft: 8, fontSize: 10 }}>{fails ? `${fails} to fix` : 'structural OK'}</span>}
        <i className="info" data-tip="Structural checks run live here. The full FDA scan (nutrient %DV, font sizes, banned-list) runs at the compliance check after submit." tabIndex={0} role="img" aria-label="About the scan">i</i>
      </div>
      {!draftId && <p className="tiny muted" style={{ marginTop: 8 }}>Save the draft to run checks.</p>}
      {draftId && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 6 }}>
          {checks.map((c) => (
            <li key={c.label} style={{ display: 'flex', gap: 9, alignItems: 'center', fontSize: 12.5 }}>
              <Mark status={c.status} />
              <span style={c.status === 'pending' ? { color: 'var(--ink-500)' } : undefined}>{c.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
