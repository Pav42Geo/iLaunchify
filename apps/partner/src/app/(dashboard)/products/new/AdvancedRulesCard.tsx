'use client'

// Phase 3 configurator editors (docs/PRODUCT_CONFIGURATOR_CONSTRAINTS.md §6,§7):
//  • CompatibilityRulesCard (#5) — cross-option EXCLUDE/REQUIRE rules. Endpoints
//    are stable "axisKey:valueLabel" composite keys (id-churn-safe).
//  • ApprovalTriggersCard (#7) — which change type re-triggers which approver.
// Both self-contained with debounced autosave (not lifted — not used elsewhere).
// Rendered inside GuidedBuilder's `.gb` style scope.

import { useEffect, useRef, useState } from 'react'
import { saveOptionRules, saveChangeApprovalRules, type OptionRuleInput, type ChangeApprovalRuleInput, type InitialDraft } from './build-actions'
import type { OptionAxisUI } from './OptionAxesCard'
import { Settings2, Ban } from 'lucide-react'

// ---------------------------------------------------------------------------
// #7 Approval triggers
// ---------------------------------------------------------------------------

const CHANGE_TYPES: Array<{ key: ChangeApprovalRuleInput['changeType']; label: string }> = [
  { key: 'LABEL_COPY', label: 'Label copy change' },
  { key: 'FLAVOR_ADD', label: 'New flavor / option value' },
  { key: 'RECIPE_CHANGE', label: 'Recipe change' },
  { key: 'PACKAGING_CHANGE', label: 'Packaging change' },
  { key: 'PRICE_CHANGE', label: 'Price change' },
]
const APPROVERS: Array<{ key: ChangeApprovalRuleInput['requiredApprover']; label: string }> = [
  { key: 'BRAND_OPS', label: 'Brand Ops' },
  { key: 'MANUFACTURER_QA', label: 'Manufacturer QA' },
  { key: 'LEGAL', label: 'Legal' },
  { key: 'PRODUCTION_SCHEDULING', label: 'Production Scheduling' },
]
// Sensible platform defaults.
const DEFAULT_APPROVER: Record<string, ChangeApprovalRuleInput['requiredApprover']> = {
  LABEL_COPY: 'LEGAL', FLAVOR_ADD: 'MANUFACTURER_QA', RECIPE_CHANGE: 'MANUFACTURER_QA',
  PACKAGING_CHANGE: 'PRODUCTION_SCHEDULING', PRICE_CHANGE: 'BRAND_OPS',
}

