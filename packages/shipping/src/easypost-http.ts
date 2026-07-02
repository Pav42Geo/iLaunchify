/**
 * Phase L2 — runtime EasyPostHttp implementation (fetch-based, server-only).
 * Kept out of gateway.ts so unit tests stay network-free. API key comes from
 * env at the call site (EASYPOST_API_KEY) — never from the DB.
 */

import type { EasyPostHttp } from './gateway'

const BASE = 'https://api.easypost.com'

export function createFetchEasyPostHttp(): EasyPostHttp {
  return {
    async request(method, path, body, apiKey) {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        ...(method === 'POST' && body !== undefined ? { body: JSON.stringify(body) } : {}),
      })
      const json: unknown = await res.json().catch(() => null)
      if (!res.ok) {
        const msg =
          typeof json === 'object' && json !== null && 'error' in json
            ? JSON.stringify((json as { error: unknown }).error)
            : `HTTP ${res.status}`
        throw new Error(`EasyPost ${method} ${path} failed: ${msg}`)
      }
      return json
    },
  }
}
