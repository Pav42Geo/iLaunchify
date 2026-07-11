// Pure auth-header construction for the compliance-service client, extracted so the
// FAIL-CLOSED security behavior (docs/SECURITY_ARCHITECTURE.md Tier 0.4, LOCKED) is
// unit-testable without a network call (H4 — packages/compliance-client had 0 tests).
//
// Contract: every /v1 call carries `Authorization: Bearer <token>`. In production a
// missing token THROWS (a misconfigured deploy must error loudly, never silently
// call an open service). Outside production, a missing token is allowed (local dev
// against an unauthenticated service).

export function buildComplianceAuthHeaders(args: {
  token: string | undefined
  isProd: boolean
}): Record<string, string> {
  const { token, isProd } = args
  if (!token) {
    if (isProd) {
      throw new Error(
        'COMPLIANCE_SERVICE_TOKEN is not set — refusing to call the compliance service unauthenticated in production.',
      )
    }
    return { 'content-type': 'application/json' }
  }
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
  }
}
