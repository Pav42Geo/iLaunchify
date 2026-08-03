// Secret box: the pure crypto core of the channel token vault (Track B1,
// docs/SHOP_CONNECT_E2E_2026-07-24.md §5). Seals marketplace OAuth tokens with
// AES-256-GCM before they touch the database; the key lives ONLY in the
// CHANNEL_TOKEN_KEY env var (see .env.example + the admin Integrations
// registry row 'channel-vault'). DB plumbing lives in the creator app
// (channels/vault.ts); this module is dependency-free crypto + PKCE/state
// helpers so the goldens run in the pure vitest runner.
//
// ⚠ SERVER-ONLY: imports node:crypto. Deliberately NOT exported from the
// package barrel (src/index.ts): a client-component import chain that touches
// node:crypto breaks the Next webpack build (see packages/auth/src/index.ts
// history). Import via the subpath: `@ilaunchify/channels/secret-box`
// (same pattern as @ilaunchify/orders subpath exports).
//
// Sealed format (versioned for key/format agility):
//   v1.<base64 iv (12B)>.<base64 authTag (16B)>.<base64 ciphertext>
// GCM authenticates ciphertext + the optional AAD, so any tamper (bit flip,
// swapped segments, wrong key) throws on open: never returns garbage.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ALG = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16
const VERSION = 'v1'

// ── Key handling ─────────────────────────────────────────────────────────────

/**
 * Parse CHANNEL_TOKEN_KEY into a 32-byte key. Accepts 64 hex chars
 * (openssl rand -hex 32) or base64 of 32 bytes. Throws a descriptive error on
 * anything else so a misconfigured env fails loudly at first use, not with
 * silent bad crypto.
 */
export function parseChannelTokenKey(raw: string | undefined | null): Buffer {
  const value = (raw ?? '').trim()
  if (!value) {
    throw new Error(
      'CHANNEL_TOKEN_KEY is not set. Generate one with `openssl rand -hex 32` and add it to .env.local (see .env.example).',
    )
  }
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, 'hex')
  // Base64 fallback (44 chars with padding for 32 bytes).
  try {
    const buf = Buffer.from(value, 'base64')
    if (buf.length === 32) return buf
  } catch {
    // fall through to the error below
  }
  throw new Error('CHANNEL_TOKEN_KEY must be 32 bytes: 64 hex chars or base64. Generate: `openssl rand -hex 32`.')
}

// ── Seal / open ──────────────────────────────────────────────────────────────

export interface SealOptions {
  /**
   * Additional authenticated data: bound into the GCM tag without being
   * stored. Pass the same value on open or the open throws. Used to bind a
   * sealed secret to its row kind so ciphertexts can't be swapped between
   * columns.
   */
  aad?: string
  /** Test-only IV injection for deterministic goldens. NEVER pass in prod. */
  ivForTests?: Buffer
}

/** Encrypt a plaintext secret → the versioned sealed string stored in the DB. */
export function sealSecret(plaintext: string, key: Buffer, opts: SealOptions = {}): string {
  if (key.length !== 32) throw new Error('sealSecret: key must be 32 bytes')
  const iv = opts.ivForTests ?? randomBytes(IV_BYTES)
  if (iv.length !== IV_BYTES) throw new Error(`sealSecret: iv must be ${IV_BYTES} bytes`)
  const cipher = createCipheriv(ALG, key, iv)
  if (opts.aad) cipher.setAAD(Buffer.from(opts.aad, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.')
}

/** Decrypt a sealed string. Throws on tamper, wrong key, wrong AAD, bad format. */
export function openSecret(sealed: string, key: Buffer, opts: Pick<SealOptions, 'aad'> = {}): string {
  if (key.length !== 32) throw new Error('openSecret: key must be 32 bytes')
  const parts = sealed.split('.')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('openSecret: unrecognized sealed format (expected v1.iv.tag.ciphertext)')
  }
  const iv = Buffer.from(parts[1] as string, 'base64')
  const tag = Buffer.from(parts[2] as string, 'base64')
  const ciphertext = Buffer.from(parts[3] as string, 'base64')
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('openSecret: malformed iv/tag segment')
  }
  const decipher = createDecipheriv(ALG, key, iv)
  decipher.setAuthTag(tag)
  if (opts.aad) decipher.setAAD(Buffer.from(opts.aad, 'utf8'))
  // GCM verifies the tag inside final(); tampering throws here.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

// ── OAuth handshake material ─────────────────────────────────────────────────

/** CSRF `state` token for the OAuth redirect: 32 random bytes, base64url (43 chars). */
export function generateOauthState(): string {
  return randomBytes(32).toString('base64url')
}

export interface PkcePair {
  codeVerifier: string
  codeChallenge: string
  codeChallengeMethod: 'S256'
}

/**
 * RFC 7636 S256 challenge for a given verifier. Split out (and exported) so
 * the RFC test vector can pin the transform.
 */
export function pkceChallengeFromVerifier(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier, 'ascii').digest('base64url')
}

/**
 * PKCE pair for channels that require it (Etsy mandates S256). Verifier:
 * 48 random bytes → 64 base64url chars, inside RFC 7636's 43–128 unreserved
 * character window.
 */
export function generatePkcePair(): PkcePair {
  const codeVerifier = randomBytes(48).toString('base64url')
  return { codeVerifier, codeChallenge: pkceChallengeFromVerifier(codeVerifier), codeChallengeMethod: 'S256' }
}
