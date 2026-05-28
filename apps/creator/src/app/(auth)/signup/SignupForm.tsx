'use client'

import { Button, Input, Label } from '@ilaunchify/ui'
import { useState } from 'react'
import { toast } from 'sonner'

interface SignupFormProps {
  prefillEmail?: string
  prefillBrand?: string
}

type SignupResponse =
  | { ok: true; nextStep: 'CHECK_EMAIL'; warning?: string }
  | { ok: true; nextStep: 'DEV_REDIRECT'; devUrl: string }
  | { error: string; message: string }

export function SignupForm({ prefillEmail, prefillBrand }: SignupFormProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState(prefillEmail ?? '')
  const [brandName, setBrandName] = useState(prefillBrand ?? '')
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!agreedToTerms) {
      toast.error('Please agree to the terms to continue.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, brandName: brandName || undefined }),
      })
      const data = (await res.json()) as SignupResponse

      if (!res.ok || 'error' in data) {
        const msg = 'message' in data ? data.message : 'Signup failed. Please try again.'
        toast.error(msg)
        return
      }

      if (data.nextStep === 'DEV_REDIRECT') {
        toast.success('Account created. Redirecting…')
        window.location.href = data.devUrl
        return
      }

      if (data.warning) {
        toast.warning(data.warning)
      } else {
        toast.success('Check your email for the sign-in link.')
      }
      window.location.href = `/login/check-email?email=${encodeURIComponent(email)}`
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Your name</Label>
        <Input
          id="name"
          required
          value={name}
          placeholder="Alex Rivera"
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
      </div>

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

      <div className="space-y-1.5">
        <Label htmlFor="brandName">Brand name (optional)</Label>
        <Input
          id="brandName"
          value={brandName}
          placeholder="You can add this later in onboarding"
          onChange={(e) => setBrandName(e.target.value)}
          disabled={busy}
        />
        <p className="text-xs text-ink-500">Don&apos;t worry if you haven&apos;t picked a name yet.</p>
      </div>

      <label className="flex items-start gap-2 text-sm text-ink-600">
        <input
          type="checkbox"
          checked={agreedToTerms}
          onChange={(e) => setAgreedToTerms(e.target.checked)}
          className="mt-1"
          disabled={busy}
        />
        <span>
          I agree to the{' '}
          <a href="/terms" className="underline">
            terms
          </a>{' '}
          and{' '}
          <a href="/privacy" className="underline">
            privacy policy
          </a>
          .
        </span>
      </label>

      <Button type="submit" className="w-full" disabled={busy || !agreedToTerms || !name || !email}>
        {busy ? 'Creating account…' : 'Start my creator account'}
      </Button>
    </form>
  )
}
