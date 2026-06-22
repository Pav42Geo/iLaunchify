'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Mail, Copy, Check } from 'lucide-react'
import { createAdminInvite } from './actions'

type RoleOption = { value: string; label: string }

export function InviteAdminForm({ roles }: { roles: RoleOption[] }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState(roles[0]?.value ?? 'SUPPORT_AGENT')
  const [link, setLink] = useState<string | null>(null)
  const [emailed, setEmailed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()

  function submit() {
    if (!email.trim().includes('@')) {
      toast.error('Enter a valid email address.')
      return
    }
    start(async () => {
      const r = await createAdminInvite({ email: email.trim(), role: role as never })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      setLink(r.link)
      setEmailed(r.emailed)
      setCopied(false)
      toast.success(
        r.emailed
          ? `Invite emailed to ${r.email}.`
          : 'Invite created. Copy the link below and send it to them.',
      )
      setEmail('')
      router.refresh()
    })
  }

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Could not copy — select the link and copy manually.')
    }
  }

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4">
      <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-900">
        <Mail className="h-4 w-4 text-ink-400" /> Invite a new admin
      </h2>
      <p className="mt-0.5 text-[12px] text-ink-500">
        For someone who doesn&apos;t have an account yet. We generate a one-time link — share it
        with them; they sign up themselves and land with the role you pick. (We never create
        accounts or set passwords.) Links expire in 7 days.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-[220px] flex-1 text-[11.5px] text-ink-600">
          <span className="mb-1 block font-medium">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="new-admin@yourcompany.com"
            className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          />
        </label>
        <label className="text-[11.5px] text-ink-600">
          <span className="mb-1 block font-medium">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-lg border border-ink-200 px-2.5 py-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            {roles.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create invite'}
        </button>
      </div>

      {link && (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
          <p className="text-[11px] font-medium text-emerald-800">
            {emailed
              ? 'Emailed to them — here’s the same link to copy if you want a backup'
              : 'Invite link — send this to them'}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 truncate rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 font-mono text-[11.5px] text-ink-700"
            />
            <button
              type="button"
              onClick={copy}
              className="inline-flex flex-none items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
