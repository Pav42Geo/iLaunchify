import { requireCapability } from '@ilaunchify/auth'
import { listAdminLibraryTemplates, getTemplateUsageStats } from '@ilaunchify/db'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { TemplatesManager } from './TemplatesManager'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Design Templates — Admin' }

export default async function LibraryTemplatesPage() {
  await requireCapability('catalog:write')
  const [templates, usage] = await Promise.all([listAdminLibraryTemplates(), getTemplateUsageStats()])

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Design templates"
        description={
          <>
            The curated template library creators browse in the Design Studio. Tag each with a product
            domain, a style category, and a die-line target so it surfaces only on matching products. Save
            as <strong>Regular</strong> (all creators) or <strong>Premium</strong> (Agency tier only). Use{' '}
            <strong>Admin Mode</strong> in the sidebar to design one live in the Studio.
          </>
        }
      />

      {usage.total > 0 && (
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-ink-200 bg-white p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Most applied templates</p>
            <p className="mt-0.5 text-[11px] text-ink-400">{usage.total} total applies</p>
            <ul className="mt-3 space-y-1.5">
              {usage.topTemplates.map((t) => (
                <li key={t.id} className="flex items-center justify-between text-[13px]">
                  <span className="truncate text-ink-800">{t.name}</span>
                  <span className="ml-2 flex-shrink-0 font-semibold text-ink-900">{t.count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-ink-200 bg-white p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Most applied styles</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {usage.topStyles.map((s) => (
                <span key={s.label} className="rounded-full border border-ink-200 px-2.5 py-1 text-[12px] text-ink-700">
                  {s.label} <span className="font-semibold text-ink-900">{s.count}</span>
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      <TemplatesManager
        initial={templates.map((t) => ({
          id: t.id,
          name: t.name,
          thumbnailUrl: t.thumbnailUrl,
          isPremium: t.isPremium,
          tier: t.tier,
          domain: t.domain,
          createdAt: t.createdAt.toISOString(),
        }))}
      />
    </div>
  )
}
