'use client'

// Per-partner Access & Opportunity controls — the admin's lever grid.
// design/partner-access-admin-prototype.html → "Partner tab" view. Each bool
// lever is tri-state (Inherit / Allow / Deny); NAMED_REVIEWS is an audience
// select. Shows the EFFECTIVE state + source + any prerequisite block.

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { AccessLeverState } from '@ilaunchify/auth'
import type { LeverMeta } from './lever-meta'
import { setPartnerAccessOverride } from './actions'

export interface LeverRow extends LeverMeta {
  effective: boolean
  source: 'master' | 'override' | 'default' | 'prerequisite'
  blockedReason?: string
  overrideState: AccessLeverState
  /** For NAMED_REVIEWS — the resolved audience ('paid' | 'any' | 'anonymous'). */
  audienceValue?: string
}

const TRI: { s: AccessLeverState; label: string }[] = [
  { s: 'INHERIT', label: 'Inherit' },
  { s: 'ALLOW', label: 'Allow' },
  { s: 'DENY', label: 'Deny' },
]

const AUDIENCE_OPTS: { v: string; label: string }[] = [
  { v: 'INHERIT', label: 'Inherit (default)' },
  { v: 'paid', label: 'Paid creators only' },
  { v: 'any', label: 'Any logged-in' },
  { v: 'anonymous', label: 'Anonymous always' },
]

function audienceLabel(v?: string) {
  return v === 'any' ? 'Any logged-in' : v === 'anonymous' ? 'Anonymous' : 'Paid only'
}

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  const cls: Record<string, string> = {
    on: 'bg-success-50 text-success-700 border border-success-100',
    off: 'bg-ink-100 text-ink-500 border border-ink-200',
    allow: 'bg-success-500 text-white',
    deny: 'bg-danger-50 text-danger-700 border border-danger-100',
    blocked: 'bg-warning-50 text-warning-700 border border-warning-100',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] font-bold ${cls[tone]}`}>
      {children}
    </span>
  )
}

function EffBadge({ row }: { row: LeverRow }) {
  if (row.source === 'master') return <Badge tone="blocked">Master off</Badge>
  if (row.source === 'prerequisite') return <Badge tone="blocked">Blocked</Badge>
  if (row.kind === 'audience') return <Badge tone="on">{audienceLabel(row.audienceValue)}</Badge>
  if (row.source === 'override')
    return row.effective ? <Badge tone="allow">On</Badge> : <Badge tone="deny">Denied</Badge>
  return row.effective ? <Badge tone="on">On</Badge> : <Badge tone="off">Off</Badge>
}

function sourceLabel(row: LeverRow) {
  if (row.source === 'override') return `override · ${row.overrideState.toLowerCase()}`
  if (row.source === 'prerequisite') return 'prerequisite'
  if (row.source === 'master') return 'master switch'
  return 'default'
}

export function PartnerAccessControls({
  partnerId,
  rows,
}: {
  partnerId: string
  rows: LeverRow[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function commit(
    lever: LeverRow['lever'],
    state: AccessLeverState,
    value?: string | null,
  ) {
    start(async () => {
      const r = await setPartnerAccessOverride({ partnerId, lever, state, value })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success('Access updated.')
      router.refresh()
    })
  }

  const groups: { key: 'A' | 'B'; title: string }[] = [
    { key: 'A', title: 'Identity & disclosure' },
    { key: 'B', title: 'Marketplace opportunities' },
  ]

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.key}>
          <div className="mb-2 flex items-center gap-2">
            <span className="font-display text-[14px] font-bold text-ink-900">{g.title}</span>
            <span className="rounded-full bg-ink-100 px-2 py-[1px] text-[10px] font-bold uppercase tracking-wide text-ink-400">
              Group {g.key}
            </span>
          </div>
          <div className="space-y-2">
            {rows
              .filter((r) => r.group === g.key)
              .map((row) => (
                <div
                  key={row.lever}
                  className="grid grid-cols-1 items-center gap-3 rounded-xl border border-ink-200 bg-white p-3.5 sm:grid-cols-[1fr_auto_auto]"
                >
                  <div>
                    <div className="flex items-center gap-2 text-[13.5px] font-semibold text-ink-900">
                      {row.label}
                      {row.superOnly && (
                        <span className="rounded-full border border-pink-100 bg-pink-50 px-1.5 py-[1px] text-[9.5px] font-bold uppercase tracking-wide text-pink-700">
                          Super-admin
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[12px] text-ink-500">{row.desc}</div>
                    {row.source === 'prerequisite' && row.blockedReason && (
                      <div className="mt-1.5 text-[11px] font-medium text-warning-700">
                        Blocked: {row.blockedReason}
                      </div>
                    )}
                  </div>

                  {row.kind === 'audience' ? (
                    <select
                      disabled={pending}
                      value={row.overrideState === 'INHERIT' ? 'INHERIT' : row.audienceValue ?? 'paid'}
                      onChange={(e) =>
                        e.target.value === 'INHERIT'
                          ? commit(row.lever, 'INHERIT')
                          : commit(row.lever, 'ALLOW', e.target.value)
                      }
                      className="rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-ink-900 focus:border-pink-500 focus:outline-none"
                    >
                      {AUDIENCE_OPTS.map((o) => (
                        <option key={o.v} value={o.v}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="inline-flex overflow-hidden rounded-md border border-ink-300">
                      {TRI.map((t, i) => {
                        const on = row.overrideState === t.s
                        const tone =
                          t.s === 'ALLOW'
                            ? 'bg-success-500 text-white'
                            : t.s === 'DENY'
                              ? 'bg-danger-500 text-white'
                              : 'bg-ink-900 text-white'
                        return (
                          <button
                            key={t.s}
                            type="button"
                            disabled={pending}
                            onClick={() => commit(row.lever, t.s)}
                            className={
                              'px-3 py-1.5 text-[11.5px] font-bold transition-colors ' +
                              (i > 0 ? 'border-l border-ink-300 ' : '') +
                              (on ? tone : 'bg-white text-ink-500 hover:bg-ink-50')
                            }
                          >
                            {t.label}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  <div className="text-right sm:min-w-[120px]">
                    <EffBadge row={row} />
                    <div className="mt-1 text-[10px] text-ink-400">{sourceLabel(row)}</div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}
