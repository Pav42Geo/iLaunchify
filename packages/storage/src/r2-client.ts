// R2 client factory. Lazy + memoized so missing env doesn't crash on import
// in non-storage code paths.

import { S3Client } from '@aws-sdk/client-s3'

interface R2Config {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  endpoint: string
  // True when pointing at an S3-compatible store like MinIO (local dev).
  // MinIO needs path-style URLs (http://host:9000/bucket/key); R2 does not.
  forcePathStyle: boolean
}

let cachedClient: S3Client | null = null
let cachedConfig: R2Config | null = null

export function getR2Config(): R2Config {
  if (cachedConfig) return cachedConfig

  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  // Optional override: point the S3 client at any S3-compatible endpoint
  // (e.g. local MinIO at http://localhost:9000). When unset, the endpoint is
  // derived from R2_ACCOUNT_ID as before (real Cloudflare R2).
  const endpointOverride = process.env.R2_ENDPOINT

  const missing: string[] = []
  if (!accountId && !endpointOverride) missing.push('R2_ACCOUNT_ID (or R2_ENDPOINT)')
  if (!accessKeyId) missing.push('R2_ACCESS_KEY_ID')
  if (!secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY')
  if (!bucket) missing.push('R2_BUCKET')

  if (missing.length > 0) {
    throw new Error(
      `[storage] missing required env vars: ${missing.join(', ')}. ` +
        'See packages/storage/src/index.ts for setup instructions.',
    )
  }

  cachedConfig = {
    accountId: accountId ?? 'local',
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    bucket: bucket!,
    // R2 endpoint format — see https://developers.cloudflare.com/r2/api/s3/api/
    endpoint: endpointOverride ?? `https://${accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: Boolean(endpointOverride),
  }
  return cachedConfig
}

export function getR2Client(): S3Client {
  if (cachedClient) return cachedClient
  const cfg = getR2Config()
  cachedClient = new S3Client({
    region: 'auto', // R2 requires this literal (MinIO accepts any region)
    endpoint: cfg.endpoint,
    forcePathStyle: cfg.forcePathStyle,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  })
  return cachedClient
}
