'use client'

// MarketplaceProductActions — the title-side Save + Share cluster on the
// product detail page (docs/FAVORITES_MANAGEMENT.md §11). No icon on the hero
// image; heart for Save; Share opens the native sheet on mobile or a popover on
// desktop. Save is private per-creator; guests get sent to sign-in with the
// save intent preserved.

import { Heart, Share2, Link2, Check } from 'lucide-react'
import { useEffect, useRef, useState, useTransition } from 'react'
import { toggleFavoriteFromMarketplace } from '@/app/marketplace/favorites-actions'

interface Props {
  /** Real ProductTemplate.id. Undefined for fixture cards → Save hidden. */
  templateId?: string
  initialSaved?: boolean
  shareTitle?: string
}

export function MarketplaceProductActions({ templateId, initialSaved = false, shareTitle }: Props) {
  const [saved, setSaved] = useState(initialSaved)
  const [pending, startTransition] = useTransition()
  const [shareOpen, setShareOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const shareRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!shareOpen) return
    function onDoc(e: MouseEvent) {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) setShareOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [shareOpen])

  function onSave() {
    if (!templateId) return
    const next = !saved
    setSaved(next)
    startTransition(async () => {
      const res = await toggleFavoriteFromMarketplace({ templateId })
      if (res.ok) {
        setSaved(res.saved)
      } else if (res.reason === 'GUEST') {
        window.location.href = res.loginUrl
      } else {
        setSaved(!next)
      }
    })
  }

  function currentUrl() {
    return typeof window !== 'undefined' ? window.location.href : ''
  }

  async function onShare() {
    const url = currentUrl()
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: shareTitle ?? document.title, url })
        return
      } catch {
        /* dismissed — fall through */
      }
    }
    setShareOpen((o) => !o)
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(currentUrl())
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* blocked */
    }
  }

  const enc = encodeURIComponent
  const url = currentUrl()
  const socials = [
    { label: 'X', href: `https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(shareTitle ?? '')}` },
    { label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}` },
    { label: 'WhatsApp', href: `https://wa.me/?text=${enc((shareTitle ? shareTitle + ' ' : '') + url)}` },
  ]

  return (
    <div className="mb-3 flex items-center gap-2">
      {templateId && (
        <button
          type="button"
          onClick={onSave}
          aria-pressed={saved}
          disabled={pending}
          className={`inline-flex h-[34px] items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 ${
            saved ? 'border-pink-200 bg-pink-50 text-pink-700' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400'
          }`}
        >
          <Heart className="h-[17px] w-[17px]" strokeWidth={2} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
          {saved ? 'Saved' : 'Save'}
        </button>
      )}

      <div className="relative" ref={shareRef}>
        <button
          type="button"
          onClick={onShare}
          aria-haspopup="dialog"
          aria-expanded={shareOpen}
          aria-label="Share this product"
          className="inline-flex h-[34px] items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3.5 text-[13px] font-medium text-ink-700 transition-colors hover:border-ink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          <Share2 className="h-[17px] w-[17px]" strokeWidth={2} aria-hidden="true" />
          Share
        </button>

        {shareOpen && (
          <div
            role="dialog"
            aria-label="Share options"
            className="absolute left-0 z-20 mt-2 w-[280px] rounded-2xl border border-ink-200 bg-white p-2.5 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.28)]"
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
    </div>
  )
}
