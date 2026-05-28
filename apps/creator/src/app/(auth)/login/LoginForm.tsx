'use client'

import { Button, Input, Label } from '@ilaunchify/ui'
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

export function LoginForm({
  callbackUrl = '/dashboard',
  providers,
}: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  // Dev mode: only Credentials is registered.
  const devOnly = providers.credentials && !providers.resend && !providers.google

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
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

  async function handleDevSignIn(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    // Use the /api/dev/login bypass route — it skips Auth.js and directly
    // creates a Session row + cookie. Most reliable in local dev where the
    // Auth.js Credentials provider has historically been finicky.
    const url = new URL('/api/dev/login', window.location.origin)
    url.searchParams.set('email', email)
    url.searchParams.set('callbackUrl', callbackUrl)
    window.location.href = url.toString()
  }

  async function handleGoogle() {
    setBusy(true)
    await signIn('google', { callbackUrl })
  }

  // -------- Dev-only sign-in UI --------
  if (devOnly) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <strong>Dev mode.</strong> No Google or Resend credentials configured. Sign in by typing
          the email of any seeded user — no password needed.
        </div>
        <form onSubmit={handleDevSignIn} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              placeholder="georgiev.pavel@gmail.com"
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy || !email}>
            {busy ? 'Signing in…' : 'Sign in (dev)'}
          </Button>
        </form>
      </div>
    )
  }

  // -------- Production sign-in UI --------
  return (
    <div className="space-y-4">
      {providers.google && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleGoogle}
          disabled={busy}
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
          <Button type="submit" className="w-full" disabled={busy || !email}>
            {busy ? 'Sending…' : 'Send magic link'}
          </Button>
        </form>
      )}
    </div>
  )
}
