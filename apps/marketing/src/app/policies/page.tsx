import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { LandingFooter } from '@/components/LandingFooter'
import { FileText, Handshake, Info, ArrowRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Policies — iLaunchify',
  description: 'iLaunchify legal policies and agreements.',
  robots: { index: false, follow: false },
}

// Canonical public path per slug (all top-level except membership).
function pathFor(slug: string): string {
  return slug === 'membership-subscription-terms'
    ? '/policies/membership-subscription-terms'
    : `/${slug}`
}

const KIND_ORDER = ['POLICY', 'AGREEMENT', 'NOTICE'] as const
const KIND_LABEL: Record<string, string> = {
  POLICY: 'Policies',
  AGREEMENT: 'Agreements',
  NOTICE: 'Notices',
}
const KIND_ICON: Record<string, typeof FileText> = {
  POLICY: FileText,
  AGREEMENT: Handshake,
  NOTICE: Info,
}

export default async function PoliciesHubPage() {
  const docs = await prisma.legalDocument.findMany({
    where: { isActive: true },
    orderBy: [{ title: 'asc' }],
    select: { id: true, slug: true, title: true, kind: true, currentVersionId: true },
  })

  const anyDraft = docs.some((d) => d.currentVersionId == null)
  const grouped = KIND_ORDER.map((kind) => ({
    kind,
    label: KIND_LABEL[kind],
    Icon: KIND_ICON[kind] ?? FileText,
    items: docs.filter((d) => d.kind === kind),
  })).filter((g) => g.items.length > 0)

  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-ink-100">
        <div className="mx-auto max-w-3xl px-6 py-5">
          <Link href="/" className="text-sm font-semibold text-ink-900 transition-colors hover:text-pink-600">
            ← iLaunchify
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-12">
        {anyDraft && (
          <span className="inline-flex items-center rounded-pill border border-warning-300 bg-warning-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-warning-800">
            Draft
          </span>
        )}
        <h1 className="mt-3 font-display text-3xl font-bold tracking-[-0.02em] text-ink-900">Policies</h1>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-ink-600">
          The legal agreements and policies that govern iLaunchify. Some documents are working drafts pending
          legal review and are not yet binding.
        </p>

        {grouped.map((group) => (
          <div key={group.kind} className="mt-10">
            <h2 className="flex items-center gap-2 font-display text-[13px] font-bold uppercase tracking-[0.08em] text-ink-500">
              <group.Icon className="h-4 w-4" aria-hidden="true" /> {group.label}
            </h2>
            <ul className="mt-3 space-y-3">
              {group.items.map((d) => (
                <li key={d.id}>
                  <Link
                    href={pathFor(d.slug)}
                    className="group flex items-center gap-4 rounded-2xl border border-ink-200 bg-white p-5 transition-colors hover:border-ink-300 hover:bg-ink-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-display text-[16px] font-semibold text-ink-900">{d.title}</span>
                        {d.currentVersionId == null && (
                          <span className="rounded-full border border-warning-200 bg-warning-50 px-1.5 py-[1px] text-[10px] font-semibold text-warning-800">
                            Draft
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11px] text-ink-400">{pathFor(d.slug)}</span>
                    </span>
                    <ArrowRight
                      className="h-4 w-4 shrink-0 text-ink-400 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <LandingFooter />
    </main>
  )
}
