// Channel token vault + OAuth handshake state (Track B1,
// docs/SHOP_CONNECT_E2E_2026-07-24.md §5). Server-only DB plumbing around the
// pure crypto in @ilaunchify/channels/secret-box.
//
// Vault rules:
//   - Plaintext tokens NEVER touch the database or logs. Rows hold the sealed
//     AES-256-GCM envelope only; the key is CHANNEL_TOKEN_KEY (env, presence
//     surfaced in the admin Integrations registry as 'channel-vault').
//   - The "ref" stored on ChannelConnection.accessTokenRef / refreshTokenRef /
//     webhookSecretRef is the ChannelSecret row id. Refresh flows ROTATE the
//     sealed value in place so refs on the connection row never churn.
//   - Every sealed value is AAD-bound to its kind: an access_token envelope
//     cannot be replayed as a webhook_secret even with DB write access.
//   - Auditing stays at the CALLER (connect/disconnect/refresh actions log
//     against the connection, same precedent as L3a logging against 'User').
//
// OAuth-state rules (CSRF + PKCE):
//   - issueOauthState() before redirecting to a marketplace consent screen;
//     consumeOauthState() in the callback. Single-use, 10-minute TTL, atomic
//     claim (updateMany on consumedAt: null) so a replayed callback loses.
//   - The PKCE verifier is stored SEALED with the same vault key.

import { prisma } from '@ilaunchify/db'
import {
  parseChannelTokenKey,
  sealSecret,
  openSecret,
  generateOauthState,
  generatePkcePair,
} from '@ilaunchify/channels/secret-box'

// ─────────────────────────────────────────────────────────────────────────────
// CHANNEL-B1-CAST: ChannelSecret + ChannelOauthState land with the next
// `pnpm db:push && pnpm db:generate` (schema §CHANNEL CONNECT B1). Until the
// client regenerates, go through this minimal structural cast: the runtime
// tables exist as soon as Pavel pushes; only the generated types lag. Drop the
// cast (import the models normally) after the push, like prior *-CAST markers.
// ─────────────────────────────────────────────────────────────────────────────
type SecretRow = { id: string; sealed: string; kind: string }
type OauthStateRow = {
  id: string
  state: string
  sealedVerifier: string | null
  creatorUserId: string
  channelId: string
  returnTo: string | null
  expiresAt: Date
  consumedAt: Date | null
}
const p = prisma as unknown as {
  channelSecret: {
    create: (a: { data: { sealed: string; kind: string; channelConnectionId?: string | null }; select: { id: true } }) => Promise<{ id: string }>
    findUnique: (a: { where: { id: string } }) => Promise<SecretRow | null>
    update: (a: { where: { id: string }; data: { sealed: string }; select: { id: true } }) => Promise<{ id: string }>
    updateMany: (a: { where: { id: string }; data: { channelConnectionId: string } }) => Promise<{ count: number }>
    deleteMany: (a: { where: { id?: { in: string[] }; channelConnectionId?: string } }) => Promise<{ count: number }>
  }
  channelOauthState: {
    create: (a: { data: { state: string; sealedVerifier: string | null; creatorUserId: string; channelId: string; returnTo: string | null; expiresAt: Date }; select: { id: true } }) => Promise<{ id: string }>
    findUnique: (a: { where: { state: string } }) => Promise<OauthStateRow | null>
    updateMany: (a: { where: { state: string; consumedAt: null; expiresAt: { gt: Date } }; data: { consumedAt: Date } }) => Promise<{ count: number }>
    deleteMany: (a: { where: { expiresAt: { lt: Date } } }) => Promise<{ count: number }>
  }
}

/** Sealed-secret kinds: doubles as the AAD binding (see module header). */
export type ChannelSecretKind = 'access_token' | 'refresh_token' | 'webhook_secret'

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes, per Track B1 spec
const STATE_CLEANUP_GRACE_MS = 24 * 60 * 60 * 1000 // sweep rows expired >1 day

let cachedKey: Buffer | null = null
function vaultKey(): Buffer {
  // Parsed once per process; parse throws loudly on a missing/short key.
  if (!cachedKey) cachedKey = parseChannelTokenKey(process.env.CHANNEL_TOKEN_KEY)
  return cachedKey
}

/** True when the vault can operate (key present + well-formed). For UI gating. */
export function channelVaultConfigured(): boolean {
  try {
    vaultKey()
    return true
  } catch {
    return false
  }
}

// ── Token vault ──────────────────────────────────────────────────────────────

/**
 * Seal + store a secret. Returns the ref to persist on the connection row.
 * `channelConnectionId` is optional because the connection row may not exist
 * yet mid-handshake; link it afterwards via linkSecretToConnection.
 */
export async function storeChannelSecret(input: {
  kind: ChannelSecretKind
  plaintext: string
  channelConnectionId?: string | null
}): Promise<string> {
  const sealed = sealSecret(input.plaintext, vaultKey(), { aad: input.kind })
  const row = await p.channelSecret.create({
    data: { sealed, kind: input.kind, channelConnectionId: input.channelConnectionId ?? null },
    select: { id: true },
  })
  return row.id
}

/**
 * Open a stored secret. Returns null for a missing ref (disconnected /
 * destroyed); THROWS on tamper or key mismatch: that is an incident, not a
 * soft-fail.
 */
export async function readChannelSecret(ref: string, kind: ChannelSecretKind): Promise<string | null> {
  const row = await p.channelSecret.findUnique({ where: { id: ref } })
  if (!row) return null
  return openSecret(row.sealed, vaultKey(), { aad: kind })
}

