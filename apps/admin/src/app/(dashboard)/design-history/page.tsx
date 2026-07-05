// Admin → Design History — support tool (versioning v2 Phase 4, §5).
// Read-only view of a creator product's design slots, alternates and version
// history, with a tickets:admin-gated support-restore. Reached by pasting the
// product id / GTIN / SKU from a ticket. NOT in the sidebar yet (sidebar v3 is
// LOCKED — propose the entry separately; deep-link from tickets later).

import { requireCapability } from '@ilaunchify/auth'
import { findProductForSupport, listDesignHistoryForSupport } from './actions'
import { RestoreButton } from './RestoreButton'
import { Search, Crown, Pin } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ q?: string; design?: string }>
}

export default async function DesignHistoryPage({ searchParams }: PageProps) {
  await requireCapability('creators:read')
  const { q, design: designParam } = await searchParams
  const lookup = q ? await findProductForSupport(q) : null

  const designs = lookup?.ok ? lookup.designs : []
  const selectedDesignId = designParam && designs.some((d) => d.id === designParam) ? designParam : designs[0]?.id ?? null
  const history = selectedDesignId ? await listDesignHistoryForSupport(selectedDesignId) : []
  const selectedDesign = designs.find((d) => d.id === selectedDesignId) ?? null

  const slotLabel = (d: (typeof designs)[number]) =>
    [d.flavorName ?? 'Base', d.surfaceKey ?? null, d.alternateName ?? (d.isActiveAlternate ? 'Original' : 'Draft')]
      .filter(Boolean)
      .join(' · ')

  return (
    <div className="space-y-4">
      {/* Hero band — admin v2 chrome */}
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-5">
        <h1 className="font-display text-[22px] font-bold text-ink-900">Design History</h1>
        <p className="mt-0.5 text-[13px] text-ink-500">
          Support tool — inspect a creator product’s design versions. Viewing is read-only; restore requires support-lead
          access, is audited, and shows up labeled in the creator’s own history.
        </p>
        <form method="GET" className="mt-3 flex max-w-xl items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              type="text"
              name="q"
              defaultValue={q ?? ''}
              placeholder="Product id, GTIN, or internal SKU…"
              className="w-full rounded-full border border-ink-200 bg-white py-2 pl-9 pr-4 text-[13px] text-ink-900 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
            />
          </div>
          <button
            type="submit"
            className="rounded-full bg-ink-900 px-5 py-2 text-[12px] font-semibold uppercase tracking-wider text-white hover:bg-black"
          >
            Look up
          </button>
        </form>
      </div>

      {lookup && !lookup.ok && (
        <div className="rounded-2xl border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] text-danger-700">{lookup.error}</div>
      )}

      {lookup?.ok && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          {/* Product + slots */}
          <section className="rounded-2xl border border-ink-200 bg-white p-4">
            <div className="text-[14px] font-semibold text-ink-900">{lookup.product.name}</div>
            <div className="mt-0.5 text-[12px] text-ink-500">
              {lookup.product.brandName}
              {lookup.product.creatorEmail ? ` · ${lookup.product.creatorEmail}` : ''}
            </div>
            <span className="mt-1.5 inline-flex rounded-full border border-ink-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
              {lookup.product.status}
            </span>

            <div className="mt-3 border-t border-ink-100 pt-2">
              <div className="pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                Design slots &amp; alternates ({designs.length})
              </div>
              <ul className="space-y-1">
                {designs.map((d) => (
                  <li key={d.id}>
                    <a
                      href={`?q=${encodeURIComponent(q ?? '')}&design=${d.id}`}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors ${
                        d.id === selectedDesignId
                          ? 'border-pink-300 bg-pink-50/60 text-pink-800'
                          : 'border-transparent text-ink-700 hover:border-ink-200 hover:bg-ink-50'
                      }`}
                    >
                      <span className="truncate">{slotLabel(d)}</span>
                      {d.isActiveAlternate && <Crown className="h-3 w-3 shrink-0 text-pink-500" aria-label="Active" />}
                    </a>
                  </li>
                ))}
                {designs.length === 0 && <li className="px-2 py-3 text-[12px] text-ink-400">No designs saved yet.</li>}
              </ul>
            </div>
          </section>

          {/* History for the selected design */}
          <section className="rounded-2xl border border-ink-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-semibold text-ink-900">
                Version history{selectedDesign ? <span className="font-normal text-ink-500"> — {slotLabel(selectedDesign)}</span> : null}
              </div>
              <div className="text-[11px] text-ink-400">{history.length} version{history.length === 1 ? '' : 's'}</div>
            </div>

            <ul className="mt-3 space-y-1.5">
              {history.map((h) => (
                <li key={h.id} className="flex items-center gap-3 rounded-xl border border-ink-200 px-3 py-2">
                  {h.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.thumbnail} alt="" className="h-10 w-10 shrink-0 rounded border border-ink-200 bg-white object-contain" />
                  ) : (
                    <div className="h-10 w-10 shrink-0 rounded border border-ink-200 bg-ink-50" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-medium text-ink-900">
                        {h.label ?? (h.kind === 'AUTO' ? 'Autosave' : 'Snapshot')}
                      </span>
                      {h.pinned && <Pin className="h-3 w-3 shrink-0 text-warning-600" aria-label="Pinned" />}
                    </div>
                    <div className="text-[11px] text-ink-500">
                      {h.kind} · {h.createdAt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </div>
                  {selectedDesignId && <RestoreButton designId={selectedDesignId} snapshotId={h.id} />}
                </li>
              ))}
              {history.length === 0 && (
                <li className="px-2 py-6 text-center text-[12px] text-ink-400">No versions recorded for this design yet.</li>
              )}
            </ul>
          </section>
        </div>
      )}
    </div>
  )
}
