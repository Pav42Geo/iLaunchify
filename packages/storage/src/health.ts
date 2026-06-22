// R2 connectivity health check — a read-only HeadBucket that validates the
// configured credentials + bucket without reading or returning any secret.
// Lives in the storage package because it owns the AWS SDK; the admin
// integrations control center calls it via @ilaunchify/storage.

import { HeadBucketCommand } from '@aws-sdk/client-s3'
import { getR2Client, getR2Config } from './r2-client'

export interface R2PingResult {
  ok: boolean
  message: string
  latencyMs?: number
}

const TIMEOUT_MS = 8000

/** HeadBucket the configured R2 bucket. Never returns the credentials. */
export async function pingR2(): Promise<R2PingResult> {
  let bucket: string
  try {
    bucket = getR2Config().bucket // throws if any R2_* env var is missing
  } catch (err) {
    return { ok: false, message: (err as Error).message.replace(/^\[storage\]\s*/, '') }
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  const started = Date.now()
  try {
    await getR2Client().send(new HeadBucketCommand({ Bucket: bucket }), { abortSignal: ctrl.signal })
    return { ok: true, message: 'Connected (bucket reachable)', latencyMs: Date.now() - started }
  } catch (err) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number }; message?: string }
    const status = e.$metadata?.httpStatusCode
    if (e.name === 'AbortError' || e.name === 'TimeoutError') return { ok: false, message: `Timed out after ${TIMEOUT_MS / 1000}s` }
    if (status === 403) return { ok: false, message: 'Access denied (credentials rejected)' }
    if (status === 404 || e.name === 'NoSuchBucket' || e.name === 'NotFound') return { ok: false, message: 'Bucket not found' }
    return { ok: false, message: `Unreachable: ${e.message ?? e.name ?? 'unknown error'}` }
  } finally {
    clearTimeout(timer)
  }
}
