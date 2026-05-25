// Key generation helpers — keep storage paths predictable so we can find +
// list files without DB lookups when needed.
//
// Path convention:
//   partners/{partnerId}/{section}/{cuid}-{filename}
//
// Why this shape:
//   - leading "partners/" namespaces away from other R2 use cases (assets, exports)
//   - partnerId lets us delete-all-by-partner with a single ListObjectsV2 + Delete
//   - section lets us list files for one verification section
//   - cuid prefix on the filename guarantees uniqueness (two uploads of "license.pdf" don't collide)
//   - original filename is preserved at the end so manual debugging is easier

import { randomBytes } from 'crypto'

function generateCuid(): string {
  // Mini cuid — 12 hex chars is enough for collision-free filenames per partner
  return randomBytes(6).toString('hex')
}

function sanitizeFilename(filename: string): string {
  // Strip path separators + anything weird; keep dots, dashes, underscores
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
}

export function partnerFileKey(params: {
  partnerId: string
  section: 'business' | 'facility' | 'documents' | 'public_profile'
  filename: string
}): string {
  const id = generateCuid()
  const safe = sanitizeFilename(params.filename)
  return `partners/${params.partnerId}/${params.section}/${id}-${safe}`
}

// Brand assets — logo, hero, patterns, etc. Path convention:
//   brands/{brandId}/{kind}/{cuid}-{filename}
// Where {kind} is the AssetType enum value lower-cased (e.g., 'logo', 'hero_image').
// Brand-scoped namespacing lets us delete-all-by-brand on brand teardown.
export function brandAssetKey(params: {
  brandId: string
  kind: 'logo' | 'logo_icon' | 'logo_horizontal' | 'logo_vertical' | 'logo_monogram' | 'logo_inverse' | 'hero_image' | 'pattern' | 'favicon'
  filename: string
}): string {
  const id = generateCuid()
  const safe = sanitizeFilename(params.filename)
  return `brands/${params.brandId}/${params.kind}/${id}-${safe}`
}

// Partner packaging assets (die-lines + reference photos). Path convention:
//   partners/{partnerId}/packaging/{packagingSystemId}/{kind}/{cuid}-{filename}
// Lets us delete-all-by-packaging-system on archival + delete-all-by-partner
// on teardown. {kind} = 'die_line' | 'reference_photo'.
export function packagingAssetKey(params: {
  partnerId: string
  packagingSystemId: string
  kind: 'die_line' | 'reference_photo'
  filename: string
}): string {
  const id = generateCuid()
  const safe = sanitizeFilename(params.filename)
  return `partners/${params.partnerId}/packaging/${params.packagingSystemId}/${params.kind}/${id}-${safe}`
}
