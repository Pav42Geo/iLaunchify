'use client'

import { Button, Input, Label } from '@ilaunchify/ui'
import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { toast } from 'sonner'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
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
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'Sending…' : 'Send magic link'}
      </Button>
    </form>
  )
}
