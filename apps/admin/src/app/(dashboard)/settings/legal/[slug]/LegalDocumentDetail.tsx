'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Tabs, TabsList, TabsTrigger, TabsContent, Switch } from '@ilaunchify/ui'
import { FileUp, Plus, ShieldCheck, FileClock, Rocket, AlertTriangle } from 'lucide-react'
import { saveDraftVersion, createDraftVersion, updateDocumentSettings, publishVersion } from '../actions'

interface FileRow {
  id: string
  format: string
  fileName: string
  sizeBytes: number
  isPrimary: boolean
  sha256: string
}
interface VersionRow {
  id: string
  version: string
  status: string
  changeType: string | null
  bodyHtml: string
  summaryOfChanges: string | null
  contentSha256: string
  effectiveAt: string | null
  publishedAt: string | null
  createdAt: string
  files: FileRow[]
}
interface AcceptanceRow {
  id: string
  userId: string
  actorType: string
  method: string
  signerName: string | null
  documentVersionId: string
  recordSha256: string
  acceptedAt: string
}
export interface LegalDocPayload {
  id: string
  slug: string
  title: string
  kind: string
  audience: string
  requiresAcceptance: boolean
  reconsentIntervalDays: number | null
  isActive: boolean
  currentVersionId: string | null
  versions: VersionRow[]
  acceptances: AcceptanceRow[]
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
const short = (h: string) => (h ? `${h.slice(0, 10)}…` : '—')

export function LegalDocumentDetail({ doc }: { doc: LegalDocPayload }) {
  const draft = doc.versions.find((v) => v.status === 'DRAFT') ?? null
  const versionLabel = useMemo(() => {
    const m = new Map<string, string>()
    doc.versions.forEach((v) => m.set(v.id, v.version))
    return m
  }, [doc.versions])

  return (
    <Tabs defaultValue="editor">
      <TabsList>
        <TabsTrigger value="editor">Editor</TabsTrigger>
        <TabsTrigger value="files">Files</TabsTrigger>
        <TabsTrigger value="versions">Versions ({doc.versions.length})</TabsTrigger>
        <TabsTrigger value="acceptances">Acceptances ({doc.acceptances.length})</TabsTrigger>
        <TabsTrigger value="publish">Publish</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>

      <TabsContent value="editor">
        {draft ? (
          <EditorPane documentId={doc.id} draft={draft} />
        ) : (
          <NoDraft documentId={doc.id} />
        )}
      </TabsContent>

      <TabsContent value="publish">
        <PublishPane doc={doc} draft={draft} />
      </TabsContent>

      <TabsContent value="files">
        <FilesPane draft={draft} />
      </TabsContent>

      <TabsContent value="versions">
        <VersionsPane doc={doc} />
      </TabsContent>

      <TabsContent value="acceptances">
        <AcceptancesPane acceptances={doc.acceptances} versionLabel={versionLabel} />
      </TabsContent>

      <TabsContent value="settings">
        <SettingsPane doc={doc} />
      </TabsContent>
    </Tabs>
  )
}

// ── Editor ────────────────────────────────────────────────────────────────
function EditorPane({ documentId: _documentId, draft }: { documentId: string; draft: VersionRow }) {
  const [bodyHtml, setBodyHtml] = useState(draft.bodyHtml)
  const [summary, setSummary] = useState(draft.summaryOfChanges ?? '')
  const [dirty, setDirty] = useState(false)
  const [pending, start] = useTransition()

  function save() {
    start(async () => {
      const r = await saveDraftVersion({ versionId: draft.id, bodyHtml, summaryOfChanges: summary })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(`Draft ${draft.version} saved.`)
      setDirty(false)
    })
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center gap-2 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-[12px] text-warning-800">
        <FileClock className="h-4 w-4 shrink-0" />
        Editing draft <span className="font-mono font-semibold">{draft.version}</span>. Changes are not live until published (next phase).
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-[12px] font-semibold text-ink-700">Body (HTML)</label>
          <textarea
            value={bodyHtml}
            onChange={(e) => {
              setBodyHtml(e.target.value)
              setDirty(true)
            }}
            spellCheck={false}
            className="h-[420px] w-full rounded-lg border border-ink-200 px-3 py-2 font-mono text-[12px] leading-relaxed text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-[12px] font-semibold text-ink-700">Live preview</label>
          <div
            className="prose prose-sm h-[420px] max-w-none overflow-auto rounded-lg border border-ink-200 bg-white px-4 py-3 text-[13px] text-ink-800"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-[12px] font-semibold text-ink-700">
          Summary of changes <span className="font-normal text-ink-400">(shown to users + in the notice email at publish)</span>
        </label>
        <textarea
          value={summary}
          onChange={(e) => {
            setSummary(e.target.value)
            setDirty(true)
          }}
          rows={2}
          placeholder="e.g. Clarified refund window; added sub-processor disclosure."
          className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[13px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="rounded-full bg-pink-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-pink-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save draft'}
        </button>
        {dirty && <span className="text-[12px] text-ink-500">Unsaved changes</span>}
      </div>
    </div>
  )
}

function NoDraft({ documentId }: { documentId: string }) {
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-col items-start gap-3 pt-6">
      <p className="text-[13px] text-ink-600">
        No open draft. All versions are published or archived (immutable). Start a new draft to propose changes.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await createDraftVersion({ documentId })
            if (!r.ok) {
        toast.error(r.error)
        return
      }
            toast.success('New draft created.')
          })
        }
        className="inline-flex items-center gap-1.5 rounded-full bg-pink-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-pink-700 disabled:opacity-50"
      >
        <Plus className="h-4 w-4" /> {pending ? 'Creating…' : 'Start new draft'}
      </button>
    </div>
  )
}

