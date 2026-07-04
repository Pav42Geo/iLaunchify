'use client'

// Die-cut Templates → "Container assignments" tab. The old Container Die-lines page, folded in
// (docs/DIE_CUT_TEMPLATES_MODULE.md phase 2): per-container default die-cut + product domains.
// Reuses the DieCutPicker / DomainPicker client controls unchanged. Each container name links to
// its hub (/packaging-studio/[id]).

import { DieCutPicker } from '../packaging-containers/DieCutPicker'
import { DomainPicker } from '../packaging-containers/DomainPicker'
import type { ContainerAssignmentsData } from './loader'

const pretty = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

export function ContainerAssignmentsClient({ data }: { data: ContainerAssignmentsData }) {
  return (
    <div className="space-y-5">
      <p className="text-[13px] text-ink-500">
        Assign a default die-cut and product domains to each container. The Design Studio uses the
        default die-cut as the fallback when a product&apos;s variant carries none of its own.
      </p>

      <div className="grid grid-cols-3 gap-3">
        {[
          ['Containers', data.stats.total],
          ['With default die-cut', data.stats.assigned],
          ['Unassigned', data.stats.total - data.stats.assigned],
        ].map(([l, v]) => (
          <div key={l as string} className="rounded-2xl border border-ink-200 bg-white px-4 py-3">
            <p className="text-[12px] font-bold uppercase tracking-wide text-ink-700">{l}</p>
            <p className="mt-1 font-display text-[22px] font-bold text-ink-900">{v}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        {data.containers.length === 0 ? (
          <div className="px-6 py-10 text-center text-[13px] text-ink-500">
            No packaging containers yet. Seed the PackagingType catalog to populate this list.
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50 text-left text-[12px] font-bold uppercase tracking-wide text-ink-700">
                <th className="px-4 py-2.5">Container</th>
                <th className="px-3 py-2.5">Category</th>
                <th className="px-3 py-2.5">Domains</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Default die-cut</th>
              </tr>
            </thead>
            <tbody>
              {data.containers.map((c) => (
                <tr key={c.id} className="border-b border-ink-100 align-top last:border-0">
                  <td className="px-4 py-3">
                    <a href={`/packaging-studio/${c.id}`} className="font-medium text-ink-900 hover:text-pink-700 hover:underline" title="Open this container's hub">
                      {c.displayName}
                    </a>
                    <div className="mt-0.5 text-[11px] text-ink-500">{c.slug}</div>
                  </td>
                  <td className="px-3 py-3 text-ink-700">{c.containerCategory ? pretty(c.containerCategory) : '—'}</td>
                  <td className="px-3 py-3"><DomainPicker packagingTypeId={c.id} value={c.applicableLabelingTypes ?? []} /></td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${c.status === 'ACTIVE' ? 'bg-success-100 text-success-700' : 'bg-ink-100 text-ink-500'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-3 py-3"><DieCutPicker packagingTypeId={c.id} value={c.defaultDieCutTemplateId} options={data.options} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
