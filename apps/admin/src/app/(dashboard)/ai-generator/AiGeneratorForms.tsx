'use client'

// Admin AI Generator settings forms (§7/§13/§16). Each section edits the EFFECTIVE
// values (engine defaults + admin overrides) and saves the edited object back as the
// override. Sections are independent.

import * as React from 'react'
import { Gauge, Palette, FileDown, Cpu, ShieldCheck, Sparkles, Trash2, Power, Layers, Plus, ChevronUp, ChevronDown } from 'lucide-react'
import { Button, Switch, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@ilaunchify/ui'
import { saveTierLimits, saveDomainVocab, saveOutputPolicies, saveGates, createVocabGroup, updateVocabGroup, removeVocabGroup, reorderVocabGroups, setDomainGroups, savePreset, removePreset } from './actions'
import type { TierGenerationLimits, OutputPolicy, OutputFormat, ProviderStatus } from '@ilaunchify/imagegen'
import type { DomainPreset } from '@ilaunchify/ai-design'
import type { AiOutputPresetRow, AiVocabGroupRow } from '@ilaunchify/db'

const NUM = 'w-24 rounded-md border border-ink-300 bg-white px-2 py-1 text-[13px] tabular-nums text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400'
const TXT = 'w-full rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-[13px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400'
const MB = 1024 * 1024
const FORMATS: OutputFormat[] = ['PNG', 'PDF', 'SVG', 'AI', 'GLB']
const DOMAIN_LABEL: Record<string, string> = { FOOD: 'Food', DIETARY_SUPPLEMENT: 'Supplement', OTC: 'OTC / Drug', COSMETIC: 'Cosmetic', PET_PRODUCT: 'Pet' }

function Card({ icon: Icon, title, desc, children }: { icon: typeof Gauge; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-pink-50 text-pink-700"><Icon className="h-4 w-4" /></span>
        <h3 className="text-[14px] font-bold text-ink-900">{title}</h3>
      </div>
      <p className="mb-3 mt-1 text-[12.5px] text-ink-500">{desc}</p>
      {children}
    </div>
  )
}

function SaveBar({ pending, status, onSave }: { pending: boolean; status: { ok: boolean; msg: string } | null; onSave: () => void }) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <button onClick={onSave} disabled={pending} className="rounded-full bg-ink-900 px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50">{pending ? 'Saving…' : 'Save'}</button>
      {status && <span className={`text-[12px] font-medium ${status.ok ? 'text-success-700' : 'text-warning-700'}`}>{status.msg}</span>}
    </div>
  )
}
function useSaver() {
  const [pending, start] = React.useTransition()
  const [status, setStatus] = React.useState<{ ok: boolean; msg: string } | null>(null)
  const run = (fn: () => Promise<{ ok: boolean } | { ok: false; error: string }>) =>
    start(async () => { const r = await fn(); setStatus('ok' in r && r.ok ? { ok: true, msg: 'Saved.' } : { ok: false, msg: ('error' in r && r.error) || 'Failed.' }) })
  return { pending, status, run }
}

export function AiGeneratorForms(props: {
  tierLimits: Record<string, TierGenerationLimits>
  domains: Record<string, DomainPreset>
  vocabGroups: AiVocabGroupRow[]
  domainGroups: Record<string, string[]>
  outputPolicies: Record<string, OutputPolicy>
  presets: AiOutputPresetRow[]
  gates: { generatorEnabled: boolean; blockExportUntilCompliant: boolean; blockSaveOverStorage: boolean; makerGenerationDisabled: boolean }
  provider: ProviderStatus
}) {
  return (
    <div className="space-y-5">
      <ProviderCard s={props.provider} />
      <TierLimitsCard initial={props.tierLimits} />
      <VocabGroupsCard initial={props.vocabGroups} />
      <DomainVocabCard initial={props.domains} groups={props.vocabGroups} domainGroups={props.domainGroups} />
      <OutputCapsCard initial={props.outputPolicies} />
      <PresetsCard initial={props.presets} />
      <GatesCard initial={props.gates} />
    </div>
  )
}

/**
 * Compact master on/off control for the page hero (AdminPageHeader `actions`
 * slot). When off, the AI Templator disappears from every creator's Design
 * Studio and the route is blocked platform-wide. Turning OFF opens a confirm
 * modal; turning back ON is instant. Design-system Switch + Dialog + Button.
 */
