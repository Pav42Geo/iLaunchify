// @ilaunchify/academy — render + SEO helpers (ACADEMY_SPEC §6, §10).
//
// Structured-data builders (schema.org Course + VideoObject) for the public
// lesson/course pages — the acquisition thesis depends on server-rendered,
// indexable content. Pure functions returning JSON-LD objects the page embeds
// in a <script type="application/ld+json">. No DB, no React.

export interface CourseStructuredDataInput {
  title: string
  summary: string
  url: string
  audience: 'CREATOR' | 'PARTNER'
  heroImageUrl?: string | null
}

/** schema.org/Course JSON-LD for a course page. Provider is iLaunchify. */
export function courseStructuredData(input: CourseStructuredDataInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: input.title,
    description: input.summary,
    url: input.url,
    ...(input.heroImageUrl ? { image: input.heroImageUrl } : {}),
    provider: {
      '@type': 'Organization',
      name: 'iLaunchify',
      sameAs: 'https://ilaunchify.com',
    },
    audience: {
      '@type': 'Audience',
      audienceType: input.audience === 'PARTNER' ? 'Manufacturers & production partners' : 'CPG creators',
    },
  }
}

export interface VideoStructuredDataInput {
  name: string
  description: string
  url: string
  durationSeconds?: number | null
  thumbnailUrl?: string | null
  uploadDate?: string | null // ISO date; pass from publishedAt at the call site
}

/** schema.org/VideoObject JSON-LD for a VIDEO lesson page. */
export function videoStructuredData(input: VideoStructuredDataInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: input.name,
    description: input.description,
    contentUrl: input.url,
    ...(input.thumbnailUrl ? { thumbnailUrl: input.thumbnailUrl } : {}),
    ...(input.uploadDate ? { uploadDate: input.uploadDate } : {}),
    ...(input.durationSeconds ? { duration: isoDuration(input.durationSeconds) } : {}),
  }
}

/** Seconds → ISO-8601 duration (e.g. 90 → "PT1M30S") for VideoObject.duration. */
export function isoDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `PT${h ? `${h}H` : ''}${m ? `${m}M` : ''}${sec || (!h && !m) ? `${sec}S` : ''}`
}

/** Human-readable duration label (e.g. 90 → "1 min", 3720 → "1h 2m"). */
export function formatDuration(totalSeconds?: number | null): string {
  if (!totalSeconds || totalSeconds <= 0) return ''
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.round((totalSeconds % 3600) / 60)
  if (h) return `${h}h ${m}m`
  if (m) return `${m} min`
  return '<1 min'
}

/** Sum lesson durations → a course's "estimated minutes" when not set explicitly. */
export function estimateCourseMinutes(lessonDurations: Array<number | null | undefined>): number {
  const total = lessonDurations.reduce<number>((acc, d) => acc + (d ?? 0), 0)
  return Math.round(total / 60)
}
