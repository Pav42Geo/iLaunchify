'use client'

// Tiny footer for the Application + Onboarding surfaces (Pavel 2026-07-09):
// © line + Terms / Privacy / Contact links that open modals.
//
// Terms + Privacy intentionally show a "being finalized" state — the source docs
// (docs/legal/*.docx) are DRAFTS marked "NOT LEGAL ADVICE" with placeholder
// fields, so we don't present them as live legal text. Drop counsel-approved
// markdown into LEGAL_DOCS below when ready. Contact composes an email (mailto)
// — no backend; upgrade to stored tickets when there's a public sink.

import { useState, useTransition } from 'react'
import { TurnstileWidget } from '@ilaunchify/ui'
import { TERMS_OF_USE, PRIVACY_POLICY, type LegalPara } from '@/lib/legal-docs'
import { submitContactMessage } from '@/lib/contact-actions'

type ModalKey = 'terms' | 'privacy' | 'contact' | null

// Turnstile is only enforced when a site key is present (feature-gated). (H5 A4)
const TURNSTILE_ON = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

export function SiteFooter({
  termsHtml,
  privacyHtml,
}: {
  /** Published Terms body from the Legal CMS; falls back to the draft paras when null. */
  termsHtml?: string | null
  /** Published Privacy body from the Legal CMS; falls back to the draft paras when null. */
  privacyHtml?: string | null
} = {}) {
  const [open, setOpen] = useState<ModalKey>(null)
  const year = new Date().getFullYear()

  return (
    <>
      <footer className="mx-auto flex max-w-[640px] flex-wrap items-center justify-center gap-x-3 gap-y-1 px-5 py-6 text-[13px] text-ink-400">
        <span>© {year} iLaunchify, Inc.</span>
        <span aria-hidden="true">·</span>
        <FooterLink onClick={() => setOpen('terms')}>Terms of use</FooterLink>
        <span aria-hidden="true">·</span>
        <FooterLink onClick={() => setOpen('privacy')}>Privacy</FooterLink>
        <span aria-hidden="true">·</span>
        <FooterLink onClick={() => setOpen('contact')}>Contact us</FooterLink>
      </footer>

      {open === 'terms' && (
        <Modal title="Terms of Use" onClose={() => setOpen(null)}>
          <LegalDoc html={termsHtml} paras={TERMS_OF_USE} />
        </Modal>
      )}
      {open === 'privacy' && (
        <Modal title="Privacy Policy" onClose={() => setOpen(null)}>
          <LegalDoc html={privacyHtml} paras={PRIVACY_POLICY} />
        </Modal>
      )}
      {open === 'contact' && (
        <Modal title="Contact us" onClose={() => setOpen(null)}>
          <ContactForm onDone={() => setOpen(null)} />
        </Modal>
      )}
    </>
  )
}

/** Inline trigger for the same contact modal, usable anywhere on the
 *  Application/Onboarding surfaces (e.g. the welcome page's "Talk to our
 *  team" — Pavel 2026-07-12: modal form instead of mailto). Renders as a
 *  text link; pass className to match the surrounding copy. */
export function ContactTeamLink({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          'underline underline-offset-2 hover:text-ink-800 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500'
        }
      >
        {children}
      </button>
      {open && (
        <Modal title="Contact us" onClose={() => setOpen(false)}>
          <ContactForm onDone={() => setOpen(false)} />
        </Modal>
      )}
    </>
  )
}

function FooterLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-ink-500 underline-offset-2 hover:text-ink-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:rounded"
    >
      {children}
    </button>
  )
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
          <h3 className="font-display text-[18px] font-bold text-ink-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-ink-400 hover:bg-ink-50 hover:text-ink-700"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

function LegalDoc({ html, paras }: { html?: string | null; paras: LegalPara[] }) {
  // Prefer the admin-published version from the Legal CMS (no draft banner);
  // fall back to the hardcoded draft paras (with banner) until a version is published.
  if (html) {
    return (
      <div
        className="space-y-2 text-[12.5px] leading-relaxed text-ink-600 [&_h1]:mt-3 [&_h1]:text-[14px] [&_h1]:font-bold [&_h1]:text-ink-900 [&_h2]:mt-3 [&_h2]:text-[13px] [&_h2]:font-bold [&_h2]:text-ink-900 [&_strong]:text-ink-900"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }
  return (
    <div className="space-y-2">
      <div className="mb-3 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-[11.5px] text-warning-800">
        Draft — pending final legal review. iLaunchify is currently in private beta.
      </div>
      {paras.map((p, i) =>
        p.h ? (
          <h4 key={i} className="mt-3 text-[13px] font-bold text-ink-900">
            {p.t}
          </h4>
        ) : (
          <p key={i} className="text-[12.5px] leading-relaxed text-ink-600">
            {p.t}
          </p>
        ),
      )}
    </div>
  )
}

function ContactForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const canSend =
    name.trim() && email.trim() && message.trim() && !pending && (!TURNSTILE_ON || !!turnstileToken)

  function send() {
    setError(null)
    startTransition(async () => {
      const res = await submitContactMessage({ name, email, subject, message, turnstileToken: turnstileToken ?? undefined })
      if (res.ok) setSent(true)
      else setError('Please fill in your name, email, and message — and complete the verification.')
    })
  }

  if (sent) {
    return (
      <div className="space-y-3 py-2 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-success-100 text-success-700">
          ✓
        </div>
        <p className="text-[13px] font-semibold text-ink-900">Thanks — we&apos;ve got your message.</p>
        <p className="text-[12.5px] text-ink-500">We&apos;ll reply to {email || 'your email'} soon.</p>
        <button
          type="button"
          onClick={onDone}
          className="rounded-full bg-ink-900 px-5 py-2.5 text-[13px] font-bold text-white hover:opacity-90"
        >
          Close
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4 text-left">
      <p className="text-[13.5px] leading-relaxed text-ink-500">
        Send us a note and we&apos;ll reply by email.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Your name" value={name} onChange={setName} placeholder="Jane Doe" />
        <Input label="Email" value={email} onChange={setEmail} placeholder="you@company.com" type="email" />
      </div>
      <Input label="Subject" value={subject} onChange={setSubject} placeholder="How can we help?" />
      <label className="block text-left">
        <span className="mb-1.5 block text-[14px] font-semibold text-ink-900">Message</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          className="w-full resize-y rounded-xl border border-ink-200 bg-ink-50/50 px-3.5 py-2.5 text-[14px] text-ink-900 transition placeholder:text-ink-300 focus:border-pink-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-pink-100"
        />
      </label>
      <TurnstileWidget onToken={setTurnstileToken} />
      {error && <p className="text-[12.5px] text-danger-600">{error}</p>}
      <div className="flex items-center justify-end gap-3 border-t border-ink-100 pt-4">
        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          className="rounded-full bg-pink-600 px-6 py-3 text-[13.5px] font-bold text-white shadow-sm transition hover:-translate-y-px hover:bg-pink-500 disabled:translate-y-0 disabled:opacity-40"
        >
          {pending ? 'Sending…' : 'Send message'}
        </button>
      </div>
    </div>
  )
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="block text-left">
      <span className="mb-1.5 block text-[14px] font-semibold text-ink-900">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-ink-200 bg-ink-50/50 px-3.5 py-2.5 text-[14px] text-ink-900 transition placeholder:text-ink-300 focus:border-pink-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-pink-100"
      />
    </label>
  )
}
