'use client'

// REBUILD R4 — guest gate modal on the marketplace detail page.
//
// Replaces the "bounce to /signup" flow on the Start Launching CTA.
// Captures name / email / brand name inline so the visitor keeps
// their template + flavour + size + packaging selection through the
// account creation handshake.
//
// Submit calls signupGuestAndPrepareLaunch which:
//   1. creates User + CreatorProfile + Brand on the marketing origin
//   2. returns a creator-app URL that signs the user in and creates
//      the Product post-signin (see /api/launch-after-signin route)
//   3. we then hard-navigate to that URL — the next page the visitor
//      sees is the Design Studio canvas, signed in, with their
//      product loaded.

import * as React from 'react'
import { useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { Button } from '@ilaunchify/ui'
import {
  signupGuestAndPrepareLaunch,
  type GuestSignupAndLaunchInput,
} from '@/lib/guest-gate-actions'

export interface GuestGateModalProps {
  open: boolean
  onClose: () => void
  /** Pre-filled selection from the detail page — preserved through signup. */
  launch: Omit<GuestSignupAndLaunchInput, 'name' | 'email' | 'brandName'>
  /** Template title for the modal headline. */
  templateName: string
}

export function GuestGateModal({
  open,
  onClose,
  launch,
  templateName,
}: GuestGateModalProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [brandName, setBrandName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Close on Escape.
  React.useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isPending) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, isPending])

  if (!open) return null

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await signupGuestAndPrepareLaunch({
        ...launch,
        name,
        email,
        brandName,
      })
      if (result.ok) {
        // Hard-nav across origins; preserves the dev-login redirect
        // chain (sets cookie, then /api/launch-after-signin creates
        // the product, then canvas).
        window.location.href = result.signinUrl
        return
      }
      if (result.reason === 'EMAIL_TAKEN') {
        setError(
          'That email is already registered. Sign in first, then come back to this page.',
        )
        return
      }
      setError(result.message)
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-gate-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        disabled={isPending}
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-ink-200 bg-white p-6 shadow-2xl">
        <button
          type="button"
          aria-label="Close"
          disabled={isPending}
          onClick={onClose}
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-900"
        >
          <X className="h-4 w-4" />
        </button>

        <h2
          id="guest-gate-title"
          className="font-display text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink-900"
        >
          Start launching <em className="not-italic text-pink-700">{templateName}</em>
        </h2>
        <p className="mt-1.5 text-[13px] leading-snug text-ink-500">
          Quick setup — your selection is preserved. After this you land
          straight in the Design Studio with your product loaded.
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-3.5">
          <Field
            label="Your name"
            value={name}
            onChange={setName}
            autoComplete="name"
            autoFocus
            disabled={isPending}
            placeholder="Alex Rivera"
          />
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            disabled={isPending}
            placeholder="you@brand.com"
          />
          <Field
            label="Brand name"
            value={brandName}
            onChange={setBrandName}
            disabled={isPending}
            placeholder="e.g. Wild Roots"
            help="You can rename it later from Brand Identity."
          />

          {error && (
            <p
              role="alert"
              className="rounded-md bg-pink-50 px-3 py-2 text-[12.5px] font-medium text-pink-800"
            >
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={isPending}>
              {isPending ? 'Creating your account…' : 'Continue to Design Studio →'}
            </Button>
          </div>

          <p className="pt-2 text-[11px] leading-snug text-ink-500">
            By continuing you create a free creator account. You can finish
            setting up payments and channels from your dashboard later.
          </p>
        </form>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  autoFocus,
  disabled,
  placeholder,
  help,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  type?: string
  autoComplete?: string
  autoFocus?: boolean
  disabled?: boolean
  placeholder?: string
  help?: string
}) {
  return (
    <label className="block">
      <span className="block text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-600">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder}
        required
        className="mt-1 w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-[14px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200 disabled:bg-ink-50"
      />
      {help && (
        <span className="mt-1 block text-[11px] leading-snug text-ink-500">
          {help}
        </span>
      )}
    </label>
  )
}