export function AiGeneratorMasterToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = React.useState(initial)
  const [confirming, setConfirming] = React.useState(false)
  const { pending, status, run } = useSaver()
  const apply = (next: boolean) => {
    setConfirming(false)
    setOn(next)
    run(() => saveGates({ generatorEnabled: next }))
  }
  const onSwitchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) apply(true)
    else setConfirming(true) // leave the switch visually ON until confirmed
  }
  const stateText = status && !status.ok ? status.msg : pending ? 'Saving…' : on ? 'On' : 'Off'
  const stateColor = status && !status.ok ? 'text-warning-700' : on ? 'text-success-700' : 'text-ink-500'
  return (
    <div className="flex items-center gap-3 rounded-full border border-ink-200 bg-white py-1.5 pl-3.5 pr-2 shadow-sm">
      <span className={`grid h-7 w-7 place-items-center rounded-full ${on ? 'bg-pink-50 text-pink-700' : 'bg-ink-100 text-ink-400'}`}>
        <Power className="h-4 w-4" />
      </span>
      <div className="leading-tight">
        <p className="text-[12px] font-semibold text-ink-900">AI Generator</p>
        <p className={`flex items-center gap-1 text-[11px] font-medium ${stateColor}`}>
          <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${on ? 'bg-success-500' : 'bg-ink-300'}`} />
          {stateText}
        </p>
      </div>
      <span aria-hidden className="mx-0.5 h-6 w-px bg-ink-200" />
      <Switch checked={on} disabled={pending} onChange={onSwitchChange} aria-label="Toggle AI Generator availability" />

      {/* Confirmation modal (design-system Dialog) — only when turning OFF. */}
      <Dialog open={confirming} onOpenChange={(o) => !o && setConfirming(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-pink-50 text-pink-700"><Power className="h-5 w-5" /></span>
            <DialogTitle className="mt-2">Turn the AI Generator off for all creators?</DialogTitle>
            <DialogDescription className="mt-1.5 leading-relaxed">
              The AI Templator will immediately disappear from every creator&apos;s Design Studio, and any open generator link will stop working. Saved designs and templates are not affected. You can turn it back on at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2 gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button type="button" variant="pink" size="sm" disabled={pending} onClick={() => apply(false)}>
              {pending ? 'Turning off…' : 'Turn off for everyone'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ProviderCard({ s }: { s: ProviderStatus }) {
  const Badge = ({ ok, label }: { ok: boolean; label: string }) => (
    <span className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${ok ? 'border-success-200 bg-success-50 text-success-700' : 'border-warning-200 bg-warning-50 text-warning-800'}`}>{label}: {ok ? 'configured' : 'missing key'}</span>
  )
  return (
    <Card icon={Cpu} title="Providers" desc="Image-gen readiness from env (keys never shown). fal = raster backgrounds; Recraft = in-frame vector type.">
      <div className="flex flex-wrap gap-2">
        <Badge ok={s.rasterReady} label="FAL_KEY (raster)" />
        <Badge ok={s.vectorTypeReady} label="RECRAFT_API_KEY (type)" />
        <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${s.ready ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-500'}`}>{s.ready ? 'Generation ready' : 'Placeholder mode (raster key missing)'}</span>
      </div>
    </Card>
  )
}

