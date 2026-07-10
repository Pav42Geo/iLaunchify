'use client'

// Reusable certificate picker (Pavel 2026-07-08): a "Choose certificate" field
// that opens a dropdown of small vertical cards (admin-curated badge thumbnail +
// name from the CertificateType library). Multi-select — pick as many as you're
// eligible for. Presentational: the host supplies the (eligibility-filtered)
// library + owns what the selected ids mean (a declaration at apply; a claimed
// PartnerCertificateInstance in onboarding/activation). Use it EVERYWHERE certs
// are asked so we never collect free-text cert text again.

import { useEffect, useRef, useState } from 'react'
import { ShieldCheck, ChevronDown, X } from 'lucide-react'

export type CertPickerOption = {
  id: string
  slug: string
  name: string
  description?: string
  thumbnailUrl?: string | null
}

export function CertificatePicker({
  options,
  value,
  onChange,
  requestHref,
  label = 'Choose certificate',
  singleSelect = false,
}: {
  options: CertPickerOption[]
  value: string[]
  onChange: (ids: string[]) => void
  /** Authenticated hosts pass the "request a new cert type" route. */
  requestHref?: string
  label?: string
  /** Claim flows (one PDF per cert) pick exactly one type at a time. */
  singleSelect?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const byId = new Map(options.map((o) => [o.id, o]))
  const selected = value.map((id) => byId.get(id)).filter((o): o is CertPickerOption => !!o)

  function toggle(id: string) {
    if (singleSelect) {
      onChange(value.includes(id) ? [] : [id])
      setOpen(false)
      return
    }
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-ink-300 bg-white px-3 py-2 text-left text-[13px] text-ink-700 hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
      >
        <span className={value.length ? 'text-ink-900' : 'text-ink-500'}>
          {label}
          {value.length > 0 && ` · ${value.length} selected`}
        </span>
        <ChevronDown className={`h-4 w-4 flex-none text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((o) => (
            <span
              key={o.id}
              className="inline-flex items-center gap-1 rounded-full border border-pink-200 bg-pink-50 px-2.5 py-1 text-[12px] font-semibold text-pink-700"
            >
              {o.name}
              <button
                type="button"
                onClick={() => toggle(o.id)}
                aria-label={`Remove ${o.name}`}
                className="text-pink-400 hover:text-pink-700"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-ink-200 bg-white p-2 shadow-lg">
          {options.length === 0 && (
            <p className="px-2 py-3 text-[13px] text-ink-500">No certificates available for your profile.</p>
          )}
          {options.map((o) => {
            const on = value.includes(o.id)
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle(o.id)}
                aria-pressed={on}
                className={
                  'flex w-full items-center gap-3 rounded-lg border px-2.5 py-2 text-left transition-colors ' +
                  (on ? 'border-pink-500 bg-pink-50' : 'border-transparent hover:bg-ink-50')
                }
              >
                <span className="flex h-9 w-9 flex-none items-center justify-center overflow-hidden rounded-md border border-ink-200 bg-white">
                  {o.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.thumbnailUrl} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 text-ink-400" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-ink-900">{o.name}</span>
                  {o.description && (
                    <span className="mt-0.5 block line-clamp-1 text-[12px] text-ink-500">{o.description}</span>
                  )}
                </span>
                <span
                  className={
                    'flex h-4 w-4 flex-none items-center justify-center rounded-full border text-[10px] font-bold ' +
                    (on ? 'border-pink-500 bg-pink-500 text-white' : 'border-ink-300 text-transparent')
                  }
                >
                  ✓
                </span>
              </button>
            )
          })}

          {requestHref && (
            <a
              href={requestHref}
              className="mt-1 block border-t border-ink-100 px-2.5 py-2 text-[12px] font-semibold text-pink-700 hover:text-pink-600"
            >
              Don’t see yours? Add a certificate →
            </a>
          )}
        </div>
      )}
    </div>
  )
}
