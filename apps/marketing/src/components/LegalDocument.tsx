import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LandingFooter } from './LandingFooter'
import { getDisplayLegalDoc } from '@/lib/legal'

/**
 * Renders a legal document entirely from the admin-managed Legal CMS (the single
 * source of truth). Shows the published version if one exists, otherwise the
 * latest DRAFT with a "draft — pending counsel" banner. No hardcoded copies.
 * docs/LEGAL_DOCUMENT_MANAGEMENT_SPEC_2026-07-11.md. Async server component —
 * routes that use it are force-dynamic.
 */
export async function LegalDocument({ slug }: { slug: string }) {
  const doc = await getDisplayLegalDoc(slug)
  if (!doc) notFound()

  const isDraft = !doc.isPublished
  const html = doc.currentVersion.bodyHtml
  const effective = doc.currentVersion.effectiveAt ?? doc.currentVersion.publishedAt
  const updatedLabel =
    doc.isPublished && effective
      ? new Date(effective).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : null

  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-ink-100">
        <div className="mx-auto max-w-3xl px-6 py-5">
          <Link href="/" className="text-sm font-semibold text-ink-900 hover:text-pink-600 transition-colors">
            ← iLaunchify
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-6 py-12">
        {isDraft && (
          <span className="inline-flex items-center rounded-pill border border-warning-300 bg-warning-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-warning-800">
            Draft
          </span>
        )}

        <h1 className="mt-3 font-display text-3xl font-bold tracking-[-0.02em] text-ink-900">{doc.title}</h1>
        {updatedLabel && <p className="mt-1 text-[13px] text-ink-400">Last updated {updatedLabel}</p>}

        {isDraft && (
          <div
            role="note"
            className="mt-5 rounded-lg border border-warning-300 bg-warning-50 px-4 py-3 text-[13px] leading-[1.55] text-warning-900"
          >
            <strong>Draft — pending legal review.</strong> This document is an initial draft and has not been
            reviewed by a licensed attorney. It is not legally binding. Final terms will be published before launch.
          </div>
        )}

        <div className="legal-prose mt-8" dangerouslySetInnerHTML={{ __html: html }} />
      </article>

      <LandingFooter />
    </main>
  )
}
