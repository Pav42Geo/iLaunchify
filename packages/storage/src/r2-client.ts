// R2 client factory. Lazy + memoized so missing env doesn't crash on import
// in non-storage code paths.

import { S3Client } from '@aws-sdk/client-s3'

interface R2Config {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  endpoint: string
}

let cachedClient: S3Client | null = null
let cachedConfig: R2Config | null = null

export function getR2Config(): R2Config {
  if (cachedConfig) return cachedConfig

  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET

  const missing: string[] = []
  if (!accountId) missing.push('R2_ACCOUNT_ID')
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
    accountId: accountId!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    bucket: bucket!,
    // R2 endpoint format — see https://developers.cloudflare.com/r2/api/s3/api/
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  }
  return cachedConfig
}

export function getR2Client(): S3Client {
  if (cachedClient) return cachedClient
  const cfg = getR2Config()
  cachedClient = new S3Client({
    region: 'auto', // R2 requires this literal
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  })
  return cachedClient
}
