'use server'

// Phase G2 — Review Design step server loader.
//
// loadReviewSnapshot(productId) gathers everything the Review step needs to
// render the 2D preview + automated checklist in one round-trip:
//   - The latest DesignVersion (Fabric JSON + version number + updatedAt).
//   - The product's die-cut so the preview is sized correctly.
//   - A summary of the most recent canvas-side compliance scan that was
//     persisted into DesignVersion.generationMeta.complianceAckHistory
//     (DS-69 pattern).
//   - A pre-render text-content scan: counts text objects whose string is
//     empty / whitespace / a known placeholder ("YOUR BRAND HERE", etc).
//     This is parsed from the saved Fabric JSON server-side, so the
//     creator sees the count before the canvas mounts.
//
// 3D preview is V1.5+ — Review V1 ships 2D only.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'

export interface ReviewSnapshot {
  exists: boolean
  designId: string | null
  designVersionId: string | null
  designVersion: number | null
  designUpdatedAt: string | null
  /** Fabric.js serialized state — passed to a read-only preview on the client. */
  fabricJson: object | null
  /** Die-cut so the read-only preview matches the canvas dimensions. */
  dieCut: {
    id: string
    name: string
    widthMm: number
    heightMm: number
    bleedMm: number
    safeAreaMm: number
  } | null
  /** Last persisted compliance scan + ack state from generationMeta. */
  compliance: {
    everScanned: boolean
    lastAckAt: string | null
    lastAcknowledged: boolean
    blockingFindingCount: number
  }
  /** Pre-render text-content scan. */
  text: {
    totalTextObjects: number
    emptyOrPlaceholderCount: number
    samples: string[] // up to 5 example offending strings
  }
}

const PLACEHOLDER_PATTERNS = [
  /^your\s+(brand|product|company|tagline|copy)\s+here$/i,
  /^click\s+to\s+edit/i,
  /^add\s+text/i,
  /^lorem\s+ipsum/i,
  /^placeholder/i,
  /^\[.*\]$/, // bracketed placeholders e.g. [PRODUCT NAME]
  /^tagline$/i,
]

