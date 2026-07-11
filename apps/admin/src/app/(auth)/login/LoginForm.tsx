'use client'

import { Button, Input, Label, TurnstileWidget } from '@ilaunchify/ui'
import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { toast } from 'sonner'

// Turnstile is only enforced when a site key is present (feature-gated). Admin login
// is already invite-only + TOTP — this is defense-in-depth. (H5 A4 P2)
const TURNSTILE_ON = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Server-verify the Turnstile token BEFORE handing off to Auth.js signIn(). No-op
  // (allows) when the feature is off. (H5 A4 §4)
  async function passTurnstile(): Promise<boolean> {
    if (!TURNSTILE_ON) return true
    try {
      const res = await fetch('/api/auth/turnstile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: turnstileToken }),
      })
      const data = (await res.json()) as { ok?: boolean }
      if (!data.ok) {
        toast.error('Verification failed — please retry.')
        setTurnstileToken(null) // token is single-use; force a fresh solve
        return false
      }
      return true
    } catch {
      toast.error('Verification failed — please retry.')
      return false
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      if (!(await passTurnstile())) return
      const res = await signIn('resend', { email, callbackUrl: '/leads', redirect: false })
      if (res?.error) {
        toast.error(`Couldn't send link: ${res.error}`)
        return
      }
      window.location.href = '/login/check-email'
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
      </div>
      <TurnstileWidget onToken={setTurnstileToken} />
      <Button type="submit" className="w-full" disabled={busy || (TURNSTILE_ON && !turnstileToken)}>
        {busy ? 'Sending…' : 'Send magic link'}
      </Button>
    </form>
  )
}
