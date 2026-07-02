// Local-disk DEV fallback (Pavel 2026-07-02) — lets the whole asset pipeline
// (brand logos, canvas images, generated art) work with NO Cloudflare R2 keys.
//
// Active only when R2 env is NOT configured AND NODE_ENV !== 'production':
//   • uploads land in `.dev-storage/<key>` at the repo root (gitignored)
//   • reads are served by the creator app's /api/dev-storage/[...key] route
// The moment the R2 vars appear in .env.local, R2 takes over automatically —
// no code change, and production ALWAYS requires R2 (missing keys still throw).

import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

/** All four R2 vars present → real R2 is used. */
export function isR2Configured(env: Record<string, string | undefined> = process.env): boolean {
  return !!(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET)
}

/** Local fallback allowed? Never in production — prod must fail loudly. */
export function isLocalStorageMode(): boolean {
  return !isR2Configured() && process.env.NODE_ENV !== 'production'
}

/** Repo root: walk up from cwd (an app dir under turbo) to pnpm-workspace.yaml. */
function repoRoot(): string {
  let dir = process.cwd()
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

export function localStorageDir(): string {
  return process.env.DEV_STORAGE_DIR ?? path.join(repoRoot(), '.dev-storage')
}

/** Absolute file path for a key, guarded against path traversal. */
export function localFilePath(key: string): string {
  const base = localStorageDir()
  const abs = path.resolve(base, key)
  if (!abs.startsWith(path.resolve(base) + path.sep)) {
    throw new Error(`[storage] invalid key (path traversal): ${key}`)
  }
  return abs
}

export async function uploadFileLocal(input: {
  key: string
  body: Buffer | Uint8Array
  contentType: string
}): Promise<{ key: string; bucket: string; sizeBytes: number; etag: string | null }> {
  const filePath = localFilePath(input.key)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, input.body)
  // Sidecar records the content type for the dev read route.
  await writeFile(`${filePath}.meta.json`, JSON.stringify({ contentType: input.contentType }))
  return { key: input.key, bucket: 'dev-local', sizeBytes: input.body.byteLength, etag: null }
}

export async function deleteFileLocal(key: string): Promise<void> {
  const filePath = localFilePath(key)
  await unlink(filePath).catch(() => {})
  await unlink(`${filePath}.meta.json`).catch(() => {})
}

export async function readFileLocal(key: string): Promise<{ body: Buffer; contentType: string } | null> {
  const filePath = localFilePath(key)
  try {
    const body = await readFile(filePath)
    let contentType = 'application/octet-stream'
    try {
      const meta = JSON.parse(await readFile(`${filePath}.meta.json`, 'utf8')) as { contentType?: string }
      if (meta.contentType) contentType = meta.contentType
    } catch {
      /* no sidecar — generic type */
    }
    return { body, contentType }
  } catch {
    return null
  }
}

/** Dev "signed URL": the creator app's dev-storage route (same-origin for the
 *  Studio; other apps reach it absolutely via the creator origin). */
export function localReadUrl(key: string): string {
  const base = process.env.NEXT_PUBLIC_CREATOR_URL ?? 'http://localhost:3000'
  const encoded = key.split('/').map(encodeURIComponent).join('/')
  return `${base}/api/dev-storage/${encoded}`
}
