// Platform logos (Theme Studio Phase D). CRUD over PlatformBrandAsset rows.
// Files live in R2; signed/public URL generation happens in the admin layer
// (this package stays storage-agnostic). Cast-guarded + safe before migration.

import { prisma } from './index'

export const LOGO_KINDS = ['full', 'mark'] as const
export type LogoKind = (typeof LOGO_KINDS)[number]
export const LOGO_VARIANTS = ['light', 'dark'] as const
export type LogoVariant = (typeof LOGO_VARIANTS)[number]

export interface PlatformLogoRow {
  kind: string
  variant: string
  storageKey: string
  publicUrl: string | null
  mimeType: string
}

export function isLogoKind(s: string | undefined): s is LogoKind {
  return s === 'full' || s === 'mark'
}
export function isLogoVariant(s: string | undefined): s is LogoVariant {
  return s === 'light' || s === 'dark'
}

/** All uploaded logo slots. Safe before migration ([]). */
export async function listPlatformLogos(): Promise<PlatformLogoRow[]> {
  try {
    const rows = await (prisma as unknown as {
      platformBrandAsset: { findMany: (a?: unknown) => Promise<Array<{ kind: string; variant: string; storageKey: string; publicUrl: string | null; mimeType: string }>> }
    }).platformBrandAsset.findMany()
    return rows.map((r) => ({ kind: r.kind, variant: r.variant, storageKey: r.storageKey, publicUrl: r.publicUrl, mimeType: r.mimeType }))
  } catch {
    return []
  }
}

/** Upsert one (kind, variant) slot. Returns the PREVIOUS storageKey (to delete from R2), if any. */
export async function upsertPlatformLogo(input: {
  kind: LogoKind
  variant: LogoVariant
  storageKey: string
  publicUrl: string | null
  mimeType: string
  sizeBytes: number
  uploadedBy?: string | null
}): Promise<string | null> {
  const m = (prisma as unknown as {
    platformBrandAsset: {
      findUnique: (a: unknown) => Promise<{ storageKey: string } | null>
      upsert: (a: unknown) => Promise<unknown>
    }
  }).platformBrandAsset
  const prev = await m.findUnique({ where: { kind_variant: { kind: input.kind, variant: input.variant } } })
  await m.upsert({
    where: { kind_variant: { kind: input.kind, variant: input.variant } },
    update: { storageKey: input.storageKey, publicUrl: input.publicUrl, mimeType: input.mimeType, sizeBytes: input.sizeBytes, uploadedBy: input.uploadedBy ?? null },
    create: { kind: input.kind, variant: input.variant, storageKey: input.storageKey, publicUrl: input.publicUrl, mimeType: input.mimeType, sizeBytes: input.sizeBytes, uploadedBy: input.uploadedBy ?? null },
  })
  return prev?.storageKey ?? null
}

/** Delete one slot. Returns the removed storageKey (to delete from R2), if any. */
export async function deletePlatformLogoRow(kind: LogoKind, variant: LogoVariant): Promise<string | null> {
  const m = (prisma as unknown as {
    platformBrandAsset: {
      findUnique: (a: unknown) => Promise<{ storageKey: string } | null>
      deleteMany: (a: unknown) => Promise<unknown>
    }
  }).platformBrandAsset
  const row = await m.findUnique({ where: { kind_variant: { kind, variant } } })
  await m.deleteMany({ where: { kind, variant } })
  return row?.storageKey ?? null
}
