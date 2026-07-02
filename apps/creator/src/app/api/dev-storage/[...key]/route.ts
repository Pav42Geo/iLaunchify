// DEV-ONLY asset reads for the local-disk storage fallback (@ilaunchify/storage
// ./local — active when R2 env keys are absent in development). Streams files
// from `.dev-storage/<key>` with the content type recorded at upload time.
// Hard-404s in production and whenever real R2 is configured.

import { NextResponse } from 'next/server'
import { isLocalStorageMode, readFileLocal } from '@ilaunchify/storage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  if (process.env.NODE_ENV === 'production' || !isLocalStorageMode()) {
    return new NextResponse('Not found', { status: 404 })
  }
  const { key } = await params
  const joined = key.map((s) => decodeURIComponent(s)).join('/')
  // readFileLocal path-traversal-guards the key against the storage dir.
  const file = await readFileLocal(joined).catch(() => null)
  if (!file) return new NextResponse('Not found', { status: 404 })
  return new NextResponse(new Uint8Array(file.body), {
    status: 200,
    headers: {
      'Content-Type': file.contentType,
      'Cache-Control': 'private, max-age=60',
    },
  })
}
