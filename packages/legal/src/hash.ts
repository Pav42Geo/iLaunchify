// SHA-256 helpers for the legal evidence core. SERVER-ONLY (node:crypto).
// Kept in its own module so the acceptance builder stays pure + unit-testable.

import { createHash } from 'node:crypto'

/** SHA-256 hex of a UTF-8 string. */
export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** Deterministic JSON with sorted keys, so a record hash is stable across engines. */
export function canonicalJson(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort()
  return JSON.stringify(obj, keys)
}
