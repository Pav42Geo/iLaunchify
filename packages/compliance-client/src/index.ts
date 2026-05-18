// Typed client for the Python compliance service.
//
// Used by:
//   apps/creator    — runs compliance check during recipe editing
//   apps/storefront — fetches panel data for product detail page
//   apps/admin      — runs ad-hoc checks for QA

import { ComplianceResultSchema, type ComplianceResult } from '@ilaunchify/types'

export class ComplianceClient {
  constructor(
    private baseUrl: string = process.env.COMPLIANCE_SERVICE_URL ?? 'http://localhost:8000',
  ) {}

  async checkRecipe(params: {
    recipeId: string
    rulePackId: string
    triggeredByUserId?: string
  }): Promise<ComplianceResult> {
    const res = await fetch(`${this.baseUrl}/v1/compliance/check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
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