/**
 * Replace the sealed value in place (token refresh). The ref survives, so
 * ChannelConnection rows never churn on refresh. Returns false if the ref is
 * gone (e.g. disconnect raced the refresh cron: caller should stop).
 */
export async function rotateChannelSecret(ref: string, kind: ChannelSecretKind, newPlaintext: string): Promise<boolean> {
  const sealed = sealSecret(newPlaintext, vaultKey(), { aad: kind })
  try {
    await p.channelSecret.update({ where: { id: ref }, data: { sealed }, select: { id: true } })
    return true
  } catch {
    return false
  }
}

/** Attach a mid-handshake secret to its connection row once that row exists. */
export async function linkSecretToConnection(ref: string, channelConnectionId: string): Promise<void> {
  await p.channelSecret.updateMany({ where: { id: ref }, data: { channelConnectionId } })
}

/** Destroy specific secrets by ref (ignores refs that are already gone). */
export async function destroyChannelSecrets(refs: Array<string | null | undefined>): Promise<number> {
  const ids = refs.filter((r): r is string => typeof r === 'string' && r.length > 0)
  if (ids.length === 0) return 0
  const res = await p.channelSecret.deleteMany({ where: { id: { in: ids } } })
  return res.count
}

/**
 * Destroy EVERY secret linked to a connection: the disconnect path (creator
 * disconnect + adminDisconnectConnection both call this in Track B2 wiring).
 * History rows (orders, links, sync events) survive; tokens die.
 */
export async function destroyConnectionSecrets(channelConnectionId: string): Promise<number> {
  const res = await p.channelSecret.deleteMany({ where: { channelConnectionId } })
  return res.count
}

// ── OAuth handshake state ────────────────────────────────────────────────────

export interface IssuedOauthState {
  /** Round-trip through the marketplace `state` param; single-use. */
  state: string
  /** Present only when withPkce: send as code_challenge (+ S256 method). */
  codeChallenge: string | null
}

/** Issue the state (+ optional PKCE) for one outbound consent redirect. */
export async function issueOauthState(input: {
  creatorUserId: string
  channelId: string
  /** Relative path to land on after the callback (validated at consume). */
  returnTo?: string
  /** Etsy requires PKCE S256; others omit. */
  withPkce?: boolean
}): Promise<IssuedOauthState> {
  const state = generateOauthState()
  let sealedVerifier: string | null = null
  let codeChallenge: string | null = null
  if (input.withPkce) {
    const pair = generatePkcePair()
    sealedVerifier = sealSecret(pair.codeVerifier, vaultKey(), { aad: 'pkce_verifier' })
    codeChallenge = pair.codeChallenge
  }
  await p.channelOauthState.create({
    data: {
      state,
      sealedVerifier,
      creatorUserId: input.creatorUserId,
      channelId: input.channelId,
      returnTo: input.returnTo ?? null,
      expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
    },
    select: { id: true },
  })
  return { state, codeChallenge }
}

export interface ConsumedOauthState {
  creatorUserId: string
  channelId: string
  returnTo: string | null
  /** Opened PKCE verifier, for the token exchange. */
  codeVerifier: string | null
}

/**
 * Atomically claim a callback's state. Returns null when the state is unknown,
 * expired, or already consumed (CSRF / replay / stale tab): the callback
 * route should show a friendly "start the connection again" screen, never
 * proceed.
 */
export async function consumeOauthState(state: string): Promise<ConsumedOauthState | null> {
  if (!state || state.length > 128) return null
  const now = new Date()
  const claimed = await p.channelOauthState.updateMany({
    where: { state, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  })
  if (claimed.count !== 1) return null
  const row = await p.channelOauthState.findUnique({ where: { state } })
  if (!row) return null

  // Opportunistic sweep of long-expired rows; never blocks the handshake.
  p.channelOauthState
    .deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - STATE_CLEANUP_GRACE_MS) } } })
    .catch(() => {})

  // returnTo hygiene: relative paths only: an absolute URL here would be an
  // open-redirect vector through our own callback.
  const returnTo = row.returnTo && row.returnTo.startsWith('/') && !row.returnTo.startsWith('//') ? row.returnTo : null

  return {
    creatorUserId: row.creatorUserId,
    channelId: row.channelId,
    returnTo,
    codeVerifier: row.sealedVerifier ? openSecret(row.sealedVerifier, vaultKey(), { aad: 'pkce_verifier' }) : null,
  }
}

// ── Adapter token hydration (Phase C1) ───────────────────────────────────────

/** What a call site must select from ChannelConnection to hydrate tokens. */
export interface TokenRefFields {
  accessTokenRef?: string | null
  refreshTokenRef?: string | null
}

/**
 * Open a connection's sealed tokens for an adapter call. Stub-connected rows
 * (no refs, pre-C1) hydrate to the stub token so the dev pipeline keeps
 * working; a real adapter with a missing/unreadable ref surfaces as an auth
 * failure at the vendor, which the sync-event log makes visible.
 */
export async function hydrateConnectionTokens(conn: TokenRefFields): Promise<{ accessToken: string; refreshToken?: string }> {
  const accessToken = conn.accessTokenRef
    ? await readChannelSecret(conn.accessTokenRef, 'access_token').catch(() => null)
    : null
  const refreshToken = conn.refreshTokenRef
    ? await readChannelSecret(conn.refreshTokenRef, 'refresh_token').catch(() => null)
    : null
  return { accessToken: accessToken ?? 'stub', ...(refreshToken ? { refreshToken } : {}) }
}
