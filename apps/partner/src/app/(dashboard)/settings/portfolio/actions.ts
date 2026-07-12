'use server'

// Portfolio manager actions — the #p-portfolio panel (Front Face slice 2).
// PartnerPortfolioItem CRUD: tiles shown on the public profile's "Recent work"
// grid. Tile image goes through the same R2 public rail as logo/cover (optional
// — imageless tiles render the deterministic brand gradient). Audited;
// ownership-guarded; cap 12 items.

import { uploadFile, deleteFile, partnerFileKey } from '@ilaunchify/storage'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

export type PortfolioResult = { ok: true } | { ok: false; error: string }

const OK_MIMES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_BYTES = 6 * 1024 * 1024
const MAX_ITEMS = 12

function publicBase(): string | null {
  return (process.env.R2_PUBLIC_BASE_URL ?? process.env.R2_PUBLIC_URL)?.replace(/\/$/, '') ?? null
}

async function requirePartnerId() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  return { user, partnerId: partner?.id ?? null }
}

async function maybeUploadTileImage(
  partnerId: string,
  file: FormDataEntryValue | null,
): Promise<{ url: string | null; error?: string }> {
  if (!(file instanceof File) || file.size === 0) return { url: null }
  const base = publicBase()
  if (!base) return { url: null, error: 'Public image hosting is not configured (R2_PUBLIC_BASE_URL).' }
  if (file.size > MAX_BYTES) return { url: null, error: 'Image too large (max 6 MB).' }
  const contentType = file.type || 'image/png'
  if (!OK_MIMES.includes(contentType)) return { url: null, error: 'Upload a PNG, JPG, or WEBP.' }
  const key = partnerFileKey({
    partnerId,
    section: 'public_profile',
    filename: `portfolio-${file.name}`,
  })
  try {
    const up = await uploadFile({
      key,
      body: Buffer.from(await file.arrayBuffer()),
      contentType,
      cacheControl: 'public, max-age=31536000, immutable',
      contentDisposition: 'inline',
    })
    return { url: `${base}/${up.key}` }
  } catch (err) {
    return { url: null, error: `Upload failed: ${(err as Error).message}` }
  }
}

async function deleteByPublicUrl(url: string | null): Promise<void> {
  const base = publicBase()
  if (!url || !base || !url.startsWith(`${base}/`)) return
  await deleteFile(url.slice(base.length + 1)).catch(() => {})
}

export async function createPortfolioItem(formData: FormData): Promise<PortfolioResult> {
  const { user, partnerId } = await requirePartnerId()
  if (!partnerId) return { ok: false, error: 'No partner account.' }

  const title = String(formData.get('title') ?? '').trim().slice(0, 80)
  const meta = String(formData.get('meta') ?? '').trim().slice(0, 80)
  if (!title) return { ok: false, error: 'Give the work a title.' }

  const count = await prisma.partnerPortfolioItem.count({ where: { partnerId } })
  if (count >= MAX_ITEMS) return { ok: false, error: `Portfolio is capped at ${MAX_ITEMS} items.` }

  const img = await maybeUploadTileImage(partnerId, formData.get('file'))
  if (img.error) return { ok: false, error: img.error }

  const item = await prisma.partnerPortfolioItem.create({
    data: { partnerId, title, meta: meta || null, imageUrl: img.url, sortOrder: count },
  })
  await logAuditAs(user, {
    entityType: 'PartnerPortfolioItem',
    entityId: item.id,
    action: 'PORTFOLIO_ITEM_CREATED',
    payload: { title, hasImage: Boolean(img.url) },
  })
  revalidatePath('/settings/portfolio')
  return { ok: true }
}

export async function setPortfolioItemPublished(id: string, published: boolean): Promise<void> {
  const { user, partnerId } = await requirePartnerId()
  if (!partnerId) return
  const { count } = await prisma.partnerPortfolioItem.updateMany({
    where: { id, partnerId }, // ownership fence
    data: { published },
  })
  if (count === 0) return
  await logAuditAs(user, {
    entityType: 'PartnerPortfolioItem',
    entityId: id,
    action: published ? 'PORTFOLIO_ITEM_PUBLISHED' : 'PORTFOLIO_ITEM_UNPUBLISHED',
    payload: { published },
  })
  revalidatePath('/settings/portfolio')
}

export async function deletePortfolioItem(id: string): Promise<void> {
  const { user, partnerId } = await requirePartnerId()
  if (!partnerId) return
  const item = await prisma.partnerPortfolioItem.findFirst({
    where: { id, partnerId }, // ownership fence
    select: { id: true, imageUrl: true, title: true },
  })
  if (!item) return
  await prisma.partnerPortfolioItem.delete({ where: { id: item.id } })
  await deleteByPublicUrl(item.imageUrl)
  await logAuditAs(user, {
    entityType: 'PartnerPortfolioItem',
    entityId: id,
    action: 'PORTFOLIO_ITEM_DELETED',
    payload: { title: item.title },
  })
  revalidatePath('/settings/portfolio')
}

/** Move an item up/down one slot (simple swap of sortOrder). */
export async function movePortfolioItem(id: string, dir: 'up' | 'down'): Promise<void> {
  const { user, partnerId } = await requirePartnerId()
  if (!partnerId) return
  const items = await prisma.partnerPortfolioItem.findMany({
    where: { partnerId },
    orderBy: { sortOrder: 'asc' },
    select: { id: true },
  })
  const idx = items.findIndex((i) => i.id === id)
  const swapWith = dir === 'up' ? idx - 1 : idx + 1
  if (idx < 0 || swapWith < 0 || swapWith >= items.length) return
  const a = items[idx]
  const b = items[swapWith]
  if (!a || !b) return
  // Normalize both slots in one pass (also heals any duplicate sortOrders).
  await prisma.$transaction(
    items.map((it, i) =>
      prisma.partnerPortfolioItem.update({
        where: { id: it.id },
        data: { sortOrder: it.id === a.id ? swapWith : it.id === b.id ? idx : i },
      }),
    ),
  )
  await logAuditAs(user, {
    entityType: 'PartnerPortfolioItem',
    entityId: id,
    action: 'PORTFOLIO_ITEM_REORDERED',
    payload: { dir },
  })
  revalidatePath('/settings/portfolio')
}
