import * as React from 'react'
import { Label } from '../primitives/label'
import { cn } from '../lib/utils'

/**
 * FormField — a label + control cell that stays aligned with its neighbours.
 *
 * The alignment problem: when several fields share a row and one column's label
 * wraps to two lines while another's stays on one, a plain top-stacked cell puts
 * the inputs at different heights ("one low, one high"). FormField renders its
 * label and control as two CSS-subgrid rows, so when it sits inside a {@link FieldRow}
 * every label shares one track and every input shares the next — inputs line up
 * regardless of how the labels wrap.
 *
 * Standalone (not inside a FieldRow), `grid-template-rows: subgrid` harmlessly
 * falls back to a normal grid and the field renders as a simple stacked label +
 * control, so the same component works for full-width fields too.
 *
 * Hint / error live in the same row-2 wrapper as the control, so they grow that
 * row instead of overflowing the two-row span.
 */
export interface FormFieldProps {
  label: React.ReactNode
  /** Associates the label with a control `id` (renders `htmlFor`). */
  htmlFor?: string
  /** Renders a pink `*` after the label. */
  required?: boolean
  hint?: string
  /** Where the hint sits relative to the control. Default `'below'`. */
  hintPlacement?: 'above' | 'below'
  error?: string
  /** Extra classes for the `<Label>` (e.g. surface-specific size/color). */
  labelClassName?: string
  /** Extra classes for the outer cell. */
  className?: string
  children: React.ReactNode
}

export function FormField({
  label,
  htmlFor,
  required,
  hint,
  hintPlacement = 'below',
  error,
  labelClassName,
  className,
  children,
}: FormFieldProps) {
  const hintEl = hint ? <p className="text-ui-caption text-ink-500">{hint}</p> : null
  return (
    <div className={cn('grid gap-y-1.5 sm:row-span-2 sm:[grid-template-rows:subgrid]', className)}>
      <div className="flex items-baseline gap-1">
        <Label htmlFor={htmlFor} className={labelClassName}>
          {label}
          {required && (
            <span className="ml-0.5 text-pink-500" aria-label="required" title="Required">
              *
            </span>
          )}
        </Label>
      </div>
      <div className="space-y-1.5">
        {hintPlacement === 'above' && hintEl}
        {children}
        {hintPlacement === 'below' && hintEl}
        {error && <p className="text-xs text-danger-600">{error}</p>}
      </div>
    </div>
  )
}

const FIELD_ROW_COLS: Record<number, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
}

/**
 * FieldRow — the grid that lays {@link FormField} cells out in a single row and
 * defines the two shared tracks (label / control) their subgrids align to.
 *
 * Use it for one row of side-by-side fields; on mobile it collapses to a single
 * column. Each direct child should be a FormField.
 *
 *   <FieldRow cols={3}>
 *     <FormField label="Country">…</FormField>
 *     <FormField label="State / region" required>…</FormField>
 *     <FormField label="City">…</FormField>
 *   </FieldRow>
 */
export interface FieldRowProps {
  /** Number of columns on `sm+` screens (1–4). Default 2. */
  cols?: 1 | 2 | 3 | 4
  className?: string
  children: React.ReactNode
}

export function FieldRow({ cols = 2, className, children }: FieldRowProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4 sm:gap-y-1.5 sm:[grid-template-rows:auto_auto]',
        FIELD_ROW_COLS[cols],
        className,
      )}
    >
      {children}
    </div>
  )
}
