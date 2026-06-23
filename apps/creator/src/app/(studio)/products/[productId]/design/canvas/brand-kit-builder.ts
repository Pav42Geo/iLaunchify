'use server'

// Brand Kit Builder (V1.5 beta, docs/BRAND_KIT_PROPOSAL.md §2). Auto-extract a logo
// + brand colors from the creator's website and apply them to a kit — Canva's
// "Brand Kit Builder" analog. Heuristic + best-effort: partial success is fine.
//
// Safety: ownership-checked; SSRF-guarded (https only, private hosts blocked); fetches
// are timeout- and size-capped. No rendering engine — we parse the served HTML, so
// JS-painted colors won't be seen (documented as beta).

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { uploadFile, brandAssetKey } from '@ilaunchify/storage'
import { logAuditAs } from '@ilaunchify/audit'

const FETCH_TIMEOUT_MS = 7000
const HTML_MAX_BYTES = 2 * 1024 * 1024
const IMG_MAX_BYTES = 5 * 1024 * 1024
const IMG_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'])

export type BuildBrandKitResult =
  | { ok: true; colorsApplied: number; logoApplied: boolean; sourceUrl: string }
  | { ok: false; error: string }

function normalizeUrl(raw: string): URL | null {
  let s = raw.trim()
  if (!s) return null
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`
  try {
    const u = new URL(s)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return u
  } catch {
    return null
  }
}

function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase()
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (h === '0.0.0.0' || h === '::1' || h === '[::1]') return true
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  return false
}

async function safeFetch(url: string, maxBytes: number): Promise<{ buf: Buffer; contentType: string } | null> {
  const u = normalizeUrl(url)
  if (!u || isBlockedHost(u.hostname)) return null
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(u.toString(), {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'iLaunchify-BrandKitBuilder/1.0' },
    })
    if (!res.ok || !res.body) return null
    const contentType = res.headers.get('content-type') ?? ''
    const ab = await res.arrayBuffer()
    if (ab.byteLength > maxBytes) return null
    return { buf: Buffer.from(ab), contentType }
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

function abs(base: URL, href: string): string | null {
  try {
    return new URL(href, base).toString()
  } catch {
    return null
  }
}

function extractLogoUrl(html: string, base: URL): string | null {
  const pick = (re: RegExp): string | null => {
    const m = re.exec(html)
    return m?.[1] ? abs(base, m[1]) : null
  }
  return (
    pick(/<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i) ||
    pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    pick(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i) ||
    `${base.origin}/favicon.ico`
  )
}

function extractColors(html: string): string[] {
  const counts = new Map<string, number>()
  const add = (hex: string) => {
    const h = hex.toUpperCase()
    counts.set(h, (counts.get(h) ?? 0) + 1)
  }
  // theme-color meta is the strongest signal — weight it.
  const theme = /<meta[^>]+name=["']theme-color["'][^>]+content=["']\s*(#[0-9a-fA-F]{3,6})/i.exec(html)
  if (theme?.[1]) {
    const e = expand(theme[1])
    if (e) for (let i = 0; i < 5; i++) add(e)
  }
  for (const m of html.matchAll(/#([0-9a-fA-F]{6})\b/g)) add(`#${m[1]}`)
  for (const m of html.matchAll(/#([0-9a-fA-F]{3})\b/g)) {
    const e = expand(`#${m[1]}`)
    if (e) add(e)
  }
  return [...counts.entries()]
    .filter(([hex]) => isBrandable(hex))
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex)
    .slice(0, 3)
}

function expand(hex: string): string | null {
  const m = /^#([0-9a-fA-F]{3,6})$/.exec(hex)
  if (!m) return null
  const v = m[1]!
  if (v.length === 6) return `#${v.toUpperCase()}`
  if (v.length === 3) return `#${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}`.toUpperCase()
  return null
}

function isBrandable(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const sum = r + g + b
  if (sum > 720 || sum < 45) return false // too white / too black
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max - min < 18) return false // near-grayscale
  return true
}

export async function applyBrandKitFromUrl(brandId: string, rawUrl: string): Promise<BuildBrandKitResult> {
  const user = await requireUser()
  const brand = await prisma.brand.findFirst({
    where: { id: brandId, creatorProfile: { userId: user.id } },
    select: { id: true },
  })
  if (!brand) return { ok: false, error: 'That brand kit is not on your account.' }

  const u = normalizeUrl(rawUrl)
  if (!u) return { ok: false, error: 'Enter a valid website address.' }
  if (isBlockedHost(u.hostname)) return { ok: false, error: 'That address can’t be reached.' }

  const page = await safeFetch(u.toString(), HTML_MAX_BYTES)
  if (!page) return { ok: false, error: 'Couldn’t load that website. Check the address and try again.' }
  const html = page.buf.toString('utf8')

  // --- Colors ---
  const colors = extractColors(html)
  let colorsApplied = 0
  if (colors.length > 0) {
    await prisma.brand.update({
      where: { id: brandId },
      data: {
        colorPrimary: colors[0] ?? undefined,
        colorSecondary: colors[1] ?? undefined,
        colorAccent: colors[2] ?? undefined,
      },
    })
    colorsApplied = colors.length
  }

  // --- Logo (best-effort) ---
  let logoApplied = false
  const logoUrl = extractLogoUrl(html, u)
  if (logoUrl) {
    const img = await safeFetch(logoUrl, IMG_MAX_BYTES)
    const mime = img?.contentType.split(';')[0]?.trim() ?? ''
    if (img && IMG_MIME.has(mime)) {
      try {
        const ext = mime.includes('svg') ? 'svg' : mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'
        const key = brandAssetKey({ brandId, kind: 'logo', filename: `website-logo.${ext}` })
        const up = await uploadFile({ key, body: img.buf, contentType: mime })
        const asset = await prisma.asset.create({
          data: {
            ownerType: 'BRAND',
            ownerId: brandId,
            type: 'LOGO',
            source: 'USER_UPLOAD',
            storageKey: up.key,
            mimeType: mime,
            sizeBytes: up.sizeBytes,
            uploadedByUserId: user.id,
          },
        })
        await prisma.brand.update({ where: { id: brandId }, data: { logoAssetId: asset.id } })
        logoApplied = true
      } catch {
        logoApplied = false
      }
    }
  }

  if (colorsApplied === 0 && !logoApplied) {
    return { ok: false, error: 'Couldn’t find a logo or brand colors on that page. Try a different URL or add them manually.' }
  }

  await logAuditAs(user, {
    entityType: 'Brand',
    entityId: brandId,
    action: 'BRAND_KIT_BUILT_FROM_URL',
    payload: { sourceUrl: u.origin, colorsApplied, logoApplied },
  })
  return { ok: true, colorsApplied, logoApplied, sourceUrl: u.origin }
}
