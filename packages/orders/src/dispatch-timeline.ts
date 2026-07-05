// Creator order timeline — pure builder (docs/EMAIL_NOTIFICATION_CENTER.md
// Part 3 / checklist F). Merges two signals into one chronological story per
// dispatch:
//
//   1. FSM state timestamps already on OrderDispatch (acceptedAt … deliveredAt)
//   2. Partner-authored DispatchProgressUpdate rows (NOTE / ETA / PHOTO /
//      MILESTONE) — the operation-level signal (model lands in Phase F schema;
//      the row shape is declared here so this helper + the UI can build now)
//
// Pure: no prisma, no I/O, no Date.now(). Hosts fetch rows and pass them in;
// the presentational <OrderTimelineView /> (@ilaunchify/ui) renders the output.

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export type ProgressUpdateKind = 'NOTE' | 'ETA' | 'PHOTO' | 'MILESTONE'

/** Mirror of the upcoming DispatchProgressUpdate model (checklist F, CODE/PAVEL). */
export interface DispatchProgressUpdateData {
  id: string
  kind: ProgressUpdateKind
  /** Partner's note (NOTE / MILESTONE annotation / photo caption). */
  body: string | null
  /** Revised ETA (kind=ETA). ISO. */
  etaAt: string | null
  photoAssetId: string | null
  /** Machine-readable milestone slug (kind=MILESTONE), e.g. 'plates-made'. */
  milestone: string | null
  authorName: string | null
  createdAt: string // ISO
}

