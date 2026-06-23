import { requireCapability } from '@ilaunchify/auth'
import { listAdminLibraryTemplates } from '@ilaunchify/db'
import { TemplatesManager } from './TemplatesManager'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Design Templates — Admin' }

export default async function LibraryTemplatesPage() {
  await requireCapability('catalog:write')
  const templates = await listAdminLibraryTemplates()

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-[#F3EFE8] px-7 py-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-900">Design templates</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-600">
          The curated template library creators browse in the Design Studio. Tag each with a product
          domain, a style category, and a die-line target so it surfaces only on matching products. Save
          as <strong>Regular</strong> (all creators) or <strong>Premium</strong> (Agency tier only).
          Paste a design&apos;s canvas JSON exported from the Studio.
        </p>
      </div>

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
