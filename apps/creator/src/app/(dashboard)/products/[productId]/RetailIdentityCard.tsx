'use client'

import * as React from 'react'
import { Barcode, CheckCircle2, AlertTriangle, Info } from 'lucide-react'
import { GTIN_FORMAT_LABEL, prettyPrintGtin, validateGtin } from '@ilaunchify/ui'
import {
  checkIdentity,
  saveProductIdentity,
  type BarcodeMode,
  type IdentityCheck,
} from './identity-actions'

interface Props {
  productId: string
  initial: {
    gtin: string | null
    internalSku: string | null
    barcodeMode: BarcodeMode
  }
}

/**
 * Retail identity card on the product overview page (DS-52c).
 *
 * Opt-in section — folded behind a toggle so DTC-only creators aren't shown
 * UPC jargon. When opened, lets the creator set:
 *   - GTIN (UPC/EAN) — check-digit validated + cross-product duplicate
 *     warning (privacy-safe — never names the other brand)
 *   - Internal SKU — free-form, for the Internal-SKU barcode mode
 *   - Barcode mode — None / Retail UPC / Internal SKU — controls what
 *     the BarcodeDrawer wires onto packaging at print time
 */
export function RetailIdentityCard({ productId, initial }: Props) {
  const [open, setOpen] = React.useState(
    !!initial.gtin || !!initial.internalSku || initial.barcodeMode !== 'NONE',
  )
  const [gtin, setGtin] = React.useState(initial.gtin ?? '')
  const [sku, setSku] = React.useState(initial.internalSku ?? '')
  const [mode, setMode] = React.useState<BarcodeMode>(initial.barcodeMode)
  const [check, setCheck] = React.useState<IdentityCheck | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [savedAt, setSavedAt] = React.useState<Date | null>(null)

  // Debounced server validation for duplicate detection + complete error list.
  React.useEffect(() => {
    const id = setTimeout(async () => {
      const result = await checkIdentity(productId, {
        gtin,
        internalSku: sku,
        barcodeMode: mode,
      })
      setCheck(result)
    }, 400)
    return () => clearTimeout(id)
  }, [productId, gtin, sku, mode])

  // Client-side check digit feedback (synchronous, no network round-trip).
  const gtinClient = React.useMemo(() => validateGtin(gtin), [gtin])

  async function handleSave() {
    setSaving(true)
    try {
      const result = await saveProductIdentity(productId, {
        gtin: gtin.trim() || null,
        internalSku: sku.trim() || null,
        barcodeMode: mode,
      })
      if (result.ok) {
        setSavedAt(new Date())
      } else {
        setCheck({
          ok: false,
          errors: result.errors,
          warnings: result.warnings,
        })
      }
    } finally {
      setSaving(false)
    }
  }

  const gtinError = check?.errors.find((e) => e.field === 'gtin')
  const gtinWarning = check?.warnings.find((w) => w.field === 'gtin')
  const skuError = check?.errors.find((e) => e.field === 'internalSku')
  const modeError = check?.errors.find((e) => e.field === 'barcodeMode')

  return (
    <section className="rounded-xl border border-zinc-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-zinc-50 rounded-xl transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-md bg-zinc-100 flex items-center justify-center">
            <Barcode className="h-4 w-4 text-zinc-700" />
          </span>
          <div>
            <div className="font-semibold text-sm text-zinc-900">
              Retail identity
              {initial.gtin && (
                <span className="ml-2 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                  UPC set
                </span>
              )}
              {!initial.gtin && initial.barcodeMode === 'INTERNAL_SKU' && (
                <span className="ml-2 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                  Internal
                </span>
              )}
            </div>
            <div className="text-[11.5px] text-zinc-500 mt-0.5">
              Optional — needed for Amazon / Walmart / retail
            </div>
          </div>
        </div>
        <span className="text-[11px] text-zinc-500">{open ? 'Hide' : 'Configure'}</span>
      </button>

      {open && (
        <div className="border-t border-zinc-200 p-5 space-y-5">
          {/* GTIN */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 block mb-1.5">
              GTIN / UPC / EAN
              <span className="ml-2 text-zinc-400 normal-case font-normal tracking-normal">
                · 8, 12, 13, or 14 digits
              </span>
            </label>
            <input
              type="text"
              value={gtin}
              onChange={(e) => setGtin(e.target.value)}
              placeholder="012345678905"
              spellCheck={false}
              className="w-full h-10 px-3 text-sm font-mono tabular-nums border border-zinc-300 rounded-md focus:outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-500/15"
            />
            {gtinClient.ok && gtinClient.normalized && gtinClient.format && (
              <p className="mt-1.5 text-[11.5px] text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3" />
                Valid {GTIN_FORMAT_LABEL[gtinClient.format]} ·{' '}
                <span className="font-mono">
                  {prettyPrintGtin(gtinClient.normalized, gtinClient.format)}
                </span>
              </p>
            )}
            {gtinError && (
              <p className="mt-1.5 text-[11.5px] text-pink-700">{gtinError.message}</p>
            )}
            {gtinWarning && (
              <p className="mt-1.5 text-[11.5px] text-amber-700 flex items-start gap-1.5">
                <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                {gtinWarning.message}
              </p>
            )}
            <p className="mt-1.5 text-[11px] text-zinc-500 flex items-start gap-1">
              <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
              For retail (Amazon, Walmart, Target), register at{' '}
              <a
                href="https://www.gs1.org/standards/get-barcodes"
                target="_blank"
                rel="noopener"
                className="text-pink-700 font-semibold hover:text-pink-600 underline ml-0.5"
              >
                GS1
              </a>{' '}
              first.
            </p>
          </div>

          {/* Internal SKU */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 block mb-1.5">
              Internal SKU
              <span className="ml-2 text-zinc-400 normal-case font-normal tracking-normal">
                · for warehouse routing + pre-launch
              </span>
            </label>
            <input
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value.toUpperCase())}
              placeholder="KINDRED-VAN-30CT"
              spellCheck={false}
              className="w-full h-10 px-3 text-sm font-mono tabular-nums border border-zinc-300 rounded-md focus:outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-500/15"
            />
            {skuError && (
              <p className="mt-1.5 text-[11.5px] text-pink-700">{skuError.message}</p>
            )}
          </div>

          {/* Barcode mode */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 block mb-1.5">
              What prints on packaging
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['NONE', 'RETAIL_UPC', 'INTERNAL_SKU'] as BarcodeMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={
                    'rounded-md border p-2.5 text-left transition-all ' +
                    (mode === m
                      ? 'border-pink-500 bg-pink-50 ring-2 ring-pink-500/20'
                      : 'border-zinc-200 bg-white hover:border-zinc-400')
                  }
                >
                  <div className="font-bold text-[12.5px] text-zinc-900">
                    {m === 'NONE' && 'No barcode'}
                    {m === 'RETAIL_UPC' && 'Retail UPC'}
                    {m === 'INTERNAL_SKU' && 'Internal SKU'}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">
                    {m === 'NONE' && 'Skip the barcode area'}
                    {m === 'RETAIL_UPC' && 'Print the GTIN above'}
                    {m === 'INTERNAL_SKU' && 'Code 128 + "INTERNAL"'}
                  </div>
                </button>
              ))}
            </div>
            {modeError && (
              <p className="mt-1.5 text-[11.5px] text-pink-700">{modeError.message}</p>
            )}
          </div>

          {/* Save */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || (check ? !check.ok : false)}
              className="h-10 px-5 inline-flex items-center justify-center text-sm font-semibold bg-zinc-900 text-white rounded-md hover:bg-black disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving…' : 'Save identity'}
            </button>
            {savedAt && (
              <span className="text-[11.5px] text-emerald-700">
                Saved {savedAt.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
