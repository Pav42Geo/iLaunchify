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
        {/* Unmissable DRAFT badge above the title, even to a fast scroller. */}
        <span className="inline-flex items-center rounded-pill border border-warning-300 bg-warning-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-warning-800">
          Draft
        </span>

        <h1 className="mt-3 font-display text-3xl font-bold tracking-[-0.02em] text-ink-900">
          {doc.title}
        </h1>
        <p className="mt-1 text-[13px] text-ink-400">Last updated June 1, 2026</p>

        <div
          role="note"
          className="mt-5 rounded-lg border border-warning-300 bg-warning-50 px-4 py-3 text-[13px] leading-[1.55] text-warning-900"
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
