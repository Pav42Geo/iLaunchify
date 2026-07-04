// Admin — Container Die-lines (#135). Assign a default die-line (DieCutTemplate)
// to each physical packaging type (container). The Design Studio uses it as the
// fallback whenever a product's variant doesn't carry its own die-line. v2 admin
// surface: header + KPI strip + table.

import { prisma } from '@ilaunchify/db'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { DieCutPicker, type DieCutOption } from './DieCutPicker'
import { DomainPicker } from './DomainPicker'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Container Die-lines — Admin' }

interface ContainerRow {
  id: string
  displayName: string
  slug: string
  containerCategory: string | null
  status: string
  defaultDieCutTemplateId: string | null
  applicableLabelingTypes: string[]
}

export default async function PackagingContainersPage() {
  // Cast-guarded: defaultDieCutTemplateId + applicableLabelingTypes land with
  // their migrations (run `pnpm db:push` + `db:generate`).
  const containers = await (prisma as unknown as {
    packagingType: { findMany: (a: unknown) => Promise<ContainerRow[]> }
  }).packagingType
    .findMany({
      orderBy: { displayName: 'asc' },
      select: {
        id: true,
        displayName: true,
        slug: true,
        containerCategory: true,
        status: true,
        defaultDieCutTemplateId: true,
        applicableLabelingTypes: true,
      },
    })
    .catch(() => [] as ContainerRow[])

  const dieCuts = await prisma.dieCutTemplate
    .findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, category: true } })
    .catch(() => [] as { id: string; name: string; category: string }[])
  const options: DieCutOption[] = dieCuts.map((d) => ({ id: d.id, label: `${d.name} · ${d.category}` }))

  const total = containers.length
  const assigned = containers.filter((c) => c.defaultDieCutTemplateId).length

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Packaging Studio"
        title="Container Die-lines"
        description={
          <>
            Assign a default die-line to each physical container. The Design Studio uses it as the
            fallback die-line whenever a product&apos;s variant doesn&apos;t carry one of its own — so a
            serum lands on a dropper-bottle cut, a pouch on a pouch cut, and so on.
          </>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          ['Containers', total],
          ['With default die-line', assigned],
          ['Unassigned', total - assigned],
        ].map(([l, v]) => (
          <div key={l as string} className="rounded-2xl border border-ink-200 bg-white px-4 py-3">
            <p className="text-[12px] font-bold uppercase tracking-wide text-ink-700">{l}</p>
            <p className="mt-1 font-display text-[22px] font-bold text-ink-900">{v}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        {containers.length === 0 ? (
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
                <th className="px-3 py-2.5">Default die-line</th>
              </tr>
            </thead>
            <tbody>
              {containers.map((c) => (
                <tr key={c.id} className="border-b border-ink-100 last:border-0 align-top">
                  <td className="px-4 py-3">
                    <a href={`/packaging-studio/${c.id}`} className="font-medium text-ink-900 hover:text-pink-700 hover:underline" title="Open this container's hub">
                      {c.displayName}
                    </a>
                    <div className="mt-0.5 text-[11px] text-ink-500">{c.slug}</div>
                  </td>
                  <td className="px-3 py-3 text-ink-700">{c.containerCategory ?? '—'}</td>
                  <td className="px-3 py-3">
                    <DomainPicker packagingTypeId={c.id} value={c.applicableLabelingTypes ?? []} />
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        c.status === 'ACTIVE' ? 'bg-success-100 text-success-700' : 'bg-ink-100 text-ink-500'
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <DieCutPicker packagingTypeId={c.id} value={c.defaultDieCutTemplateId} options={options} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
