// Server-side R2 object listing + batch delete. Server actions / cron only.

import { ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3'
import { getR2Client, getR2Config } from './r2-client'

export interface ListedObject {
  key: string
  lastModified: Date | null
  sizeBytes: number
}

/**
 * List every object under a key prefix (paginated internally). `max` is a
 * safety valve for runaway prefixes — the caller gets the FIRST `max` keys
 * and should treat hitting it as "there is more".
 */
export async function listKeys(prefix: string, max = 10_000): Promise<ListedObject[]> {
  const cfg = getR2Config()
  const client = getR2Client()
  const out: ListedObject[] = []
  let token: string | undefined
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: cfg.bucket,
        Prefix: prefix,
        ContinuationToken: token,
        MaxKeys: Math.min(1000, max - out.length),
      }),
    )
    for (const o of res.Contents ?? []) {
      if (!o.Key) continue
      out.push({ key: o.Key, lastModified: o.LastModified ?? null, sizeBytes: o.Size ?? 0 })
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token && out.length < max)
  return out
}

/**
 * Batch delete by key (chunks of 1000 — the S3 API limit). Idempotent:
 * already-gone objects succeed. Returns how many delete results came back.
 */
export async function deleteFiles(keys: string[]): Promise<number> {
  if (keys.length === 0) return 0
  const cfg = getR2Config()
  const client = getR2Client()
  let deleted = 0
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000)
    const res = await client.send(
      new DeleteObjectsCommand({
        Bucket: cfg.bucket,
        Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
      }),
    )
    deleted += chunk.length - (res.Errors?.length ?? 0)
  }
  return deleted
}
