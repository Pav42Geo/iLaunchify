'use server'

// Test-connection probes for the integrations control center (docs/INTEGRATIONS.md).
//
// Each probe makes a READ-ONLY call to the vendor using the already-configured
// env var, and returns ONLY a status (ok / http code / latency). It never returns,
// logs, or echoes the secret value. platform:admin only. No money, no writes.

import { requireCapability } from '@ilaunchify/auth'
import { markIntegrationRotated, setIntegrationCadence } from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
import { INTEGRATIONS } from './integration-registry'

export interface TestResult {
  ok: boolean
  message: string
  latencyMs?: number
}

type ActionResult = { ok: true } | { ok: false; error: string }

function isKnownKey(key: string): boolean {
  return INTEGRATIONS.some((i) => i.key === key)
}

/** Record that the admin just rotated this integration's key (stamps now). */
export async function recordRotation(input: { key: string }): Promise<ActionResult> {
  const actor = await requireCapability('platform:admin')
  if (!isKnownKey(input.key)) return { ok: false, error: 'Unknown integration.' }
  await markIntegrationRotated(input.key)
  await logAuditAs(actor, {
    entityType: 'IntegrationMeta',
    entityId: input.key,
    action: 'INTEGRATION_KEY_ROTATED',
  })
  revalidatePath('/integrations')
  return { ok: true }
}

/** Override the suggested rotation cadence (days). 0 / null clears the override. */
export async function setRotationCadence(input: { key: string; days: number | null }): Promise<ActionResult> {
  const actor = await requireCapability('platform:admin')
  if (!isKnownKey(input.key)) return { ok: false, error: 'Unknown integration.' }
  const days = input.days && input.days > 0 ? Math.round(input.days) : null
  await setIntegrationCadence(input.key, days)
  await logAuditAs(actor, {
    entityType: 'IntegrationMeta',
    entityId: input.key,
    action: 'INTEGRATION_CADENCE_SET',
    toValue: days != null ? `${days}d` : 'cleared',
  })
  revalidatePath('/integrations')
  return { ok: true }
}

const TIMEOUT_MS = 8000

/** Read-only GET with a timeout; classifies the response without leaking secrets. */
async function probe(
  url: string,
  init: RequestInit,
  okWhen: (status: number) => boolean = (s) => s >= 200 && s < 300,
): Promise<TestResult> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  const started = Date.now()
  try {
    const res = await fetch(url, { ...init, method: init.method ?? 'GET', signal: ctrl.signal, cache: 'no-store' })
    const latencyMs = Date.now() - started
    if (okWhen(res.status)) return { ok: true, message: `Connected (HTTP ${res.status})`, latencyMs }
    if (res.status === 401 || res.status === 403) return { ok: false, message: `Key rejected (HTTP ${res.status})`, latencyMs }
    return { ok: false, message: `Unexpected response (HTTP ${res.status})`, latencyMs }
  } catch (err) {
    const e = err as Error
    return { ok: false, message: e.name === 'AbortError' ? `Timed out after ${TIMEOUT_MS / 1000}s` : `Unreachable: ${e.message}` }
  } finally {
    clearTimeout(t)
  }
}

function need(name: string): string | null {
  const v = process.env[name]
  return v && v !== '' ? v : null
}

const PROBES: Record<string, () => Promise<TestResult>> = {
  // Read-only: validates the secret without touching money.
  stripe: async () => {
    const key = need('STRIPE_SECRET_KEY')
    if (!key) return { ok: false, message: 'STRIPE_SECRET_KEY not set' }
    return probe('https://api.stripe.com/v1/balance', { headers: { Authorization: `Bearer ${key}` } })
  },
  // GET /domains is a read-only auth check.
  resend: async () => {
    const key = need('AUTH_RESEND_KEY')
    if (!key) return { ok: false, message: 'AUTH_RESEND_KEY not set' }
    return probe('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${key}` } })
  },
  // Tiny search; free + read-only.
  'usda-fdc': async () => {
    const key = need('USDA_FDC_API_KEY')
    if (!key) return { ok: false, message: 'USDA_FDC_API_KEY not set' }
    return probe(`https://api.nal.usda.gov/fdc/v1/foods/search?query=apple&pageSize=1&api_key=${encodeURIComponent(key)}`, {})
  },
  // GET /v1/models is free + read-only.
  anthropic: async () => {
    const key = need('ANTHROPIC_API_KEY')
    if (!key) return { ok: false, message: 'ANTHROPIC_API_KEY not set' }
    return probe('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    })
  },
  // Internal service health endpoint (bearer-authenticated).
  'compliance-service': async () => {
    const base = need('COMPLIANCE_SERVICE_URL')
    const token = need('COMPLIANCE_SERVICE_TOKEN')
    if (!base) return { ok: false, message: 'COMPLIANCE_SERVICE_URL not set' }
    const url = `${base.replace(/\/$/, '')}/health`
    return probe(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {})
  },
}

export async function testIntegration(key: string): Promise<TestResult> {
  await requireCapability('platform:admin')
  const fn = PROBES[key]
  if (!fn) return { ok: false, message: 'No test available for this integration.' }
  return fn()
}
