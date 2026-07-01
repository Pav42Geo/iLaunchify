'use client'

// Admin AI Generator settings forms (§7/§13/§16). Each section edits the EFFECTIVE
// values (engine defaults + admin overrides) and saves the edited object back as the
// override. Sections are independent.

import * as React from 'react'
import { Gauge, Palette, FileDown, Cpu, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { saveTierLimits, saveDomainVocab, saveOutputPolicies, saveGates, savePreset, removePreset } from './actions'
import type { TierGenerationLimits, OutputPolicy, OutputFormat, ProviderStatus } from '@ilaunchify/imagegen'
import type { DomainPreset } from '@ilaunchify/ai-design'
import type { AiOutputPresetRow } from '@ilaunchify/db'

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
      {status && <span className={`text-[12px] font-medium ${status.ok ? 'text-emerald-700' : 'text-amber-700'}`}>{status.msg}</span>}
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
  outputPolicies: Record<string, OutputPolicy>
  presets: AiOutputPresetRow[]
  gates: { blockExportUntilCompliant: boolean; blockSaveOverStorage: boolean; makerGenerationDisabled: boolean }
  provider: ProviderStatus
}) {
  return (
    <div className="space-y-5">
      <ProviderCard s={props.provider} />
      <TierLimitsCard initial={props.tierLimits} />
      <DomainVocabCard initial={props.domains} />
      <OutputCapsCard initial={props.outputPolicies} />
      <PresetsCard initial={props.presets} />
      <GatesCard initial={props.gates} />
    </div>
  )
}

function ProviderCard({ s }: { s: ProviderStatus }) {
  const Badge = ({ ok, label }: { ok: boolean; label: string }) => (
    <span className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{label}: {ok ? 'configured' : 'missing key'}</span>
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

function DomainVocabCard({ initial }: { initial: Record<string, DomainPreset> }) {
  const [dv, setDv] = React.useState(initial)
  const [dom, setDom] = React.useState(Object.keys(initial)[0] ?? 'FOOD')
  const { pending, status, run } = useSaver()
  const cur = dv[dom]!
  const setList = (k: 'styles' | 'colors' | 'elements', csv: string) => setDv((p) => ({ ...p, [dom]: { ...p[dom]!, [k]: csv.split(',').map((s) => s.trim()).filter(Boolean) } }))
  const setTone = (v: string) => setDv((p) => ({ ...p, [dom]: { ...p[dom]!, promptTone: v } }))
  return (
    <Card icon={Palette} title="Per-domain creative vocabulary" desc="The style / colour / element chips + prompt tone shown per domain. Compliance is never affected.">
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
      <SaveBar pending={pending} status={status} onSave={() => run(() => saveDomainVocab(dv as never))} />
    </Card>
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
              <td className="text-right"><button onClick={() => del(r.id)} className="text-ink-400 hover:text-amber-700"><Trash2 className="h-3.5 w-3.5" /></button></td>
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
        {status && <span className={`text-[12px] font-medium ${status.ok ? 'text-emerald-700' : 'text-amber-700'}`}>{status.msg}</span>}
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
