// The canonical interactive die-line frame editor now lives in @ilaunchify/ui
// (shared with the admin Die-line Curator — C9.g, 2026-06-23). This thin
// re-export keeps existing partner imports (DielineStudioShell, etc.) working.
export {
  DielineFrameEditor,
  type DielineFrameEditorProps,
  type DielineBackdrop,
  type DielineEditorMeta,
  type DielineSaveStatus,
  type PersistResult,
} from '@ilaunchify/ui'
