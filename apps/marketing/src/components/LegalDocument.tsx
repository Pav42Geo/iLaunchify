import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LandingFooter } from './LandingFooter'
import { LEGAL_DOCS } from '@/content/legal/content'

/**
 * Renders a legal document (Terms / Privacy / Creator-Agreement /
 * Partner-Agreement) from the auto-generated content module (punch-list #3).
 *
 * Content is extracted from docs/legal/*.docx and is still a DRAFT pending
 * counsel review — surfaced via the amber banner. Final terms swap in by
 * re-running the extractor once the source docs are finalized.
 */
export function LegalDocument({ slug }: { slug: string }) {
  const doc = LEGAL_DOCS[slug]
  if (!doc) notFound()

  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-ink-100">
        <div className="mx-auto max-w-3xl px-6 py-5">
          <Link
            href="/"
            className="text-sm font-semibold text-ink-900 hover:text-pink-600 transition-colors"
          >
            ← iLaunchify
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-3xl font-bold tracking-[-0.02em] text-ink-900">
          {doc.title}
        </h1>

        <div
          role="note"
          className="mt-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] leading-[1.55] text-amber-900"
        >
          <strong>Draft — pending legal review.</strong> This document is an initial draft and
          has not been reviewed by a licensed attorney. It is not legally binding. Final terms
          will be published before launch.
        </div>

        <div className="legal-prose mt-8" dangerouslySetInnerHTML={{ __html: doc.html }} />
      </article>

      <LandingFooter />
    </main>
  )
}
