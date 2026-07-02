// Generate a short-lived signed URL for reading a file from R2.
// Use this when serving file previews/downloads — never expose raw bucket URLs.

import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getR2Client, getR2Config } from './r2-client'

export async function getSignedReadUrl(
  key: string,
  options: { expiresInSeconds?: number } = {},
): Promise<string> {
  const cfg = getR2Config()
  const client = getR2Client()
  const command = new GetObjectCommand({ Bucket: cfg.bucket, Key: key })
  return getSignedUrl(client, command, {
    expiresIn: options.expiresInSeconds ?? 300, // 5 min default
  })
}
