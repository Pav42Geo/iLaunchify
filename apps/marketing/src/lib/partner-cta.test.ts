import { describe, it, expect } from 'vitest'
import {
  partnerCta,
  PARTNER_APPLY_HREF,
  PARTNER_SIGNUP_HREF,
  DEFAULT_PARTNER_ACCESS_MODE,
} from './partner-cta'

describe('partnerCta', () => {
  it('PRIVATE → application form + invite-only affordance', () => {
    const c = partnerCta('PRIVATE', 'nav')
    expect(c.label).toBe('Become a partner')
    expect(c.href).toBe(PARTNER_APPLY_HREF)
    expect(c.inviteOnly).toBe(true)
  })

  it('PUBLIC → real signup', () => {
    const c = partnerCta('PUBLIC', 'nav')
    expect(c.label).toBe('Sign up')
    expect(c.href).toBe(PARTNER_SIGNUP_HREF)
    expect(c.inviteOnly).toBe(false)
  })

  it('placement changes wording + style but not the destination', () => {
    const primary = partnerCta('PRIVATE', 'primary')
    const footer = partnerCta('PRIVATE', 'footer')
    expect(primary.href).toBe(footer.href)
    expect(primary.style).toBe('pill')
    expect(footer.style).toBe('link')
    expect(primary.label).not.toBe(footer.label)
  })

  it('is total — every mode+placement yields a non-empty label', () => {
    for (const mode of ['PRIVATE', 'PUBLIC'] as const) {
      for (const place of ['primary', 'nav', 'footer'] as const) {
        expect(partnerCta(mode, place).label.length).toBeGreaterThan(0)
      }
    }
  })

  it('fails closed to invite-only by default', () => {
    expect(DEFAULT_PARTNER_ACCESS_MODE).toBe('PRIVATE')
    expect(partnerCta(DEFAULT_PARTNER_ACCESS_MODE).inviteOnly).toBe(true)
  })
})
