// Local-filesystem storage fallback for LOCAL DEV ONLY.
//
// When R2 credentials are absent (a fresh clone / no dev bucket), every storage
// path — brand logos, canvas uploads, die-line SVGs, label proofs — would
// otherwise throw at getR2Config(). This fallback writes to a gitignored
// `.dev-storage/` at the repo root and serves reads as `data:` URLs, so the
// whole app is exercisable without any cloud credentials.
//
// SAFE BY CONSTRUCTION: activates ONLY when R2 creds are missing. With R2
// configured (all real environments), isDevFsMode() is false and upload.ts /
// signed-url.ts behave exactly as before — zero production impact.

import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

/** True when R2 creds are absent → use the local-fs fallback (dev only). */
export function isDevFsMode(): boolean {
  return (
    !process.env.R2_ACCOUNT_ID ||
    !process.env.R2_ACCESS_KEY_ID ||
    !process.env.R2_SECRET_ACCESS_KEY
  )
}

/** Walk up from cwd to the workspace root (stable across app/script cwds). */
function repoRoot(): string {
  let dir = process.cwd()
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

function devStorageRoot(): string {
  return process.env.DEV_STORAGE_DIR ?? path.join(repoRoot(), '.dev-storage')
}

export async function devFsWrite(key: string, body: Buffer | Uint8Array): Promise<void> {
  const full = path.join(devStorageRoot(), key)
  await mkdir(path.dirname(full), { recursive: true })
  await writeFile(full, body)
}

export async function devFsDelete(key: string): Promise<void> {
  await rm(path.join(devStorageRoot(), key), { force: true })
}

const CONTENT_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
}

/** Read a locally-stored object as a `data:` URL (browser- + node-fetchable). */
export async function devFsReadDataUrl(key: string): Promise<string> {
  const buf = await readFile(path.join(devStorageRoot(), key))
  const ct = CONTENT_TYPES[path.extname(key).toLowerCase()] ?? 'application/octet-stream'
  return `data:${ct};base64,${buf.toString('base64')}`
}