function TierLimitsCard({ initial }: { initial: Record<string, TierGenerationLimits> }) {
  const [tl, setTl] = React.useState(initial)
  const { pending, status, run } = useSaver()
  const set = (tier: string, k: keyof TierGenerationLimits, v: number) => setTl((p) => ({ ...p, [tier]: { ...p[tier]!, [k]: v } }))
  return (
    <Card icon={Gauge} title="Tier limits (metering)" desc="Draft cycles + finalize megapixel budget + max single render + storage per billing period. Maker has no generation.">
      <table className="w-full text-[13px]">
        <thead><tr className="text-[11px] uppercase tracking-wide text-ink-500"><th className="py-1 text-left">Tier</th><th className="text-left">Draft cycles</th><th className="text-left">Finalize MP</th><th className="text-left">Max render MP</th><th className="text-left">Storage (MB)</th></tr></thead>
        <tbody>
          {Object.entries(tl).map(([tier, v]) => (
            <tr key={tier} className="border-t border-ink-100">
              <td className="py-1.5 font-semibold capitalize text-ink-900">{tier}</td>
              <td><input type="number" className={NUM} value={v.draftCyclesPerPeriod} onChange={(e) => set(tier, 'draftCyclesPerPeriod', +e.target.value)} /></td>
              <td><input type="number" className={NUM} value={v.finalizeMpBudget} onChange={(e) => set(tier, 'finalizeMpBudget', +e.target.value)} /></td>
              <td><input type="number" className={NUM} value={v.maxSingleRenderMp} onChange={(e) => set(tier, 'maxSingleRenderMp', +e.target.value)} /></td>
              <td><input type="number" className={NUM} value={Math.round(v.storageBytes / MB)} onChange={(e) => set(tier, 'storageBytes', +e.target.value * MB)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <SaveBar pending={pending} status={status} onSave={() => run(() => saveTierLimits(tl as never))} />
    </Card>
  )
}

function dedupeCI(list: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    const v = raw.trim()
    if (!v || seen.has(v.toLowerCase())) continue
    seen.add(v.toLowerCase())
    out.push(v)
  }
  return out
}

function DomainVocabCard({ initial, groups, domainGroups }: { initial: Record<string, DomainPreset>; groups: AiVocabGroupRow[]; domainGroups: Record<string, string[]> }) {
  const [dv, setDv] = React.useState(initial)
  const [dg, setDg] = React.useState<Record<string, string[]>>(domainGroups)
  const [dom, setDom] = React.useState(Object.keys(initial)[0] ?? 'FOOD')
  const vocab = useSaver()
  const assign = useSaver()
  const cur = dv[dom]!
  const setList = (k: 'styles' | 'colors' | 'elements', csv: string) => setDv((p) => ({ ...p, [dom]: { ...p[dom]!, [k]: csv.split(',').map((s) => s.trim()).filter(Boolean) } }))
  const setTone = (v: string) => setDv((p) => ({ ...p, [dom]: { ...p[dom]!, promptTone: v } }))

  const byId = new Map(groups.map((g) => [g.id, g]))
  const assignedIds = dg[dom] ?? []
  const toggleGroup = (id: string) =>
    setDg((p) => {
      const curIds = p[dom] ?? []
      return { ...p, [dom]: curIds.includes(id) ? curIds.filter((x) => x !== id) : [...curIds, id] }
    })
  // Only ACTIVE assigned groups feed the folded preview — mirrors the creator loader.
  const assignedActive = assignedIds.map((id) => byId.get(id)).filter((g): g is AiVocabGroupRow => Boolean(g && g.active))
  const fold = (k: 'styles' | 'colors' | 'elements') => dedupeCI([...cur[k], ...assignedActive.flatMap((g) => g[k])])

  return (
    <Card icon={Palette} title="Per-domain creative vocabulary" desc="The style / colour / element options + prompt tone shown per domain. Assign reusable groups to extend a domain without retyping. Compliance is never affected.">
      <div className="mb-3 flex items-center gap-2 text-[13px]">
        <span className="text-ink-500">Domain</span>
        <select className={`${TXT} w-40`} value={dom} onChange={(e) => setDom(e.target.value)}>
          {Object.keys(dv).map((d) => <option key={d} value={d}>{DOMAIN_LABEL[d] ?? d}</option>)}
        </select>
      </div>
      {(['styles', 'colors', 'elements'] as const).map((k) => (
        <label key={k} className="mb-2 block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-500">{k}</span>
          <input className={TXT} value={cur[k].join(', ')} onChange={(e) => setList(k, e.target.value)} />
        </label>
      ))}
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-500">Prompt tone</span>
        <input className={TXT} value={cur.promptTone} onChange={(e) => setTone(e.target.value)} />
      </label>
      <SaveBar pending={vocab.pending} status={vocab.status} onSave={() => vocab.run(() => saveDomainVocab(dv as never))} />

      {/* Group assignment for this domain */}
      <div className="mt-5 border-t border-ink-100 pt-4">
        <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-ink-500">Groups applied to {DOMAIN_LABEL[dom] ?? dom}</span>
        {groups.length === 0 ? (
          <p className="text-[12px] text-ink-400">No vocabulary groups yet — create one in the card above to reuse a set across domains.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {groups.map((g) => {
              const on = assignedIds.includes(g.id)
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => toggleGroup(g.id)}
                  className={`rounded-full border px-2.5 py-1 text-[12px] font-medium transition ${on ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400'} ${g.active ? '' : 'opacity-60'}`}
                >
                  {g.label}{g.active ? '' : ' (off)'}
                </button>
              )
            })}
          </div>
        )}
        {assignedActive.length > 0 && (
          <div className="mt-3 rounded-lg border border-ink-100 bg-ink-50/50 p-2.5 text-[11.5px] text-ink-500">
            <p className="font-semibold text-ink-600">Creators will see (domain + groups):</p>
            <p className="mt-1"><span className="font-medium text-ink-500">Styles:</span> {fold('styles').join(', ') || '—'}</p>
            <p><span className="font-medium text-ink-500">Colours:</span> {fold('colors').join(', ') || '—'}</p>
            <p><span className="font-medium text-ink-500">Elements:</span> {fold('elements').join(', ') || '—'}</p>
          </div>
        )}
        {groups.length > 0 && <SaveBar pending={assign.pending} status={assign.status} onSave={() => assign.run(() => setDomainGroups(dom, dg[dom] ?? []))} />}
      </div>
    </Card>
  )
}

function VocabGroupsCard({ initial }: { initial: AiVocabGroupRow[] }) {
  const [rows, setRows] = React.useState(initial)
  const [newName, setNewName] = React.useState('')
  const create = useSaver()
  const reorder = useSaver()

  const addGroup = () => {
    const label = newName.trim()
    if (!label) return
    create.run(async () => {
      const r = await createVocabGroup({ label, sortOrder: rows.length })
      if (r.ok) {
        setRows((p) => [...p, { id: r.id, label, styles: [], colors: [], elements: [], sortOrder: p.length, active: true }])
        setNewName('')
      }
      return r
    })
  }
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    if (j < 0 || j >= rows.length) return
    const next = [...rows]
    const a = next[idx]!
    next[idx] = next[j]!
    next[j] = a
    setRows(next)
    reorder.run(() => reorderVocabGroups(next.map((r) => r.id)))
  }

  return (
    <Card icon={Layers} title="Vocabulary groups" desc="Reusable sets of style / colour / element terms you can assign to any domain below. Edit once, and every domain that uses the group updates. Purely creative — never compliance.">
      {rows.length === 0 && <p className="mb-3 text-[12px] text-ink-400">No groups yet. Create one to reuse a curated set (e.g. “Premium / Luxury”, “Botanical”) across domains.</p>}
      <div className="space-y-3">
        {rows.map((row, i) => (
          <GroupRow
            key={row.id}
            row={row}
            canUp={i > 0}
            canDown={i < rows.length - 1}
            onUp={() => move(i, -1)}
            onDown={() => move(i, 1)}
            onDeleted={() => setRows((p) => p.filter((r) => r.id !== row.id))}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          className={`${TXT} w-52`}
          placeholder="New group name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGroup() } }}
        />
        <button type="button" onClick={addGroup} disabled={create.pending} className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 px-3 py-1.5 text-[12.5px] font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" /> {create.pending ? 'Adding…' : 'Add group'}
        </button>
        {(create.status || reorder.status) && (() => { const s = create.status ?? reorder.status!; return <span className={`text-[12px] font-medium ${s.ok ? 'text-success-700' : 'text-warning-700'}`}>{s.msg}</span> })()}
      </div>
    </Card>
  )
}

function GroupRow({ row, canUp, canDown, onUp, onDown, onDeleted }: { row: AiVocabGroupRow; canUp: boolean; canDown: boolean; onUp: () => void; onDown: () => void; onDeleted: () => void }) {
  const [label, setLabel] = React.useState(row.label)
  const [styles, setStyles] = React.useState(row.styles.join(', '))
  const [colors, setColors] = React.useState(row.colors.join(', '))
  const [elements, setElements] = React.useState(row.elements.join(', '))
  const [active, setActive] = React.useState(row.active)
  const save = useSaver()
  const del = useSaver()
  const csv = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean)
  const onSave = () => save.run(() => updateVocabGroup(row.id, { label: label.trim() || 'Untitled group', styles: csv(styles), colors: csv(colors), elements: csv(elements) }))
  const onToggleActive = (v: boolean) => { setActive(v); save.run(() => updateVocabGroup(row.id, { active: v })) }
  const onDelete = () => del.run(async () => { const r = await removeVocabGroup(row.id); if (r.ok) onDeleted(); return r })

  return (
    <div className={`rounded-xl border border-ink-200 p-3 ${active ? '' : 'bg-ink-50/40'}`}>
      <div className="mb-2 flex items-center gap-2">
        <div className="flex flex-col">
          <button type="button" onClick={onUp} disabled={!canUp} aria-label="Move up" className="grid h-4 w-5 place-items-center text-ink-400 hover:text-ink-700 disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={onDown} disabled={!canDown} aria-label="Move down" className="grid h-4 w-5 place-items-center text-ink-400 hover:text-ink-700 disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
        </div>
        <input className={`${TXT} flex-1 font-semibold`} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Group name" />
        <label className="flex items-center gap-1.5 text-[11px] text-ink-500" title="Only active groups feed creators">
          <Switch checked={active} onChange={(e) => onToggleActive(e.target.checked)} aria-label="Group active" />
          {active ? 'Active' : 'Off'}
        </label>
        <button type="button" onClick={onDelete} disabled={del.pending} aria-label="Delete group" className="grid h-8 w-8 place-items-center rounded-md text-ink-400 hover:bg-ink-50 hover:text-warning-700 disabled:opacity-50">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <label className="mb-2 block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-500">styles</span>
        <input className={TXT} value={styles} onChange={(e) => setStyles(e.target.value)} placeholder="comma-separated terms" />
      </label>
      <label className="mb-2 block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-500">colors</span>
        <input className={TXT} value={colors} onChange={(e) => setColors(e.target.value)} placeholder="comma-separated terms" />
      </label>
      <label className="mb-2 block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-500">elements</span>
        <input className={TXT} value={elements} onChange={(e) => setElements(e.target.value)} placeholder="comma-separated terms" />
      </label>
      <SaveBar pending={save.pending} status={save.status ?? del.status} onSave={onSave} />
    </div>
  )
}

function OutputCapsCard({ initial }: { initial: Record<string, OutputPolicy> }) {
  const [op, setOp] = React.useState(initial)
  const { pending, status, run } = useSaver()
  const set = (tier: string, k: keyof OutputPolicy, v: unknown) => setOp((p) => ({ ...p, [tier]: { ...p[tier]!, [k]: v } }))
  return (
    <Card icon={FileDown} title="Output caps per tier" desc="Hard caps that clamp any creator export down. Max DPI, colour, editability, batch, white-label.">
      <table className="w-full text-[13px]">
        <thead><tr className="text-[11px] uppercase tracking-wide text-ink-500"><th className="py-1 text-left">Tier</th><th className="text-left">Max DPI</th><th>CMYK</th><th>Layered</th><th>Batch</th><th>White-label</th></tr></thead>
        <tbody>
          {Object.entries(op).map(([tier, v]) => (
            <tr key={tier} className="border-t border-ink-100">
              <td className="py-1.5 font-semibold capitalize text-ink-900">{tier}</td>
              <td><input type="number" className={NUM} value={v.maxDpi} onChange={(e) => set(tier, 'maxDpi', +e.target.value)} /></td>
              <td className="text-center"><input type="checkbox" checked={v.allowCmyk} onChange={(e) => set(tier, 'allowCmyk', e.target.checked)} /></td>
              <td className="text-center"><input type="checkbox" checked={v.allowLayered} onChange={(e) => set(tier, 'allowLayered', e.target.checked)} /></td>
              <td className="text-center"><input type="checkbox" checked={v.allowBatch} onChange={(e) => set(tier, 'allowBatch', e.target.checked)} /></td>
              <td className="text-center"><input type="checkbox" checked={v.allowWhiteLabel} onChange={(e) => set(tier, 'allowWhiteLabel', e.target.checked)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <SaveBar pending={pending} status={status} onSave={() => run(() => saveOutputPolicies(op as never))} />
    </Card>
  )
}

function PresetsCard({ initial }: { initial: AiOutputPresetRow[] }) {
  const [rows, setRows] = React.useState(initial)
  const [label, setLabel] = React.useState('')
  const [minTier, setMinTier] = React.useState('builder')
  const [format, setFormat] = React.useState<OutputFormat>('PDF')
  const [dpi, setDpi] = React.useState(300)
  const { pending, status, run } = useSaver()
  const add = () => {
    if (!label.trim()) return
    run(async () => {
      const r = await savePreset({ label: label.trim(), minTier, settings: { format, dpi, colorProfile: 'CMYK', marks: true, layered: false, watermark: false, variations: 4, batch: false, whiteLabel: false } })
      if (r.ok) { setRows((p) => [...p, { id: 'tmp' + Date.now(), label: label.trim(), minTier, settings: { format, dpi }, sortOrder: 0, active: true }]); setLabel('') }
      return r
    })
  }
  const del = (id: string) => run(async () => { const r = await removePreset(id); if (r.ok) setRows((p) => p.filter((x) => x.id !== id)); return r })
  return (
    <Card icon={Sparkles} title="Output presets" desc="Named export bundles creators pick from, gated by minimum tier.">
      <table className="w-full text-[13px]">
        <thead><tr className="text-[11px] uppercase tracking-wide text-ink-500"><th className="py-1 text-left">Preset</th><th className="text-left">Min tier</th><th className="text-left">Format</th><th className="text-left">DPI</th><th></th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={5} className="py-2 text-[12px] text-ink-400">No presets yet.</td></tr>}
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-ink-100">
              <td className="py-1.5 font-medium text-ink-900">{r.label}</td>
              <td className="capitalize text-ink-600">{r.minTier}+</td>
              <td className="text-ink-600">{String(r.settings.format ?? '—')}</td>
              <td className="text-ink-600">{String(r.settings.dpi ?? '—')}</td>
              <td className="text-right"><button onClick={() => del(r.id)} className="text-ink-400 hover:text-warning-700"><Trash2 className="h-3.5 w-3.5" /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input className={`${TXT} w-40`} placeholder="preset name…" value={label} onChange={(e) => setLabel(e.target.value)} />
        <select className={`${TXT} w-28`} value={minTier} onChange={(e) => setMinTier(e.target.value)}><option value="maker">Maker+</option><option value="builder">Builder+</option><option value="agency">Agency+</option></select>
        <select className={`${TXT} w-24`} value={format} onChange={(e) => setFormat(e.target.value as OutputFormat)}>{FORMATS.map((f) => <option key={f}>{f}</option>)}</select>
        <input type="number" className={NUM} value={dpi} onChange={(e) => setDpi(+e.target.value)} />
        <button onClick={add} disabled={pending} className="rounded-full border border-ink-300 px-3 py-1.5 text-[12.5px] font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50">Add preset</button>
        {status && <span className={`text-[12px] font-medium ${status.ok ? 'text-success-700' : 'text-warning-700'}`}>{status.msg}</span>}
      </div>
    </Card>
  )
}

function GatesCard({ initial }: { initial: { blockExportUntilCompliant: boolean; blockSaveOverStorage: boolean; makerGenerationDisabled: boolean } }) {
  const [g, setG] = React.useState(initial)
  const { pending, status, run } = useSaver()
  const Row = ({ k, label }: { k: keyof typeof g; label: string }) => (
    <label className="flex items-center gap-2 py-1 text-[13px] text-ink-700"><input type="checkbox" checked={g[k]} onChange={(e) => setG((p) => ({ ...p, [k]: e.target.checked }))} /> {label}</label>
  )
  return (
    <Card icon={ShieldCheck} title="Gates" desc="Platform-wide safety rules for the generator.">
      <Row k="blockExportUntilCompliant" label="Block export until compliance is complete" />
      <Row k="blockSaveOverStorage" label="Block saving templates when over the storage cap" />
      <Row k="makerGenerationDisabled" label="Maker tier: templates + recolour only (no generation)" />
      <SaveBar pending={pending} status={status} onSave={() => run(() => saveGates(g))} />
    </Card>
  )
}
