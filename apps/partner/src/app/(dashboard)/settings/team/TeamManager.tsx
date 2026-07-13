'use client'

// Team management client surface (P3, PRINT_PRODUCTION_WORKFLOW §2.1):
// invite form (email + admin flag + per-service role checkboxes), pending
// invites with revoke, member rows with remove. Small shops tick everything
// for one person — the form makes that the easy path.
//
// Restyled 1:1 to the prototype "Team & roles" settings panel
// (design/partner-profile-prototype-v2.html): member rows are .lrow rows with
// a 40px initials avatar, role pills on the right, outline-pill controls, and
// a pink-pill "Invite teammate" primary action.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2, Mail, MailX, ShieldCheck } from 'lucide-react'
import { LRow, PanelCard, PanelHeader, StPill } from '@/components/panel-kit'
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
  isSelf: boolean
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

// Deterministic avatar background — small palette of CSS token vars, picked
// by a stable hash of the member's display name. Real initials only.
const AVATAR_BG = ['var(--pink-500)', 'var(--info-500)', 'var(--neon-600)', 'var(--ink-600)']

function avatarBg(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_BG[h % AVATAR_BG.length] ?? 'var(--ink-600)'
}

function initialsOf(seed: string): string {
  const parts = seed.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  const two = `${first}${last}` || seed.slice(0, 2)
  return two.toUpperCase()
}

const inputCls =
  'mt-1 w-full rounded-md border border-ink-300 bg-white px-3 py-2.5 text-[13.5px] text-ink-900 placeholder:text-ink-400 transition-all focus:border-pink-500 focus:outline-none focus:ring-[3px] focus:ring-pink-500/15'

const outlinePillCls =
  'inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-700 transition-colors hover:border-danger-300 hover:text-danger-600 disabled:opacity-50'

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
      <PanelCard>
        <PanelHeader
          title="Team & roles"
          desc="Admins manage everything; service roles see only their queues."
        />
        {members.map((m) => {
          const display = m.name ?? m.email
          return (
            <div
              key={m.membershipId}
              className="mb-2.5 flex flex-wrap items-center gap-3.5 rounded-xl border border-ink-200 px-4 py-[15px] transition-all last:mb-0 hover:border-ink-300 hover:shadow-sm"
            >
              <div
                className="grid h-10 w-10 flex-none place-items-center rounded-full text-[14px] font-bold text-white"
                style={{ background: avatarBg(display) }}
                aria-hidden="true"
              >
                {initialsOf(display)}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-ink-900">
                  {display}
                  {m.isSelf && <StPill tone="muted">You</StPill>}
                </div>
                <div className="text-[12px] text-ink-500">
                  {m.email} · joined {new Date(m.acceptedAt).toLocaleDateString()}
                </div>
              </div>
              <div className="ml-auto flex flex-none flex-wrap items-center justify-end gap-2">
                {m.isFounder ? (
                  <StPill tone="info">Founder · Org admin</StPill>
                ) : m.isAdmin ? (
                  <StPill tone="info">Org admin</StPill>
                ) : null}
                {m.serviceRoles.map((s) => (
                  <StPill key={`${m.membershipId}-${s.serviceLabel}`} tone="muted">
                    {s.roles.map((r) => ROLE_LABEL[r] ?? r).join(' + ')} · {s.serviceLabel}
                  </StPill>
                ))}
                {!m.isFounder && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (!confirm(`Remove ${m.email} from the team?`)) return
                      void run(
                        () => removePartnerTeammate({ membershipId: m.membershipId }),
                        'Teammate removed',
                      )
                    }}
                    className={outlinePillCls}
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" /> Remove
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </PanelCard>

      {/* Pending invites */}
      {invites.length > 0 && (
        <PanelCard>
          <PanelHeader title="Pending invites" />
          {invites.map((i) => (
            <LRow
              key={i.id}
              icon={<Mail aria-hidden="true" />}
              title={i.email}
              sub={`Invited ${new Date(i.createdAt).toLocaleDateString()} · expires ${new Date(i.expiresAt).toLocaleDateString()}`}
              right={
                <>
                  {i.grantAdmin && <StPill tone="info">Org admin</StPill>}
                  <StPill tone="warn">PENDING</StPill>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(() => revokePartnerInvite({ inviteId: i.id }), 'Invite revoked')
                    }
                    className={outlinePillCls}
                  >
                    <MailX className="h-3 w-3" aria-hidden="true" /> Revoke
                  </button>
                </>
              }
            />
          ))}
        </PanelCard>
      )}

      {/* Invite form */}
      <PanelCard>
        <PanelHeader
          title="Invite a teammate"
          desc="Non-admins see only the services you grant. Small shops: tick everything for one person."
        />
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[240px] flex-1 text-[12px] font-semibold text-ink-700">
            Email address
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
              className={inputCls}
            />
          </label>
          <label className="flex items-center gap-2 pb-2.5 text-[13px] font-medium text-ink-800">
            <input
              type="checkbox"
              checked={grantAdmin}
              onChange={(e) => setGrantAdmin(e.target.checked)}
              className="h-4 w-4 rounded border-ink-300 text-pink-600 focus:ring-pink-500"
            />
            <ShieldCheck className="h-3.5 w-3.5 text-ink-500" aria-hidden="true" /> Organization admin
          </label>
        </div>

        <div className="mt-4">
          <p className="text-[12px] font-semibold text-ink-700">Service roles</p>
          <div className="mt-2 space-y-2">
            {services.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 px-4 py-2.5 text-[12.5px]"
              >
                <span className="font-semibold text-ink-900">{s.label}</span>
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

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            disabled={busy || email.trim() === ''}
            onClick={() => void submitInvite()}
            className="inline-flex items-center gap-1.5 rounded-full bg-pink-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-pink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {busy ? 'Sending…' : 'Invite teammate'}
          </button>
        </div>
      </PanelCard>
    </div>
  )
}