// ── Files ─────────────────────────────────────────────────────────────────
function FilesPane({ draft }: { draft: VersionRow | null }) {
  const files = draft?.files ?? []
  return (
    <div className="space-y-4 pt-4">
      <p className="text-[12.5px] text-ink-600">
        Authoritative counsel-delivered files (PDF / DOCX / HTML) attached to the working draft. Uploading is wired with the asset pipeline in the next phase; at publish, the editor body must match the primary file (attestation).
      </p>
      {files.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-300 bg-ink-50/50 px-4 py-8 text-center text-[13px] text-ink-500">
          No files attached to this draft yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <table className="w-full text-[12.5px]">
            <thead className="bg-ink-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">File</th>
                <th className="px-4 py-2.5 text-left font-semibold">Format</th>
                <th className="px-4 py-2.5 text-left font-semibold">Size</th>
                <th className="px-4 py-2.5 text-left font-semibold">SHA-256</th>
                <th className="px-4 py-2.5 text-left font-semibold">Primary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {files.map((f) => (
                <tr key={f.id}>
                  <td className="px-4 py-2.5 text-ink-900">{f.fileName}</td>
                  <td className="px-4 py-2.5 text-ink-700">{f.format}</td>
                  <td className="px-4 py-2.5 tabular-nums text-ink-700">{(f.sizeBytes / 1024).toFixed(1)} KB</td>
                  <td className="px-4 py-2.5 font-mono text-ink-500">{short(f.sha256)}</td>
                  <td className="px-4 py-2.5">{f.isPrimary ? 'Yes' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button
        type="button"
        disabled
        title="Available with the asset pipeline in the next phase"
        className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-4 py-2 text-[13px] font-semibold text-ink-400"
      >
        <FileUp className="h-4 w-4" /> Upload file (soon)
      </button>
    </div>
  )
}

// ── Versions ────────────────────────────────────────────────────────────────
function VersionsPane({ doc }: { doc: LegalDocPayload }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <table className="w-full text-[12.5px]">
        <thead className="bg-ink-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
          <tr>
            <th className="px-4 py-2.5 text-left font-semibold">Version</th>
            <th className="px-4 py-2.5 text-left font-semibold">Status</th>
            <th className="px-4 py-2.5 text-left font-semibold">Change</th>
            <th className="px-4 py-2.5 text-left font-semibold">Content hash</th>
            <th className="px-4 py-2.5 text-left font-semibold">Created</th>
            <th className="px-4 py-2.5 text-left font-semibold">Published</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {doc.versions.map((v) => {
            const isLive = v.id === doc.currentVersionId
            return (
              <tr key={v.id}>
                <td className="px-4 py-2.5 font-mono text-ink-900">
                  {v.version} {isLive && <span className="ml-1 text-[10px] font-semibold text-success-700">LIVE</span>}
                </td>
                <td className="px-4 py-2.5">
                  <StatusPill status={v.status} />
                </td>
                <td className="px-4 py-2.5 text-ink-700">{v.changeType ?? '—'}</td>
                <td className="px-4 py-2.5 font-mono text-ink-500">{short(v.contentSha256)}</td>
                <td className="px-4 py-2.5 text-ink-700">{fmtDate(v.createdAt)}</td>
                <td className="px-4 py-2.5 text-ink-700">{fmtDate(v.publishedAt)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: 'border-warning-200 bg-warning-50 text-warning-800',
    PUBLISHED: 'border-success-200 bg-success-50 text-success-800',
    ARCHIVED: 'border-ink-200 bg-ink-100 text-ink-600',
  }
  return (
    <span className={`rounded-full border px-2 py-[2px] text-[11px] font-semibold ${map[status] ?? map.ARCHIVED}`}>
      {status}
    </span>
  )
}

// ── Acceptances ─────────────────────────────────────────────────────────────
function AcceptancesPane({
  acceptances,
  versionLabel,
}: {
  acceptances: AcceptanceRow[]
  versionLabel: Map<string, string>
}) {
  if (acceptances.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-ink-300 bg-ink-50/50 px-4 py-8 text-center text-[13px] text-ink-500">
        No acceptances recorded yet. Consent capture is wired in a later phase (signup, checkout, and the re-acceptance gate).
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <table className="w-full text-[12.5px]">
        <thead className="bg-ink-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
          <tr>
            <th className="px-4 py-2.5 text-left font-semibold">User</th>
            <th className="px-4 py-2.5 text-left font-semibold">Role</th>
            <th className="px-4 py-2.5 text-left font-semibold">Version</th>
            <th className="px-4 py-2.5 text-left font-semibold">Method</th>
            <th className="px-4 py-2.5 text-left font-semibold">Signer</th>
            <th className="px-4 py-2.5 text-left font-semibold">Record hash</th>
            <th className="px-4 py-2.5 text-left font-semibold">Accepted</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {acceptances.map((a) => (
            <tr key={a.id}>
              <td className="px-4 py-2.5 font-mono text-ink-700">{a.userId.slice(0, 8)}…</td>
              <td className="px-4 py-2.5 text-ink-700">{a.actorType}</td>
              <td className="px-4 py-2.5 font-mono text-ink-900">{versionLabel.get(a.documentVersionId) ?? '—'}</td>
              <td className="px-4 py-2.5 text-ink-700">{a.method}</td>
              <td className="px-4 py-2.5 text-ink-700">{a.signerName ?? '—'}</td>
              <td className="px-4 py-2.5 font-mono text-ink-500">{short(a.recordSha256)}</td>
              <td className="px-4 py-2.5 text-ink-700">{fmtDate(a.acceptedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Publish ─────────────────────────────────────────────────────────────────
function PublishPane({ doc, draft }: { doc: LegalDocPayload; draft: VersionRow | null }) {
  const [changeType, setChangeType] = useState<'MATERIAL' | 'MINOR'>('MINOR')
  const [effectiveAt, setEffectiveAt] = useState('')
  const [attest, setAttest] = useState(false)
  const [pending, start] = useTransition()

  if (!draft) {
    return (
      <div className="rounded-lg border border-dashed border-ink-300 bg-ink-50/50 px-4 py-8 text-center text-[13px] text-ink-500">
        No draft to publish. Create or edit a draft in the Editor tab first.
      </div>
    )
  }

  function publish() {
    start(async () => {
      const r = await publishVersion({
        versionId: draft!.id,
        changeType,
        effectiveAt: effectiveAt.trim() === '' ? null : new Date(effectiveAt).toISOString(),
        attestMatchesFile: attest,
      })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(`Published ${draft!.version}. It is now the live version.`)
      setAttest(false)
    })
  }

  return (
    <div className="max-w-xl space-y-5 pt-4">
      <div className="rounded-lg border border-ink-200 bg-white px-4 py-3 text-[12.5px] text-ink-700">
        Publishing draft <span className="font-mono font-semibold text-ink-900">{draft.version}</span> makes it the
        live version and archives the current one{doc.currentVersionId ? '' : ' (none live yet)'}. Public pages that
        render this document will reflect it immediately.
      </div>

      <fieldset className="space-y-2">
        <legend className="text-[12px] font-semibold text-ink-700">Change type</legend>
        <label className="flex items-start gap-2 text-[13px] text-ink-800">
          <input type="radio" name="changeType" checked={changeType === 'MINOR'} onChange={() => setChangeType('MINOR')} className="mt-1 accent-pink-600" />
          <span><span className="font-semibold">Minor</span> — typo, clarification, formatting. No re-acceptance or notice.</span>
        </label>
        <label className="flex items-start gap-2 text-[13px] text-ink-800">
          <input type="radio" name="changeType" checked={changeType === 'MATERIAL'} onChange={() => setChangeType('MATERIAL')} className="mt-1 accent-pink-600" />
          <span><span className="font-semibold">Material</span> — changes rights, data use, fees, or obligations.</span>
        </label>
      </fieldset>

      {changeType === 'MATERIAL' && doc.requiresAcceptance && (
        <div className="flex items-start gap-2 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-[12px] text-warning-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          A material change to an acceptance-required document will (once L3/L4 ship) force affected {doc.audience.toLowerCase()} users to re-accept and email them a notice. The published record is captured now regardless.
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-[12px] font-semibold text-ink-700">
          Effective date <span className="font-normal text-ink-400">— blank = effective immediately</span>
        </label>
        <input
          type="datetime-local"
          value={effectiveAt}
          onChange={(e) => setEffectiveAt(e.target.value)}
          className="w-64 rounded-lg border border-ink-200 px-3 py-2 text-[13px] focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
      </div>

      <label className="flex items-start gap-2 text-[13px] text-ink-800">
        <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} className="mt-1 accent-pink-600" />
        <span>I confirm the editor body matches the authoritative counsel-approved text / uploaded primary file.</span>
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={publish}
          disabled={pending || !attest}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-5 py-2 text-[13px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
        >
          <Rocket className="h-4 w-4" /> {pending ? 'Publishing…' : 'Publish version'}
        </button>
        {!attest && <span className="text-[12px] text-ink-500">Confirm the attestation to publish</span>}
      </div>
    </div>
  )
}

// ── Settings ────────────────────────────────────────────────────────────────
function SettingsPane({ doc }: { doc: LegalDocPayload }) {
  const [audience, setAudience] = useState(doc.audience)
  const [requiresAcceptance, setRequiresAcceptance] = useState(doc.requiresAcceptance)
  const [reconsent, setReconsent] = useState(doc.reconsentIntervalDays?.toString() ?? '')
  const [isActive, setIsActive] = useState(doc.isActive)
  const [dirty, setDirty] = useState(false)
  const [pending, start] = useTransition()

  function save() {
    start(async () => {
      const r = await updateDocumentSettings({
        documentId: doc.id,
        audience: audience as 'PUBLIC' | 'CREATOR' | 'PARTNER' | 'ALL',
        requiresAcceptance,
        reconsentIntervalDays: reconsent.trim() === '' ? null : Number(reconsent),
        isActive,
      })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success('Settings saved.')
      setDirty(false)
    })
  }

  return (
    <div className="max-w-lg space-y-5 pt-4">
      <div className="space-y-2">
        <label className="block text-[12px] font-semibold text-ink-700">Audience</label>
        <select
          value={audience}
          onChange={(e) => {
            setAudience(e.target.value)
            setDirty(true)
          }}
          className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[13px] focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
        >
          <option value="ALL">Everyone</option>
          <option value="PUBLIC">Public</option>
          <option value="CREATOR">Creators</option>
          <option value="PARTNER">Partners</option>
        </select>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-800">
            <ShieldCheck className="h-4 w-4 text-pink-600" /> Requires acceptance
          </div>
          <p className="text-[12px] text-ink-500">Material changes raise a forced re-acceptance gate.</p>
        </div>
        <Switch
          checked={requiresAcceptance}
          onChange={(e) => {
            setRequiresAcceptance(e.target.checked)
            setDirty(true)
          }}
        />
      </div>

      <div className="space-y-2">
        <label className="block text-[12px] font-semibold text-ink-700">
          Re-consent interval (days) <span className="font-normal text-ink-400">— blank = event-driven only</span>
        </label>
        <input
          type="number"
          min={0}
          value={reconsent}
          onChange={(e) => {
            setReconsent(e.target.value)
            setDirty(true)
          }}
          placeholder="e.g. 365"
          className="w-40 rounded-lg border border-ink-200 px-3 py-2 text-[13px] focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[13px] font-semibold text-ink-800">Active</div>
          <p className="text-[12px] text-ink-500">Inactive documents are hidden from public rendering.</p>
        </div>
        <Switch
          checked={isActive}
          onChange={(e) => {
            setIsActive(e.target.checked)
            setDirty(true)
          }}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="rounded-full bg-pink-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-pink-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save settings'}
        </button>
        {dirty && <span className="text-[12px] text-ink-500">Unsaved changes</span>}
      </div>
    </div>
  )
}
