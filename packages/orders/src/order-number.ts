// Human-friendly order numbers — `ILF-YYMMDD-XXXXX` (Pavel 2026-06-30).
//
// The visible label a creator/partner/ops reads on an order. Format:
//   ILF-260630-7K3M9
//        │      │
//        │      └─ 5-char code from a Crockford-style unambiguous alphabet
//        └──────── the order's creation date as YYMMDD (local? no — see below)
//
// The DATE segment is derived from the supplied `date` in UTC so the same
// instant produces the same prefix regardless of server timezone. The CODE is
// drawn from `crypto.randomBytes` with rejection sampling so every symbol is
// uniformly distributed (NO modulo bias). 30^5 ≈ 24.3M codes per day; combined
// with the Order.orderNumber @unique constraint + a P2002 retry at the call
// site, collisions are vanishingly rare and always recovered.
//
// Pure + deterministic given an injected RNG — see the optional `randomBytes`
// argument, which the test pins to make the output exact.

import { randomBytes as nodeRandomBytes } from 'node:crypto'

/** Crockford-style alphabet: no 0/1/I/L/O/U (ambiguous or accidentally rude). */
export const ORDER_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Length of the random code segment. */
export const ORDER_CODE_LENGTH = 5

/** Static prefix on every order number. */
export const ORDER_NUMBER_PREFIX = 'ILF'

/** Matches a well-formed order number, e.g. `ILF-260630-7K3M9`. */
export const ORDER_NUMBER_REGEX = new RegExp(
  `^${ORDER_NUMBER_PREFIX}-\\d{6}-[${ORDER_CODE_ALPHABET}]{${ORDER_CODE_LENGTH}}$`,
)

/** Source of randomness — `(n) => Buffer`. Injectable for deterministic tests. */
export type RandomBytes = (size: number) => Buffer

/**
 * Draw `length` symbols uniformly from `ORDER_CODE_ALPHABET` using rejection
 * sampling so there is no modulo bias. We read one byte per symbol and reject
 * any byte at or above the largest multiple of the alphabet size that fits in a
 * byte (`floor(256 / 30) * 30 = 240`); bytes 240–255 are discarded and re-drawn.
 */
function drawCode(length: number, randomBytes: RandomBytes): string {
  const alphabetSize = ORDER_CODE_ALPHABET.length
  const ceiling = Math.floor(256 / alphabetSize) * alphabetSize // 240 for 30
  let out = ''
  // Pull bytes in chunks so we rarely re-enter the syscall; over-pull a little
  // to cover rejected bytes.
  while (out.length < length) {
    const need = length - out.length
    const buf = randomBytes(need + 4)
    for (let i = 0; i < buf.length && out.length < length; i++) {
      const b = buf[i]!
      if (b >= ceiling) continue // reject → no bias
      out += ORDER_CODE_ALPHABET[b % alphabetSize]
    }
  }
  return out
}

/** Two-digit, zero-padded. */
function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

/**
 * Build a human-friendly order number for the given creation date.
 *
 * @param date        the order's creation instant (defaults to now).
 * @param randomBytes optional RNG override (defaults to node:crypto). Injecting
 *                    a deterministic source makes the output exact + testable.
 * @returns `ILF-YYMMDD-XXXXX`
 */
export function generateOrderNumber(
  date: Date = new Date(),
  randomBytes: RandomBytes = nodeRandomBytes,
): string {
  const yy = pad2(date.getUTCFullYear() % 100)
  const mm = pad2(date.getUTCMonth() + 1)
  const dd = pad2(date.getUTCDate())
  const code = drawCode(ORDER_CODE_LENGTH, randomBytes)
  return `${ORDER_NUMBER_PREFIX}-${yy}${mm}${dd}-${code}`
}

/** True when `value` is a structurally valid order number. */
export function isValidOrderNumber(value: string): boolean {
  return ORDER_NUMBER_REGEX.test(value)
}
