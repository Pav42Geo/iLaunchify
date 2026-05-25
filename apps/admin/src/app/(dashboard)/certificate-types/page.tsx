// Admin certificate library — list view.
// Per #129. Lists every CertificateType (ACTIVE + DEPRECATED) with a count
// of partner claims per type.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Button } from '@ilaunchify/ui'
import { Plus, ShieldCheck, FileImage } from 'lucide-react'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Certificate library — iLaunchify Admin' }

export default async function CertificateTypesListPage() {
  const types = await prisma.certificateType.findMany({
    include: { _count: { select: { partnerInstances: true } } },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  })

  const active = types.filter((t) => t.status === 'ACTIVE')
  const deprecated = types.filter((t) => t.status === 'DEPRECATED')

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Certificate library</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Admin-curated canonical cert types (NSF, USDA Organic, etc.). Partners pick
            from this list when claiming certificates. Branded thumbnail required before
            badges appear publicly.
          </p>
        </div>
        <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
          <Link href="/certificate-types/new">
            <Plus className="mr-1.5 h-4 w-4" /> Add type
          </Link>
        </Button>
      </header>

      {types.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="rounded-full bg-emerald-50 p-3">
              <ShieldCheck className="h-7 w-7 text-emerald-600" />
            </div>
            <CardTitle className="text-base">No certificate types yet</CardTitle>
            <CardDescription className="max-w-md text-sm">
              Run <code className="rounded bg-zinc-100 px-1 text-xs">pnpm seed:certificate-types</code>{' '}
              to load the 12 starter types, or add one manually below.
            </CardDescription>
            <Button asChild className="mt-2 bg-emerald-600 hover:bg-emerald-700">
              <Link href="/certificate-types/new">
                <Plus className="mr-1.5 h-4 w-4" /> Add your first
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && <TypeSection title="Active" types={active} />}
          {deprecated.length > 0 && <TypeSection title="Deprecated" types={deprecated} />}
        </div>
      )}
    </div>
  )
}

function TypeSection({
  title,
  types,
}: {
  title: string
  types: Array<{
    id: string
    name: string
    slug: string
    description: string
    thumbnailFileId: string | null
    status: 'ACTIVE' | 'DEPRECATED'
    _count: { partnerInstances: number }
  }>
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {title} <span className="ml-2 text-sm font-normal text-zinc-500">{types.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-zinc-200 text-left text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-6 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Slug</th>
                <th className="px-3 py-2 font-medium">Badge</th>
                <th className="px-3 py-2 font-medium">Partners claiming</th>
                <th className="px-6 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                  <td className="px-6 py-3">
                    <div className="font-medium text-zinc-900">{t.name}</div>
                    <div className="mt-0.5 line-clamp-1 text-xs text-zinc-500">
                      {t.description}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs">{t.slug}</code>
                  </td>
                  <td className="px-3 py-3">
                    {t.thumbnailFileId ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                        <ShieldCheck className="h-3.5 w-3.5" /> Uploaded
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                        <FileImage className="h-3.5 w-3.5" /> Missing
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-zinc-700">
                    {t._count.partnerInstances.toLocaleString()}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Link
                      href={`/certificate-types/${t.id}`}
                      className="text-sm font-medium text-emerald-700 hover:underline"
                    >
                      Edit →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
