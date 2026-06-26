import type { ReactNode } from 'react'

/**
 * AdminPageHeader — the ONE hero band for every admin page (Hero Usage Policy,
 * 2026-06-25). Replaces ~67 hand-rolled inline bands that had drifted apart
 * (different title sizes, eyebrow styles, subtitle widths, some missing the
 * border). Compact by design: short band, `text-xl` title, a single readable
 * description measure, optional eyebrow + right-aligned actions.
 *
 * Locked layout — do not restyle per-page. Pass content via props:
 *   <AdminPageHeader eyebrow="Asset Management" title="Ingredient queue"
 *     description="…" actions={<Button/>} />
 */
export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  /** Optional caps eyebrow above the title (e.g. "Operate", "Asset Management · …"). */
  eyebrow?: string
  title: string
  /** Optional one-line scope/instruction. Renders at a fixed readable width. */
  description?: ReactNode
  /** Optional right-aligned actions (buttons, links). */
  actions?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">{eyebrow}</p>
          )}
          <h1 className="mt-1 font-display text-xl font-bold leading-tight tracking-[-0.02em] text-ink-900">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-ink-600">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-none items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}
