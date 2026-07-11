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
import { TERMS_OF_USE, PRIVACY_POLICY, type LegalPara } from '@/lib/legal-docs'
import { submitContactMessage } from '@/lib/contact-actions'

type ModalKey = 'terms' | 'privacy' | 'contact' | null

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
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const canSend = name.trim() && email.trim() && message.trim() && !pending

  function send() {
    setError(null)
    startTransition(async () => {
      const res = await submitContactMessage({ name, email, subject, message })
      if (res.ok) setSent(true)
      else setError('Please fill in your name, email, and message.')
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
    <div className="space-y-3">
      <p className="text-[12.5px] text-ink-500">Send us a note and we&apos;ll reply by email.</p>
      <Input label="Your name" value={name} onChange={setName} placeholder="Jane Doe" />
      <Input label="Email" value={email} onChange={setEmail} placeholder="you@company.com" type="email" />
      <Input label="Subject" value={subject} onChange={setSubject} placeholder="How can we help?" />
      <label className="block">
        <span className="text-[12px] font-semibold text-ink-700">Message</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-[13px] focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
      </label>
      {error && <p className="text-[12px] text-danger-600">{error}</p>}
      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          className="rounded-full bg-pink-600 px-5 py-2.5 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-40"
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
    <label className="block">
      <span className="text-[12px] font-semibold text-ink-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-[13px] focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
      />
    </label>
  )
}
