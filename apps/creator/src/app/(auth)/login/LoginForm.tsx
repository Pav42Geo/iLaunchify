'use client'

import { Button, Input, Label, TurnstileWidget } from '@ilaunchify/ui'
import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { toast } from 'sonner'

interface LoginFormProps {
  callbackUrl?: string
  /** Provider availability from the server. Default mode is 'magic-link'. */
  providers: {
    google: boolean
    resend: boolean
    credentials: boolean
  }
}

// Turnstile is only enforced when a site key is present (feature-gated). (H5 A4)
const TURNSTILE_ON = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

export function LoginForm({
  callbackUrl = '/dashboard',
  providers,
}: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Server-verify the Turnstile token BEFORE handing off to Auth.js signIn(), so the
  // Auth.js flow stays untouched. No-op (allows) when the feature is off. (H5 A4 §4)
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

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      if (!(await passTurnstile())) return
      const res = await signIn('resend', { email, callbackUrl, redirect: false })
      if (res?.error) {
        toast.error(`Couldn't send sign-in email: ${res.error}`)
        return
      }
      window.location.href = '/login/check-email'
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleGoogle() {
    setBusy(true)
    try {
      if (!(await passTurnstile())) return
      await signIn('google', { callbackUrl })
    } finally {
      // signIn('google') redirects on success; only reached if it didn't.
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <TurnstileWidget onToken={setTurnstileToken} />

      {providers.google && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleGoogle}
          disabled={busy || (TURNSTILE_ON && !turnstileToken)}
        >
          Continue with Google
        </Button>
      )}

      {providers.google && providers.resend && (
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-ink-200" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-ink-500">or</span>
          </div>
        </div>
      )}

      {providers.resend && (
        <form onSubmit={handleMagicLink} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              placeholder="you@example.com"
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={busy || !email || (TURNSTILE_ON && !turnstileToken)}
          >
            {busy ? 'Sending…' : 'Send magic link'}
          </Button>
        </form>
      )}
    </div>
  )
}
