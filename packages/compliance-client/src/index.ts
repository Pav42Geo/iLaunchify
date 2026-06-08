// Typed client for the Python compliance service.
//
// Used by:
//   apps/creator    — runs compliance check during template customization
//   apps/admin      — runs ad-hoc checks for QA
//
// Auth (docs/SECURITY_ARCHITECTURE.md Tier 0.4, LOCKED 2026-06-05): every
// /v1 call carries `Authorization: Bearer ${COMPLIANCE_SERVICE_TOKEN}`. The
// service refuses unauthenticated /v1 traffic outside development, and this
// client fails closed in production if the token is missing — a misconfigured
// deploy should error loudly, not silently call an open service.

import { ComplianceResultSchema, type ComplianceResult } from '@ilaunchify/types'

export class ComplianceClient {
  constructor(
    private baseUrl: string = process.env.COMPLIANCE_SERVICE_URL ?? 'http://localhost:8000',
    private token: string | undefined = process.env.COMPLIANCE_SERVICE_TOKEN,
  ) {}

  /** Shared headers for /v1 calls. Throws in production when the token is absent. */
  private authHeaders(): Record<string, string> {
    if (!this.token) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'COMPLIANCE_SERVICE_TOKEN is not set — refusing to call the compliance service unauthenticated in production.',
        )
      }
      return { 'content-type': 'application/json' }
    }
    return {
      'content-type': 'application/json',
      authorization: `Bearer ${this.token}`,
    }
  }

  async checkRecipe(params: {
    recipeId: string
    rulePackId: string
    triggeredByUserId?: string
  }): Promise<ComplianceResult> {
    const res = await fetch(`${this.baseUrl}/v1/compliance/check`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(params),
    })
    if (!res.ok) {
      throw new Error(`Compliance check failed: ${res.status} ${await res.text()}`)
    }
    const json = await res.json()
    return ComplianceResultSchema.parse(json)
  }

  async renderLabel(params: {
    recipeId: string
    rulePackId: string
    format: 'PDF' | 'SVG'
  }): Promise<Blob> {
    const res = await fetch(`${this.baseUrl}/v1/labels/render`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(params),
    })
    if (!res.ok) {
      throw new Error(`Label render failed: ${res.status} ${await res.text()}`)
    }
    return res.blob()
  }

  async healthz(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/healthz`)
      return res.ok
    } catch {
      return false
    }
  }
}
