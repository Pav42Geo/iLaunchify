'use client'

// Roles × Capabilities grid (docs/ADMIN_RBAC.md P5). Each checkbox grants/revokes
// one capability for one role via setRoleCapabilityAction. Super admin column is
// shown as always-on + disabled (never editable).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check } from 'lucide-react'
import { setRoleCapabilityAction } from './actions'

type RoleCol = { value: string; label: string }

export function RoleMatrix({
  capabilities,
  roles,
  initial,
}: {
  capabilities: string[]
  roles: RoleCol[] // editable roles only (Agent/Lead/Billing)
  initial: Record<string, string[]> // role → granted capabilities
}) {
  const router = useRouter()
  const [grants, setGrants] = useState<Record<string, Set<string>>>(() => {
    const m: Record<string, Set<string>> = {}
    for (const r of roles) m[r.value] = new Set(initial[r.value] ?? [])
    return m
  })
  const [pending, start] = useTransition()

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

  return (
    <div className="overflow-x-auto rounded-2xl border border-ink-200 bg-white">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-ink-100 text-[10.5px] uppercase tracking-wider text-ink-500">
            <th className="px-4 py-2.5 font-semibold">Capability</th>
            {roles.map((r) => (
              <th key={r.value} className="px-3 py-2.5 text-center font-semibold">{r.label}</th>
            ))}
            <th className="px-3 py-2.5 text-center font-semibold text-pink-700">Super admin</th>
          </tr>
        </thead>
        <tbody>
          {capabilities.map((cap) => (
            <tr key={cap} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50">
              <td className="px-4 py-2.5 font-mono text-[12px] text-ink-800">{cap}</td>
              {roles.map((r) => {
                const on = grants[r.value]?.has(cap) ?? false
                return (
                  <td key={r.value} className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={pending}
                      onChange={(e) => toggle(r.value, cap, e.target.checked)}
                      aria-label={`${r.label}: ${cap}`}
                      className="h-4 w-4 accent-pink-600 disabled:opacity-50"
                    />
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
