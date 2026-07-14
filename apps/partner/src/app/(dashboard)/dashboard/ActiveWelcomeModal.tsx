'use client'

// One-time go-live celebration — the activation prototype's .celebrate-card
// (design/activation-launch-console-tokens.html) on a WHITE surface (Pavel
// 2026-07-13: post-activation chrome is white — black pill CTA, pink accents,
// Fraunces italic accent word; neon stays dark-only).
//
// Rendered by /dashboard ONLY when status is ACTIVE, every service is live,
// and onboardingProgress.activeWelcomeSeen is unset. Any dismissal path
// stamps the flag so it never shows again.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Rocket, X, ArrowRight } from 'lucide-react'
import { markActiveWelcomeSeen } from './welcome-modal-actions'

export function ActiveWelcomeModal({ companyName }: { companyName: string }) {
  const [open, setOpen] = useState(true)
  const [, startTransition] = useTransition()
  const router = useRouter()

  function dismiss(href?: string) {
    // Optimistic close; the flag-stamp fires in the background. If it fails,
    // worst case the partner sees the celebration once more.
    setOpen(false)
    startTransition(async () => {
      await markActiveWelcomeSeen()
    })
    if (href) router.push(href)
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/70 p-5 backdrop-blur-[4px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss()
      }}
    >
      {/* .celebrate-card, white variant — soft pink glow from the top edge */}
      <div className="relative w-full max-w-[440px] overflow-hidden rounded-2xl border border-pink-200 bg-white p-[34px] text-center shadow-xl">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 [background:radial-gradient(80%_80%_at_50%_-10%,var(--pink-100),transparent_60%)]"
        />

        <button
          type="button"
          onClick={() => dismiss()}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 rounded-md p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
        >
          <X className="h-4 w-4" />
        </button>

        {/* .rocket tile */}
        <div className="relative z-10 mx-auto grid h-[76px] w-[76px] animate-[ilfy-pop_.45s_ease-out] place-items-center rounded-[20px] bg-pink-500 text-white">
          <Rocket className="h-[38px] w-[38px]" aria-hidden="true" />
        </div>

        <h2
          id="welcome-modal-title"
          className="relative z-10 mt-5 font-display text-[24px] font-extrabold tracking-[-0.01em] text-ink-900"
        >
          You&rsquo;re <span className="font-serif italic text-pink-700">live</span>, {companyName}.
        </h2>
        <p className="relative z-10 mx-auto mt-2 max-w-[340px] text-[13.5px] leading-relaxed text-ink-600">
          Creators can now route production orders to you. You&rsquo;ll get an email and an in-app
          notification whenever a dispatch needs your acceptance — payouts land via Stripe about 2
          business days after each shipment.
        </p>

        {/* .cbtns */}
        <div className="relative z-10 mt-5 flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={() => dismiss('/services')}
            className="inline-flex items-center rounded-full border border-ink-300 bg-white px-4 py-2 text-[13px] font-semibold text-ink-900 transition-colors hover:bg-ink-50"
          >
            Review my services
          </button>
          {/* Pavel 2026-07-13: a just-live partner has NO orders yet — the
              primary simply lands them on their (fresh) dashboard. */}
          <button
            type="button"
            onClick={() => dismiss()}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            Take me to my dashboard <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* pop keyframes (same curve as the prototype; plain <style> — no styled-jsx) */}
      <style>{`@keyframes ilfy-pop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  )
}
