import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LandingFooter } from './LandingFooter'
import { LEGAL_DOCS, type LegalDoc } from '@/content/legal/content'
import { getLiveLegalDoc } from '@/lib/legal'

/**
 * Renders a legal document (Terms / Privacy / Creator-Agreement /
 * Partner-Agreement / …). Source of truth is the admin-managed DB version
 * (docs/LEGAL_DOCUMENT_MANAGEMENT_SPEC_2026-07-11.md): if a PUBLISHED version
 * exists for the slug, it renders live and drops the draft banner. Until a doc
 * is published in admin, it falls back to the legacy auto-generated content.ts
 * (still shown with the amber "draft — pending counsel" banner). A `doc`
 * override still renders hand-authored drafts (e.g. Membership Terms) directly.
 *
 * Async server component — reads the DB. Routes that use it are force-dynamic.
 */
export async function LegalDocument({ slug, doc: docOverride }: { slug?: string; doc?: LegalDoc }) {
  let title: string | undefined
  let html: string | undefined
  let isDraft = true
  let updatedLabel = 'June 1, 2026'

  // DB-first: a PUBLISHED version always wins (drops the draft banner). `doc`
  // is a hand-authored draft fallback (e.g. Membership, Accessibility) used only
  // until that slug is published; LEGAL_DOCS is the legacy auto-generated fallback.
  if (slug) {
    const live = await getLiveLegalDoc(slug)
    if (live) {
      title = live.title
      html = live.currentVersion.bodyHtml
      isDraft = false
      const published = live.currentVersion.effectiveAt ?? live.currentVersion.publishedAt
      if (published) {
        updatedLabel = new Date(published).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      }
    }
  }

  if (title === undefined || html === undefined) {
    const fallback = docOverride ?? (slug ? LEGAL_DOCS[slug] : undefined)
    if (fallback) {
      title = fallback.title
      html = fallback.html
    }
  }

  if (title === undefined || html === undefined) notFound()

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

        <h1 className="mt-3 font-display text-3xl font-bold tracking-[-0.02em] text-ink-900">{title}</h1>
        <p className="mt-1 text-[13px] text-ink-400">Last updated {updatedLabel}</p>

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
