// Server-side file upload to R2. Use this from server actions only —
// don't try to import this into a client component.

import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getR2Client, getR2Config } from './r2-client'

export interface UploadInput {
  key: string                       // generated via partnerFileKey() or similar
  body: Buffer | Uint8Array
  contentType: string               // e.g. 'application/pdf'
  // Optional cache-control + content-disposition (default: attachment + filename)
  cacheControl?: string
  contentDisposition?: string
}

export interface UploadResult {
  key: string
  bucket: string
  sizeBytes: number
  etag: string | null
}

export async function uploadFile(input: UploadInput): Promise<UploadResult> {
  const cfg = getR2Config()
  const client = getR2Client()

  const command = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: input.key,
    Body: input.body,
    ContentType: input.contentType,
    CacheControl: input.cacheControl ?? 'private, max-age=0',
    ContentDisposition: input.contentDisposition ?? 'attachment',
  })

  const response = await client.send(command)

  return {
    key: input.key,
    bucket: cfg.bucket,
    sizeBytes: input.body.byteLength,
    etag: response.ETag ?? null,
  }
}

/**
 * Delete a file by key. Idempotent — succeeds even if the object is already gone.
 */
export async function deleteFile(key: string): Promise<void> {
  const cfg = getR2Config()
  const client = getR2Client()
  await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }))
}
