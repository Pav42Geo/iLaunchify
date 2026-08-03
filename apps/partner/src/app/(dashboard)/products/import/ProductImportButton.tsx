'use client'

// "Import products" button → drag-drop modal → (1) map columns → (2) choose
// products + set each one's Category → Subcategory → create DRAFTs.
// Category assignment is PER PRODUCT in step 2. A partner can "+ Add category" /
// "+ Add subcategory" inline: these are SUGGESTIONS (taxonomy is admin-curated) —
// they appear in the dropdown now and flow to the admin review queue on import.

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Upload, UploadCloud, X, Check, FileSpreadsheet, Loader2, Search, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
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
  // Flavor matrix — rows that share a Base SKU collapse into one multi-flavor product.
  { key: 'flavor', label: 'Flavor', kind: 'text', aliases: ['flavor', 'flavour', 'variant name', 'variation', 'variant'] },
  { key: 'flavorStatementOfIdentity', label: 'Flavor statement of identity', kind: 'text', aliases: ['flavor statement of identity', 'flavour statement of identity', 'flavor soi', 'flavour soi', 'statement of identity', 'soi'] },
  { key: 'flavorUnitPriceCents', label: 'Flavor price (USD)', kind: 'num', aliases: ['flavor price', 'flavour price', 'price per flavor', 'flavor unit price', 'per-flavor price'] },
  { key: 'flavorLeadTimeDays', label: 'Flavor lead time (days)', kind: 'int', aliases: ['flavor lead time', 'flavour lead time', 'flavor lead', 'per-flavor lead'] },
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
  const headers = ['Product name', 'Category', 'Base SKU', 'Short description', 'Country of origin', 'MOQ', 'Order increment', 'Repeat lead time (days)', 'First-run lead time (days)', 'Monthly capacity', 'Shelf life (days)', 'Net content value', 'Net content unit', 'Flavor', 'Flavor statement of identity', 'Flavor price (USD)', 'Flavor lead time (days)']
  // Single-flavor product (one row) + a multi-flavor product (rows sharing a Base
  // SKU — one row per flavor). Repeat the product name + Base SKU on every flavor row.
  const examples = [
    ['Sparkling Yuzu Soda', 'Beverages', 'SODA-YUZU', 'Crisp Japanese yuzu, lightly sparkling, zero sugar', 'US', '500', '100', '21', '35', '50000', '365', '473', 'mL', '', '', '', ''],
    ['Protein Cookie', 'Snacks', 'PCK-001', 'Soft-baked protein cookie', 'US', '1000', '100', '28', '42', '20000', '270', '60', 'g', 'Chocolate Chip', 'Chocolate Chip Protein Cookie', '2.50', '28'],
    ['Protein Cookie', 'Snacks', 'PCK-001', 'Soft-baked protein cookie', 'US', '1000', '100', '28', '42', '20000', '270', '60', 'g', 'Strawberry', 'Strawberry Protein Cookie', '2.50', '28'],
  ]
  const esc = (c: string) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)
  const csv = [headers, ...examples].map((r) => r.map(esc).join(',')).join('\n')
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
  const [previewIdx, setPreviewIdx] = useState(0) // which row the preview/editor shows
  const [overrides, setOverrides] = useState<Record<number, Record<string, string>>>({}) // rowIndex → field → tweaked value
  // Partner-private external references — each maps a label (e.g. "ERP ID") to a column.
  const [refMappings, setRefMappings] = useState<{ id: number; label: string; col: number | null }[]>([])
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
    setPreviewIdx(0); setOverrides({}); setRefMappings([])
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
    setFileName(name); setHeaders(h); setRows(r); setMapping(map); setPreviewIdx(0); setOverrides({}); setStep('map')
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

  // The effective value for a field on a row: a manufacturer's inline edit (preview
  // editor) wins, else the mapped cell. Drives the editable preview AND the import.
  const valueFor = useCallback((rowIndex: number, key: string): string => {
    const o = overrides[rowIndex]?.[key]
    if (o != null) return o
    const r = rows[rowIndex]
    return r ? cellOf(r, key) : ''
  }, [overrides, rows, cellOf])

  function rowToBase(rowIndex: number): BaseRow | null {
    const g = (key: string) => valueFor(rowIndex, key)
    const name = g('name')
    if (name.length < 2) return null
    const cooRaw = g('countryOfOrigin')
    const coo = cooRaw ? (COUNTRY_TO_CODE[cooRaw.toLowerCase()] ?? (cooRaw.length === 2 ? cooRaw.toUpperCase() : cooRaw)) : null
    return {
      name,
      familyCode: g('familyCode') || null,
      description: g('description') || null,
      countryOfOrigin: coo,
      moqMin: toInt(g('moqMin')),
      orderIncrement: toInt(g('orderIncrement')),
      leadTimeRepeatDays: toInt(g('leadTimeRepeatDays')),
      leadTimeFirstRunDays: toInt(g('leadTimeFirstRunDays')),
      monthlyCapacity: toInt(g('monthlyCapacity')),
      shelfLifeDays: toInt(g('shelfLifeDays')),
      netContentValue: toNum(g('netContentValue')),
      netContentUnit: g('netContentUnit') || null,
      flavor: g('flavor') || null,
      flavorStatementOfIdentity: g('flavorStatementOfIdentity') || null,
      flavorUnitPriceCents: (() => { const d = toNum(g('flavorUnitPriceCents')); return d == null ? null : Math.round(d * 100) })(),
      flavorLeadTimeDays: toInt(g('flavorLeadTimeDays')),
    }
  }

  const valid = useMemo(() => {
    const out: Array<{ base: BaseRow; issues: number; rowIndex: number; sheetCategory: string }> = []
    rows.forEach((r, rowIndex) => {
      const base = rowToBase(rowIndex)
      if (!base) return
      let issues = 0
      for (const f of FIELDS) {
        if (f.key === 'category') continue
        if (fieldResolve(f, valueFor(rowIndex, String(f.key))).flag === 'check') issues++
      }
      out.push({ base, issues, rowIndex, sheetCategory: cellOf(r, 'category') })
    })
    return out
  }, [rows, mapping, cellOf, valueFor])

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

  // Editable per-product preview. `pIdx` is the row currently shown; the partner
  // pages through with < >. Each field is an input bound to valueFor → overrides.
  const pIdx = rows.length ? Math.min(previewIdx, rows.length - 1) : 0
  const previewFields = useMemo(() => {
    if (rows.length === 0) return [] as Array<{ key: string; label: string; required: boolean; value: string; flag: PreviewFlag; edited: boolean }>
    const r = rows[pIdx]
    return FIELDS.filter((f) => f.key !== 'category').map((f) => {
      const value = valueFor(pIdx, String(f.key))
      const raw = r ? cellOf(r, String(f.key)) : ''
      const { flag } = fieldResolve(f, value)
      return { key: String(f.key), label: f.label, required: !!f.required, value, flag, edited: value !== raw }
    })
  }, [rows, pIdx, valueFor, cellOf])
  const previewIssues = previewFields.filter((p) => p.flag === 'missing' || p.flag === 'check').length
  const previewEdited = previewFields.some((p) => p.edited)
  const previewName = rows.length ? valueFor(pIdx, 'name') : ''

  // A product's external references = each ref-mapping's column value for that row.
  const buildRefs = useCallback((rowIndex: number) => {
    const r = rows[rowIndex]
    if (!r) return [] as { label: string; value: string }[]
    return refMappings
      .filter((rm) => rm.col != null && rm.col >= 0)
      .map((rm) => ({ label: rm.label.trim() || 'Reference', value: (r[rm.col!] ?? '').trim() }))
      .filter((x) => x.value)
  }, [rows, refMappings])
  const previewRefs = useMemo(() => buildRefs(pIdx), [buildRefs, pIdx])

  // Columns from the sheet not yet consumed by an iLaunchify field OR a reference —
  // offered as one-click "keep as my reference" so nothing in the sheet is silently
  // dropped. Adding one moves it into the references list above (and out of here).
  const unmatchedCols = useMemo(() => {
    const used = new Set<number>()
    for (const k of Object.keys(mapping)) { const v = mapping[k]; if (v != null && v >= 0) used.add(v) }
    for (const rm of refMappings) { if (rm.col != null && rm.col >= 0) used.add(rm.col) }
    return headers
      .map((h, i) => ({ label: (h || `Column ${i + 1}`).trim(), col: i }))
      .filter(({ col }) => !used.has(col))
  }, [headers, mapping, refMappings])

  // Which rows the partner has actually changed (override differs from the cell) —
  // for the "edited" markers in the preview header + the choose-products list.
  const editedRows = useMemo(() => {
    const s = new Set<number>()
    for (const k of Object.keys(overrides)) {
      const idx = Number(k)
      const r = rows[idx]
      if (r && Object.entries(overrides[idx]!).some(([key, v]) => v !== cellOf(r, key))) s.add(idx)
    }
    return s
  }, [overrides, rows, cellOf])

  // Flavor matrix — collapse valid rows that share a Base SKU (or name) into ONE
  // product. The representative is the first row; `flavors` lists the distinct
  // flavor names; `memberRowIndexes` are every row in the group (expanded at commit).
  type GroupEntry = { base: BaseRow; issues: number; rowIndex: number; sheetCategory: string; flavors: string[]; memberRowIndexes: number[] }
  const groups = useMemo<GroupEntry[]>(() => {
    const m = new Map<string, GroupEntry>()
    const order: string[] = []
    for (const v of valid) {
      const key = (v.base.familyCode || v.base.name).trim().toLowerCase()
      let g = m.get(key)
      if (!g) { g = { ...v, flavors: [], memberRowIndexes: [] }; m.set(key, g); order.push(key) }
      g.memberRowIndexes.push(v.rowIndex)
      g.issues = Math.max(g.issues, v.issues)
      const fl = (v.base.flavor ?? '').trim()
      if (fl && !g.flavors.includes(fl)) g.flavors.push(fl)
    }
    return order.map((k) => m.get(k)!)
  }, [valid])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups.filter((v) => v.base.name.toLowerCase().includes(q) || (v.base.familyCode ?? '').toLowerCase().includes(q))
  }, [groups, query])

  const selectedCount = groups.filter((v) => selected.has(v.rowIndex)).length
  const chosen = useMemo(
    () => groups.filter((v) => selected.has(v.rowIndex) && isReady(v)),
    [groups, selected, isReady],
  )
  const needCategory = selectedCount - chosen.length

  function next() {
    if (!groups.length) { toast.error('No products found to import.'); return }
    setSelected(new Set(groups.map((v) => v.rowIndex)))
    setStep('select')
  }

  function applyBulk() {
    if (!bulkCat || !bulkSub) return
    setAssign((a) => {
      const n = { ...a }
      for (const v of groups) if (selected.has(v.rowIndex)) n[v.rowIndex] = { categoryId: bulkCat, subcategoryId: bulkSub }
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
    // Expand each product group to one ImportRow per member row (so the server gets
    // every flavor), all sharing the group's resolved category + a groupKey.
    const importRows: ImportRow[] = ready.flatMap((v) => {
      const e = effAssign(v)
      const sug = isSuggested(e)
      const subLabel = e.subcategoryId ? subNameOf(e.categoryId, e.subcategoryId) : ''
      const label = (catNameOf(e.categoryId) || v.sheetCategory || 'New') + (subLabel ? ` › ${subLabel}` : '')
      const groupKey = (v.base.familyCode || v.base.name).trim().toLowerCase()
      return v.memberRowIndexes
        .map((ri) => rowToBase(ri))
        .filter((b): b is BaseRow => b != null)
        .map((b) => ({
          ...b,
          subcategoryId: sug ? firstSubId : e.subcategoryId,
          suggestedCategoryName: sug ? label : null,
          manufacturerRefs: buildRefs(v.rowIndex),
          groupKey,
        }))
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
            className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--card-radius)] border border-ink-200 bg-white shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[9px] bg-pink-50 text-pink-700"><Upload className="h-[15px] w-[15px]" aria-hidden="true" /></span>
                <h2 className="font-display text-[17px] font-bold tracking-[-0.015em] text-ink-900">
                  {step === 'select' ? 'Choose products & set their category' : 'Import products from a spreadsheet'}
                </h2>
              </div>
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
                    className={`grid cursor-pointer place-items-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${drag ? 'border-success-500 bg-success-50' : 'border-ink-300 bg-ink-50/40 hover:border-ink-400'}`}
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

                  <div className="mt-4 rounded-lg border border-ink-200 bg-white px-3 py-2.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
                      Your references <span className="font-medium normal-case tracking-normal text-ink-400">· optional — track products by your own ERP / warehouse codes</span>
                    </div>
                    {refMappings.length > 0 && (
                      <div className="mt-2 grid gap-2">
                        {refMappings.map((rm) => (
                          <div key={rm.id} className="grid grid-cols-[1fr_1.2fr_28px] items-center gap-2">
                            <input
                              value={rm.label}
                              onChange={(e) => setRefMappings((rs) => rs.map((x) => (x.id === rm.id ? { ...x, label: e.target.value } : x)))}
                              placeholder="Label (e.g. ERP ID)"
                              className={SEL}
                            />
                            <select className={SEL} value={rm.col ?? ''} onChange={(e) => setRefMappings((rs) => rs.map((x) => (x.id === rm.id ? { ...x, col: e.target.value === '' ? null : parseInt(e.target.value, 10) } : x)))}>
                              <option value="">— which column —</option>
                              {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                            </select>
                            <button type="button" aria-label="Remove reference" onClick={() => setRefMappings((rs) => rs.filter((x) => x.id !== rm.id))} className="grid h-8 w-7 place-items-center rounded-md text-ink-400 hover:bg-ink-100 hover:text-ink-700">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {refMappings.length < 8 && (
                      <button type="button" onClick={() => setRefMappings((rs) => [...rs, { id: seqRef.current++, label: '', col: null }])} className="mt-2 text-[12.5px] font-semibold text-pink-700 hover:text-pink-800">
                        + Add a reference
                      </button>
                    )}

                    {unmatchedCols.length > 0 && refMappings.length < 8 && (
                      <div className="mt-3 border-t border-ink-100 pt-2.5">
                        <div className="text-[11.5px] text-ink-500">
                          Other columns in your sheet — tap to keep as a reference{' '}
                          <span className="text-ink-400">(applies to every product you import; each keeps its own value)</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {unmatchedCols.map((c) => (
                            <button
                              key={c.col}
                              type="button"
                              onClick={() => setRefMappings((rs) => (rs.length >= 8 ? rs : [...rs, { id: seqRef.current++, label: c.label, col: c.col }]))}
                              className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-ink-50 px-2.5 py-1 text-[12px] font-medium text-ink-700 hover:border-pink-300 hover:bg-pink-50 hover:text-pink-800"
                            >
                              <Plus className="h-3 w-3" />
                              {c.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {previewRefs.length > 0 && (
                      <div className="mt-3 border-t border-ink-100 pt-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-[11px] font-bold uppercase tracking-wider text-ink-500">
                            For {previewName || `Row ${pIdx + 1}`}
                          </span>
                          <span className="flex-none text-[11px] tabular-nums text-ink-400">{pIdx + 1} / {rows.length}</span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                          {previewRefs.map((r, i) => (
                            <span key={i} className="text-[12px] text-ink-600">
                              <span className="text-ink-400">{r.label}:</span> <span className="font-medium text-ink-900">{r.value}</span>
                            </span>
                          ))}
                        </div>
                        <p className="mt-1.5 text-[11px] text-ink-400">Values shown for the previewed product — use ‹ › below to check others.</p>
                      </div>
                    )}
                  </div>

                  {rows.length > 0 && (
                    <div className="mt-4 overflow-hidden rounded-lg border border-ink-200 bg-white">
                      <div className="flex items-center justify-between gap-3 border-b border-ink-100 bg-ink-50 px-3 py-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="min-w-0 truncate text-[12.5px] font-semibold text-ink-900">Preview — {previewName || `Row ${pIdx + 1}`}</span>
                          {previewEdited && <span className="flex-none rounded-full bg-pink-100 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wide text-pink-700">Edited</span>}
                        </span>
                        <div className="flex flex-none items-center gap-1">
                          <button type="button" aria-label="Previous product" disabled={pIdx === 0} onClick={() => setPreviewIdx((i) => Math.max(0, i - 1))} className="grid h-6 w-6 place-items-center rounded-md border border-ink-200 text-ink-600 hover:bg-ink-100 disabled:opacity-40">
                            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={rows.length}
                            value={pIdx + 1}
                            onChange={(e) => { const n = parseInt(e.target.value, 10); if (Number.isFinite(n)) setPreviewIdx(Math.min(rows.length - 1, Math.max(0, n - 1))) }}
                            aria-label="Go to product number"
                            className="w-12 rounded-md border border-ink-200 bg-white px-1 py-0.5 text-center text-[11.5px] tabular-nums text-ink-900 focus:border-pink-500 focus:outline-none focus:ring-[3px] focus:ring-pink-50"
                          />
                          <span className="text-[11.5px] tabular-nums text-ink-500">/ {rows.length}</span>
                          <button type="button" aria-label="Next product" disabled={pIdx >= rows.length - 1} onClick={() => setPreviewIdx((i) => Math.min(rows.length - 1, i + 1))} className="grid h-6 w-6 place-items-center rounded-md border border-ink-200 text-ink-600 hover:bg-ink-100 disabled:opacity-40">
                            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                      <div className="divide-y divide-ink-100">
                        {previewFields.map((p) => (
                          <div key={p.key} className="grid grid-cols-[1fr_1.4fr] items-center gap-3 px-3 py-1.5">
                            <label htmlFor={`pv-${p.key}`} className="flex items-center gap-1.5 text-[12.5px] text-ink-600">
                              <span>{p.label}{p.required && <span className="text-pink-700"> *</span>}</span>
                              {p.edited && <span className="h-1.5 w-1.5 flex-none rounded-full bg-pink-500" title="Edited" aria-label="edited" />}
                            </label>
                            <div className="flex items-center gap-1.5">
                              <input
                                id={`pv-${p.key}`}
                                value={p.value}
                                onChange={(ev) => setOverrides((o) => ({ ...o, [pIdx]: { ...(o[pIdx] ?? {}), [p.key]: ev.target.value } }))}
                                placeholder="—"
                                className={`w-full rounded-md border bg-white px-2 py-1 text-[12.5px] text-ink-900 placeholder:text-ink-300 focus:outline-none focus:ring-[3px] focus:ring-pink-50 ${p.flag === 'missing' ? 'border-danger-300 focus:border-danger-400' : p.flag === 'check' ? 'border-warning-300 focus:border-warning-400' : 'border-ink-200 focus:border-pink-500'}`}
                              />
                              {p.flag === 'check' && <span className="flex-none text-[11px] text-warning-700">check</span>}
                              {p.flag === 'missing' && <span className="flex-none text-[11px] text-danger-600">required</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t border-ink-100 px-3 py-1.5">
                        <span className="text-[11px] text-ink-500">Edits apply to this product. Use ‹ › or type a number.</span>
                        <span className={`text-[12px] font-medium ${previewIssues > 0 ? 'text-warning-700' : 'text-success-700'}`}>
                          {previewIssues > 0 ? `${previewIssues} to check` : 'Looks clean'}
                        </span>
                      </div>
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
                        className="w-full rounded-lg border border-ink-200 bg-white py-2 pl-9 pr-3 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-500 focus:outline-none focus:ring-[3px] focus:ring-pink-50"
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
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-[13px] font-medium text-ink-900">{v.base.name}</span>
                              {v.flavors.length >= 2 && (
                                <span className="flex-none rounded-full bg-pink-50 px-1.5 py-0.5 text-[10px] font-semibold text-pink-700">{v.flavors.length} flavors</span>
                              )}
                            </span>
                            <span className="flex items-center gap-1.5 text-[11px]">
                              {v.base.familyCode && <span className="truncate text-ink-400">{v.base.familyCode}</span>}
                              {v.flavors.length >= 2 && <span className="truncate text-ink-500">{v.flavors.join(', ')}</span>}
                              {v.issues > 0 && <span className="text-warning-700">{v.issues} to check</span>}
                              {editedRows.has(v.rowIndex) && <span className="text-pink-700">· edited</span>}
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
                    <span className="text-ink-500">{groups.length} product{groups.length === 1 ? '' : 's'} · {selectedCount} selected</span>
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
                        {r.ok && r.flavors ? <span className="flex-none rounded-full bg-pink-50 px-1.5 py-0.5 text-[10px] font-semibold text-pink-700">{r.flavors} flavors</span> : null}
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
                  <button type="button" onClick={() => setStep('drop')} className="rounded-full border border-ink-200 bg-white px-4 py-2 text-[13px] font-semibold text-ink-800 hover:border-ink-400">Back</button>
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
                  <button type="button" onClick={() => setStep('map')} className="rounded-full border border-ink-200 bg-white px-4 py-2 text-[13px] font-semibold text-ink-800 hover:border-ink-400">Back</button>
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
                <button type="button" onClick={close} className="rounded-full border border-ink-200 bg-white px-4 py-2 text-[13px] font-semibold text-ink-800 hover:border-ink-400">Cancel</button>
              )}
            </div>
          </div>

          {addModal && (
            <div className="fixed inset-0 z-[60] grid place-items-center bg-ink-900/55 p-4" onMouseDown={() => setAddModal(null)}>
              <div className="w-full max-w-sm rounded-[var(--card-radius)] border border-ink-200 bg-white p-5 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
                <h3 className="font-display text-[15px] font-bold tracking-[-0.015em] text-ink-900">
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
                  className="mt-3 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-500 focus:outline-none focus:ring-[3px] focus:ring-pink-50"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => setAddModal(null)} className="rounded-full border border-ink-200 bg-white px-4 py-2 text-[13px] font-semibold text-ink-800 hover:border-ink-400">Cancel</button>
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

const SEL = 'w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-900 focus:border-pink-500 focus:outline-none focus:ring-[3px] focus:ring-pink-50'
