// Pure messaging helpers — network-free (runs in run-vitest-suites.mjs).
import { describe, it, expect } from 'vitest'
import { memberRoleLabel, messagePreview, countUnread } from './messaging-pure'

describe('memberRoleLabel', () => {
  it('prefers the explicit free-text title', () => {
    expect(
      memberRoleLabel({ title: 'Food Scientist', isAdmin: true, serviceRoles: ['PARTNER_PRODUCTION'] }),
    ).toBe('Food Scientist')
  })
  it('ignores whitespace-only titles', () => {
    expect(memberRoleLabel({ title: '   ', isAdmin: false, serviceRoles: ['PARTNER_PREPRESS'] })).toBe(
      'Prepress',
    )
  })
  it('derives from service roles', () => {
    expect(memberRoleLabel({ title: null, isAdmin: false, serviceRoles: ['PARTNER_PRODUCTION'] })).toBe(
      'Production',
    )
    expect(
      memberRoleLabel({
        title: null,
        isAdmin: false,
        serviceRoles: ['PARTNER_PREPRESS', 'PARTNER_PRODUCTION'],
      }),
    ).toBe('Prepress & Production')
  })
  it('falls back to admin, then generic', () => {
    expect(memberRoleLabel({ title: null, isAdmin: true, serviceRoles: [] })).toBe('Team Admin')
    expect(memberRoleLabel({ title: null, isAdmin: false, serviceRoles: [] })).toBe('Team Member')
  })
})

describe('messagePreview', () => {
  it('collapses whitespace and trims', () => {
    expect(messagePreview('  hello\n  world  ')).toBe('hello world')
  })
  it('truncates with an ellipsis at the cap', () => {
    const out = messagePreview('x'.repeat(100), 20)
    expect(out).toHaveLength(20)
    expect(out.endsWith('…')).toBe(true)
  })
  it('leaves short messages intact', () => {
    expect(messagePreview('short', 20)).toBe('short')
  })
})

describe('countUnread', () => {
  const t = (min: number) => new Date(Date.UTC(2026, 6, 13, 12, min))
  const viewer = { userId: 'u1', side: 'CREATOR' as const }

  it('counts only counterpart messages newer than the cursor', () => {
    const msgs = [
      { createdAt: t(0), authorUserId: 'u2', authorRole: 'PARTNER' }, // before cursor
      { createdAt: t(10), authorUserId: 'u2', authorRole: 'PARTNER' }, // unread
      { createdAt: t(11), authorUserId: 'u1', authorRole: 'CREATOR' }, // mine
      { createdAt: t(12), authorUserId: 'u3', authorRole: 'PARTNER' }, // unread
    ]
    expect(countUnread(msgs, viewer, t(5))).toBe(2)
  })

  it('treats a missing cursor as everything-unread', () => {
    const msgs = [
      { createdAt: t(0), authorUserId: 'u2', authorRole: 'PARTNER' },
      { createdAt: t(1), authorUserId: 'u2', authorRole: 'PARTNER' },
    ]
    expect(countUnread(msgs, viewer, null)).toBe(2)
  })

  it('falls back to side comparison for legacy rows without authorUserId', () => {
    const msgs = [
      { createdAt: t(10), authorUserId: null, authorRole: 'CREATOR' }, // legacy mine
      { createdAt: t(11), authorUserId: null, authorRole: 'PARTNER' }, // legacy theirs
    ]
    expect(countUnread(msgs, viewer, null)).toBe(1)
  })
})
