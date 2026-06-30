import { describe, it, expect } from 'vitest'
import {
  generateOrderNumber,
  isValidOrderNumber,
  ORDER_CODE_ALPHABET,
  ORDER_CODE_LENGTH,
  ORDER_NUMBER_REGEX,
  type RandomBytes,
} from './order-number'

// A deterministic byte source: emits the given bytes in order, looping.
function fixedBytes(seq: number[]): RandomBytes {
  let cursor = 0
  return (size: number) => {
    const out = Buffer.alloc(size)
    for (let i = 0; i < size; i++) {
      out[i] = seq[cursor % seq.length]!
      cursor++
    }
    return out
  }
}

describe('generateOrderNumber', () => {
  it('produces the exact date prefix in UTC YYMMDD', () => {
    // 2026-06-30T12:00:00Z → 260630
    const date = new Date(Date.UTC(2026, 5, 30, 12, 0, 0))
    // bytes 0,1,2,3,4 → alphabet[0..4] = '2','3','4','5','6'
    const n = generateOrderNumber(date, fixedBytes([0, 1, 2, 3, 4]))
    expect(n).toBe('ILF-260630-23456')
  })

  it('zero-pads single-digit month and day', () => {
    // 2027-01-05 → 270105
    const date = new Date(Date.UTC(2027, 0, 5, 0, 0, 0))
    const n = generateOrderNumber(date, fixedBytes([5, 6, 7, 8, 9]))
    expect(n).toBe('ILF-270105-789AB') // alphabet[5..9] = '7','8','9','A','B'
  })

  it('matches the canonical format regex', () => {
    const n = generateOrderNumber(new Date(Date.UTC(2026, 5, 30)), fixedBytes([10, 11, 12, 13, 14]))
    expect(ORDER_NUMBER_REGEX.test(n)).toBe(true)
    expect(isValidOrderNumber(n)).toBe(true)
  })

  it('rejection-samples past out-of-range bytes (no modulo bias)', () => {
    // 240..255 must be skipped (30*8 = 240 is the ceiling). Feed three rejects
    // (250, 245, 240) then valid bytes — output must use only the valid bytes.
    const n = generateOrderNumber(
      new Date(Date.UTC(2026, 5, 30)),
      fixedBytes([250, 245, 240, 0, 1, 2, 3, 4]),
    )
    expect(n).toBe('ILF-260630-23456')
  })

  it('only ever emits alphabet characters in the code segment', () => {
    // Walk every byte 0..255 through the generator; the code chars must all be
    // in the alphabet and never the banned 0/1/I/L/O/U.
    const code = generateOrderNumber(new Date(), fixedBytes(Array.from({ length: 256 }, (_, i) => i))).slice(-ORDER_CODE_LENGTH)
    for (const ch of code) {
      expect(ORDER_CODE_ALPHABET.includes(ch)).toBe(true)
    }
    expect(/[01ILOU]/.test(code)).toBe(false)
  })

  it('emits a 5-char code', () => {
    const n = generateOrderNumber(new Date(), fixedBytes([0, 1, 2, 3, 4]))
    expect(n.slice(-ORDER_CODE_LENGTH)).toHaveLength(ORDER_CODE_LENGTH)
  })

  it('rejects malformed strings', () => {
    expect(isValidOrderNumber('ILF-260630-7K3M9')).toBe(true)
    expect(isValidOrderNumber('ORD-12345678')).toBe(false)
    expect(isValidOrderNumber('ILF-26063-23456')).toBe(false) // 5-digit date
    expect(isValidOrderNumber('ILF-260630-2345')).toBe(false) // 4-char code
    expect(isValidOrderNumber('ILF-260630-0OIL1')).toBe(false) // banned chars
  })
})
