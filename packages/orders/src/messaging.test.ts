// Pure messaging helpers — network-free (runs in run-vitest-suites.mjs).
import { describe, it, expect } from 'vitest'
import {
  memberRoleLabel,
  messagePreview,
  countUnread,
  findOrphanedChatKeys,
  isOnline,
  isTypingIn,
  chatAttachmentFromPayload,
  PRESENCE_ONLINE_MS,
  TYPING_ACTIVE_MS,
} from './messaging-pure'

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

describe('presence helpers', () => {
  const NOW = Date.UTC(2026, 6, 13, 12, 0, 0)

  it('isOnline: within the window, at the edge, and expired', () => {
    expect(isOnline({ lastSeenAt: new Date(NOW - 5_000) }, NOW)).toBe(true)
    expect(isOnline({ lastSeenAt: new Date(NOW - PRESENCE_ONLINE_MS) }, NOW)).toBe(true)
    expect(isOnline({ lastSeenAt: new Date(NOW - PRESENCE_ONLINE_MS - 1) }, NOW)).toBe(false)
    expect(isOnline(null, NOW)).toBe(false)
  })

  it('isTypingIn: matches thread key and freshness', () => {
    const row = {
      lastSeenAt: new Date(NOW),
      typingThreadKey: 'room:r1',
      typingAt: new Date(NOW - 2_000),
    }
    expect(isTypingIn(row, 'room:r1', NOW)).toBe(true)
    expect(isTypingIn(row, 'room:r2', NOW)).toBe(false) // other thread
    expect(
      isTypingIn({ ...row, typingAt: new Date(NOW - TYPING_ACTIVE_MS - 1) }, 'room:r1', NOW),
    ).toBe(false) // stale
    expect(isTypingIn({ ...row, typingAt: null }, 'room:r1', NOW)).toBe(false)
    expect(isTypingIn(null, 'room:r1', NOW)).toBe(false)
  })
})

describe('chatAttachmentFromPayload', () => {
  it('parses a valid payload and rejects junk', () => {
    const good = { key: 'rooms/r1/chat/ab-file.pdf', name: 'file.pdf', mimeType: 'application/pdf', size: 1234 }
    expect(chatAttachmentFromPayload(good)).toEqual(good)
    expect(chatAttachmentFromPayload(null)).toBeNull()
    expect(chatAttachmentFromPayload('x')).toBeNull()
    expect(chatAttachmentFromPayload({ key: 'k', name: 'n' })).toBeNull()
    expect(chatAttachmentFromPayload({ ...good, size: '1234' })).toBeNull()
  })
})

describe('findOrphanedChatKeys', () => {
  const CUTOFF = new Date('2026-07-13T00:00:00Z')
  const OLD = new Date('2026-07-10T00:00:00Z')
  const FRESH = new Date('2026-07-13T05:00:00Z') // newer than the cutoff — in-flight composer

  it('deletes only old, unreferenced /chat/ keys', () => {
    const orphans = findOrphanedChatKeys({
      objects: [
        { key: 'rooms/r1/chat/a-orphan.pdf', lastModified: OLD }, // ← the one true orphan
        { key: 'rooms/r1/chat/b-sent.pdf', lastModified: OLD }, // referenced
        { key: 'dms/c1/chat/c-fresh.png', lastModified: FRESH }, // too fresh (in-flight composer)
        { key: 'rooms/r1/labels/o1/proof/x.svg', lastModified: OLD }, // NOT chat — label proof
        { key: 'rooms/r1/chat/d-unknown-age.pdf', lastModified: null }, // unknown age — skipped
      ],
      referencedKeys: ['rooms/r1/chat/b-sent.pdf'],
      cutoff: CUTOFF,
    })
    expect(orphans).toEqual(['rooms/r1/chat/a-orphan.pdf'])
  })

  it('handles dm keys and an exactly-at-cutoff object (kept)', () => {
    const orphans = findOrphanedChatKeys({
      objects: [
        { key: 'dms/c1/chat/e-orphan.gif', lastModified: OLD },
        { key: 'dms/c1/chat/f-at-cutoff.gif', lastModified: CUTOFF },
      ],
      referencedKeys: new Set<string>(),
      cutoff: CUTOFF,
    })
    expect(orphans).toEqual(['dms/c1/chat/e-orphan.gif'])
  })
})
