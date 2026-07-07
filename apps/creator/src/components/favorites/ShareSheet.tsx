'use client'

// ShareSheet — Share button + popover (docs/FAVORITES_MANAGEMENT.md §11).
//
// Mobile: invokes the native OS share sheet via the Web Share API. Desktop (or
// no navigator.share): a small popover with X, LinkedIn, WhatsApp, Copy link.
// Share targets the PUBLIC marketplace product-page URL — it never exposes the
// creator's private Favorites list.

import { Share2, Link2, Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface Props {
  /** Public, shareable product-page URL. */
  url: string
  title?: string
  variant?: 'pill' | 'icon'
}

export function ShareSheet({ url, title = 'Check out this product on iLaunchify', variant = 'pill' }: Props) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  async function onShareClick() {
    // Prefer the native share sheet where available (mobile).
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url })
        return
      } catch {
        // User dismissed, or share failed — fall through to the popover.
      }
    }
    setOpen((o) => !o)
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  const enc = encodeURIComponent
  const socials: { label: string; href: string }[] = [
    { label: 'X', href: `https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(title)}` },
    { label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}` },
    { label: 'WhatsApp', href: `https://wa.me/?text=${enc(title + ' ' + url)}` },
  ]

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={onShareClick}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Share this product"
        className={
          variant === 'icon'
            ? 'inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border border-ink-200 bg-white text-ink-500 transition-colors hover:border-ink-400 hover:text-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1'
            : 'inline-flex h-[34px] items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3.5 text-[13px] font-medium text-ink-700 transition-colors hover:border-ink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2'
        }
      >
        <Share2 className={variant === 'icon' ? 'h-4 w-4' : 'h-[17px] w-[17px]'} strokeWidth={2} aria-hidden="true" />
        {variant === 'pill' && 'Share'}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Share options"
          className="absolute right-0 z-20 mt-2 w-[280px] rounded-2xl border border-ink-200 bg-white p-2.5 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.28)]"
        >
          <p className="px-2 pb-2 pt-1 text-[12px] text-ink-400">Share this product page</p>
          <div className="grid grid-cols-4 gap-1.5">
            {socials.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] text-ink-600 transition-colors hover:bg-ink-50"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-ink-200 text-[11px] font-semibold text-ink-700">
                  {s.label.slice(0, 2)}
                </span>
                {s.label}
              </a>
            ))}
            <button
              type="button"
              onClick={copyLink}
              className="flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] text-pink-700 transition-colors hover:bg-pink-50"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-pink-50 text-pink-700">
                {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
              </span>
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