/** The per-state timestamps the timeline reads off OrderDispatch (B6 columns). */
export interface DispatchTimelineSource {
  dispatchId: string
  dispatchType: string
  partnerName?: string | null
  createdAt: string // ISO — dispatch assigned
  acceptedAt?: string | null
  productionStartedAt?: string | null
  qualityCheckStartedAt?: string | null
  qualityCheckFailedAt?: string | null
  readyAt?: string | null
  shippedAt?: string | null
  inTransitAt?: string | null
  deliveredAt?: string | null
  declinedAt?: string | null
  withdrawnAt?: string | null
  trackingCarrier?: string | null
  trackingNumber?: string | null
  /** Partner-revisable running ETA (Phase F column). ISO. */
  currentEtaAt?: string | null
  progressUpdates?: readonly DispatchProgressUpdateData[]
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export type TimelineEntryKind =
  | 'STATE' // FSM transition
  | 'NOTE'
  | 'ETA'
  | 'PHOTO'
  | 'MILESTONE'

export interface OrderTimelineEntry {
  /** Stable key for rendering. */
  id: string
  dispatchId: string
  at: string // ISO
  kind: TimelineEntryKind
  /** Short human line, creator-facing. */
  label: string
  /** Secondary detail (note text, tracking, ETA date), if any. */
  detail: string | null
  /** Who reported it — partner display name for progress rows, null for FSM rows. */
  author: string | null
  photoAssetId: string | null
  /** True for terminal-negative rows (declined / withdrawn / QC failed). */
  attention: boolean
}

// ---------------------------------------------------------------------------

const STATE_ROWS: ReadonlyArray<{
  field: keyof DispatchTimelineSource
  label: (s: DispatchTimelineSource) => string
  detail?: (s: DispatchTimelineSource) => string | null
  attention?: boolean
}> = [
  { field: 'createdAt', label: (s) => `${who(s)} received the job` },
  { field: 'acceptedAt', label: (s) => `${who(s)} accepted the job` },
  { field: 'productionStartedAt', label: () => 'Production started' },
  { field: 'qualityCheckStartedAt', label: () => 'Quality check started' },
  {
    field: 'qualityCheckFailedAt',
    label: () => 'Quality check failed — iLaunchify is arranging a fix',
    attention: true,
  },
  { field: 'readyAt', label: () => 'Ready to ship' },
  {
    field: 'shippedAt',
    label: () => 'Shipped',
    detail: (s) =>
      s.trackingNumber
        ? `${s.trackingCarrier ? `${s.trackingCarrier} · ` : ''}${s.trackingNumber}`
        : null,
  },
  { field: 'inTransitAt', label: () => 'In transit' },
  { field: 'deliveredAt', label: () => 'Delivered' },
  {
    field: 'declinedAt',
    label: (s) => `${who(s)} declined — rerouting to another partner`,
    attention: true,
  },
  {
    field: 'withdrawnAt',
    label: (s) => `${who(s)} withdrew — order paused for reroute`,
    attention: true,
  },
]

function who(s: DispatchTimelineSource): string {
  return s.partnerName?.trim() || 'Your partner'
}

function isoValid(v: unknown): v is string {
  return typeof v === 'string' && !Number.isNaN(new Date(v).getTime())
}

function fmtEta(iso: string): string {
  const d = new Date(iso)
  // An ETA is a calendar date, not an instant — format in UTC so the date
  // never shifts with the viewer's timezone (midnight-UTC ETAs would
  // otherwise read as the previous day in the Americas).
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Build the chronological timeline for ONE dispatch. Entries are sorted oldest
 * → newest; invalid/absent timestamps are skipped. Deterministic: ties keep
 * STATE rows before progress rows at the same instant, then input order.
 */
export function buildDispatchTimeline(source: DispatchTimelineSource): OrderTimelineEntry[] {
  const entries: Array<OrderTimelineEntry & { _tie: number }> = []
  let tie = 0

  for (const row of STATE_ROWS) {
    const at = source[row.field]
    if (!isoValid(at)) continue
    entries.push({
      id: `${source.dispatchId}:${String(row.field)}`,
      dispatchId: source.dispatchId,
      at,
      kind: 'STATE',
      label: row.label(source),
      detail: row.detail?.(source) ?? null,
      author: null,
      photoAssetId: null,
      attention: row.attention ?? false,
      _tie: tie++,
    })
  }

  for (const u of source.progressUpdates ?? []) {
    if (!isoValid(u.createdAt)) continue
    entries.push({
      id: `${source.dispatchId}:progress:${u.id}`,
      dispatchId: source.dispatchId,
      at: u.createdAt,
      kind: u.kind,
      label: progressLabel(u, source),
      detail: progressDetail(u),
      author: u.authorName?.trim() || null,
      photoAssetId: u.photoAssetId,
      attention: false,
      _tie: tie++,
    })
  }

  entries.sort((a, b) => {
    const dt = new Date(a.at).getTime() - new Date(b.at).getTime()
    if (dt !== 0) return dt
    if (a.kind === 'STATE' && b.kind !== 'STATE') return -1
    if (b.kind === 'STATE' && a.kind !== 'STATE') return 1
    return a._tie - b._tie
  })
  return entries.map(({ _tie, ...e }) => e)
}

function progressLabel(u: DispatchProgressUpdateData, s: DispatchTimelineSource): string {
  switch (u.kind) {
    case 'ETA':
      return u.etaAt && isoValid(u.etaAt)
        ? `${who(s)} updated the delivery estimate to ${fmtEta(u.etaAt)}`
        : `${who(s)} updated the delivery estimate`
    case 'PHOTO':
      return `${who(s)} shared a production photo`
    case 'MILESTONE':
      return u.milestone ? `Milestone: ${humanizeMilestone(u.milestone)}` : 'Milestone reached'
    case 'NOTE':
    default:
      return `${who(s)} posted an update`
  }
}

function progressDetail(u: DispatchProgressUpdateData): string | null {
  const body = u.body?.trim()
  return body ? body.slice(0, 500) : null
}

/** 'plates-made' / 'PLATES_MADE' → 'Plates made'. */
export function humanizeMilestone(slug: string): string {
  const words = slug.toLowerCase().split(/[-_\s]+/).filter(Boolean)
  if (words.length === 0) return slug
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
}

/**
 * Merge timelines from every dispatch on the order into one stream (newest
 * LAST — callers reverse for newest-first display). Stable across dispatches.
 */
export function buildOrderTimeline(
  dispatches: readonly DispatchTimelineSource[],
): OrderTimelineEntry[] {
  const all = dispatches.flatMap((d) => buildDispatchTimeline(d))
  return all.sort((a, b) => {
    const dt = new Date(a.at).getTime() - new Date(b.at).getTime()
    if (dt !== 0) return dt
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/**
 * The single "where is it now" ETA for a dispatch: the running currentEtaAt
 * when set, else the latest ETA progress update, else null.
 */
export function effectiveEta(source: DispatchTimelineSource): string | null {
  if (isoValid(source.currentEtaAt)) return source.currentEtaAt
  const etas = (source.progressUpdates ?? [])
    .filter((u) => u.kind === 'ETA' && isoValid(u.etaAt) && isoValid(u.createdAt))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return etas[0]?.etaAt ?? null
}
