// Table-driven tests for the pure ownership decision logic —
// docs/SECURITY_ARCHITECTURE.md Tier 1.1 (LOCKED 2026-06-05).
//
// Same convention as partner-fsm.test.ts / suggestNiches.test.ts: throw-based
// scenarios with a runAll() aggregator, no hard vitest import, so this
// type-checks under `tsc --noEmit` today and plugs into vitest later.
//
// Why this matters: tenant isolation is threat #1. These tables pin the exact
// allow/deny matrix so a refactor can't silently widen access.

import {
  decidePartnerActor,
  decideTemplateAccess,
  type TemplateAccessReason,
} from './ownership-rules'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

// ---- 1. Partner actor matrix --------------------------------------------------

export const scenarioPartnerActorMatrix = () => {
  const cases: Array<{
    role: string
    hasPartnerRow: boolean
    expect: 'allow' | 'NOT_A_PARTNER' | 'PARTNER_NOT_FOUND'
  }> = [
    { role: 'PARTNER', hasPartnerRow: true, expect: 'allow' },
    { role: 'PARTNER', hasPartnerRow: false, expect: 'PARTNER_NOT_FOUND' },
    { role: 'CREATOR', hasPartnerRow: true, expect: 'NOT_A_PARTNER' },
    { role: 'CREATOR', hasPartnerRow: false, expect: 'NOT_A_PARTNER' },
    // Admin does NOT get implicit partner access — admin surfaces use their
    // own requireRole('ADMIN') paths. Cross-role bleed is exactly the bug class
    // this guard exists to prevent.
    { role: 'ADMIN', hasPartnerRow: true, expect: 'NOT_A_PARTNER' },
    { role: 'ADMIN', hasPartnerRow: false, expect: 'NOT_A_PARTNER' },
  ]
  for (const c of cases) {
    const d = decidePartnerActor({ role: c.role, hasPartnerRow: c.hasPartnerRow })
    const got = d.allowed ? 'allow' : d.reason
    assert(got === c.expect, `actor(${c.role},row=${c.hasPartnerRow}): got ${got}, want ${c.expect}`)
  }
  return true
}

// ---- 2. Template access matrix ------------------------------------------------

interface TemplateCase {
  name: string
  role: string
  requesterPartnerId: string | null
  exists: boolean
  status: string | null
  ownerPartnerId: string | null
  hasManufacturerService: boolean
  expect: 'allow' | TemplateAccessReason
}

const T: TemplateCase[] = [
  // The two cases that define tenant isolation:
  {
    name: 'owner edits own template',
    role: 'PARTNER', requesterPartnerId: 'p1',
    exists: true, status: 'DRAFT', ownerPartnerId: 'p1', hasManufacturerService: true,
    expect: 'allow',
  },
  {
    name: "competitor cannot touch another partner's template",
    role: 'PARTNER', requesterPartnerId: 'p2',
    exists: true, status: 'DRAFT', ownerPartnerId: 'p1', hasManufacturerService: true,
    expect: 'NOT_YOUR_TEMPLATE',
  },
  // Status + existence:
  {
    name: 'REJECTED is terminal even for the owner',
    role: 'PARTNER', requesterPartnerId: 'p1',
    exists: true, status: 'REJECTED', ownerPartnerId: 'p1', hasManufacturerService: true,
    expect: 'TEMPLATE_REJECTED',
  },
  {
    name: 'missing template',
    role: 'PARTNER', requesterPartnerId: 'p1',
    exists: false, status: null, ownerPartnerId: null, hasManufacturerService: false,
    expect: 'TEMPLATE_NOT_FOUND',
  },
  // Pre-routing draft (no manufacturerService yet) — historical semantics:
  {
    name: 'unrouted template is editable by a partner actor',
    role: 'PARTNER', requesterPartnerId: 'p1',
    exists: true, status: 'DRAFT', ownerPartnerId: null, hasManufacturerService: false,
    expect: 'allow',
  },
  // Role gates:
  {
    name: 'creator cannot use partner guard',
    role: 'CREATOR', requesterPartnerId: 'p1',
    exists: true, status: 'DRAFT', ownerPartnerId: 'p1', hasManufacturerService: true,
    expect: 'NOT_A_PARTNER',
  },
  {
    name: 'admin does not get implicit access via partner guard',
    role: 'ADMIN', requesterPartnerId: 'p1',
    exists: true, status: 'DRAFT', ownerPartnerId: 'p1', hasManufacturerService: true,
    expect: 'NOT_A_PARTNER',
  },
  {
    name: 'partner actor without partner row',
    role: 'PARTNER', requesterPartnerId: null,
    exists: true, status: 'DRAFT', ownerPartnerId: 'p1', hasManufacturerService: true,
    expect: 'PARTNER_NOT_FOUND',
  },
  // Defensive: service set but owner unresolvable (dangling FK) must DENY —
  // fail closed when ownership can't be proven.
  {
    name: 'dangling manufacturerService denies',
    role: 'PARTNER', requesterPartnerId: 'p1',
    exists: true, status: 'DRAFT', ownerPartnerId: null, hasManufacturerService: true,
    expect: 'NOT_YOUR_TEMPLATE',
  },
  // Check status ordering: rejection beats ownership mismatch? No — ownership
  // matrix: REJECTED check runs before ownership, so a competitor probing a
  // rejected template learns "rejected" not "not yours". Both deny; pin it.
  {
    name: 'competitor probing a REJECTED template still denied',
    role: 'PARTNER', requesterPartnerId: 'p2',
    exists: true, status: 'REJECTED', ownerPartnerId: 'p1', hasManufacturerService: true,
    expect: 'TEMPLATE_REJECTED',
  },
]

export const scenarioTemplateAccessMatrix = () => {
  for (const c of T) {
    const d = decideTemplateAccess({
      role: c.role,
      requesterPartnerId: c.requesterPartnerId,
      template: {
        exists: c.exists,
        status: c.status,
        ownerPartnerId: c.ownerPartnerId,
        hasManufacturerService: c.hasManufacturerService,
      },
    })
    const got = d.allowed ? 'allow' : d.reason
    assert(got === c.expect, `template[${c.name}]: got ${got}, want ${c.expect}`)
  }
  return true
}

// All scenarios — run via a manual runner to confirm locally:
//   import { runAll } from '@ilaunchify/auth/src/ownership.test'
export function runAll(): void {
  scenarioPartnerActorMatrix()
  scenarioTemplateAccessMatrix()
}
