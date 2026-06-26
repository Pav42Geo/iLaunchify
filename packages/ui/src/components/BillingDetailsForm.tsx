'use client'

// Canva-style "Billing details" form, shared by the creator + partner billing
// surfaces (docs/BILLING_AND_ACCOUNTING.md slice 1).
//
// This collects PLAIN invoice/tax contact data only — no card, bank, CVC, or
// government TIN. The host app passes a server action as `action`; this component
// is purely presentational + local state. Server actions are serializable across
// the RSC boundary (unlike plain function/icon props), so passing `action` is safe.

import { useState, useTransition } from 'react'
import { Input } from '../primitives/input'
import { Label } from '../primitives/label'
import { Button } from '../primitives/button'

export interface BillingFormAddress {
  line1?: string
  line2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
}

export interface BillingFormValues {
  billingContactName: string | null
  billingAddress: BillingFormAddress | null
  taxId: string | null
  additionalContacts: string[]
}

export interface BillingDetailsFormProps {
  initial: BillingFormValues
  /** Server action that persists the values. Returns ok + optional error message. */
  action: (values: BillingFormValues) => Promise<{ ok: boolean; error?: string }>
}

const fieldCls =
  'block w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-[13px] focus:border-pink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500'

export function BillingDetailsForm({ initial, action }: BillingDetailsFormProps) {
  const [contactName, setContactName] = useState(initial.billingContactName ?? '')
  const [addr, setAddr] = useState<BillingFormAddress>(initial.billingAddress ?? {})
  const [taxId, setTaxId] = useState(initial.taxId ?? '')
  const [contactsText, setContactsText] = useState((initial.additionalContacts ?? []).join(', '))
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  function setAddrField(key: keyof BillingFormAddress, value: string) {
    setAddr((prev) => ({ ...prev, [key]: value }))
    setStatus('idle')
  }

  function save() {
    setStatus('idle')
    setErrorMsg(null)
    const additionalContacts = contactsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const cleanedAddr: BillingFormAddress = Object.fromEntries(
      Object.entries(addr).filter(([, v]) => (v ?? '').trim() !== ''),
    )
    const hasAddr = Object.keys(cleanedAddr).length > 0
    startTransition(async () => {
      const result = await action({
        billingContactName: contactName.trim() || null,
        billingAddress: hasAddr ? cleanedAddr : null,
        taxId: taxId.trim() || null,
        additionalContacts,
      })
      if (result.ok) {
        setStatus('saved')
        setTimeout(() => setStatus('idle'), 2500)
      } else {
        setStatus('error')
        setErrorMsg(result.error ?? 'Something went wrong — please try again.')
      }
    })
  }

  return (
    <div className="space-y-6 rounded-2xl border border-ink-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-[17px] font-semibold tracking-tight text-ink-900">
            Invoice information
          </h2>
          <p className="mt-1 text-[12px] text-ink-500">
            Appears on your invoices. We never store card or bank numbers here — those
            are held securely by our payment processor.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {status === 'saved' && (
            <span className="text-xs font-medium text-success-600">✓ Saved</span>
          )}
          {status === 'error' && <span className="text-xs font-medium text-danger-600">⚠ Not saved</span>}
          <Button size="sm" onClick={save} disabled={isPending}>
            {isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>

      {errorMsg && (
        <p className="rounded-lg bg-danger-50 px-3 py-2 text-[12px] text-danger-700">{errorMsg}</p>
      )}

      {/* Billing contact name */}
      <div className="space-y-1.5">
        <Label className="text-[13px] font-medium text-ink-900">Billing contact name</Label>
        <Input
          value={contactName}
          onChange={(e) => {
            setContactName(e.target.value)
            setStatus('idle')
          }}
          placeholder="Your business or entity name"
        />
        <p className="text-[12px] text-ink-500">
          Appears below your name on the invoice (for example, your business name).
        </p>
      </div>

      {/* Billing address */}
      <div className="space-y-2">
        <div>
          <Label className="text-[13px] font-medium text-ink-900">Billing address</Label>
          <p className="mt-0.5 text-[12px] text-ink-500">We use this to calculate tax.</p>
        </div>
        <input
          aria-label="Address line 1"
          value={addr.line1 ?? ''}
          onChange={(e) => setAddrField('line1', e.target.value)}
          placeholder="Street address"
          className={fieldCls}
        />
        <input
          aria-label="Address line 2"
          value={addr.line2 ?? ''}
          onChange={(e) => setAddrField('line2', e.target.value)}
          placeholder="Apartment, suite, etc. (optional)"
          className={fieldCls}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            aria-label="City"
            value={addr.city ?? ''}
            onChange={(e) => setAddrField('city', e.target.value)}
            placeholder="City"
            className={fieldCls}
          />
          <input
            aria-label="State / Province / Region"
            value={addr.state ?? ''}
            onChange={(e) => setAddrField('state', e.target.value)}
            placeholder="State / Province / Region"
            className={fieldCls}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            aria-label="ZIP / Postal code"
            value={addr.postalCode ?? ''}
            onChange={(e) => setAddrField('postalCode', e.target.value)}
            placeholder="ZIP / Postal code"
            className={fieldCls}
          />
          <input
            aria-label="Country"
            value={addr.country ?? ''}
            onChange={(e) => setAddrField('country', e.target.value)}
            placeholder="Country"
            className={fieldCls}
          />
        </div>
      </div>

      {/* Tax ID */}
      <div className="space-y-1.5">
        <Label className="text-[13px] font-medium text-ink-900">Tax ID (optional)</Label>
        <Input
          value={taxId}
          onChange={(e) => {
            setTaxId(e.target.value)
            setStatus('idle')
          }}
          placeholder="VAT, GST, or business registration number"
          className="max-w-md"
        />
        <p className="text-[12px] text-ink-500">
          Shown on your invoices. Do not enter a Social Security number — only a
          business/VAT/GST number.
        </p>
      </div>

      {/* Additional billing contacts */}
      <div className="space-y-1.5">
        <Label className="text-[13px] font-medium text-ink-900">Additional billing contacts</Label>
        <Input
          value={contactsText}
          onChange={(e) => {
            setContactsText(e.target.value)
            setStatus('idle')
          }}
          placeholder="finance@acme.com, ops@acme.com"
        />
        <p className="text-[12px] text-ink-500">
          Comma-separated emails. Billing emails go to you plus these contacts.
        </p>
      </div>
    </div>
  )
}
