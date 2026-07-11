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

  async function handleGoogle() {
    setBusy(true)
    await signIn('google', { callbackUrl })
  }

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
