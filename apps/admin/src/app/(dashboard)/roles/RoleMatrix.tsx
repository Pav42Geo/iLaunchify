'use client'

// Roles × Capabilities grid (docs/ADMIN_RBAC.md P5). Each checkbox grants/revokes
// one capability for one role via setRoleCapabilityAction. Super admin column is
// shown as always-on + disabled (never editable). Each role also has a one-click
// "Apply preset" that loads its suggested bundle; suggested-but-not-granted
// capabilities show a hollow dot behind the checkbox.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Sparkles } from 'lucide-react'
import { Checkbox } from '@ilaunchify/ui'
import { setRoleCapabilityAction, applyRolePresetAction } from './actions'

type RoleCol = { value: string; label: string }

export function RoleMatrix({
  capabilities,
  roles,
  initial,
  presets,
}: {
  capabilities: string[]
  roles: RoleCol[] // editable roles only (Agent/Lead/Billing)
  initial: Record<string, string[]> // role → granted capabilities
  presets: Record<string, string[]> // role → suggested capabilities
}) {
  const router = useRouter()
  const [grants, setGrants] = useState<Record<string, Set<string>>>(() => {
    const m: Record<string, Set<string>> = {}
    for (const r of roles) m[r.value] = new Set(initial[r.value] ?? [])
    return m
  })
  const [pending, start] = useTransition()

  const presetSets: Record<string, Set<string>> = {}
  for (const r of roles) presetSets[r.value] = new Set(presets[r.value] ?? [])

  function toggle(role: string, cap: string, next: boolean) {
    setGrants((prev) => {
      const copy: Record<string, Set<string>> = {}
      for (const k of Object.keys(prev)) copy[k] = new Set(prev[k])
      if (next) copy[role]!.add(cap)
      else copy[role]!.delete(cap)
      return copy
    })
    start(async () => {
      const r = await setRoleCapabilityAction({ role: role as never, capability: cap as never, enabled: next })
      if (!r.ok) {
        toast.error(r.error)
        // revert
        setGrants((prev) => {
          const copy: Record<string, Set<string>> = {}
          for (const k of Object.keys(prev)) copy[k] = new Set(prev[k])
          if (next) copy[role]!.delete(cap)
          else copy[role]!.add(cap)
          return copy
        })
        return
      }
      router.refresh()
    })
  }

  function applyPreset(role: string, label: string) {
    const preset = presetSets[role] ?? new Set<string>()
    setGrants((prev) => {
      const copy: Record<string, Set<string>> = {}
      for (const k of Object.keys(prev)) copy[k] = new Set(prev[k])
      copy[role] = new Set(preset)
      return copy
    })
    start(async () => {
      const r = await applyRolePresetAction({ role: role as never })
      if (!r.ok) {
        toast.error(r.error)
        router.refresh()
        return
      }
      toast.success(`Applied the suggested preset for ${label}.`)
      router.refresh()
    })
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-ink-200 bg-white">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-ink-100 align-bottom text-[12px] uppercase tracking-wider text-ink-700">
            <th className="px-4 py-2.5 font-semibold">Capability</th>
            {roles.map((r) => {
              const count = presetSets[r.value]?.size ?? 0
              return (
                <th key={r.value} className="px-3 py-2.5 text-center font-semibold">
                  <div>{r.label}</div>
                  <button
                    type="button"
                    onClick={() => applyPreset(r.value, r.label)}
                    disabled={pending}
                    title={`Replace this role's capabilities with the suggested ${count}-capability bundle`}
                    className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-pink-200 bg-pink-50 px-2 py-[3px] text-[9.5px] font-semibold normal-case tracking-normal text-pink-700 hover:bg-pink-100 disabled:opacity-50"
                  >
                    <Sparkles className="h-3 w-3" /> Apply preset
                  </button>
                </th>
              )
            })}
            <th className="px-3 py-2.5 text-center font-semibold text-pink-700">Super admin</th>
          </tr>
        </thead>
        <tbody>
          {capabilities.map((cap) => (
            <tr key={cap} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50">
              <td className="px-4 py-2.5 font-mono text-[12px] text-ink-800">{cap}</td>
              {roles.map((r) => {
                const on = grants[r.value]?.has(cap) ?? false
                const suggested = presetSets[r.value]?.has(cap) ?? false
                return (
                  <td key={r.value} className="px-3 py-2.5 text-center">
                    <span className="relative inline-flex items-center justify-center">
                      <Checkbox
                        checked={on}
                        disabled={pending}
                        onChange={(e) => toggle(r.value, cap, e.target.checked)}
                        aria-label={`${r.label}: ${cap}${suggested ? ' (suggested)' : ''}`}
                      />
                      {!on && suggested && (
                        <span
                          aria-hidden="true"
                          title="Suggested for this role"
                          className="pointer-events-none absolute -right-2.5 h-1.5 w-1.5 rounded-full border border-pink-400"
                        />
                      )}
                    </span>
                  </td>
                )
              })}
              <td className="px-3 py-2.5 text-center text-emerald-600" title="Super admin always has every capability">
                <Check className="mx-auto h-4 w-4" aria-label="always on" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