export async function loadReviewSnapshot(
  productId: string,
): Promise<ReviewSnapshot> {
  const user = await requireUser()
  // Auth: must own the product through brand → creator. If not, return empty.
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      brand: { creatorProfile: { userId: user.id } },
    },
    select: { id: true, category: true },
  })
  if (!product) return emptySnapshot()

  // Latest DesignVersion + its parent Design.
  const designVersion = await prisma.designVersion.findFirst({
    where: { design: { productId: product.id } },
    orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      designId: true,
      version: true,
      designJson: true,
      generationMeta: true,
      createdAt: true,
    },
  })

  // Die-cut — same resolver the canvas page uses.
  const dieCut = await resolveDefaultDieCut(product.category)

  if (!designVersion) {
    return {
      ...emptySnapshot(),
      dieCut,
    }
  }

  // Parse Fabric JSON for the text scan.
  const text = scanTextContent(designVersion.designJson)

  // Parse generationMeta for the latest compliance ack.
  const compliance = readComplianceState(designVersion.generationMeta)

  return {
    exists: true,
    designId: designVersion.designId,
    designVersionId: designVersion.id,
    designVersion: designVersion.version,
    designUpdatedAt: designVersion.createdAt.toISOString(),
    fabricJson: designVersion.designJson as object | null,
    dieCut,
    compliance,
    text,
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function emptySnapshot(): ReviewSnapshot {
  return {
    exists: false,
    designId: null,
    designVersionId: null,
    designVersion: null,
    designUpdatedAt: null,
    fabricJson: null,
    dieCut: null,
    compliance: {
      everScanned: false,
      lastAckAt: null,
      lastAcknowledged: false,
      blockingFindingCount: 0,
    },
    text: {
      totalTextObjects: 0,
      emptyOrPlaceholderCount: 0,
      samples: [],
    },
  }
}

interface TextScanResult {
  totalTextObjects: number
  emptyOrPlaceholderCount: number
  samples: string[]
}

/**
 * Walk the Fabric JSON object array and flag text-type objects whose
 * `text` field is empty, whitespace-only, or matches a known placeholder
 * pattern. We avoid a full Fabric.loadFromJSON here — the JSON shape is
 * well-known (objects: [{type, text, ...}]) and walking it is cheap.
 */
function scanTextContent(designJson: unknown): TextScanResult {
  const result: TextScanResult = {
    totalTextObjects: 0,
    emptyOrPlaceholderCount: 0,
    samples: [],
  }
  if (!designJson || typeof designJson !== 'object') return result
  const root = designJson as Record<string, unknown>
  const objects = Array.isArray(root.objects) ? root.objects : []
  for (const raw of objects) {
    if (!raw || typeof raw !== 'object') continue
    const obj = raw as Record<string, unknown>
    const type = typeof obj.type === 'string' ? obj.type.toLowerCase() : ''
    // Fabric text types: 'text' | 'i-text' | 'textbox'
    if (!type.includes('text')) continue
    result.totalTextObjects++
    const text = typeof obj.text === 'string' ? obj.text : ''
    const trimmed = text.trim()
    const isEmpty = trimmed.length === 0
    const isPlaceholder = PLACEHOLDER_PATTERNS.some((p) => p.test(trimmed))
    if (isEmpty || isPlaceholder) {
      result.emptyOrPlaceholderCount++
      if (result.samples.length < 5) {
        result.samples.push(isEmpty ? '(empty text box)' : trimmed)
      }
    }
  }
  return result
}

interface ComplianceState {
  everScanned: boolean
  lastAckAt: string | null
  lastAcknowledged: boolean
  blockingFindingCount: number
}

/**
 * Pull the most recent entry from generationMeta.complianceAckHistory[]
 * (DS-69). The cart-actions writer appends one entry each time the
 * creator places an order with an ack. We treat the presence of any
 * entry as "ever scanned" and surface the latest acknowledged flag.
 */
function readComplianceState(generationMeta: unknown): ComplianceState {
  const empty: ComplianceState = {
    everScanned: false,
    lastAckAt: null,
    lastAcknowledged: false,
    blockingFindingCount: 0,
  }
  if (!generationMeta || typeof generationMeta !== 'object') return empty
  const meta = generationMeta as Record<string, unknown>
  const history = Array.isArray(meta.complianceAckHistory)
    ? (meta.complianceAckHistory as Array<Record<string, unknown>>)
    : []
  if (history.length === 0) return empty
  const last = history[history.length - 1] ?? {}
  const blockingIds = Array.isArray(last.blockingFindingIds)
    ? (last.blockingFindingIds as unknown[])
    : []
  return {
    everScanned: true,
    lastAckAt: typeof last.acknowledgedAt === 'string' ? last.acknowledgedAt : null,
    lastAcknowledged: last.acknowledged === true,
    blockingFindingCount: blockingIds.length,
  }
}

/**
 * Mirrors the canvas page's resolver: pick a sensible default die-cut by
 * product category. Kept inline (rather than imported) so this server
 * action stays self-contained.
 */
async function resolveDefaultDieCut(
  productCategory: 'FOOD' | 'BEVERAGE_FUNCTIONAL' | 'SUPPLEMENT',
): Promise<ReviewSnapshot['dieCut']> {
  const categoryPreference: Record<typeof productCategory, string[]> = {
    SUPPLEMENT: ['BOTTLE_WRAP', 'TUB_LID', 'STICKER'],
    BEVERAGE_FUNCTIONAL: ['BOTTLE_WRAP', 'STICKER'],
    FOOD: ['POUCH_FRONT', 'BOX_PANEL', 'STICKER'],
  }
  const preferred = categoryPreference[productCategory]
  for (const cat of preferred) {
    const row = await prisma.dieCutTemplate.findFirst({
      where: {
        category: cat as
          | 'BOTTLE_WRAP'
          | 'TUB_LID'
          | 'POUCH_FRONT'
          | 'BOX_PANEL'
          | 'STICKER'
          | 'CUSTOM',
        isActive: true,
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        widthMm: true,
        heightMm: true,
        bleedMm: true,
        safeAreaMm: true,
      },
    })
    if (row) return row
  }
  return null
}
