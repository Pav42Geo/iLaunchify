// Table-style pins for the pure Partner Access & Opportunity resolver —
// docs/PARTNER_ACCESS_ADMIN_CONTROLS_2026-07-14.md. Same throw-based convention
// as ownership.test.ts / turnstile.test.ts (no vitest import; runs anywhere).

import {
  resolveNamedReviewsAudience,
  resolvePartnerOpportunity,
  type AccessOverride,
  type AccessPolicy,
  type PartnerFacts,
} from './partner-opportunity'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`)
}

const policy: AccessPolicy = {
  publicProfilesEnabled: true,
  discoverabilityEnabled: true,
  defaultProfileVisibility: 'invited',
  namedReviewsAudience: 'paid',
  defaultProfileSharing: true,
  defaultBriefIntake: true,
  defaultDiscoverable: true,
  defaultPrintRotation: false,
  defaultSampleIntake: true,
}

const publicMfr: PartnerFacts = {
  status: 'ACTIVE',
  participationMode: 'PUBLIC',
  profilePublished: true,
  hasFullDisclosureNameable: true,
  isPurePrinter: false,
  onboardingComplete: true,
}

// master switch beats a per-partner ALLOW
{
  const off = { ...policy, publicProfilesEnabled: false }
  const allow: AccessOverride = { lever: 'PUBLIC_PROFILE', state: 'ALLOW' }
  const r = resolvePartnerOpportunity('PUBLIC_PROFILE', off, publicMfr, allow)
  assert(r.effective === false && r.source === 'master', 'master beats ALLOW')
}

// PUBLIC_PROFILE is ADMIN-governed, live-by-default: on once the partner is
// eligible (published + FULL-disclosure nameable service); admin can only
// restrict (DENY / master-off). Decoupled from participationMode.
{
  const on = resolvePartnerOpportunity('PUBLIC_PROFILE', policy, publicMfr)
  assert(on.effective === true && on.source === 'default', 'public profile on when eligible')

  const deny: AccessOverride = { lever: 'PUBLIC_PROFILE', state: 'DENY' }
  const restricted = resolvePartnerOpportunity('PUBLIC_PROFILE', policy, publicMfr, deny)
  assert(restricted.effective === false && restricted.source === 'override', 'admin DENY restricts')

  const notPublished: PartnerFacts = { ...publicMfr, profilePublished: false }
  const blocked = resolvePartnerOpportunity('PUBLIC_PROFILE', policy, notPublished)
  assert(
    blocked.effective === false && blocked.source === 'prerequisite',
    'blocked until content is published',
  )

  // Decoupled from "Open market" (Pavel 2026-07-15): an INVITED_ONLY partner that
  // is eligible + published still has a live public profile.
  const invitedOnly: PartnerFacts = { ...publicMfr, participationMode: 'INVITED_ONLY' }
  const stillLive = resolvePartnerOpportunity('PUBLIC_PROFILE', policy, invitedOnly)
  assert(
    stillLive.effective === true,
    'invited-only does not hide the profile (decoupled from participationMode)',
  )
}

// override DENY forces a default-on lever off
{
  const deny: AccessOverride = { lever: 'BRIEF_INTAKE', state: 'DENY' }
  const r = resolvePartnerOpportunity('BRIEF_INTAKE', policy, publicMfr, deny)
  assert(r.effective === false && r.source === 'override', 'DENY forces off')
}

// expired override falls back to the default
{
  const expired: AccessOverride = {
    lever: 'BRIEF_INTAKE',
    state: 'DENY',
    expiresAt: new Date('2020-01-01'),
  }
  const r = resolvePartnerOpportunity('BRIEF_INTAKE', policy, publicMfr, expired)
  assert(r.effective === true && r.source === 'default', 'expired override → default')
}

// prerequisite can only subtract — print rotation blocked for non-printers
{
  const allow: AccessOverride = { lever: 'PRINT_ROTATION', state: 'ALLOW' }
  const r = resolvePartnerOpportunity('PRINT_ROTATION', policy, publicMfr, allow)
  assert(r.effective === false && r.source === 'prerequisite', 'rotation blocked for non-printer')
  assert(/pure print/i.test(r.blockedReason ?? ''), 'blockedReason names the rule')
}

// print rotation allowed for a pure printer that is active
{
  const printer: PartnerFacts = { ...publicMfr, isPurePrinter: true }
  const allow: AccessOverride = { lever: 'PRINT_ROTATION', state: 'ALLOW' }
  const r = resolvePartnerOpportunity('PRINT_ROTATION', policy, printer, allow)
  assert(r.effective === true && r.source === 'override', 'rotation ok for pure printer')
}

// sharing blocked when the public profile is not live (not published here; the
// live signal no longer includes participationMode)
{
  const notLive: PartnerFacts = { ...publicMfr, profilePublished: false }
  const r = resolvePartnerOpportunity('PROFILE_SHARING', policy, notLive)
  assert(r.effective === false && r.source === 'prerequisite', 'no share without live public profile')
}

// named-reviews audience: default / DENY / ALLOW-value
{
  assert(resolveNamedReviewsAudience(policy) === 'paid', 'audience defaults to policy')
  const deny: AccessOverride = { lever: 'NAMED_REVIEWS', state: 'DENY' }
  assert(resolveNamedReviewsAudience(policy, deny) === 'anonymous', 'DENY → anonymous')
  const allow: AccessOverride = { lever: 'NAMED_REVIEWS', state: 'ALLOW', value: 'any' }
  assert(resolveNamedReviewsAudience(policy, allow) === 'any', 'ALLOW value overrides')
}

// eslint-disable-next-line no-console
console.log('partner-opportunity: all pins passed')
