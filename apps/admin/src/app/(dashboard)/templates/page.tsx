import { requireCapability } from '@ilaunchify/auth'
import { listPremiumTemplates } from '@ilaunchify/db'
import { TemplatesManager } from './TemplatesManager'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Premium Templates — Admin' }

export default async function PremiumTemplatesPage() {
  await requireCapability('catalog:write')
  const templates = await listPremiumTemplates()

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-[#F3EFE8] px-7 py-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-900">Premium templates</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-600">
          The curated template library Agency-tier creators can browse and recolor in the Design Studio.
          Paste a design&apos;s canvas JSON (exported from the Studio) to publish one. Optionally restrict a
          template to a minimum tier.
        </p>
      </div>

      <TemplatesManager
        initial={templates.map((t) => ({
          id: t.id,
          name: t.name,
          thumbnailUrl: t.thumbnailUrl,
          tier: t.tier,
          createdAt: t.createdAt.toISOString(),
        }))}
      />
    </div>
  )
}
