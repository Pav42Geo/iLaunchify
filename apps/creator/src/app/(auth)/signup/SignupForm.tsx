'use client'

import { Button, Input, Label, Checkbox, TurnstileWidget } from '@ilaunchify/ui'
import { useState } from 'react'
import { toast } from 'sonner'
import { marketingUrl } from '@/lib/marketing-url'

interface SignupFormProps {
  prefillEmail?: string
  prefillBrand?: string
}

/** Marketplace launch-selection keys carried through the signup deep link. */
const LAUNCH_KEYS = ['template', 'flavor', 'size', 'packaging', 'quantity', 'partnerOfferingId'] as const

/** Read whitelisted launch params from the current URL; null when no product
 *  was picked (i.e. the visitor came to /signup directly). Client-only. */
function readLaunchParams(): Record<string, string> | null {
  if (typeof window === 'undefined') return null
  const qs = new URLSearchParams(window.location.search)
  const out: Record<string, string> = {}
  for (const key of LAUNCH_KEYS) {
    const value = qs.get(key)
    if (value) out[key] = value
  }
  // Only meaningful when a template was actually chosen.
  return out.template ? out : null
}

type SignupResponse =
  | { ok: true; nextStep: 'CHECK_EMAIL'; warning?: string }
  | { ok: false; error: string; message: string }

// Turnstile is only enforced when a site key is present (feature-gated). When it is,
// the submit button waits for a live token. (H5 A4)
const TURNSTILE_ON = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

export function SignupForm({ prefillEmail, prefillBrand }: SignupFormProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState(prefillEmail ?? '')
  const [brandName, setBrandName] = useState(prefillBrand ?? '')
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!agreedToTerms) {
      toast.error('Please agree to the terms to continue.')
      return
    }
    setBusy(true)
    try {
      // Carry any marketplace product pick that brought the visitor here
      // (?template=…&flavor=…&size=…&packaging=…&quantity=…) so the server can
      // resume the launch into the Design Studio right after sign-in instead of
      // dropping the user on a blank dashboard. Whitelisted keys only.
      const launch = readLaunchParams()
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          brandName: brandName || undefined,
          ...(launch ? { launch } : {}),
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
      })
      const data = (await res.json()) as SignupResponse

      if (!res.ok || 'error' in data) {
        const msg = 'message' in data ? data.message : 'Signup failed. Please try again.'
        toast.error(msg)
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
        <p className="text-ui-caption text-ink-500">Don&apos;t worry if you haven&apos;t picked a name yet.</p>
      </div>

      <Checkbox
        checked={agreedToTerms}
        onChange={(e) => setAgreedToTerms(e.target.checked)}
        disabled={busy}
        className="items-start text-sm text-ink-600"
        label={
          <span>
            I agree to the{' '}
            <a href={marketingUrl('/terms')} className="underline" target="_blank" rel="noreferrer">
              Terms
            </a>
            , the{' '}
            <a href={marketingUrl('/creator-agreement')} className="underline" target="_blank" rel="noreferrer">
              Creator Agreement
            </a>
            , and the{' '}
            <a href={marketingUrl('/privacy')} className="underline" target="_blank" rel="noreferrer">
              Privacy Policy
            </a>
            .
          </span>
        }
      />

      <TurnstileWidget onToken={setTurnstileToken} />

      <Button
        type="submit"
        className="w-full"
        disabled={busy || !agreedToTerms || !name || !email || (TURNSTILE_ON && !turnstileToken)}
      >
        {busy ? 'Creating account…' : 'Start my creator account'}
      </Button>
    </form>
  )
}
