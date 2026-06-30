// Order-creation helper that stamps a unique human order number with retry.
//
// The Order.orderNumber column carries a @unique constraint. generateOrderNumber()
// codes collide only ~1-in-millions per day, but when one does the create throws
// Prisma P2002. `createOrderWithNumber` regenerates and retries a handful of times
// so a collision is silently recovered rather than failing a checkout.
//
// The caller supplies the actual create fn (which runs inside its own
// transaction shape) — we only own the orderNumber + retry loop. The generated
// Prisma client may be stale (no `orderNumber` field yet), so callers cast-guard
// the data block at the create site; this helper is field-agnostic.

import { generateOrderNumber } from './order-number'

/** Max attempts before giving up (collisions are astronomically unlikely). */
export const ORDER_NUMBER_MAX_ATTEMPTS = 5

/** True when `err` is a Prisma unique-constraint violation on `orderNumber`. */
function isOrderNumberConflict(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const e = err as { code?: unknown; meta?: { target?: unknown } }
  if (e.code !== 'P2002') return false
  const target = e.meta?.target
  // Prisma reports the conflicting field(s) in meta.target (string or string[]).
  if (Array.isArray(target)) return target.some((t) => String(t).includes('orderNumber'))
  if (typeof target === 'string') return target.includes('orderNumber')
  // Some adapters omit target — treat any P2002 raised here as a number clash
  // (the only unique we introduce around this create) and retry.
  return true
}

/**
 * Run `create(orderNumber)` with a freshly generated order number, retrying on a
 * P2002 orderNumber collision up to ORDER_NUMBER_MAX_ATTEMPTS times.
 *
 * @param create runs the order.create (and any surrounding txn). Receives the
 *               order number to stamp onto the row.
 * @param date   creation date for the number's YYMMDD prefix (defaults to now).
 */
export async function createOrderWithNumber<T>(
  create: (orderNumber: string) => Promise<T>,
  date: Date = new Date(),
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < ORDER_NUMBER_MAX_ATTEMPTS; attempt++) {
    const orderNumber = generateOrderNumber(date)
    try {
      return await create(orderNumber)
    } catch (err) {
      lastErr = err
      if (isOrderNumberConflict(err)) continue // regenerate + retry
      throw err
    }
  }
  throw lastErr
}
