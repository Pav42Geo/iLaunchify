'use client'

// "Import products" button → drag-drop modal → (1) map columns → (2) choose
// products + set each one's Category → Subcategory → create DRAFTs.
// Category assignment is PER PRODUCT in step 2. A partner can "+ Add category" /
// "+ Add subcategory" inline: these are SUGGESTIONS (taxonomy is admin-curated) —
// they appear in the dropdown now and flow to the admin review queue on import.

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Upload, UploadCloud, X, Check, FileSpreadsheet, Loader2, Search } from 'lucide-react'
import { bulkImportProducts, parseSpreadsheet, type ImportRow, type ImportResult } from './import-actions'

function abToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(bin)
}

interface ImportCategory { id: string; name: string; subcategories: { id: string; name: string }[] }
type BaseRow = Omit<ImportRow, 'subcategoryId' | 'suggestedCategoryName'>
type Assignment = { categoryId: string; subcategoryId: string }

const isSugCat = (id: string) => id.startsWith('sug:c:')
const isSugSub = (id: string) => id.startsWith('sug:s:')

type FieldKind = 'text' | 'int' | 'num' | 'coo'
interface FieldDef { key: keyof ImportRow | 'category'; label: string; required?: boolean; kind: FieldKind; aliases: string[] }
const FIELDS: FieldDef[] = [
  { key: 'name', label: 'Product name', required: true, kind: 'text', aliases: ['product name', 'display name', 'item name', 'product title', 'name', 'title'] },
  { key: 'category', label: 'Category', kind: 'text', aliases: ['category', 'subcategory', 'product type', 'item type', 'class', 'type'] },
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

type PreviewFlag = 'ok' | 'missing' | 'check' | 'empty'
function fieldResolve(f: FieldDef, raw: string): { shown: string; flag: PreviewFlag } {
  if (raw === '') return { shown: '', flag: f.required ? 'missing' : 'empty' }
  if (f.kind === 'int' || f.kind === 'num') {
    const n = f.kind === 'int' ? toInt(raw) : toNum(raw)
    if (n == null) return { shown: raw, flag: 'check' }
    return { shown: String(n), flag: /^\d+(\.\d+)?$/.test(raw) ? 'ok' : 'check' }
  }
  if (f.kind === 'coo') {
    const code = COUNTRY_TO_CODE[raw.toLowerCase()] ?? (raw.length === 2 ? raw.toUpperCase() : raw)
    return { shown: code, flag: /^[A-Z]{2}$/.test(code) ? 'ok' : 'check' }
  }
  return { shown: raw, flag: 'ok' }
}

function downloadTemplate() {
  const headers = ['Product name', 'Category', 'Base SKU', 'Short description', 'Country of origin', 'MOQ', 'Order increment', 'Repeat lead time (days)', 'First-run lead time (days)', 'Monthly capacity', 'Shelf life (days)', 'Net content value', 'Net content unit']
  const example = ['Sparkling Yuzu Soda', 'Beverages', 'SODA-YUZU', 'Crisp Japanese yuzu, lightly sparkling, zero sugar', 'US', '500', '100', '21', '35', '50000', '365', '473', 'mL']
  const esc = (c: string) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)
  const csv = [headers, example].map((r) => r.map(esc).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = 'ilaunchify-products-template.csv'; a.click()
  URL.revokeObjectURL(url)
}

export function ProductImportButton({ categories, triggerClassName, triggerLabel }: { categories: ImportCategory[]; triggerClassName?: string; triggerLabel?: React.ReactNode }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'drop' | 'map' | 'select' | 'done'>('drop')
  const [drag, setDrag] = useState(false)
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<string, number | null>>({})
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<ImportResult[] | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set()) // keyed by raw row index
  const [query, setQuery] = useState('')
  const [assign, setAssign] = useState<Record<number, Assignment>>({}) // rowIndex → category/subcategory
  const [bulkCat, setBulkCat] = useState('')
  const [bulkSub, setBulkSub] = useState('')
  // Partner-suggested categories / subcategories (session-local; admin finalizes on import).
  const [suggCats, setSuggCats] = useState<{ id: string; name: string }[]>([])
  const [suggSubs, setSuggSubs] = useState<Record<string, { id: string; name: string }[]>>({})
  const [addModal, setAddModal] = useState<{ mode: 'category' | 'subcategory'; categoryId: string; rowIndex: number } | null>(null)
  const [addName, setAddName] = useState('')
  const seqRef = useRef(0)
  const fileRef = useRef<HTMLInputElement>(null)

  // Auto-match maps from the REAL category tree.
  const { subcatByName, catByName, realSubsByCat, firstSubId } = useMemo(() => {
    const sbn = new Map<string, { subId: string; catId: string }>()
    const cbn = new Map<string, string>()
    const sbc = new Map<string, { id: string; name: string }[]>()
    for (const c of categories) {
      cbn.set(c.name.trim().toLowerCase(), c.id)
      sbc.set(c.id, c.subcategories)
      for (const s of c.subcategories) sbn.set(s.name.trim().toLowerCase(), { subId: s.id, catId: c.id })
    }
    return { subcatByName: sbn, catByName: cbn, realSubsByCat: sbc, firstSubId: categories[0]?.subcategories[0]?.id ?? '' }
  }, [categories])

  // Category options for the dropdowns = real + partner-suggested.
  const catOptions = useMemo(() => [...categories.map((c) => ({ id: c.id, name: c.name })), ...suggCats], [categories, suggCats])
  const subsFor = useCallback((catId: string) => [...(realSubsByCat.get(catId) ?? []), ...(suggSubs[catId] ?? [])], [realSubsByCat, suggSubs])
  const catNameOf = useCallback((catId: string) => catOptions.find((c) => c.id === catId)?.name ?? '', [catOptions])
  const subNameOf = useCallback((catId: string, subId: string) => subsFor(catId).find((s) => s.id === subId)?.name ?? '', [subsFor])

  function reset() {
    setStep('drop'); setFileName(''); setHeaders([]); setRows([]); setMapping({}); setResults(null); setDrag(false)
    setSelected(new Set()); setQuery(''); setAssign({}); setBulkCat(''); setBulkSub('')
    setSuggCats([]); setSuggSubs({}); setAddModal(null); setAddName(''); seqRef.current = 0
  }
  function close() { setOpen(false); setTimeout(reset, 200) }

  const applyParsed = useCallback((name: string, h: string[], r: string[][]) => {
    if (h.length === 0 || r.length === 0) { toast.error('Could not read any rows from that file.'); return }
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

  const cellOf = useCallback(
    (row: string[], key: string): string => { const i = mapping[key]; return i != null && i >= 0 ? (row[i] ?? '').trim() : '' },
    [mapping],
  )

  function rowToBase(r: string[]): BaseRow | null {
    const get = (key: string) => cellOf(r, key)
    const name = get('name')
    if (name.length < 2) return null
    const cooRaw = get('countryOfOrigin')
    const coo = cooRaw ? (COUNTRY_TO_CODE[cooRaw.toLowerCase()] ?? (cooRaw.length === 2 ? cooRaw.toUpperCase() : cooRaw)) : null
    return {
      name,
      familyCode: get('familyCode') || null,
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

  const valid = useMemo(() => {
    const out: Array<{ base: BaseRow; issues: number; rowIndex: number; sheetCategory: string }> = []
    rows.forEach((r, rowIndex) => {
      const base = rowToBase(r)
      if (!base) return
      let issues = 0
      for (const f of FIELDS) {
        if (f.key === 'category') continue
        if (fieldResolve(f, cellOf(r, String(f.key))).flag === 'check') issues++
      }
      out.push({ base, issues, rowIndex, sheetCategory: cellOf(r, 'category') })
    })
    return out
  }, [rows, mapping, cellOf])

  const skippedNoName = useMemo(() => rows.filter((r) => cellOf(r, 'name').length < 2).length, [rows, cellOf])
  const nameMapped = mapping.name != null && mapping.name >= 0

  const autoMatch = useCallback((sheetCategory: string): Assignment => {
    const key = sheetCategory.trim().toLowerCase()
    if (!key) return { categoryId: '', subcategoryId: '' }
    const sub = subcatByName.get(key)
    if (sub) return { categoryId: sub.catId, subcategoryId: sub.subId }
    const cat = catByName.get(key)
    if (cat) return { categoryId: cat, subcategoryId: '' }
    return { categoryId: '', subcategoryId: '' }
  }, [subcatByName, catByName])
  const effAssign = useCallback(
    (v: { rowIndex: number; sheetCategory: string }): Assignment => assign[v.rowIndex] ?? autoMatch(v.sheetCategory),
    [assign, autoMatch],
  )
  const isSuggested = useCallback((e: Assignment) => isSugCat(e.categoryId) || isSugSub(e.subcategoryId), [])
  const isReady = useCallback((v: { rowIndex: number; sheetCategory: string }): boolean => {
    const e = effAssign(v)
    return !!e.subcategoryId || isSugCat(e.categoryId)
  }, [effAssign])

  const preview = useMemo(() => {
    if (rows.length === 0) return [] as Array<{ key: string; label: string; required: boolean; mapped: boolean; shown: string; raw: string; flag: PreviewFlag }>
    const row = rows[0]!
    return FIELDS.filter((f) => f.key !== 'category').map((f) => {
      const raw = cellOf(row, String(f.key))
      const { shown, flag } = fieldResolve(f, raw)
      return { key: String(f.key), label: f.label, required: !!f.required, mapped: mapping[f.key] != null && (mapping[f.key] as number) >= 0, shown, raw, flag }
    })
  }, [rows, mapping, cellOf])
  const previewIssues = preview.filter((p) => p.flag === 'missing' || p.flag === 'check').length

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return valid
    return valid.filter((v) => v.base.name.toLowerCase().includes(q) || (v.base.familyCode ?? '').toLowerCase().includes(q))
  }, [valid, query])

  const selectedCount = valid.filter((v) => selected.has(v.rowIndex)).length
  const chosen = useMemo(
    () => valid.filter((v) => selected.has(v.rowIndex) && isReady(v)),
    [valid, selected, isReady],
  )
  const needCategory = selectedCount - chosen.length

  function next() {
    if (!valid.length) { toast.error('No products found to import.'); return }
    setSelected(new Set(valid.map((v) => v.rowIndex)))
    setStep('select')
  }

  function applyBulk() {
    if (!bulkCat || !bulkSub) return
    setAssign((a) => {
      const n = { ...a }
      for (const v of valid) if (selected.has(v.rowIndex)) n[v.rowIndex] = { categoryId: bulkCat, subcategoryId: bulkSub }
      return n
    })
  }

  function saveAdd() {
    const name = addName.trim()
    if (!addModal || name.length < 2) return
    if (addModal.mode === 'category') {
      const id = `sug:c:${seqRef.current++}`
      setSuggCats((cs) => [...cs, { id, name }])
      setAssign((a) => ({ ...a, [addModal.rowIndex]: { categoryId: id, subcategoryId: '' } }))
    } else {
      const id = `sug:s:${seqRef.current++}`
      const catId = addModal.categoryId
      setSuggSubs((m) => ({ ...m, [catId]: [...(m[catId] ?? []), { id, name }] }))
      setAssign((a) => ({ ...a, [addModal.rowIndex]: { categoryId: catId, subcategoryId: id } }))
    }
    setAddModal(null); setAddName('')
  }

  function commit() {
    const ready = chosen
    if (!ready.length) { toast.error('Select products and give each a category.'); return }
    const importRows: ImportRow[] = ready.map((v) => {
      const e = effAssign(v)
      const sug = isSuggested(e)
      const subLabel = e.subcategoryId ? subNameOf(e.categoryId, e.subcategoryId) : ''
      const label = (catNameOf(e.categoryId) || v.sheetCategory || 'New') + (subLabel ? ` › ${subLabel}` : '')
      return {
        ...v.base,
        subcategoryId: sug ? firstSubId : e.subcategoryId,
        suggestedCategoryName: sug ? label : null,
      }
    })
    setBusy(true)
    bulkImportProducts(importRows).then((res) => {
      setBusy(false)
      if (!res.ok) { toast.error(res.error); return }
      const ok = res.results.filter((r) => r.ok)
      if (ok.length === 1 && ok[0]?.id) { router.push(`/products/new?draft=${ok[0].id}&imported=1`); return }
      setResults(res.results); setStep('done')
      if (ok.length) { toast.success(`Created ${ok.length} draft${ok.length === 1 ? '' : 's'}`); router.refresh() }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName ?? 'inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-4 py-2 text-[13px] font-semibold text-ink-800 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2'}
      >
        {triggerLabel ?? <><Upload className="h-4 w-4" aria-hidden="true" /> Import products</>}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/45 p-4" onMouseDown={close}>
          <div
            className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3.5">
              <h2 className="font-display text-[17px] font-bold text-ink-900">
                {step === 'select' ? 'Choose products & set their category' : 'Import products from a spreadsheet'}
              </h2>
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
                    One product per row, with a header row. We auto-match columns like “Product name”, “SKU”, “MOQ”, “Country”. Next you confirm the columns, then choose products and set each one&apos;s category.
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

                  <p className="mb-4 text-[12.5px] leading-relaxed text-ink-600">
                    <span className="font-semibold text-ink-800">Confirm which of your columns maps to each iLaunchify field.</span>{' '}
                    We auto-matched what we could. Change any dropdown that looks wrong, or leave a field “— not in my sheet —”. You&apos;ll pick each product&apos;s category in the next step.
                  </p>

                  <div className="mb-1.5 grid grid-cols-[1fr_1.2fr] items-center gap-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500">iLaunchify field</span>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500">← your spreadsheet column</span>
                  </div>
                  <div className="grid gap-2.5">
                    {FIELDS.map((f) => (
                      <div key={f.key} className="grid grid-cols-[1fr_1.2fr] items-center gap-3">
                        <span className="text-[13px] font-medium text-ink-800">{f.label}{f.required && <span className="text-pink-700"> *</span>}</span>
                        <select
                          className={SEL}
                          value={mapping[f.key] ?? ''}
                          onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value === '' ? null : parseInt(e.target.value, 10) }))}
                        >
                          <option value="">— not in my sheet —</option>
                          {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>

                  {preview.length > 0 && (
                    <div className="mt-4 overflow-hidden rounded-lg border border-ink-200 bg-white">
                      <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50 px-3 py-2">
                        <span className="text-[12.5px] font-semibold text-ink-900">
                          {`Preview — first of ${rows.length} row${rows.length === 1 ? '' : 's'}`}
                        </span>
                        <span className={`text-[12px] font-medium ${previewIssues > 0 ? 'text-warning-700' : 'text-success-700'}`}>
                          {previewIssues > 0 ? `${previewIssues} to check` : 'Looks clean'}
                        </span>
                      </div>
                      <dl className="divide-y divide-ink-100">
                        {preview.filter((p) => p.mapped || p.flag === 'missing').map((p) => (
                          <div key={p.key} className="grid grid-cols-[1fr_1.3fr] items-baseline gap-3 px-3 py-1.5">
                            <dt className="text-[12.5px] text-ink-600">{p.label}{p.required && <span className="text-pink-700"> *</span>}</dt>
                            <dd className="flex flex-wrap items-baseline gap-x-1.5 text-[12.5px]">
                              {p.flag === 'missing' ? (
                                <span className="font-medium text-danger-700">Missing</span>
                              ) : p.flag === 'check' ? (
                                <>
                                  <span className="font-medium text-ink-900">{p.shown || '—'}</span>
                                  <span className="text-warning-700">· check “{p.raw}”</span>
                                </>
                              ) : (
                                <span className="font-medium text-ink-900">{p.shown || '—'}</span>
                              )}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}

                  <div className="mt-4 flex items-center gap-3 rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-[13px]">
                    <span className={`font-semibold ${valid.length ? 'text-ink-900' : 'text-ink-500'}`}>{valid.length} product{valid.length === 1 ? '' : 's'} found</span>
                    {skippedNoName > 0 && <span className="text-ink-500">· {skippedNoName} skipped (missing name)</span>}
                    {!nameMapped && <span className="text-pink-700">· map a Product name column</span>}
                  </div>
                </>
              )}

              {step === 'select' && (
                <>

                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-ink-50 px-2.5 py-2">
                    <span className="text-[12px] text-ink-600">Set all selected:</span>
                    <select className={`${SEL} h-9 w-auto min-w-[120px] flex-1 py-1`} value={bulkCat} onChange={(e) => { setBulkCat(e.target.value); setBulkSub('') }}>
                      <option value="">Category…</option>
                      {catOptions.map((c) => <option key={c.id} value={c.id}>{isSugCat(c.id) ? `${c.name} · new` : c.name}</option>)}
                    </select>
                    <select className={`${SEL} h-9 w-auto min-w-[120px] flex-1 py-1`} value={bulkSub} onChange={(e) => setBulkSub(e.target.value)} disabled={!bulkCat}>
                      <option value="">Subcategory…</option>
                      {subsFor(bulkCat).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <button type="button" onClick={applyBulk} disabled={!bulkCat || !bulkSub || selectedCount === 0} className="rounded-full border border-ink-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-40">Apply</button>
                  </div>

                  {valid.length > 6 && (
                    <div className="relative mb-2">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" aria-hidden="true" />
                      <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search by name or SKU…"
                        className="w-full rounded-lg border border-ink-200 bg-white py-2 pl-9 pr-3 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-ink-400 focus:outline-none focus:ring-2 focus:ring-pink-500/30"
                      />
                    </div>
                  )}

                  <div className="overflow-hidden rounded-lg border border-ink-200">
                    <div className="grid grid-cols-[20px_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2.5 border-b border-ink-100 bg-ink-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-ink-500">
                      <input
                        type="checkbox"
                        aria-label="Select all products"
                        ref={(el) => { if (el) el.indeterminate = filtered.some((v) => selected.has(v.rowIndex)) && !filtered.every((v) => selected.has(v.rowIndex)) }}
                        checked={filtered.length > 0 && filtered.every((v) => selected.has(v.rowIndex))}
                        onChange={() => setSelected((s) => { const n = new Set(s); const all = filtered.length > 0 && filtered.every((v) => n.has(v.rowIndex)); for (const v of filtered) { if (all) n.delete(v.rowIndex); else n.add(v.rowIndex) } return n })}
                        className="h-4 w-4 accent-pink-600"
                      />
                      <span>Product</span>
                      <span>Category</span>
                      <span>Subcategory</span>
                    </div>
                    <div className="max-h-[44vh] divide-y divide-ink-100 overflow-auto">
                    {filtered.length === 0 ? (
                      <p className="px-3 py-6 text-center text-[12.5px] text-ink-500">No products match “{query}”.</p>
                    ) : filtered.map((v) => {
                      const on = selected.has(v.rowIndex)
                      const e = effAssign(v)
                      const sug = isSuggested(e)
                      return (
                        <div key={v.rowIndex} className={`grid grid-cols-[20px_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2.5 px-3 py-2 transition-colors ${on ? 'bg-pink-50/40' : ''}`}>
                          <input
                            type="checkbox"
                            checked={on}
                            aria-label={`Select ${v.base.name}`}
                            onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(v.rowIndex)) n.delete(v.rowIndex); else n.add(v.rowIndex); return n })}
                            className="h-4 w-4 flex-none accent-pink-600"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium text-ink-900">{v.base.name}</span>
                            <span className="flex items-center gap-1.5 text-[11px]">
                              {v.base.familyCode && <span className="truncate text-ink-400">{v.base.familyCode}</span>}
                              {v.issues > 0 && <span className="text-warning-700">{v.issues} to check</span>}
                              {sug && <span className="text-warning-700">· admin review</span>}
                            </span>
                          </span>
                          <select
                            className={`${SEL} h-9 py-1 ${on && !isReady(v) ? 'border-pink-300' : ''}`}
                            value={e.categoryId}
                            onChange={(ev) => {
                              const val = ev.target.value
                              if (val === '__add_cat__') { setAddModal({ mode: 'category', categoryId: '', rowIndex: v.rowIndex }); setAddName(''); return }
                              setAssign((a) => ({ ...a, [v.rowIndex]: { categoryId: val, subcategoryId: '' } }))
                            }}
                          >
                            <option value="">Category…</option>
                            {catOptions.map((c) => <option key={c.id} value={c.id}>{isSugCat(c.id) ? `${c.name} · new` : c.name}</option>)}
                            <option value="__add_cat__">+ Add category…</option>
                          </select>
                          <select
                            className={`${SEL} h-9 py-1 ${on && e.categoryId && !e.subcategoryId && !isSugCat(e.categoryId) ? 'border-pink-300' : ''}`}
                            value={e.subcategoryId}
                            disabled={!e.categoryId}
                            onChange={(ev) => {
                              const val = ev.target.value
                              if (val === '__add_sub__') { setAddModal({ mode: 'subcategory', categoryId: e.categoryId, rowIndex: v.rowIndex }); setAddName(''); return }
                              setAssign((a) => ({ ...a, [v.rowIndex]: { ...effAssign(v), subcategoryId: val } }))
                            }}
                          >
                            <option value="">{e.categoryId ? 'Subcategory…' : '—'}</option>
                            {subsFor(e.categoryId).map((s) => <option key={s.id} value={s.id}>{isSugSub(s.id) ? `${s.name} · new` : s.name}</option>)}
                            {e.categoryId && <option value="__add_sub__">+ Add subcategory…</option>}
                          </select>
                        </div>
                      )
                    })}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink-900">{chosen.length} ready</span>
                      {needCategory > 0 && <span className="text-pink-700">· {needCategory} need a category</span>}
                      {skippedNoName > 0 && <span className="text-ink-500">· {skippedNoName} skipped (missing name)</span>}
                    </span>
                    <span className="text-ink-500">{valid.length} found · {selectedCount} selected</span>
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
                        <span className="min-w-0 flex-1 truncate text-ink-900">{r.name}</span>
                        {r.ok && r.id
                          ? <a href={`/products/new?draft=${r.id}&imported=1`} className="flex-none text-[12px] font-semibold text-pink-700 hover:text-pink-800">Open →</a>
                          : !r.ok && <span className="ml-auto truncate text-[12px] text-danger-700">{r.error}</span>}
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
                    onClick={next}
                    disabled={!valid.length || !nameMapped}
                    className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-5 py-2 text-[13px] font-semibold text-white hover:bg-ink-700 disabled:opacity-50"
                  >
                    Choose products →
                  </button>
                </>
              )}
              {step === 'select' && (
                <>
                  <button type="button" onClick={() => setStep('map')} className="rounded-full px-4 py-2 text-[13px] font-semibold text-ink-700 hover:bg-ink-100">Back</button>
                  <button
                    type="button"
                    onClick={commit}
                    disabled={busy || chosen.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-5 py-2 text-[13px] font-semibold text-white hover:bg-ink-700 disabled:opacity-50"
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    {busy ? 'Creating…' : chosen.length === 1 ? 'Create & review →' : `Create ${chosen.length} draft${chosen.length === 1 ? '' : 's'}`}
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

          {addModal && (
            <div className="fixed inset-0 z-[60] grid place-items-center bg-ink-900/55 p-4" onMouseDown={() => setAddModal(null)}>
              <div className="w-full max-w-sm rounded-xl border border-ink-200 bg-white p-5 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
                <h3 className="font-display text-[15px] font-bold text-ink-900">
                  {addModal.mode === 'category' ? 'Suggest a new category' : `Suggest a subcategory${addModal.categoryId ? ` in ${catNameOf(addModal.categoryId)}` : ''}`}
                </h3>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-500">
                  Added to the dropdown now so you can assign it. iLaunchify reviews it when you import and files the product into the right place.
                </p>
                <input
                  autoFocus
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveAdd() }}
                  placeholder={addModal.mode === 'category' ? 'e.g. Functional Elixirs' : 'e.g. Hard Kombucha'}
                  className="mt-3 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-100"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => setAddModal(null)} className="rounded-full px-4 py-2 text-[13px] font-semibold text-ink-700 hover:bg-ink-100">Cancel</button>
                  <button type="button" onClick={saveAdd} disabled={addName.trim().length < 2} className="rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-ink-700 disabled:opacity-50">Save</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}

const SEL = 'w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-900 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-100'
