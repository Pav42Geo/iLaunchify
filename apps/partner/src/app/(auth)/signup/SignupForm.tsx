'use client'

import { Button, Input, Label } from '@ilaunchify/ui'
import { useState } from 'react'
import { toast } from 'sonner'

interface SignupFormProps {
  prefillEmail?: string
  prefillCompany?: string
}

type SignupResponse =
  | { ok: true; nextStep: 'CHECK_EMAIL'; warning?: string }
  | { ok: true; nextStep: 'DEV_REDIRECT'; devUrl: string }
  | { error: string; message: string }

export function SignupForm({ prefillEmail, prefillCompany }: SignupFormProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState(prefillEmail ?? '')
  const [companyName, setCompanyName] = useState(prefillCompany ?? '')
  const [roleAtCompany, setRoleAtCompany] = useState('')
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
        body: JSON.stringify({ name, email, companyName, roleAtCompany: roleAtCompany || undefined }),
      })
      const data = (await res.json()) as SignupResponse

      if (!res.ok || 'error' in data) {
        const msg = 'message' in data ? data.message : 'Signup failed. Please try again.'
        toast.error(msg)
        return
      }

      if (data.nextStep === 'DEV_REDIRECT') {
        // Dev — go straight in (no email infrastructure)
        toast.success('Account created. Redirecting…')
        window.location.href = data.devUrl
        return
      }

      // Production — show check-email screen
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
          placeholder="Jane Smith"
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          type="email"
          required
          value={email}
          placeholder="jane@acmecopack.com"
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="companyName">Company name</Label>
        <Input
          id="companyName"
          required
          value={companyName}
          placeholder="Acme Co-Pack, Inc."
          onChange={(e) => setCompanyName(e.target.value)}
          disabled={busy}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="roleAtCompany">Your role at the company (optional)</Label>
        <Input
          id="roleAtCompany"
          value={roleAtCompany}
          placeholder="Operations Manager"
          onChange={(e) => setRoleAtCompany(e.target.value)}
          disabled={busy}
        />
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
            partner terms
          </a>{' '}
          and{' '}
          <a href="/privacy" className="underline">
            privacy policy
          </a>
          . I understand I&apos;ll need to complete identity verification before becoming active.
        </span>
      </label>

      <Button type="submit" className="w-full" disabled={busy || !agreedToTerms || !name || !email || !companyName}>
        {busy ? 'Creating account…' : 'Apply to join the network'}
      </Button>
    </form>
  )
}
