// Server-action input validation — docs/SECURITY_ARCHITECTURE.md Tier 1.2
// (LOCKED 2026-06-05) + docs/ZOD_ACTION_BOUNDARIES.md (the conversion spec).
//
// Every mutating server action validates its input with a Zod schema via
// parseActionInput() BEFORE touching Prisma. Reference conversion:
// addVariant in apps/partner .../edit/card-actions.ts.
//
// `z` is re-exported here so app code imports it from @ilaunchify/types
// (already a dependency + transpilePackage of every app) instead of each app
// adding its own zod dependency.

import { z } from 'zod'

export { z }

export type ParsedInput<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

/**
 * Validate raw action input against a schema. Returns a Result-friendly
 * shape: the FIRST issue as a human-readable message (server actions show
 * one toast, not a form-error map — keep messages writable as toasts).
 */
export function parseActionInput<S extends z.ZodTypeAny>(
  schema: S,
  input: unknown,
): ParsedInput<z.infer<S>> {
  const result = schema.safeParse(input)
  if (result.success) return { ok: true, data: result.data }
  const first = result.error.issues[0]
  const where =
    first && first.path.length > 0 ? ` (${first.path.join('.')})` : ''
  return { ok: false, error: `${first?.message ?? 'Invalid input.'}${where}` }
}
