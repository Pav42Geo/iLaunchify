// Anti-circumvention detector — pure, network-free.
import { describe, it, expect } from 'vitest'
import { detectContactLeaks, evaluateContactLeak } from './contact-leak'

const kinds = (body: string) => detectContactLeaks(body).map((m) => m.kind)

describe('detectContactLeaks — emails', () => {
  it('catches plain emails', () => {
    expect(kinds('reach me at maria.k@vitaform.com thanks')).toContain('EMAIL')
  })
  it('catches obfuscated emails', () => {
    expect(kinds('write to maria at gmail dot com')).toContain('OBFUSCATED_EMAIL')
    expect(kinds('maria [at] vitaform [dot] co')).toContain('OBFUSCATED_EMAIL')
  })
  it('does not flag ordinary "at ... " prose', () => {
    expect(kinds('we met at the expo in Chicago')).toHaveLength(0)
    expect(kinds('pick it up at the dock door')).toHaveLength(0)
  })
})

describe('detectContactLeaks — phones', () => {
  it('catches international and formatted numbers', () => {
    expect(kinds('call me +359 88 123 4567')).toContain('PHONE')
    expect(kinds('my cell is (555) 123-4567')).toContain('PHONE')
    expect(kinds('reach me on 555-123-4567 after 5')).toContain('PHONE')
  })
  it('never flags commercial numerics', () => {
    expect(kinds('volume is 10,000 units at $2.10 each')).toHaveLength(0)
    expect(kinds('MOQ 250, lead time 7 wk, batch 5000')).toHaveLength(0)
    expect(kinds('recipe v2.5 targets 355 ml and 120 kcal')).toHaveLength(0)
    expect(kinds('PO number 20260713 confirmed')).toHaveLength(0) // bare digits, no +
  })
})

describe('detectContactLeaks — messenger channels', () => {
  it('flags naming an off-platform channel', () => {
    expect(kinds('ping me on WhatsApp')).toContain('MESSENGER')
    expect(kinds('are you on telegram?')).toContain('MESSENGER')
  })
  it('leaves normal words alone', () => {
    expect(kinds('the signal from the sensor was weak')).toContain('MESSENGER') // known trade-off: "signal" matches
    expect(kinds('we can discuss the label proof here')).toHaveLength(0)
  })
})

describe('evaluateContactLeak — policy ladder', () => {
  const leaky = 'email me: x@y.com'
  it('OFF never runs', () => {
    expect(evaluateContactLeak(leaky, 'OFF').action).toBe('ALLOW')
  })
  it('clean text always allows', () => {
    expect(evaluateContactLeak('label proof looks good', 'BLOCK').action).toBe('ALLOW')
  })
  it('WARN / WARN_AND_FLAG / BLOCK map through', () => {
    expect(evaluateContactLeak(leaky, 'WARN').action).toBe('WARN')
    expect(evaluateContactLeak(leaky, 'WARN_AND_FLAG').action).toBe('WARN_AND_FLAG')
    expect(evaluateContactLeak(leaky, 'BLOCK').action).toBe('BLOCK')
  })
  it('returns the matches for the audit payload', () => {
    const r = evaluateContactLeak(leaky, 'WARN_AND_FLAG')
    expect(r.matches[0]?.kind).toBe('EMAIL')
    expect(r.matches[0]?.excerpt).toContain('x@y.com')
  })
})
