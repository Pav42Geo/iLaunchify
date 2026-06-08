// Lesson-page components (ACADEMY_SPEC §7 level 3): video frame + transcript,
// prev/next, and the article reading layout. Server components. V1 renders a
// branded video frame (the player SDK is a later refinement); captions/transcript
// are always present (WCAG AA) and server-rendered for SEO.

import Link from 'next/link'
import { PlayCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { lessonHref, type AcademyAudience } from '@ilaunchify/academy'

interface NeighborLesson {
  slug: string
  title: string
}

export function VideoFrame({ provider, title }: { provider?: string | null; title: string }) {
  return (
    <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl bg-ink-900">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-white">
          <PlayCircle className="h-9 w-9" />
        </span>
        <p className="px-6 text-[13px] font-medium text-ink-300">{title}</p>
        {provider && <p className="text-[11px] uppercase tracking-[0.12em] text-ink-500">{provider} video</p>}
      </div>
    </div>
  )
}

/** Renders bodyMdx as a simple readable block (V1: paragraphs + headings via
 *  light markdown). Server-rendered for indexability. */
export function LessonBody({ body }: { body: string | null }) {
  if (!body) return null
  const blocks = body.split(/\n{2,}/).filter((b) => b.trim())
  return (
    <div className="space-y-3 text-[14px] leading-relaxed text-ink-700">
      {blocks.map((b, i) => {
        const trimmed = b.trim()
        if (trimmed.startsWith('## ')) {
          return <h3 key={i} className="pt-2 font-display text-[17px] font-bold text-ink-900">{trimmed.slice(3)}</h3>
        }
        if (trimmed.startsWith('# ')) {
          return <h2 key={i} className="pt-2 font-display text-[20px] font-bold text-ink-900">{trimmed.slice(2)}</h2>
        }
        return <p key={i} className="whitespace-pre-wrap">{trimmed}</p>
      })}
    </div>
  )
}

export function PrevNext({
  audience,
  courseSlug,
  prev,
  next,
}: {
  audience: AcademyAudience
  courseSlug: string
  prev: NeighborLesson | null
  next: NeighborLesson | null
}) {
  return (
    <div className="mt-8 flex items-stretch justify-between gap-3 border-t border-ink-100 pt-5">
      {prev ? (
        <Link href={lessonHref(audience, courseSlug, prev.slug)} className="group flex max-w-[48%] items-center gap-2 rounded-xl border border-ink-200 px-4 py-3 text-left transition-colors hover:border-pink-300 hover:bg-pink-50/30">
          <ChevronLeft className="h-4 w-4 shrink-0 text-ink-400 group-hover:text-pink-600" />
          <span className="min-w-0">
            <span className="block text-[10.5px] uppercase tracking-[0.1em] text-ink-400">Previous</span>
            <span className="block truncate text-[13px] font-medium text-ink-900">{prev.title}</span>
          </span>
        </Link>
      ) : <span />}
      {next ? (
        <Link href={lessonHref(audience, courseSlug, next.slug)} className="group flex max-w-[48%] items-center gap-2 rounded-xl border border-ink-200 px-4 py-3 text-right transition-colors hover:border-pink-300 hover:bg-pink-50/30">
          <span className="min-w-0">
            <span className="block text-[10.5px] uppercase tracking-[0.1em] text-ink-400">Next</span>
            <span className="block truncate text-[13px] font-medium text-ink-900">{next.title}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-ink-400 group-hover:text-pink-600" />
        </Link>
      ) : <span />}
    </div>
  )
}

/** JSON-LD script tag — embeds structured data server-side. */
export function StructuredData({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // Structured data is a trusted, server-built object (no user HTML).
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}
