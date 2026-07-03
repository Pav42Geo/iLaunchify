'use client'

// Team management client surface (P3, PRINT_PRODUCTION_WORKFLOW §2.1):
// invite form (email + admin flag + per-service role checkboxes), pending
// invites with revoke, member rows with remove. Small shops tick everything
// for one person — the form makes that the easy path.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { UserPlus, Trash2, MailX, ShieldCheck } from 'lucide-react'
import {
  invitePartnerTeammate,
  revokePartnerInvite,
  removePartnerTeammate,
  type ServiceGrantInput,
} from './actions'

export interface TeamMemberView {
  membershipId: string
  name: string | null
  email: string
  isAdmin: boolean
  isFounder: boolean
  acceptedAt: string
  lastActiveAt: string | null
  serviceRoles: Array<{ serviceLabel: string; roles: string[] }>
}

export interface PendingInviteView {
  id: string
  email: string
  grantAdmin: boolean
  createdAt: string
  expiresAt: string
}

export interface ServiceOption {
  id: string
  label: string
}

const ROLE_LABEL: Record<string, string> = {
  PARTNER_PREPRESS: 'Prepress',
  PARTNER_PRODUCTION: 'Production',
}

export function TeamManager({
  members,
  invites,
  services,
}: {
  members: TeamMemberView[]
  invites: PendingInviteView[]
  services: ServiceOption[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [grantAdmin, setGrantAdmin] = useState(false)
  const [grants, setGrants] = useState<Record<string, Set<string>>>({})

  function toggleGrant(serviceId: string, role: string) {
    setGrants((prev) => {
      const next = { ...prev }
      const set = new Set(next[serviceId] ?? [])
      if (set.has(role)) set.delete(role)
      else set.add(role)
      next[serviceId] = set
      return next
    })
  }

  async function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okMsg: string) {
    setBusy(true)
    try {
      const r = await fn()
      if (!r.ok) {
        toast.error(r.error)
        return false
      }
      toast.success(okMsg)
      router.refresh()
      return true
    } finally {
      setBusy(false)
    }
  }

  async function submitInvite() {
    const serviceGrants: ServiceGrantInput[] = Object.entries(grants)
      .map(([serviceId, roles]) => ({ serviceId, roles: [...roles] }))
      .filter((g) => g.roles.length > 0)
    const ok = await run(
      () => invitePartnerTeammate({ email, grantAdmin, serviceGrants }),
      'Invitation sent',
    )
    if (ok) {
      setEmail('')
      setGrantAdmin(false)
      setGrants({})
    }
  }

  return (
    <div className="space-y-6">
      {/* Members */}
      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <header className="border-b border-ink-200 bg-[var(--bg-hero)] px-5 py-3">
          <h2 className="font-display text-[15px] font-semibold text-ink-900">Team members</h2>
        </header>
        <ul className="divide-y divide-ink-50">
          {members.map((m) => (
            <li key={m.membershipId} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13px]">
              <div className="min-w-0">
                <p className="font-medium text-ink-900">
                  {m.name ?? m.email}
                  {m.isFounder && (
                    <span className="ml-2 rounded bg-pink-50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-pink-700">Founder</span>
                  )}
                  {m.isAdmin && !m.isFounder && (
                    <span className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-ink-700">Admin</span>
                  )}
                </p>
                <p className="text-[11.5px] text-ink-500">
                  {m.email}
                  {m.serviceRoles.length > 0 && (
                    <> · {m.serviceRoles.map((s) => `${s.serviceLabel}: ${s.roles.map((r) => ROLE_LABEL[r] ?? r).join('+')}`).join(' · ')}</>
                  )}
                </p>
              </div>
              <span className="ml-auto text-[11.5px] text-ink-400">
                joined {new Date(m.acceptedAt).toLocaleDateString()}
              </span>
              {!m.isFounder && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (!confirm(`Remove ${m.email} from the team?`)) return
                    void run(() => removePartnerTeammate({ membershipId: m.membershipId }), 'Teammate removed')
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11.5px] font-medium text-ink-600 transition-colors hover:border-danger-300 hover:text-danger-600 disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" /> Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Pending invites */}
      {invites.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <header className="border-b border-ink-200 bg-[var(--bg-hero)] px-5 py-3">
            <h2 className="font-display text-[15px] font-semibold text-ink-900">Pending invites</h2>
          </header>
          <ul className="divide-y divide-ink-50">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13px]">
                <span className="font-medium text-ink-900">{i.email}</span>
                {i.grantAdmin && (
                  <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-ink-700">Admin</span>
                )}
                <span className="ml-auto text-[11.5px] text-ink-400">
                  expires {new Date(i.expiresAt).toLocaleDateString()}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => revokePartnerInvite({ inviteId: i.id }), 'Invite revoked')}
                  className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11.5px] font-medium text-ink-600 transition-colors hover:border-danger-300 hover:text-danger-600 disabled:opacity-50"
                >
                  <MailX className="h-3 w-3" aria-hidden="true" /> Revoke
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Invite form */}
      <section className="space-y-4 rounded-2xl border border-ink-200 bg-white px-5 py-4">
        <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink-900">
          <UserPlus className="h-4 w-4 text-ink-500" aria-hidden="true" /> Invite a teammate
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[240px] flex-1 text-[12px] font-medium text-ink-700">
            Email address
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
              className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
            />
          </label>
          <label className="flex items-center gap-2 pb-2 text-[13px] font-medium text-ink-800">
            <input
              type="checkbox"
              checked={grantAdmin}
              onChange={(e) => setGrantAdmin(e.target.checked)}
              className="h-4 w-4 rounded border-ink-300 text-pink-600 focus:ring-pink-500"
            />
            <ShieldCheck className="h-3.5 w-3.5 text-ink-500" aria-hidden="true" /> Organization admin
          </label>
        </div>

        <div>
          <p className="text-[12px] font-medium text-ink-700">Service roles</p>
          <p className="text-[11.5px] text-ink-500">
            Non-admins see only the services you grant. Small shops: tick everything for one person.
          </p>
          <div className="mt-2 space-y-2">
            {services.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-100 bg-ink-50/60 px-3 py-2 text-[12.5px]">
                <span className="font-medium text-ink-900">{s.label}</span>
                {(['PARTNER_PREPRESS', 'PARTNER_PRODUCTION'] as const).map((role) => (
                  <label key={role} className="flex items-center gap-1.5 text-ink-700">
                    <input
                      type="checkbox"
                      checked={grants[s.id]?.has(role) ?? false}
                      onChange={() => toggleGrant(s.id, role)}
                      className="h-3.5 w-3.5 rounded border-ink-300 text-pink-600 focus:ring-pink-500"
                    />
                    {ROLE_LABEL[role]}
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            disabled={busy || email.trim() === ''}
            onClick={() => void submitInvite()}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink-900 px-5 text-[12.5px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> {busy ? 'Sending…' : 'Send invite'}
          </button>
        </div>
      </section>
    </div>
  )
}
