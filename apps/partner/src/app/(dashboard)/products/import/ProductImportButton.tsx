'use client'

// "Import CSV" button → drag-and-drop modal → column mapping → bulk create
// DRAFT products via bulkImportProducts. Export Excel → CSV to use it.
// Tailwind + semantic tokens.

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Upload, UploadCloud, X, Check, FileSpreadsheet, Loader2 } from 'lucide-react'
import { bulkImportProducts, parseSpreadsheet, type ImportRow, type ImportResult } from './import-actions'

// ArrayBuffer → base64 (chunked, safe for larger workbooks) for the .xlsx path.
function abToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(bin)
}

interface SubcatOption { id: string; name: string; categoryName: string }

// Importable target fields + header-matching aliases for auto-mapping.
type FieldKind = 'text' | 'int' | 'num' | 'coo'
interface FieldDef { key: keyof ImportRow | 'category'; label: string; required?: boolean; kind: FieldKind; aliases: string[] }
// Aliases cover common ERP / commerce / PIM export headers (NetSuite, Shopify,
// QuickBooks, Akeneo/Salsify, GS1 GDM) so a dropped export auto-maps. Matching
// is first-field-wins over `header === alias || header.includes(alias)`, so the
// more specific fields are ordered to claim their columns first.
const FIELDS: FieldDef[] = [
  { key: 'name', label: 'Product name', required: true, kind: 'text', aliases: ['product name', 'display name', 'item name', 'product title', 'name', 'title'] },
  { key: 'category', label: 'Category (optional)', kind: 'text', aliases: ['category', 'subcategory', 'product type', 'item type', 'class', 'type'] },
  { key: 'gtin', label: 'GTIN / UPC / barcode', kind: 'text', aliases: ['gtin', 'upc', 'ean', 'barcode', 'gtin/upc', 'upc/ean', 'ean/upc', 'global trade item number'] },
  { key: 'familyCode', label: 'Base SKU', kind: 'text', aliases: ['base sku', 'variant sku', 'item number', 'item code', 'part number', 'mpn', 'style number', 'sku'] },
  { key: 'description', label: 'Short description', kind: 'text', aliases: ['short description', 'body html', 'body (html)', 'long description', 'product description', 'description', 'desc', 'summary'] },
  { key: 'countryOfOrigin', label: 'Country of origin', kind: 'coo', aliases: ['country of origin', 'country of manufacture', 'manufactured in', 'made in', 'origin', 'coo', 'country'] },
  { key: 'moqMin', label: 'MOQ', kind: 'int', aliases: ['moq', 'minimum order quantity', 'min order qty', 'min qty', 'minimum order', 'min order', 'minimum'] },
  { key: 'orderIncrement', label: 'Order increment', kind: 'int', aliases: ['order increment', 'increment', 'step'] },
  { key: 'leadTimeRepeatDays', label: 'Repeat lead time (days)', kind: 'int', aliases: ['repeat lead', 'lead time days', 'lead time', 'lead days', 'lead'] },
  { key: 'leadTimeFirstRunDays', label: 'First-run lead time (days)', kind: 'int', aliases: ['first-run lead', 'first run', 'new sku lead'] },
  { key: 'monthlyCapacity', label: 'Monthly capacity', kind: 'int', aliases: ['monthly capacity', 'capacity'] },
  { key: 'shelfLifeDays', label: 'Shelf life (days)', kind: 'int', aliases: ['shelf life', 'shelf', 'expiry', 'expiration'] },
  { key: 'netContentValue', label: 'Net content value', kind: 'num', aliases: ['net content', 'net weight', 'variant grams', 'fill weight', 'grams', 'fill', 'net', 'content'] },
  { key: 'netContentUnit', label: 'Net content unit', kind: 'text', aliases: ['net content unit', 'weight unit', 'unit of measure', 'net unit', 'content unit', 'uom', 'unit'] },
]

