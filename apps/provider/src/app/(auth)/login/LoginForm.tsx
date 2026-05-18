'use client'

import { Button, Input, Label } from '@ilaunchify/ui'
import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { toast } from 'sonner'

export function LoginForm({ prefillEmail }: { prefillEmail?: string }) {
  const [email, setEmail] = useState(prefillEmail ?? '')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await signIn('resend', { email, callbackUrl: '/onboarding', redirect: false })
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
          autoFocus={!prefillEmail}
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'Sending…' : 'Send magic link'}
      </Button>
    </form>
  )
}