export function ApprovalTriggersCard({ draftId, initialRules }: { draftId: string | null; initialRules?: InitialDraft['changeApprovalRules'] }) {
  const [rules, setRules] = useState<Record<string, ChangeApprovalRuleInput['requiredApprover']>>(() => {
    // Seed from saved per-template overrides; fall back to platform defaults.
    const seed = { ...DEFAULT_APPROVER }
    for (const r of initialRules ?? []) seed[r.changeType] = r.requiredApprover as ChangeApprovalRuleInput['requiredApprover']
    return seed
  })
  // If we loaded saved overrides, skip the first autosave so a resume doesn't
  // re-write identical rows. A brand-new draft (no saved rules) still persists
  // the sensible defaults on first mount.
  const hydrated = useRef((initialRules?.length ?? 0) > 0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!draftId) return
    if (!hydrated.current) { hydrated.current = true; void saveChangeApprovalRules(draftId, CHANGE_TYPES.map((c, i) => ({ changeType: c.key, requiredApprover: rules[c.key]!, sortOrder: i }))); return }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const payload: ChangeApprovalRuleInput[] = CHANGE_TYPES.map((c, i) => ({ changeType: c.key, requiredApprover: rules[c.key]!, sortOrder: i }))
      void saveChangeApprovalRules(draftId, payload)
    }, 800)
    return () => { if (timer.current) clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, draftId])

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="section-title"><span className="ic"><Settings2 size={16} strokeWidth={2} /></span> Changes that need re-approval</div>
      <table style={{ marginTop: 12 }}>
        <thead><tr><th>Change type</th><th>Required approver</th></tr></thead>
        <tbody>
          {CHANGE_TYPES.map((c) => (
            <tr key={c.key}>
              <td>{c.label}</td>
              <td>
                <select className="sel" style={{ maxWidth: 240 }} value={rules[c.key]} onChange={(e) => setRules({ ...rules, [c.key]: e.target.value as ChangeApprovalRuleInput['requiredApprover'] })}>
                  {APPROVERS.map((ap) => <option key={ap.key} value={ap.key}>{ap.label}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// #5 Compatibility rules
// ---------------------------------------------------------------------------

interface RuleRow { kind: 'EXCLUDE' | 'REQUIRE'; whenKey: string; targetKey: string; message: string }

export function CompatibilityRulesCard({ draftId, axes, initialRules }: { draftId: string | null; axes: OptionAxisUI[]; initialRules?: InitialDraft['optionRules'] }) {
  const [rules, setRules] = useState<RuleRow[]>(
    () => (initialRules ?? []).map((r) => ({ kind: r.kind, whenKey: r.whenValueId, targetKey: r.targetValueId, message: r.message ?? '' })),
  )
  // Skip the first autosave so resuming a draft never re-writes (or, on an empty
  // mount, wipes) the saved rules before the user touches anything.
  const hydrated = useRef(false)

  // Stable value options: "axisKey:valueLabel" → "Axis: Value".
  const options = axes.flatMap((a) =>
    a.values.filter((v) => v.label.trim()).map((v) => ({ key: `${a.key}:${v.label.trim()}`, label: `${a.label || a.key}: ${v.label.trim()}` })),
  )

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!draftId) return
    if (!hydrated.current) { hydrated.current = true; return }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const payload: OptionRuleInput[] = rules
        .filter((r) => r.whenKey && r.targetKey)
        .map((r) => ({ kind: r.kind, whenValueId: r.whenKey, targetValueId: r.targetKey, message: r.message || null }))
      void saveOptionRules(draftId, payload)
    }, 800)
    return () => { if (timer.current) clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, draftId])

  if (options.length < 2) return null // need at least two values to relate

  function patch(i: number, p: Partial<RuleRow>) { setRules(rules.map((r, j) => (j === i ? { ...r, ...p } : r))) }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="section-title"><span className="ic"><Ban size={16} strokeWidth={2} /></span> Compatibility rules <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· advanced</span></div>
      {rules.length > 0 && (
        <table style={{ marginTop: 12 }}>
          <thead><tr><th>When</th><th /><th>Then</th><th>Message</th><th /></tr></thead>
          <tbody>
            {rules.map((r, i) => (
              <tr key={i}>
                <td>
                  <select className="sel" value={r.whenKey} onChange={(e) => patch(i, { whenKey: e.target.value })}>
                    <option value="">Select…</option>
                    {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                </td>
                <td>
                  <select className="sel" value={r.kind} onChange={(e) => patch(i, { kind: e.target.value as RuleRow['kind'] })} style={{ maxWidth: 110 }}>
                    <option value="EXCLUDE">excludes</option>
                    <option value="REQUIRE">requires</option>
                  </select>
                </td>
                <td>
                  <select className="sel" value={r.targetKey} onChange={(e) => patch(i, { targetKey: e.target.value })}>
                    <option value="">Select…</option>
                    {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                </td>
                <td><input className="input" value={r.message} placeholder="e.g. Choose Unflavored for Decaf" onChange={(e) => patch(i, { message: e.target.value })} /></td>
                <td><button className="del" onClick={() => setRules(rules.filter((_, j) => j !== i))}>🗑</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button className="rb-btn-add" style={{ marginTop: 10 }} onClick={() => setRules([...rules, { kind: 'EXCLUDE', whenKey: '', targetKey: '', message: '' }])}>+ Add rule</button>
    </div>
  )
}