const COUNTRY_TO_CODE: Record<string, string> = {
  us: 'US', usa: 'US', 'united states': 'US', 'united states of america': 'US',
  ca: 'CA', canada: 'CA', mx: 'MX', mexico: 'MX', gb: 'GB', uk: 'GB', 'united kingdom': 'GB',
  de: 'DE', germany: 'DE', fr: 'FR', france: 'FR', it: 'IT', italy: 'IT', cn: 'CN', china: 'CN', in: 'IN', india: 'IN',
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const out: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQ = false
  const t = text.replace(/\r\n?/g, '\n')
  const pushField = () => { cur.push(field); field = '' }
  const pushRow = () => { pushField(); out.push(cur); cur = [] }
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (inQ) {
      if (c === '"') { if (t[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') pushField()
    else if (c === '\n') pushRow()
    else field += c
  }
  if (field.length > 0 || cur.length > 0) pushRow()
  const headers = (out.shift() ?? []).map((h) => h.trim())
  const rows = out.filter((r) => r.some((x) => x.trim() !== ''))
  return { headers, rows }
}

const toInt = (s: string): number | null => { const n = parseInt(s.replace(/[^0-9.-]/g, ''), 10); return Number.isFinite(n) ? Math.max(0, n) : null }
const toNum = (s: string): number | null => { const n = parseFloat(s.replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? Math.max(0, n) : null }

// A starter CSV whose headers exactly match the auto-mapper, plus one example row.
function downloadTemplate() {
  const headers = ['Product name', 'Category', 'GTIN', 'Base SKU', 'Short description', 'Country of origin', 'MOQ', 'Order increment', 'Repeat lead time (days)', 'First-run lead time (days)', 'Monthly capacity', 'Shelf life (days)', 'Net content value', 'Net content unit']
  const example = ['Sparkling Yuzu Soda', '', '850002345012', 'SODA-YUZU', 'Crisp Japanese yuzu, lightly sparkling, zero sugar', 'US', '500', '100', '21', '35', '50000', '365', '473', 'mL']
  const esc = (c: string) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)
  const csv = [headers, example].map((r) => r.map(esc).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = 'ilaunchify-products-template.csv'; a.click()
  URL.revokeObjectURL(url)
}

export function ProductImportButton({ subcategories, triggerClassName, triggerLabel }: { subcategories: SubcatOption[]; triggerClassName?: string; triggerLabel?: React.ReactNode }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'drop' | 'map' | 'done'>('drop')
  const [drag, setDrag] = useState(false)
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<string, number | null>>({})
  const [defaultSubcatId, setDefaultSubcatId] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<ImportResult[] | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const subcatByName = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of subcategories) { m.set(s.name.trim().toLowerCase(), s.id); m.set(s.categoryName.trim().toLowerCase(), s.id) }
    return m
  }, [subcategories])

  function reset() {
    setStep('drop'); setFileName(''); setHeaders([]); setRows([]); setMapping({}); setDefaultSubcatId(''); setResults(null); setDrag(false)
  }
  function close() { setOpen(false); setTimeout(reset, 200) }

  const applyParsed = useCallback((name: string, h: string[], r: string[][]) => {
    if (h.length === 0 || r.length === 0) { toast.error('Could not read any rows from that file.'); return }
    // Auto-map fields by header alias.
    const map: Record<string, number | null> = {}
    for (const f of FIELDS) {
      const idx = h.findIndex((header) => {
        const hl = header.trim().toLowerCase()
        return f.aliases.some((a) => hl === a || hl.includes(a))
      })
      map[f.key] = idx >= 0 ? idx : null
    }
    setFileName(name); setHeaders(h); setRows(r); setMapping(map); setStep('map')
  }, [])

  function onFile(file: File | undefined) {
    if (!file) return
    if (file.size > 4 * 1024 * 1024) { toast.error('File is over 4 MB — split it or trim columns.'); return }
    const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv'
    const isXlsx = /\.xlsx?$/i.test(file.name)
    if (isCsv) {
      file.text().then((t) => { const { headers: h, rows: r } = parseCsv(t); applyParsed(file.name, h, r) }).catch(() => toast.error('Could not read the file.'))
      return
    }
    if (isXlsx) {
      file.arrayBuffer().then(async (buf) => {
        const res = await parseSpreadsheet(abToB64(buf))
        if (!res.ok) { toast.error(res.error); return }
        applyParsed(file.name, res.headers, res.rows)
      }).catch(() => toast.error('Could not read the file.'))
      return
    }
    toast.error('Upload a .csv or .xlsx file.')
  }

  // Resolve a row → ImportRow using the current mapping + default subcategory.
  function rowToImport(r: string[]): ImportRow | null {
    const get = (key: string): string => { const i = mapping[key]; return i != null && i >= 0 ? (r[i] ?? '').trim() : '' }
    const name = get('name')
    if (name.length < 2) return null
    const catRaw = get('category').toLowerCase()
    const subcategoryId = (catRaw && subcatByName.get(catRaw)) || defaultSubcatId
    if (!subcategoryId) return null
    const cooRaw = get('countryOfOrigin')
    const coo = cooRaw ? (COUNTRY_TO_CODE[cooRaw.toLowerCase()] ?? (cooRaw.length === 2 ? cooRaw.toUpperCase() : cooRaw)) : null
    return {
      name,
      subcategoryId,
      familyCode: get('familyCode') || null,
      gtin: get('gtin') || null,
      description: get('description') || null,
      countryOfOrigin: coo,
      moqMin: toInt(get('moqMin')),
      orderIncrement: toInt(get('orderIncrement')),
      leadTimeRepeatDays: toInt(get('leadTimeRepeatDays')),
      leadTimeFirstRunDays: toInt(get('leadTimeFirstRunDays')),
      monthlyCapacity: toInt(get('monthlyCapacity')),
      shelfLifeDays: toInt(get('shelfLifeDays')),
      netContentValue: toNum(get('netContentValue')),
      netContentUnit: get('netContentUnit') || null,
    }
  }

  const valid = useMemo(() => (defaultSubcatId || mapping.category != null) ? rows.map(rowToImport).filter((x): x is ImportRow => x != null) : [], [rows, mapping, defaultSubcatId, subcatByName])
  const skipped = rows.length - valid.length
  const nameMapped = mapping.name != null && mapping.name >= 0

  function commit() {
    if (!valid.length) { toast.error('No valid rows to import.'); return }
    setBusy(true)
    bulkImportProducts(valid).then((res) => {
      setBusy(false)
      if (!res.ok) { toast.error(res.error); return }
      setResults(res.results); setStep('done')
      const ok = res.results.filter((r) => r.ok).length
      if (ok) { toast.success(`Created ${ok} draft${ok === 1 ? '' : 's'}`); router.refresh() }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName ?? 'inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-4 py-2 text-[13px] font-semibold text-ink-800 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2'}
      >
        {triggerLabel ?? <><Upload className="h-4 w-4" aria-hidden="true" /> Import CSV</>}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/45 p-4" onMouseDown={close}>
          <div
            className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3.5">
              <h2 className="font-display text-[17px] font-bold text-ink-900">Import products from CSV</h2>
              <button type="button" onClick={close} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-900">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-auto px-5 py-5">
              {step === 'drop' && (
                <>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fileRef.current?.click()}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click() }}
                    onDragEnter={(e) => { e.preventDefault(); setDrag(true) }}
                    onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
                    onDragLeave={(e) => { e.preventDefault(); setDrag(false) }}
                    onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files?.[0]) }}
                    className={`grid cursor-pointer place-items-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${drag ? 'border-pink-500 bg-pink-50' : 'border-ink-300 bg-ink-50/40 hover:border-ink-400'}`}
                  >
                    <UploadCloud className={`h-9 w-9 ${drag ? 'text-pink-600' : 'text-ink-400'}`} aria-hidden="true" />
                    <div className="text-[14px] font-semibold text-ink-900">Drag &amp; drop a CSV or Excel file</div>
                    <div className="text-[12.5px] text-ink-500">or click to choose · .csv or .xlsx</div>
                    <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
                  </div>
                  <p className="mt-3 text-[12px] text-ink-500">
                    One product per row, with a header row. We auto-match columns like “Product name”, “SKU”, “MOQ”, “Country”. You map the rest next.
                  </p>
                  <button type="button" onClick={downloadTemplate} className="mt-1.5 text-[12.5px] font-semibold text-pink-700 underline-offset-2 hover:text-pink-800 hover:underline">
                    Download a CSV template
                  </button>
                </>
              )}

              {step === 'map' && (
                <>
                  <div className="mb-4 flex items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-[13px] text-ink-700">
                    <FileSpreadsheet className="h-4 w-4 text-ink-500" aria-hidden="true" />
                    <span className="truncate font-medium">{fileName}</span>
                    <span className="ml-auto text-ink-500">{rows.length} row{rows.length === 1 ? '' : 's'}</span>
                  </div>

                  <label className="mb-4 block">
                    <span className="mb-1.5 block text-[13px] font-semibold text-ink-800">Default category for all rows <span className="text-pink-700">*</span></span>
                    <select className={SEL} value={defaultSubcatId} onChange={(e) => setDefaultSubcatId(e.target.value)}>
                      <option value="">Select a subcategory…</option>
                      {subcategories.map((s) => <option key={s.id} value={s.id}>{s.categoryName} → {s.name}</option>)}
                    </select>
                    <span className="mt-1 block text-[12px] text-ink-500">Used for every row, unless a mapped “Category” column matches one of your subcategories.</span>
                  </label>

                  <div className="grid gap-2.5">
                    {FIELDS.map((f) => (
                      <div key={f.key} className="grid grid-cols-[1fr_1.2fr] items-center gap-3">
                        <span className="text-[13px] font-medium text-ink-800">{f.label}{f.required && <span className="text-pink-700"> *</span>}</span>
                        <select
                          className={SEL}
                          value={mapping[f.key] ?? ''}
                          onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value === '' ? null : parseInt(e.target.value, 10) }))}
                        >
                          <option value="">— not mapped —</option>
                          {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center gap-3 rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-[13px]">
                    <span className="font-semibold text-ink-900">{valid.length} ready</span>
                    {skipped > 0 && <span className="text-ink-500">· {skipped} skipped (missing name)</span>}
                    {!nameMapped && <span className="text-pink-700">· map a Product name column</span>}
                    {!defaultSubcatId && <span className="text-pink-700">· pick a default category</span>}
                  </div>
                </>
              )}

              {step === 'done' && results && (
                <div>
                  <div className="mb-4 flex items-center gap-2 text-[14px] font-semibold text-ink-900">
                    <Check className="h-5 w-5 text-success-600" aria-hidden="true" />
                    Created {results.filter((r) => r.ok).length} of {results.length} as drafts
                  </div>
                  <div className="max-h-64 overflow-auto rounded-lg border border-ink-200">
                    {results.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 border-b border-ink-100 px-3 py-2 text-[13px] last:border-0">
                        {r.ok
                          ? <Check className="h-3.5 w-3.5 flex-none text-success-600" aria-hidden="true" />
                          : <X className="h-3.5 w-3.5 flex-none text-danger-600" aria-hidden="true" />}
                        <span className="truncate text-ink-900">{r.name}</span>
                        {!r.ok && <span className="ml-auto truncate text-[12px] text-danger-700">{r.error}</span>}
                        {r.ok && r.note && <span className="ml-auto truncate text-[12px] text-ink-500">{r.note}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-ink-100 px-5 py-3.5">
              {step === 'map' && (
                <>
                  <button type="button" onClick={() => setStep('drop')} className="rounded-full px-4 py-2 text-[13px] font-semibold text-ink-700 hover:bg-ink-100">Back</button>
                  <button
                    type="button"
                    onClick={commit}
                    disabled={busy || !valid.length || !nameMapped || !defaultSubcatId}
                    className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-5 py-2 text-[13px] font-semibold text-white hover:bg-ink-700 disabled:opacity-50"
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    {busy ? 'Creating…' : `Create ${valid.length} draft${valid.length === 1 ? '' : 's'}`}
                  </button>
                </>
              )}
              {step === 'done' && (
                <button type="button" onClick={close} className="rounded-full bg-ink-900 px-5 py-2 text-[13px] font-semibold text-white hover:bg-ink-700">Done</button>
              )}
              {step === 'drop' && (
                <button type="button" onClick={close} className="rounded-full px-4 py-2 text-[13px] font-semibold text-ink-700 hover:bg-ink-100">Cancel</button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const SEL = 'w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-900 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-100'
