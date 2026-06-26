// =============================================================================
// Admin Product review detail — locked admin surface pattern v2 (#133 + #574).
// =============================================================================
//
// Counterpart to /admin/products (list). Renders the full review picture for a
// single ProductTemplate so an admin can answer:
//   • What did the partner build? (basics + ingredients + allergens + packaging
//     + variants + certificates snapshot)
//   • What's the regulatory risk? (high-weight SELF_ATTESTED ingredient banner)
//   • Are there proposed edits to a live product? (PENDING_EDIT_REVIEW diff)
//   • What do I do next? (right-rail ProductReviewer — Approve / Request
//     changes / Reject / Pause/Resume + notes thread)
//
// Layout (v2 pattern — same shape as /admin/orders/[orderId] + /admin/partners):
//   • Cream rounded-3xl hero band with title + status pill + 5-card KPI strip
//   • Two-column grid: detail snapshot cards LEFT, sticky right rail RIGHT
//   • Right rail = Quick actions card + ProductReviewer client component
//     (unchanged from previous version — same prop shape, same behavior).
//
// Every Prisma include + the ingredient-risk computation + the author lookup
// + the PendingEditsDiff block from the previous version is preserved.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  Box,
  Beaker,
  Award,
  DollarSign,
  FileText,
  ShieldAlert,
  AlertTriangle,
  FlaskConical,
  Eye,
  History,
  Hash,
  Layers,
  Package as PackageIcon,
  ClipboardList,
  ExternalLink,
  Sparkles,
  Image as ImageIcon,
  CheckCircle2,
  XCircle,
  Building2,
  Globe2,
  ScrollText,
  Gavel,
  Ban,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type {
  ProductTemplateStatus,
  PartnerStatus,
  PartnerTier,
  FlavorPresetStatus,
} from '@ilaunchify/db'
import { prisma } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { AdminDetailHeader } from '@/components/AdminDetailHeader'
import { partnerUrl } from '@/lib/partner-url'
import {
  suggestNiches,
  suggestPhrases,
  evaluateProductRestrictions,
} from '@ilaunchify/marketplace'
import { ProductReviewer } from './ProductReviewer'
import { MarketplacePlacementPanel } from './MarketplacePlacementPanel'
import { MarketingCopyPanel } from './MarketingCopyPanel'
import { MarketplaceAttributesPanel } from './MarketplaceAttributesPanel'
import type {
  NicheOption,
  LifestyleTagOption,
  RuleHit,
} from './MarketplacePlacementPanel'
import { PhrasePlacementPanel } from './PhrasePlacementPanel'
import type {
  PhraseOption,
  PhraseRuleHit,
} from './PhrasePlacementPanel'

export const dynamic = 'force-dynamic'

// -----------------------------------------------------------------------------
// Risk threshold — preserved from previous version (#141 + ingredient
// governance memory). Slots > this % of total recipe weight whose base
// ingredient isn't ADMIN_VERIFIED/LIBRARY_PROMOTED get a red flag because
// the FDA-printed label depends on their nutrient + allergen data.
// -----------------------------------------------------------------------------

const HIGH_WEIGHT_THRESHOLD_PCT = 5

type IngredientRisk = 'OK' | 'LOW_RISK' | 'HIGH_RISK'

function classifySlotRisk(status: string, weightPct: number): IngredientRisk {
  if (status === 'ADMIN_VERIFIED' || status === 'LIBRARY_PROMOTED') return 'OK'
  return weightPct > HIGH_WEIGHT_THRESHOLD_PCT ? 'HIGH_RISK' : 'LOW_RISK'
}

// -----------------------------------------------------------------------------
// Tone maps (mirror /admin/products list page conventions)
// -----------------------------------------------------------------------------

const STATUS_LABELS: Record<ProductTemplateStatus, string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Pending review',
  NEEDS_CHANGES: 'Needs changes',
  PUBLISHED: 'Live',
  PENDING_EDIT_REVIEW: 'Edits in review',
  PAUSED: 'Paused',
  REJECTED: 'Rejected',
  UNDER_REVIEW: 'Under review',
  ARCHIVED: 'Archived',
}

const STATUS_TONE: Record<
  ProductTemplateStatus,
  { dot: string; bg: string; text: string; border: string }
> = {
  DRAFT: { dot: 'bg-ink-400', bg: 'bg-zinc-50', text: 'text-ink-700', border: 'border-zinc-200' },
  PENDING_REVIEW: { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-900', border: 'border-amber-200' },
  NEEDS_CHANGES: { dot: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-900', border: 'border-rose-200' },
  PUBLISHED: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-900', border: 'border-emerald-200' },
  PENDING_EDIT_REVIEW: { dot: 'bg-sky-500', bg: 'bg-sky-50', text: 'text-sky-900', border: 'border-sky-200' },
  PAUSED: { dot: 'bg-ink-400', bg: 'bg-zinc-50', text: 'text-ink-700', border: 'border-zinc-200' },
  REJECTED: { dot: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-900', border: 'border-rose-200' },
  UNDER_REVIEW: { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-900', border: 'border-amber-200' },
  ARCHIVED: { dot: 'bg-ink-400', bg: 'bg-zinc-50', text: 'text-ink-700', border: 'border-zinc-200' },
}

// -----------------------------------------------------------------------------
// Nutrient label + unit tables — local to this page; the compliance service
// owns canonical rounding + presentation per FDA 21 CFR 101.9(c). Admin only
// previews here.
// -----------------------------------------------------------------------------

const NUTRIENT_LABELS: Record<
  'calories' | 'protein' | 'totalFat' | 'totalCarbs' | 'sugars' | 'sodium',
  string
> = {
  calories: 'Calories',
  protein: 'Protein',
  totalFat: 'Total Fat',
  totalCarbs: 'Total Carbs',
  sugars: 'Sugars',
  sodium: 'Sodium',
}
const NUTRIENT_UNITS: Record<keyof typeof NUTRIENT_LABELS, string> = {
  calories: ' kcal',
  protein: 'g',
  totalFat: 'g',
  totalCarbs: 'g',
  sugars: 'g',
  sodium: 'mg',
}

// -----------------------------------------------------------------------------
// Partner-context tone maps — drive the Partner Constraints panel chips.
// -----------------------------------------------------------------------------

const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  LEAD: 'Lead',
  IDENTITY_PENDING_REVIEW: 'Identity in review',
  IDENTITY_VERIFIED: 'Identity verified',
  OPS_PENDING_REVIEW: 'Ops in review',
  OPERATIONALLY_CONFIGURED: 'Ops configured',
  ACTIVE: 'Active',
  INTEGRATION_ENHANCED: 'Integration enhanced',
  PAUSED: 'Paused',
  SUSPENDED: 'Suspended',
  TERMINATED: 'Terminated',
  DRAFT: 'Draft',
  INVITED: 'Invited',
  IN_PROGRESS: 'In progress',
  UNDER_REVIEW: 'Under review',
}
const PARTNER_TIER_NOTE: Record<PartnerTier, string> = {
  VERIFIED: 'Verified — baseline placement + standard fee schedule.',
  TRUSTED: 'Trusted — earned priority surfacing + reduced fee on production orders.',
  PREMIER: 'Premier — featured placement + best fee schedule.',
}

// -----------------------------------------------------------------------------
// New-builder configurator shapes (loose-delegate payloads — the generated
// client may not surface these models on every machine until the migration
// runs; see docs/PRODUCT_CONFIGURATOR_CONSTRAINTS.md).
// -----------------------------------------------------------------------------

type OverlayOpStr = 'NONE' | 'SWAP' | 'ADD' | 'REMOVE'

interface RawOptionValue {
  id: string
  label: string
  isDefault: boolean
  overlayOp: OverlayOpStr
  unitCostDeltaCents: number
  leadTimeDeltaDays: number
  moqOverride: number | null
  priceDeltaCents: number
  status: string
  sortOrder: number
}

interface RawOptionAxis {
  id: string
  key: string
  label: string
  layer: string
  editableByCreator: boolean
  affectsLabel: boolean
  required: boolean
  boundSlotId: string | null
  isActive: boolean
  sortOrder: number
  values: RawOptionValue[]
}

interface RawFee {
  id: string
  label: string
  basis: 'PER_UNIT' | 'PER_SKU_ONE_TIME' | 'PER_ORDER'
  amountCents: number
  waivedAboveQty: number | null
  sortOrder: number
}

const FEE_BASIS_LABEL: Record<RawFee['basis'], string> = {
  PER_UNIT: 'Per unit',
  PER_SKU_ONE_TIME: 'One-time / SKU',
  PER_ORDER: 'Per order',
}

const STORAGE_CLASS_LABEL: Record<'AMBIENT' | 'CHILLED' | 'FROZEN', string> = {
  AMBIENT: 'Ambient',
  CHILLED: 'Chilled',
  FROZEN: 'Frozen',
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  const t = await prisma.productTemplate.findUnique({
    where: { id },
    select: { name: true },
  })
  return { title: `${t?.name ?? 'Product'} — Admin` }
}

export default async function AdminProductReviewPage({ params }: PageProps) {
  const { id } = await params

  const template = await prisma.productTemplate.findUnique({
    where: { id },
    include: {
      subcategory: { select: { name: true, category: { select: { name: true } } } },
      manufacturerService: {
        select: {
          id: true,
          status: true,
          capabilities: true,
          disclosureLevel: true,
          partner: {
            select: {
              id: true,
              companyName: true,
              legalName: true,
              country: true,
              status: true,
              tier: true,
              primaryRegionId: true,
              primaryRegion: { select: { code: true, name: true } },
            },
          },
        },
      },
      ingredientSlots: {
        include: {
          baseIngredient: {
            select: {
              id: true,
              name: true,
              internalName: true,
              allergenFlags: true,
              source: true,
              verificationStatus: true,
              ownerPartnerId: true,
              bioengineeredStatus: true,
              nutritionPer100g: true,
            },
          },
        },
        orderBy: { displayOrder: 'asc' },
      },
      packagingSystems: {
        include: {
          packagingSystem: {
            select: { partnerName: true, topology: true, unitCount: true, moq: true, status: true },
          },
        },
      },
      variants: true,
      certificates: {
        include: {
          instance: {
            include: { certificateType: { select: { name: true, slug: true } } },
          },
        },
      },
      flavorPresets: { orderBy: { sortOrder: 'asc' } },
      reviewItems: { orderBy: { createdAt: 'desc' } },
      notes: { orderBy: { createdAt: 'asc' } },
      // 2026-06-02 Slice 3C — admin marketplace placement panel.
      niches: { include: { niche: true } },
      lifestyleTags: { include: { lifestyleTag: true } },
      // 2026-06-05 — admin label-phrase placement panel.
      phrases: { select: { mandatoryPhraseId: true } },
    },
  })
  if (!template) notFound()

  // Marketplace marketing copy (longDescription + marketingDetail). Cast-guarded —
  // marketingDetail ships with a pending migration.
  const marketingCopy = await (prisma as unknown as {
    productTemplate: {
      findUnique: (a: unknown) => Promise<{ longDescription: string | null; marketingDetail: Record<string, unknown> | null } | null>
    }
  }).productTemplate
    .findUnique({ where: { id }, select: { longDescription: true, marketingDetail: true } })
    .catch(() => null)

  // Marketplace filter attributes (§7) — Format / processes / allergen-free /
  // markets. Cast-guarded — these columns ship with a pending migration.
  const filterAttrs = await (prisma as unknown as {
    productTemplate: {
      findUnique: (a: unknown) => Promise<{
        manufacturingFormat: string | null
        manufacturingProcesses: string[]
        allergenFreeClaims: string[]
        marketCodes: string[]
        ratingAvg: number | null
        ratingCount: number
      } | null>
    }
  }).productTemplate
    .findUnique({
      where: { id },
      select: {
        manufacturingFormat: true,
        manufacturingProcesses: true,
        allergenFreeClaims: true,
        marketCodes: true,
        ratingAvg: true,
        ratingCount: true,
      },
    })
    .catch(() => null)

  // Restricted-category eligibility (labeling ≠ licensing). Read-only signal so
  // ops can see why a product would be blocked at checkout. Evaluates the
  // template's labelingType + manufacturer phraseFacts + base ingredient names.
  const restrictionHits = evaluateProductRestrictions({
    labelingType: template.labelingType,
    phraseFacts: (template.phraseFacts ?? null) as Record<string, unknown> | null,
    ingredientNames: template.ingredientSlots.map(
      (s) => s.baseIngredient.internalName || s.baseIngredient.name,
    ),
  })

  // -------------------------------------------------------------------------
  // Cross-cutting lookups — banned-ingredient dictionary + per-slot usage
  // counts (the "informed not blocking" governance signals from §4a.5).
  // -------------------------------------------------------------------------

  const [bannedIngredients, slotUsageCounts] = await Promise.all([
    prisma.bannedIngredient.findMany({
      where: { isActive: true },
      select: { id: true, matchName: true, casNumber: true, reason: true, reference: true },
    }),
    Promise.all(
      template.ingredientSlots.map(async (s) => ({
        ingredientId: s.baseIngredient.id,
        // -1 excludes the current product's own slot usage (rough proxy — count
        // is product-template-scoped so this is best-effort).
        count: await prisma.ingredientUsage.count({
          where: { ingredientId: s.baseIngredient.id },
        }),
      })),
    ),
  ])
  const usageCountByIngredientId = new Map(
    slotUsageCounts.map((u) => [u.ingredientId, u.count] as const),
  )

  // ProductNote.authorId is a soft FK — look up names separately.
  const authorIds = Array.from(new Set(template.notes.map((n) => n.authorId)))
  const authorUsers = authorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, name: true, email: true },
      })
    : []
  const nameByAuthorId = new Map(
    authorUsers.map((u) => [u.id, u.name ?? u.email] as const),
  )

  // -------------------------------------------------------------------------
  // Slice 3C — Marketplace placement panel data
  //
  // 1. The 8 active niches (filter the chip list).
  // 2. All active lifestyle tags grouped Lifestyle / Audience / Trend.
  // 3. suggestNiches result — drives the auto-suggested dot + "Why these
  //    niches?" disclosure.
  // 4. Most-recent NicheAssignmentAudit per (productTemplate, niche) — drives
  //    the AUTO / MFG / ADMIN source pill on each niche chip.
  // -------------------------------------------------------------------------

  const [allNicheRows, allLifestyleTagRows, suggestion, nicheAuditRows] =
    await Promise.all([
      prisma.niche.findMany({
        where: { isActive: true },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          slug: true,
          name: true,
          iconEmoji: true,
          accentHex: true,
        },
      }),
      prisma.lifestyleTag.findMany({
        where: { isActive: true },
        orderBy: [{ group: 'asc' }, { displayOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          slug: true,
          name: true,
          group: true,
          iconEmoji: true,
        },
      }),
      suggestNiches({ productTemplateId: template.id }),
      prisma.nicheAssignmentAudit.findMany({
        where: { productTemplateId: template.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          nicheId: true,
          source: true,
          applied: true,
          createdAt: true,
        },
      }),
    ])

  const allNiches: NicheOption[] = allNicheRows
  const allLifestyleTags: LifestyleTagOption[] = allLifestyleTagRows.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    group: t.group,
    iconEmoji: t.iconEmoji,
  }))
  const assignedNicheIds = template.niches.map((n) => n.nicheId)
  const assignedLifestyleTagIds = template.lifestyleTags.map((t) => t.lifestyleTagId)
  const lifestyleTagSourceById: Record<
    string,
    'AUTO_RULE' | 'MANUFACTURER' | 'ADMIN'
  > = {}
  for (const t of template.lifestyleTags) {
    lifestyleTagSourceById[t.lifestyleTagId] = t.source
  }
  // Most-recent audit per niche where applied=true. We iterate in DESC order
  // and only record the first hit per nicheId.
  const nicheAuditByNicheId: Record<
    string,
    { nicheId: string; source: 'AUTO_RULE' | 'MANUFACTURER' | 'ADMIN' }
  > = {}
  for (const row of nicheAuditRows) {
    if (!row.applied) continue
    if (nicheAuditByNicheId[row.nicheId]) continue
    nicheAuditByNicheId[row.nicheId] = {
      nicheId: row.nicheId,
      source: row.source,
    }
  }
  // Hydrate rule metadata (slug/description/weight/isLocked/nicheName) for
  // every rawHit — the suggestNiches result only surfaces metadata for the
  // post-dedup winners. We need the full picture for the disclosure panel.
  const ruleIdsInHits = suggestion.rawHits.map((h) => h.ruleId)
  const ruleMetaRows = ruleIdsInHits.length
    ? await prisma.nicheRule.findMany({
        where: { id: { in: ruleIdsInHits } },
        select: {
          id: true,
          slug: true,
          description: true,
          weight: true,
          isLocked: true,
          niche: { select: { name: true } },
        },
      })
    : []
  const ruleMetaById = new Map(ruleMetaRows.map((r) => [r.id, r] as const))
  const ruleHits: RuleHit[] = suggestion.rawHits
    .map((h): RuleHit => {
      const meta = ruleMetaById.get(h.ruleId)
      return {
        ruleId: h.ruleId,
        ruleSlug: meta?.slug ?? h.ruleId.slice(0, 8),
        description: meta?.description ?? '',
        weight: meta?.weight ?? 0,
        nicheId: h.nicheId,
        nicheName: meta?.niche.name ?? '',
        matched: h.matched,
        isLocked: meta?.isLocked ?? false,
      }
    })
    // Show matched first (most useful), then by weight desc within each bucket.
    .sort((a, b) => {
      if (a.matched !== b.matched) return a.matched ? -1 : 1
      return b.weight - a.weight
    })
  const suggestedNicheIds = suggestion.suggestions.map((s) => s.nicheId)
  const lockedNicheIds = suggestion.suggestions
    .filter((s) => s.isLocked)
    .map((s) => s.nicheId)

  // -------------------------------------------------------------------------
  // Label-phrase placement panel data (mirrors the niche block above).
  //
  // 1. suggestPhrases result — drives the chip list + "Why these phrases?".
  // 2. Existing ProductTemplatePhrase ids — the persisted selection.
  // 3. Latest PhraseAssignmentAudit rows (take 50) — drive the source pill.
  // -------------------------------------------------------------------------

  const [phraseSuggestion, phraseAuditRows] = await Promise.all([
    suggestPhrases({ productTemplateId: template.id }),
    prisma.phraseAssignmentAudit.findMany({
      where: { productTemplateId: template.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { mandatoryPhraseId: true, source: true, applied: true },
    }),
  ])

  const suggestedPhrases: PhraseOption[] = phraseSuggestion.suggestions.map(
    (s) => ({
      id: s.phraseId,
      slug: s.phraseSlug,
      title: s.title,
      body: s.body,
      category: s.category,
      requirement: s.requirement === 'RECOMMENDED' ? 'RECOMMENDED' : 'MANDATORY',
      cfrCitation: s.cfrCitation,
      appliesWhen: s.appliesWhen,
      isLocked: s.isLocked,
    }),
  )
  const assignedPhraseIds = template.phrases.map((p) => p.mandatoryPhraseId)
  const lockedPhraseIds = phraseSuggestion.suggestions
    .filter((s) => s.isLocked)
    .map((s) => s.phraseId)
  // Most-recent audit per phrase where applied=true (iterate DESC, first hit).
  const phraseSourceById: Record<
    string,
    'AUTO_RULE' | 'MANUFACTURER' | 'ADMIN'
  > = {}
  for (const row of phraseAuditRows) {
    if (!row.applied) continue
    if (phraseSourceById[row.mandatoryPhraseId]) continue
    phraseSourceById[row.mandatoryPhraseId] = row.source
  }
  // Hydrate rule metadata (slug/description/weight/isLocked/title) for every
  // rawHit so the disclosure panel can show matched + missed rules.
  const phraseRuleIdsInHits = phraseSuggestion.rawHits.map((h) => h.ruleId)
  const phraseRuleMetaRows = phraseRuleIdsInHits.length
    ? await prisma.phraseRule.findMany({
        where: { id: { in: phraseRuleIdsInHits } },
        select: {
          id: true,
          slug: true,
          description: true,
          weight: true,
          isLocked: true,
          mandatoryPhrase: { select: { title: true } },
        },
      })
    : []
  const phraseRuleMetaById = new Map(
    phraseRuleMetaRows.map((r) => [r.id, r] as const),
  )
  const phraseRuleHits: PhraseRuleHit[] = phraseSuggestion.rawHits
    .map((h): PhraseRuleHit => {
      const meta = phraseRuleMetaById.get(h.ruleId)
      return {
        ruleId: h.ruleId,
        ruleSlug: meta?.slug ?? h.ruleId.slice(0, 8),
        description: meta?.description ?? '',
        weight: meta?.weight ?? 0,
        phraseId: h.phraseId,
        phraseTitle: meta?.mandatoryPhrase.title ?? '',
        matched: h.matched,
        isLocked: meta?.isLocked ?? false,
      }
    })
    .sort((a, b) => {
      if (a.matched !== b.matched) return a.matched ? -1 : 1
      return b.weight - a.weight
    })

  // ---------------------------------------------------------------------------
  // New-builder data — configurator option axes + per-template fees, plus the
  // gallery/video + storage/lead scalars. These models + columns landed with
  // the guided builder (docs/PRODUCT_CONFIGURATOR_CONSTRAINTS.md, 2026-06-08)
  // and may not be on the generated client on every machine until the migration
  // runs — so reach via a loose delegate + cast and degrade to empty (the cards
  // self-hide) when the model isn't there yet.
  // ---------------------------------------------------------------------------

  const looseDb = prisma as unknown as {
    productOptionAxis?: { findMany: (args: unknown) => Promise<RawOptionAxis[]> }
    productTemplateFee?: { findMany: (args: unknown) => Promise<RawFee[]> }
  }
  const [optionAxes, fees] = await Promise.all([
    looseDb.productOptionAxis
      ?.findMany({
        where: { productTemplateId: id, isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: { values: { orderBy: { sortOrder: 'asc' } } },
      })
      .catch(() => [] as RawOptionAxis[]) ?? Promise.resolve([] as RawOptionAxis[]),
    looseDb.productTemplateFee
      ?.findMany({
        where: { productTemplateId: id },
        orderBy: { sortOrder: 'asc' },
      })
      .catch(() => [] as RawFee[]) ?? Promise.resolve([] as RawFee[]),
  ])
  const labelAffectingAxes = optionAxes.filter((a) => a.affectsLabel)

  // New scalar columns off the template (cast — may be ungenerated locally).
  const builderScalars = template as unknown as {
    galleryAssetIds?: string[] | null
    videoAssetId?: string | null
    storageClass?: 'AMBIENT' | 'CHILLED' | 'FROZEN' | null
    storageTempMinF?: number | null
    storageTempMaxF?: number | null
    leadTimeRepeatDays?: number | null
    leadTimeFirstRunDays?: number | null
    maxFlavorsPerPack?: number | null
  }
  const galleryAssetIds = builderScalars.galleryAssetIds ?? []
  const videoAssetId = builderScalars.videoAssetId ?? null
  const storageClass = builderScalars.storageClass ?? null
  const storageTempMinF = builderScalars.storageTempMinF ?? null
  const storageTempMaxF = builderScalars.storageTempMaxF ?? null
  const leadTimeRepeatDays = builderScalars.leadTimeRepeatDays ?? null
  const leadTimeFirstRunDays = builderScalars.leadTimeFirstRunDays ?? null
  const maxFlavorsPerPack = builderScalars.maxFlavorsPerPack ?? null
  const hasProductionStorageData =
    storageClass != null ||
    leadTimeRepeatDays != null ||
    leadTimeFirstRunDays != null ||
    maxFlavorsPerPack != null

  // Tone + label resolution (strict-TS bang on Record<EnumKey, T>).
  const tone = STATUS_TONE[template.status]!
  const statusLabel = STATUS_LABELS[template.status]!

  // Ingredient risk computation — preserved from previous version (#141).
  const totalWeightG = template.ingredientSlots.reduce(
    (sum, s) => sum + Number(s.weightG),
    0,
  )
  const slotsWithRisk = template.ingredientSlots.map((s) => {
    const weightG = Number(s.weightG)
    const weightPct = totalWeightG > 0 ? (weightG / totalWeightG) * 100 : 0
    return {
      slot: s,
      weightG,
      weightPct,
      risk: classifySlotRisk(s.baseIngredient.verificationStatus, weightPct),
    }
  })
  const highRiskSlots = slotsWithRisk.filter((s) => s.risk === 'HIGH_RISK')
  const lowRiskSlots = slotsWithRisk.filter((s) => s.risk === 'LOW_RISK')

  // -------------------------------------------------------------------------
  // Banned-ingredient cross-check — case-insensitive substring on display
  // name + internalName; exact match on CAS#. Either kind of hit is a hard
  // block (rose). #143 BannedIngredient is admin-managed at /admin/library.
  // -------------------------------------------------------------------------

  const bannedHits = template.ingredientSlots.flatMap((s) => {
    const hits: Array<{
      slotId: string
      slotName: string
      banned: (typeof bannedIngredients)[number]
      matchedOn: 'name' | 'cas'
    }> = []
    const namesLower = [s.baseIngredient.name, s.baseIngredient.internalName ?? '']
      .filter(Boolean)
      .map((n) => n.toLowerCase())
    for (const b of bannedIngredients) {
      if (b.matchName) {
        const needle = b.matchName.toLowerCase()
        if (namesLower.some((n) => n.includes(needle))) {
          hits.push({ slotId: s.id, slotName: s.baseIngredient.name, banned: b, matchedOn: 'name' })
          continue
        }
      }
      // Ingredient model doesn't carry CAS# in V1 schema, but BannedIngredient
      // does — if/when it lands on Ingredient, the matcher below activates.
      // (Kept as no-op for now to preserve the shape Pavel asked for.)
    }
    return hits
  })

  // -------------------------------------------------------------------------
  // Computed nutrition — sum slot.weightG × nutrientsPer100g / 100 per slot,
  // fall back to baseNutritionSnapshot when ingredient panels are sparse.
  // -------------------------------------------------------------------------

  type NutrientMap = Partial<
    Record<'calories' | 'protein' | 'totalFat' | 'totalCarbs' | 'sugars' | 'sodium', number>
  >
  const NUTRIENT_KEYS: Array<keyof NutrientMap> = [
    'calories',
    'protein',
    'totalFat',
    'totalCarbs',
    'sugars',
    'sodium',
  ]
  const computedNutrients: NutrientMap = {}
  for (const s of template.ingredientSlots) {
    const panel = (s.baseIngredient.nutritionPer100g ?? {}) as Record<string, unknown>
    const grams = Number(s.weightG)
    for (const k of NUTRIENT_KEYS) {
      const raw = panel[k]
      const v = typeof raw === 'number' ? raw : Number(raw ?? NaN)
      if (Number.isFinite(v)) {
        computedNutrients[k] = (computedNutrients[k] ?? 0) + (v * grams) / 100
      }
    }
  }
  const baseSnapshot = (template.baseNutritionSnapshot ?? null) as NutrientMap | null
  const firstVariant = template.variants[0] ?? null
  const servingsPerContainer = firstVariant?.servingsPerContainer ?? null
  const servingSizeG = firstVariant ? Number(firstVariant.servingSizeG) : null
  const perServingNutrients: NutrientMap = {}
  if (servingsPerContainer && totalWeightG > 0) {
    const servingFraction = (servingSizeG ?? totalWeightG / servingsPerContainer) / totalWeightG
    for (const k of NUTRIENT_KEYS) {
      const v = computedNutrients[k] ?? baseSnapshot?.[k]
      if (typeof v === 'number') perServingNutrients[k] = v * servingFraction
    }
  }

  // -------------------------------------------------------------------------
  // Partner context — pulls from the manufacturerService relation.
  // -------------------------------------------------------------------------

  const partner = template.manufacturerService?.partner ?? null
  const partnerId = partner?.id ?? null
  const partnerName = partner?.companyName ?? null
  const serviceStatus = template.manufacturerService?.status ?? null
  const disclosureLevel = template.manufacturerService?.disclosureLevel ?? null

  // Cert expiry math — bucket each linked cert by days-to-expiry.
  const now = Date.now()
  const DAY_MS = 86_400_000
  const certExpiries = template.certificates.map((c) => {
    const expiry = c.instance.expiryDate
    const days = expiry ? Math.floor((expiry.getTime() - now) / DAY_MS) : null
    const bucket: 'expired' | 'critical' | 'warning' | 'ok' | 'unknown' =
      days == null
        ? 'unknown'
        : days < 0
          ? 'expired'
          : days < 30
            ? 'critical'
            : days < 90
              ? 'warning'
              : 'ok'
    return {
      name: c.instance.certificateType.name,
      number: c.instance.certificateNumber,
      issuingBody: c.instance.issuingBody,
      expiry,
      days,
      bucket,
      status: c.instance.status,
    }
  })

  // Bioengineered disclosure trigger — any slot ingredient flagged BE.
  const hasBioengineered = template.ingredientSlots.some(
    (s) =>
      s.baseIngredient.bioengineeredStatus === 'BIOENGINEERED' ||
      s.baseIngredient.bioengineeredStatus === 'DERIVED_FROM_BIOENGINEERED',
  )

  // MOQ floor across all variants — surfaced as a soft warning if very low.
  const minVariantMoq = template.variants.length
    ? Math.min(...template.variants.map((v) => v.moqMin))
    : null

  // Allergen aggregate — any slot ingredient with an allergen flag.
  const anySlotHasAllergens = template.ingredientSlots.some(
    (s) => s.baseIngredient.allergenFlags.length > 0,
  )
  const hasCrossContaminationStatement = Boolean(
    template.allergenCrossContamination && template.allergenCrossContamination.trim().length > 0,
  )

  // Nutrient overrides preview shape.
  const nutrientOverrides = (template.nutrientOverrides ?? null) as
    | Array<{ nutrient?: string; value?: number; reason?: string }>
    | null
  const ingredientGroups = (template.ingredientGroups ?? null) as
    | Array<{ groupName?: string; ingredientIds?: string[]; displayMode?: string }>
    | null
  const customMetaPairs = (template.customMeta ?? null) as
    | Array<{ key?: string; value?: string }>
    | null

  // Any per-flavor nutrient overrides? (compound override warning)
  const anyFlavorHasNutrientOverride = template.flavorPresets.some((f) => {
    const o = f.nutrientOverrides as Array<unknown> | null
    return Array.isArray(o) && o.length > 0
  })

  // KPI strip values
  const openReviewItems = template.reviewItems.filter((r) => !r.resolved)
  const resolvedReviewItems = template.reviewItems.filter((r) => r.resolved)

  return (
    <div className="space-y-6">
      {/* HEADER — cream rounded-3xl band + 5-card KPI strip */}
      <AdminDetailHeader
        backHref="/products"
        backLabel="Back to queue"
        eyebrow="Products & Categories · Review"
        title={template.name}
        meta={
          <>
            <span>
              {template.subcategory.category.name} · {template.subcategory.name}
            </span>
            {partnerName && partnerId && (
              <>
                <span className="text-ink-400">·</span>
                <Link
                  href={`/partners/${partnerId}`}
                  className="font-medium text-pink-700 hover:text-pink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 focus-visible:rounded"
                >
                  {partnerName}
                </Link>
              </>
            )}
            <span className="text-ink-400">·</span>
            <span className="font-mono text-[11.5px] text-ink-500">
              slug {template.slug}
            </span>
          </>
        }
        status={
          <>
            {restrictionHits.length > 0 && (
              <span
                title={restrictionHits.map((r) => r.label).join(', ')}
                className="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-red-50 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wider text-red-700"
              >
                <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                Restricted · {restrictionHits.map((r) => r.label).join(', ')}
              </span>
            )}
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wider',
                tone.bg,
                tone.text,
                tone.border,
              )}
            >
              <span className={cn('inline-block h-2 w-2 rounded-full', tone.dot)} />
              {statusLabel}
            </span>
          </>
        }
      />

      {/* 6-card KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <KpiCard
            href="#ingredients"
            label="Ingredients"
            value={template.ingredientSlots.length}
            icon={Beaker}
          />
          <KpiCard
            href="#flavors"
            label="Flavors"
            value={template.flavorPresets.length}
            icon={Sparkles}
            tone="pink"
          />
          <KpiCard
            href="#variants"
            label="Variants"
            value={template.variants.length}
            icon={Layers}
            tone="sky"
          />
          <KpiCard
            href="#packaging"
            label="Packaging"
            value={template.packagingSystems.length}
            icon={PackageIcon}
            tone="emerald"
          />
          <KpiCard
            href="#certificates"
            label="Certificates"
            value={template.certificates.length}
            icon={Award}
            tone="amber"
          />
          <KpiCard
            href="#notes"
            label="Open review items"
            value={openReviewItems.length}
            icon={ClipboardList}
            tone={openReviewItems.length > 0 ? 'rose' : undefined}
            subline={
              resolvedReviewItems.length > 0
                ? `${resolvedReviewItems.length} resolved`
                : undefined
            }
          />
        </div>

      {/* TWO COLUMN GRID */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr,360px]">
        {/* LEFT — Main snapshot column */}
        <div className="space-y-6">
          {/* URGENT — high-risk SELF_ATTESTED ingredient banner */}
          {(highRiskSlots.length > 0 || lowRiskSlots.length > 0) && (
            <IngredientRiskBanner
              highRisk={highRiskSlots.map((s) => ({
                name: s.slot.baseIngredient.name,
                weightPct: s.weightPct,
              }))}
              lowRiskCount={lowRiskSlots.length}
            />
          )}

          {/* PROPOSED EDITS diff (PENDING_EDIT_REVIEW only) */}
          {template.status === 'PENDING_EDIT_REVIEW' && template.pendingEditPayload && (
            <PendingEditsDiff
              live={{
                name: template.name,
                description: template.description,
                priceFloorCents: template.priceFloorCents,
                allergenCrossContamination: template.allergenCrossContamination,
              }}
              proposed={template.pendingEditPayload as Record<string, unknown>}
            />
          )}

          {/* Basics */}
          <SnapshotCard icon={FileText} title="Basics">
            <dl className="divide-y divide-ink-100">
              <Row label="Name">{template.name}</Row>
              <Row label="Description" multiline>
                {template.description ?? '—'}
              </Row>
              <Row label="Base price">
                <span className="tabular-nums">
                  ${(template.priceFloorCents / 100).toFixed(2)}{' '}
                  <span className="text-[12px] uppercase tracking-wider text-ink-700">USD</span>
                </span>
              </Row>
              <Row label="Unit cost">
                <span className="tabular-nums">
                  ${(template.unitCostCents / 100).toFixed(2)}{' '}
                  <span className="text-[12px] uppercase tracking-wider text-ink-700">USD</span>
                </span>
              </Row>
            </dl>
          </SnapshotCard>

          {/* Recipe & Nutrition — §4a.3 nutrient summation + §4a.5c overrides
              + §4a.5d ingredient groups + §4a.5e BE disclosure. */}
          <SnapshotCard
            id="recipe"
            icon={Beaker}
            title="Recipe & Nutrition"
            subtitle={
              servingsPerContainer && servingSizeG
                ? `${servingsPerContainer} servings × ${servingSizeG}g`
                : 'Computed from slot weights × ingredient panels'
            }
          >
            <dl className="divide-y divide-ink-100">
              <Row label="Total recipe weight">
                <span className="tabular-nums">{totalWeightG.toFixed(1)}g</span>{' '}
                <span className="text-[12px] uppercase tracking-wider text-ink-700">
                  across {template.ingredientSlots.length} slot{template.ingredientSlots.length === 1 ? '' : 's'}
                </span>
              </Row>
              {firstVariant && (
                <Row label="Per-container">
                  <span className="tabular-nums">{servingsPerContainer ?? '—'}</span> servings ·{' '}
                  <span className="tabular-nums">{servingSizeG ?? '—'}g</span> per serving
                </Row>
              )}
              <Row label="Per-serving nutrition" multiline>
                {Object.keys(perServingNutrients).length === 0 ? (
                  <span className="text-ink-500">
                    Insufficient ingredient panel data — falls back to compliance service at publish.
                  </span>
                ) : (
                  <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
                    {(Object.keys(perServingNutrients) as Array<keyof NutrientMap>).map((k) => (
                      <li key={k} className="flex items-center justify-between gap-2">
                        <span className="text-ink-600">{NUTRIENT_LABELS[k]!}</span>
                        <span className="font-mono tabular-nums text-ink-900">
                          {(perServingNutrients[k] ?? 0).toFixed(1)}
                          {NUTRIENT_UNITS[k]!}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Row>
              {nutrientOverrides && nutrientOverrides.length > 0 && (
                <Row label="Nutrient overrides" multiline>
                  <table className="mt-1 w-full text-[12px]">
                    <thead>
                      <tr className="text-left text-[12px] uppercase tracking-wider text-ink-700">
                        <th className="pr-2 font-semibold">Nutrient</th>
                        <th className="pr-2 font-semibold">Value</th>
                        <th className="font-semibold">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nutrientOverrides.map((o, idx) => (
                        <tr key={idx} className="border-t border-ink-100">
                          <td className="py-1 pr-2 font-medium text-ink-900">{o.nutrient ?? '—'}</td>
                          <td className="py-1 pr-2 font-mono tabular-nums text-ink-900">
                            {o.value ?? '—'}
                          </td>
                          <td className="py-1 text-ink-600">{o.reason ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Row>
              )}
              {ingredientGroups && ingredientGroups.length > 0 && (
                <Row label="Label grouping">
                  <span className="text-ink-600">
                    Grouped on label:{' '}
                    <span className="font-medium text-ink-900">
                      {ingredientGroups
                        .map((g) => g.groupName ?? '—')
                        .filter((n) => n && n !== '—')
                        .join(', ')}
                    </span>
                  </span>
                </Row>
              )}
            </dl>
            {hasBioengineered && (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900">
                <FlaskConical className="h-3 w-3" aria-hidden="true" />
                Contains bioengineered ingredients — disclosure required on label
              </div>
            )}
          </SnapshotCard>

          {/* Ingredients */}
          <SnapshotCard
            id="ingredients"
            icon={Beaker}
            title="Ingredients"
            subtitle={`${template.ingredientSlots.length} slot${template.ingredientSlots.length === 1 ? '' : 's'}`}
          >
            {slotsWithRisk.length === 0 ? (
              <Empty>No ingredient slots configured.</Empty>
            ) : (
              <ul className="space-y-1.5">
                {slotsWithRisk.map(({ slot: s, weightG, weightPct, risk }) => (
                  <li
                    key={s.id}
                    className={cn(
                      'flex items-start justify-between rounded-lg border px-3 py-2 text-[12.5px]',
                      risk === 'HIGH_RISK'
                        ? 'border-rose-200 bg-rose-50/40'
                        : 'border-ink-100 bg-zinc-50/60',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink-900">
                          {s.baseIngredient.name}
                        </span>
                        <IngredientRiskPill
                          risk={risk}
                          status={s.baseIngredient.verificationStatus}
                        />
                      </div>
                      <div className="mt-0.5 text-[11px] text-ink-500">
                        <span className="tabular-nums">{weightG}g</span> ·{' '}
                        <span className="tabular-nums">{weightPct.toFixed(1)}%</span> of recipe ·{' '}
                        {s.baseIngredient.source ?? 'unsourced'}
                      </div>
                    </div>
                    {s.baseIngredient.allergenFlags.length > 0 && (
                      <span className="ml-2 shrink-0 text-[11px] font-medium text-amber-700">
                        {s.baseIngredient.allergenFlags.join(', ')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </SnapshotCard>

          {/* Allergens */}
          <SnapshotCard icon={ShieldAlert} title="Allergens">
            <dl className="divide-y divide-ink-100">
              <Row label="Cross-contamination statement" multiline>
                {template.allergenCrossContamination ?? '—'}
              </Row>
            </dl>
          </SnapshotCard>

          {/* Packaging */}
          <SnapshotCard
            id="packaging"
            icon={Box}
            title="Packaging"
            subtitle={`${template.packagingSystems.length} linked system${template.packagingSystems.length === 1 ? '' : 's'}`}
          >
            {template.packagingSystems.length === 0 ? (
              <Empty>No packaging systems linked.</Empty>
            ) : (
              <ul className="space-y-1.5">
                {template.packagingSystems.map((p) => (
                  <li
                    key={p.packagingSystemId}
                    className="flex items-start justify-between rounded-lg border border-ink-100 bg-zinc-50/60 px-3 py-2 text-[12.5px]"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-ink-900">
                        {p.packagingSystem.partnerName}
                      </div>
                      <div className="mt-0.5 text-[11px] text-ink-500">
                        {humanizeTopology(p.packagingSystem.topology)} ·{' '}
                        {p.packagingSystem.unitCount}/pack · MOQ{' '}
                        <span className="tabular-nums">
                          {p.packagingSystem.moq.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="ml-2 shrink-0 text-right">
                      <div className="font-mono text-[12.5px] font-semibold tabular-nums text-ink-900">
                        ${(p.basePriceCents / 100).toFixed(2)}
                      </div>
                      <div className="mt-0.5 text-[12px] uppercase tracking-wider text-ink-700">
                        {p.leadTimeDays}d lead
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SnapshotCard>

          {/* Variants */}
          <SnapshotCard
            id="variants"
            icon={DollarSign}
            title="Variants"
            subtitle={`${template.variants.length} variant${template.variants.length === 1 ? '' : 's'}`}
          >
            {template.variants.length === 0 ? (
              <Empty>No variants configured.</Empty>
            ) : (
              <ul className="space-y-1.5">
                {template.variants.map((v) => (
                  <li
                    key={v.id}
                    className="rounded-lg border border-ink-100 bg-zinc-50/60 px-3 py-2 text-[12.5px]"
                  >
                    <div className="font-medium text-ink-900">{v.containerFormat}</div>
                    <div className="mt-0.5 text-[11px] text-ink-500">
                      {v.servingsPerContainer} × {Number(v.servingSizeG)}g servings · MOQ{' '}
                      <span className="tabular-nums">
                        {v.moqMin.toLocaleString()}–{v.moqMax.toLocaleString()}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SnapshotCard>

          {/* Flavors — §5 "one product, many curated variations". */}
          <SnapshotCard
            id="flavors"
            icon={Sparkles}
            title="Flavors"
            subtitle={
              template.flavorPresets.length === 0
                ? 'Single-flavor product'
                : `${template.flavorPresets.length} preset${template.flavorPresets.length === 1 ? '' : 's'}${
                    anyFlavorHasNutrientOverride ? ' · per-flavor nutrient overrides' : ''
                  }`
            }
          >
            {template.flavorPresets.length === 0 ? (
              <Empty>Single-flavor product — no presets configured.</Empty>
            ) : (
              <ul className="space-y-1.5">
                {template.flavorPresets.map((f) => {
                  const slots = (f.slotResolution as Array<unknown> | null) ?? []
                  const extras = (f.extras as Array<unknown> | null) ?? []
                  const overrides = (f.nutrientOverrides as Array<unknown> | null) ?? []
                  return (
                    <li
                      key={f.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-ink-100 bg-zinc-50/60 px-3 py-2 text-[12.5px]"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-2.5">
                        <span
                          className="mt-0.5 inline-block h-5 w-5 shrink-0 rounded-full border border-ink-200"
                          style={{ backgroundColor: f.swatchHex ?? '#E5E5E5' }}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-ink-900">{f.name}</span>
                            <FlavorStatusPill status={f.status} />
                            {extras.length > 0 && (
                              <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wider text-sky-800">
                                Has extras
                              </span>
                            )}
                            {overrides.length > 0 && (
                              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                                Nutrient override
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-[11px] text-ink-500">
                            {slots.length} slot{slots.length === 1 ? '' : 's'} overridden
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-mono text-[12px] font-semibold tabular-nums text-ink-900">
                          {f.priceDeltaCents === 0
                            ? 'Base'
                            : `${f.priceDeltaCents > 0 ? '+' : ''}$${(f.priceDeltaCents / 100).toFixed(2)}`}
                        </div>
                        <div className="text-[12px] uppercase tracking-wider text-ink-700">
                          delta / unit
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </SnapshotCard>

          {/* Cost & Pricing — §6.4 per-variant pricing math + §Tier 1 partner
              tier note. Subscribe-and-save reminder is static for V1. */}
          <SnapshotCard
            id="cost"
            icon={DollarSign}
            title="Cost & Pricing"
            subtitle="Floor, unit cost, per-variant math + partner tier note"
          >
            <dl className="divide-y divide-ink-100">
              <Row label="Base price (floor)">
                <span className="tabular-nums">
                  ${(template.priceFloorCents / 100).toFixed(2)}{' '}
                  <span className="text-[12px] uppercase tracking-wider text-ink-700">USD</span>
                </span>
              </Row>
              <Row label="Unit cost">
                <span className="tabular-nums">
                  ${(template.unitCostCents / 100).toFixed(2)}{' '}
                  <span className="text-[12px] uppercase tracking-wider text-ink-700">USD</span>
                </span>
              </Row>
              {partner && (
                <Row label="Partner tier">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-wider',
                        partner.tier === 'PREMIER'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          : partner.tier === 'TRUSTED'
                            ? 'border-sky-200 bg-sky-50 text-sky-900'
                            : 'border-ink-200 bg-zinc-50 text-ink-700',
                      )}
                    >
                      {partner.tier}
                    </span>
                    <span className="text-[11.5px] text-ink-500">
                      {PARTNER_TIER_NOTE[partner.tier]}
                    </span>
                  </span>
                </Row>
              )}
            </dl>
            {template.variants.length > 0 ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-[12px] uppercase tracking-wider text-ink-700">
                      <th className="pb-1.5 pr-3 font-semibold">Container</th>
                      <th className="pb-1.5 pr-3 font-semibold">MOQ range</th>
                      <th className="pb-1.5 pr-3 font-semibold text-right">Cost / unit</th>
                      <th className="pb-1.5 pr-3 font-semibold text-right">Suggested retail</th>
                      <th className="pb-1.5 font-semibold text-right">Gross margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {template.variants.map((v) => {
                      const firstPackaging = template.packagingSystems[0] ?? null
                      const pkgCostCents = firstPackaging?.basePriceCents ?? 0
                      const servings = v.servingsPerContainer || 1
                      const perUnitCost =
                        (template.unitCostCents + pkgCostCents) / Math.max(servings, 1)
                      const retail = template.priceFloorCents * 1.5
                      const margin =
                        retail > 0 ? ((retail - perUnitCost) / retail) * 100 : 0
                      return (
                        <tr key={v.id} className="border-t border-ink-100">
                          <td className="py-1.5 pr-3 font-medium text-ink-900">
                            {v.containerFormat}
                          </td>
                          <td className="py-1.5 pr-3 tabular-nums text-ink-600">
                            {v.moqMin.toLocaleString()}–{v.moqMax.toLocaleString()}
                          </td>
                          <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-ink-900">
                            ${(perUnitCost / 100).toFixed(2)}
                          </td>
                          <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-ink-900">
                            ${(retail / 100).toFixed(2)}
                          </td>
                          <td className="py-1.5 text-right font-mono tabular-nums text-ink-900">
                            {margin.toFixed(0)}%
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
            <p className="mt-3 rounded-lg border border-ink-100 bg-zinc-50/60 px-3 py-2 text-[11.5px] text-ink-600">
              Subscribe-and-save discount caps per tier (Maker / Builder / Agency) — full
              integration is a forward pointer; see{' '}
              <Link href="/tiers" className="font-medium text-pink-700 hover:text-pink-800">
                /admin/tiers
              </Link>{' '}
              for the platform fee schedule.
            </p>
          </SnapshotCard>

          {/* Custom meta — only renders when partner supplied pairs. */}
          {customMetaPairs && customMetaPairs.length > 0 && (
            <SnapshotCard
              id="meta"
              icon={FileText}
              title="Custom meta"
              subtitle={`${customMetaPairs.length} pair${customMetaPairs.length === 1 ? '' : 's'}`}
            >
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-[12px] uppercase tracking-wider text-ink-700">
                    <th className="pb-1.5 pr-3 font-semibold">Key</th>
                    <th className="pb-1.5 font-semibold">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {customMetaPairs.map((p, idx) => (
                    <tr key={idx} className="border-t border-ink-100">
                      <td className="py-1.5 pr-3 font-medium text-ink-900">{p.key ?? '—'}</td>
                      <td className="py-1.5 text-ink-700">{p.value ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SnapshotCard>
          )}

          {/* Media — hero + gallery (max 6) + product video. New builder stores
              the gallery in galleryAssetIds[] and the clip in videoAssetId. */}
          {(template.imageAssetId || galleryAssetIds.length > 0 || videoAssetId) && (
            <SnapshotCard
              id="media"
              icon={ImageIcon}
              title="Media"
              subtitle={[
                template.imageAssetId ? 'hero' : null,
                galleryAssetIds.length > 0
                  ? `${galleryAssetIds.length} gallery image${galleryAssetIds.length === 1 ? '' : 's'}`
                  : null,
                videoAssetId ? 'video' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            >
              <div className="space-y-1.5">
                {template.imageAssetId && (
                  <MediaAssetRow
                    kind="hero"
                    label="Hero image"
                    assetId={template.imageAssetId}
                  />
                )}
                {galleryAssetIds.map((aid, idx) => (
                  <MediaAssetRow
                    key={aid}
                    kind="image"
                    label={`Gallery ${idx + 1}`}
                    assetId={aid}
                  />
                ))}
                {videoAssetId && (
                  <MediaAssetRow kind="video" label="Product video" assetId={videoAssetId} />
                )}
              </div>
            </SnapshotCard>
          )}

          {/* Creator-configurable options — the configurator axes the
              manufacturer exposed (docs/PRODUCT_CONFIGURATOR_CONSTRAINTS.md).
              The label-affecting axes are the compliance-critical ones: each
              creator selection recomputes the FDA Facts panel via the overlay
              engine, so admin must see exactly which axes mutate the label. */}
          {optionAxes.length > 0 && (
            <SnapshotCard
              id="options"
              icon={Layers}
              title="Creator-configurable options"
              subtitle={`${optionAxes.length} axis${optionAxes.length === 1 ? '' : 'es'}${
                labelAffectingAxes.length > 0
                  ? ` · ${labelAffectingAxes.length} change the Facts label`
                  : ''
              }`}
            >
              {labelAffectingAxes.length > 0 && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11.5px] text-amber-900">
                  <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {labelAffectingAxes.length} axis
                    {labelAffectingAxes.length === 1 ? '' : 'es'} recompute the FDA Facts
                    label per creator selection — verify each value&rsquo;s overlay before
                    publishing.
                  </span>
                </div>
              )}
              <ul className="space-y-2.5">
                {optionAxes.map((axis) => (
                  <li
                    key={axis.id}
                    className="rounded-xl border border-ink-100 bg-zinc-50/50 px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[12.5px] font-semibold text-ink-900">
                        {axis.label}
                      </span>
                      <span className="font-mono text-[10px] text-ink-400">{axis.key}</span>
                      <OptionTag
                        tone={axis.editableByCreator ? 'pink' : 'neutral'}
                        label={axis.editableByCreator ? 'Creator-editable' : 'Locked'}
                      />
                      {axis.affectsLabel && <OptionTag tone="amber" label="Affects label" />}
                      <OptionTag tone="neutral" label={axis.layer} />
                      {axis.required && <OptionTag tone="neutral" label="Required" />}
                    </div>
                    {axis.values.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {axis.values.map((v) => (
                          <li
                            key={v.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-ink-100 bg-white px-2.5 py-1.5 text-[12px]"
                          >
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate font-medium text-ink-900">
                                {v.label}
                              </span>
                              {v.isDefault && <OptionTag tone="emerald" label="Default" />}
                              {v.overlayOp !== 'NONE' && (
                                <OptionTag tone="sky" label={v.overlayOp} />
                              )}
                            </span>
                            <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-ink-500">
                              {formatDelta(v.unitCostDeltaCents, '$')}
                              {v.leadTimeDeltaDays !== 0 && ` · ${formatDelta(v.leadTimeDeltaDays, 'd')}`}
                              {v.moqOverride != null && ` · MOQ≥${v.moqOverride.toLocaleString()}`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </SnapshotCard>
          )}

          {/* Production & storage — first-run vs repeat lead times, storage
              class + temperature band, and the multi-flavor pack cap. */}
          {hasProductionStorageData && (
            <SnapshotCard
              id="production"
              icon={PackageIcon}
              title="Production & storage"
              subtitle="Lead times · storage class · pack cap"
            >
              <dl className="divide-y divide-ink-100">
                {(leadTimeRepeatDays != null || leadTimeFirstRunDays != null) && (
                  <Row label="Lead time">
                    <span className="tabular-nums">
                      {leadTimeFirstRunDays != null
                        ? `${leadTimeFirstRunDays}d first run`
                        : '—'}
                      {' · '}
                      {leadTimeRepeatDays != null ? `${leadTimeRepeatDays}d repeat` : '—'}
                    </span>
                  </Row>
                )}
                {storageClass && (
                  <Row label="Storage class">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-medium text-ink-900">
                        {STORAGE_CLASS_LABEL[storageClass]}
                      </span>
                      {(storageTempMinF != null || storageTempMaxF != null) && (
                        <span className="text-[11.5px] text-ink-500 tabular-nums">
                          {storageTempMinF ?? '—'}–{storageTempMaxF ?? '—'}°F
                        </span>
                      )}
                    </span>
                  </Row>
                )}
                {maxFlavorsPerPack != null && (
                  <Row label="Max flavors / pack">
                    <span className="tabular-nums">
                      {maxFlavorsPerPack}{' '}
                      <span className="text-[12px] uppercase tracking-wider text-ink-700">
                        distinct
                      </span>
                    </span>
                  </Row>
                )}
              </dl>
            </SnapshotCard>
          )}

          {/* Fees — one-time / per-unit / per-order surcharges the manufacturer
              attached (#3). Surfaced so admin can sanity-check the economics. */}
          {fees.length > 0 && (
            <SnapshotCard
              id="fees"
              icon={DollarSign}
              title="Fees"
              subtitle={`${fees.length} fee${fees.length === 1 ? '' : 's'}`}
            >
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-[12px] uppercase tracking-wider text-ink-700">
                    <th className="pb-1.5 pr-3 font-semibold">Fee</th>
                    <th className="pb-1.5 pr-3 font-semibold">Basis</th>
                    <th className="pb-1.5 pr-3 font-semibold text-right">Amount</th>
                    <th className="pb-1.5 font-semibold text-right">Waived above</th>
                  </tr>
                </thead>
                <tbody>
                  {fees.map((f) => (
                    <tr key={f.id} className="border-t border-ink-100">
                      <td className="py-1.5 pr-3 font-medium text-ink-900">{f.label}</td>
                      <td className="py-1.5 pr-3 text-ink-600">{FEE_BASIS_LABEL[f.basis]}</td>
                      <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-ink-900">
                        ${(f.amountCents / 100).toFixed(2)}
                      </td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-ink-600">
                        {f.waivedAboveQty != null
                          ? `${f.waivedAboveQty.toLocaleString()} u`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SnapshotCard>
          )}

          {/* Certificates */}
          <SnapshotCard
            id="certificates"
            icon={Award}
            title="Certificates"
            subtitle={`${template.certificates.length} attached`}
          >
            {template.certificates.length === 0 ? (
              <Empty>No certificates attached.</Empty>
            ) : (
              <ul className="space-y-1">
                {template.certificates.map((c) => (
                  <li
                    key={c.instanceId}
                    className="flex items-center gap-2 rounded-lg border border-ink-100 bg-zinc-50/60 px-3 py-2 text-[12.5px] text-ink-900"
                  >
                    <Award className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
                    {c.instance.certificateType.name}
                  </li>
                ))}
              </ul>
            )}
          </SnapshotCard>
        </div>

        {/* RIGHT — Sticky rail. Decision panel goes FIRST so Approve / Request
            changes / Reject are immediately visible — previously it sat dead
            last under the placement + constraints panels, well below the fold. */}
        <aside id="notes" className="space-y-6 md:sticky md:top-6 md:self-start">
          {/* Decision + checklist + notes — the primary review action surface. */}
          <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
            <ProductReviewer
              productTemplateId={template.id}
              currentStatus={template.status}
              openReviewItems={openReviewItems.map((r) => ({
                id: r.id,
                category: r.category,
                description: r.description,
              }))}
              notes={template.notes.map((n) => ({
                id: n.id,
                authorName: nameByAuthorId.get(n.authorId) ?? 'Unknown',
                authorType: n.authorType,
                body: n.body,
                createdAt: n.createdAt,
              }))}
            />
          </div>

          {/* Quick actions */}
          <SnapshotCard icon={ExternalLink} title="Quick actions" compact>
            <div className="flex flex-col gap-2">
              {partnerId && (
                <Link
                  href={`/partners/${partnerId}`}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-ink-300 bg-white px-4 py-2 text-[12.5px] font-semibold text-ink-900 transition-colors hover:border-ink-400 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  View partner
                </Link>
              )}
              <Link
                href={`/audit?entityType=ProductTemplate&entityId=${template.id}`}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-ink-300 bg-white px-4 py-2 text-[12.5px] font-semibold text-ink-900 transition-colors hover:border-ink-400 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
              >
                <History className="h-3.5 w-3.5" aria-hidden="true" />
                Audit history
              </Link>
              {/* Cross-app (admin 3003 → partner 3002): plain <a> + partnerUrl,
                  not <Link>, and the consolidated builder route (the /edit
                  route was retired → it redirects to /products/new?draft=). */}
              <a
                href={partnerUrl(`/products/new?draft=${template.id}`)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-ink-300 bg-white px-4 py-2 text-[12.5px] font-semibold text-ink-900 transition-colors hover:border-ink-400 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                Open in partner builder
              </a>
              <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-ink-100 bg-zinc-50/60 px-3 py-1.5">
                <span className="text-[12px] font-bold uppercase tracking-wider text-ink-700">
                  <Hash className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
                  Product ID
                </span>
                <span
                  className="truncate font-mono text-[10.5px] text-ink-700"
                  title={template.id}
                >
                  {template.id.slice(0, 12)}…
                </span>
              </div>
            </div>
          </SnapshotCard>

          {/* Slice 3C — Marketplace placement (above Partner Constraints).
              Admin can override niche + lifestyle-tag assignments + see the
              auto-suggest engine's reasoning. */}
          <MarketplacePlacementPanel
            productTemplateId={template.id}
            allNiches={allNiches}
            allLifestyleTags={allLifestyleTags}
            assignedNicheIds={assignedNicheIds}
            assignedLifestyleTagIds={assignedLifestyleTagIds}
            lifestyleTagSourceById={lifestyleTagSourceById}
            nicheAuditByNicheId={nicheAuditByNicheId}
            suggestedNicheIds={suggestedNicheIds}
            lockedNicheIds={lockedNicheIds}
            ruleHits={ruleHits}
          />

          {/* Marketplace detail-page marketing copy — admin authors the per-template
              copy the public detail page merges over the fixture. */}
          <MarketingCopyPanel
            productTemplateId={template.id}
            initial={{
              longDescription: marketingCopy?.longDescription ?? null,
              marketingDetail: marketingCopy?.marketingDetail ?? null,
            }}
          />

          {/* Marketplace filter attributes (§7) — Format / process / allergen-free
              / markets. Drives the public catalog filters. */}
          <MarketplaceAttributesPanel
            productTemplateId={template.id}
            initial={{
              manufacturingFormat: filterAttrs?.manufacturingFormat ?? null,
              manufacturingProcesses: filterAttrs?.manufacturingProcesses ?? [],
              allergenFreeClaims: filterAttrs?.allergenFreeClaims ?? [],
              marketCodes: filterAttrs?.marketCodes ?? [],
              ratingAvg: filterAttrs?.ratingAvg ?? null,
              ratingCount: filterAttrs?.ratingCount ?? 0,
            }}
          />

          {/* Label phrases — admin can override the per-product label-phrase
              engine's MANDATORY/RECOMMENDED suggestions + see its reasoning. */}
          <PhrasePlacementPanel
            productTemplateId={template.id}
            suggestedPhrases={suggestedPhrases}
            assignedPhraseIds={assignedPhraseIds}
            lockedPhraseIds={lockedPhraseIds}
            phraseSourceById={phraseSourceById}
            ruleHits={phraseRuleHits}
          />

          {/* Partner Constraints — the surface Pavel asked for. Walks every
              partner-side gate the spec mentions (status / service status /
              tier / disclosure / certs / banned ingredients / high-weight
              self-attested / allergens / region / MOQ). */}
          <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
            <header className="flex items-center gap-2.5 border-b border-ink-100 bg-[var(--bg-hero)] px-4 py-2.5">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-ink-100 text-ink-700">
                <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <h2 className="font-display text-[13.5px] font-semibold leading-none tracking-tight text-ink-900">
                Partner constraints
              </h2>
            </header>
            <ul className="divide-y divide-ink-100">
              <ConstraintRow
                tone={partner?.status === 'ACTIVE' ? 'pass' : 'block'}
                icon={Building2}
                title="Partner status"
                detail={
                  partner
                    ? partner.status === 'ACTIVE'
                      ? `${partner.companyName} is ACTIVE`
                      : `Partner is ${PARTNER_STATUS_LABELS[partner.status]!} — products from non-ACTIVE partners cannot be published`
                    : 'No manufacturer service attached'
                }
              />
              <ConstraintRow
                tone={
                  serviceStatus === 'ACTIVE'
                    ? 'pass'
                    : serviceStatus === 'DRAFT'
                      ? 'warn'
                      : 'block'
                }
                icon={Gavel}
                title="Service status"
                detail={
                  serviceStatus
                    ? `Manufacturing service: ${serviceStatus}`
                    : 'No manufacturing service linked'
                }
              />
              {partner && (
                <ConstraintRow
                  tone="info"
                  icon={Award}
                  title="Partner tier"
                  detail={PARTNER_TIER_NOTE[partner.tier]}
                  chip={partner.tier}
                />
              )}
              {certExpiries.length === 0 ? (
                <ConstraintRow
                  tone="info"
                  icon={Award}
                  title="Certificate expiries"
                  detail="No certificates linked to this product"
                />
              ) : (
                certExpiries.map((c, idx) => (
                  <ConstraintRow
                    key={idx}
                    tone={
                      c.bucket === 'ok'
                        ? 'pass'
                        : c.bucket === 'warning'
                          ? 'warn'
                          : c.bucket === 'critical' || c.bucket === 'expired'
                            ? 'block'
                            : 'info'
                    }
                    icon={Award}
                    title={c.name}
                    detail={
                      c.expiry
                        ? c.bucket === 'expired'
                          ? `Expired ${Math.abs(c.days ?? 0)}d ago — block until renewed`
                          : c.bucket === 'critical'
                            ? `Lapses in ${c.days}d — block until renewed`
                            : c.bucket === 'warning'
                              ? `Expires in ${c.days}d (under 90-day warning window)`
                              : `Expires ${c.expiry.toLocaleDateString()} (${c.days}d out)`
                        : 'No expiry on file'
                    }
                  />
                ))
              )}
              <ConstraintRow
                tone={
                  disclosureLevel === 'FULL'
                    ? 'pass'
                    : disclosureLevel === 'ANONYMOUS'
                      ? 'warn'
                      : 'info'
                }
                icon={Eye}
                title="Disclosure level"
                detail={
                  disclosureLevel === 'ANONYMOUS'
                    ? 'Service is ANONYMOUS — partner brand cannot publicly appear on product'
                    : disclosureLevel === 'CITY_STATE'
                      ? 'Service is CITY_STATE — partner location prints without legal name'
                      : disclosureLevel === 'FULL'
                        ? 'Service is FULL — partner brand may publicly appear'
                        : 'No disclosure level set'
                }
                chip={disclosureLevel ?? undefined}
              />
              {bannedHits.length === 0 ? (
                <ConstraintRow
                  tone="pass"
                  icon={Ban}
                  title="Banned ingredients"
                  detail={`Cross-checked against ${bannedIngredients.length} active banned-list entries`}
                />
              ) : (
                bannedHits.map((h, idx) => (
                  <ConstraintRow
                    key={`banned-${idx}`}
                    tone="block"
                    icon={Ban}
                    title={`${h.slotName} is banned`}
                    detail={
                      <>
                        {h.banned.reason}
                        {h.banned.reference ? (
                          <>
                            {' · '}
                            <a
                              href={h.banned.reference}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-pink-700 hover:text-pink-800"
                            >
                              reference
                            </a>
                          </>
                        ) : null}
                      </>
                    }
                  />
                ))
              )}
              <ConstraintRow
                tone={highRiskSlots.length === 0 ? 'pass' : 'block'}
                icon={FlaskConical}
                title="Self-attested high-weight ingredients"
                detail={
                  highRiskSlots.length === 0
                    ? 'No SELF_ATTESTED ingredient sits above the 5%-weight threshold'
                    : `${highRiskSlots.length} self-attested above 5% threshold — promote to library or downgrade weight before publish`
                }
              />
              <ConstraintRow
                tone={
                  hasCrossContaminationStatement
                    ? 'pass'
                    : anySlotHasAllergens
                      ? 'warn'
                      : 'info'
                }
                icon={ShieldAlert}
                title="Allergen cross-contamination"
                detail={
                  hasCrossContaminationStatement
                    ? 'Partner-supplied cross-contamination statement on file'
                    : anySlotHasAllergens
                      ? 'Recipe carries allergens but no facility statement — partners with allergen-handling capability MUST provide'
                      : 'No allergens in recipe; statement optional'
                }
              />
              <ConstraintRow
                tone="pass"
                icon={Globe2}
                title="Partner region / market"
                detail={
                  partner
                    ? `${partner.country ?? '—'}${
                        partner.primaryRegion ? ` · ${partner.primaryRegion.name}` : ''
                      } · publishes into US/FDA market`
                    : 'No partner attached'
                }
              />
              <ConstraintRow
                tone={
                  minVariantMoq == null
                    ? 'info'
                    : minVariantMoq < 100
                      ? 'warn'
                      : 'pass'
                }
                icon={PackageIcon}
                title="MOQ floor"
                detail={
                  minVariantMoq == null
                    ? 'No variants — MOQ unspecified'
                    : minVariantMoq < 100
                      ? `Lowest variant MOQ is ${minVariantMoq.toLocaleString()} — verify partner can fulfill at this scale`
                      : `Lowest variant MOQ is ${minVariantMoq.toLocaleString()}`
                }
              />
              <ConstraintRow
                tone="info"
                icon={History}
                title="Ingredient reuse"
                detail={`Across this recipe, ingredients have been used ${Array.from(
                  usageCountByIngredientId.values(),
                ).reduce((a, b) => a + b, 0)} times by partners platform-wide`}
              />
            </ul>
          </section>

          {/* Approval-map preview — static reference per §8b. */}
          <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
            <header className="flex items-center gap-2.5 border-b border-ink-100 bg-[var(--bg-hero)] px-4 py-2.5">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-ink-100 text-ink-700">
                <ScrollText className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <h2 className="font-display text-[13.5px] font-semibold leading-none tracking-tight text-ink-900">
                What edits trigger re-review
              </h2>
            </header>
            <div className="px-4 py-3 text-[12px] text-ink-700">
              <p>
                Per <span className="font-mono text-[11px]">approval-map.ts</span> (§8b),
                published products go back to <code className="font-mono text-[11px]">PENDING_EDIT_REVIEW</code>{' '}
                when the partner touches any of:
              </p>
              <ul className="mt-1.5 list-disc pl-4 text-[11.5px] leading-relaxed text-ink-600">
                <li>name, category, subcategory</li>
                <li>ingredient slots + replacements + weights</li>
                <li>flavor presets (slot picks · extras · price delta)</li>
                <li>packaging system add/remove + per-size price</li>
                <li>pricing tiers, certificates added, allergen overrides</li>
              </ul>
              <p className="mt-2 text-[11.5px] text-ink-500">
                Cosmetic edits (description, media, swatch hex, custom meta, tags, internal
                SKU) ship live without re-review.
              </p>
            </div>
          </section>

          {/* Compliance pre-check — static forward-pointer per §8.2. */}
          <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
            <header className="flex items-center gap-2.5 border-b border-ink-100 bg-[var(--bg-hero)] px-4 py-2.5">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-ink-100 text-ink-700">
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <h2 className="font-display text-[13.5px] font-semibold leading-none tracking-tight text-ink-900">
                Compliance pre-check
              </h2>
            </header>
            <ul className="divide-y divide-ink-100">
              {[
                'FDA Nutrition Facts rule pack (21 CFR 101.9)',
                'Big 9 allergen "Contains:" line',
                'Net-quantity format + placement',
                'Label section completeness scan',
              ].map((label) => (
                <li
                  key={label}
                  className="flex items-center justify-between gap-3 px-4 py-2 text-[12px]"
                >
                  <span className="text-ink-700">{label}</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-zinc-50 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider text-ink-600">
                    Not yet integrated
                  </span>
                </li>
              ))}
            </ul>
            <p className="border-t border-ink-100 bg-zinc-50/60 px-4 py-2 text-[11px] text-ink-500">
              These run automatically before admin sees the row once the compliance service
              is wired (§8.2).
            </p>
          </section>

        </aside>
      </div>
    </div>
  )
}

// =============================================================================
// KpiCard — copied verbatim from /admin/partners (shape locked there)
// =============================================================================

function KpiCard({
  href,
  label,
  value,
  icon: Icon,
  tone,
  active,
  subline,
}: {
  href: string
  label: string
  value: number
  icon: LucideIcon
  tone?: 'amber' | 'emerald' | 'sky' | 'rose' | 'pink'
  active?: boolean
  subline?: string
}) {
  const ring: Record<NonNullable<typeof tone>, string> = {
    amber: 'group-hover:ring-amber-300/60',
    emerald: 'group-hover:ring-emerald-300/60',
    sky: 'group-hover:ring-sky-300/60',
    rose: 'group-hover:ring-rose-300/60',
    pink: 'group-hover:ring-pink-300/60',
  }
  const iconTone: Record<NonNullable<typeof tone>, string> = {
    amber: 'bg-amber-100 text-amber-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    sky: 'bg-sky-100 text-sky-700',
    rose: 'bg-rose-100 text-rose-700',
    pink: 'bg-pink-100 text-pink-700',
  }
  return (
    <Link
      href={href}
      className={cn(
        'group relative rounded-2xl border border-ink-200 bg-white px-4 py-3.5 transition-shadow',
        'hover:shadow-[0_4px_18px_-8px_rgba(0,0,0,0.18)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2',
        'ring-1 ring-transparent',
        tone ? ring[tone] : 'group-hover:ring-pink-300/40',
        active && 'ring-pink-300/40',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center rounded-xl',
            tone ? iconTone[tone] : 'bg-pink-100 text-pink-700',
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="flex-1">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">
            {label}
          </p>
          <p className="font-display text-[22px] font-bold leading-none text-ink-900 tabular-nums">
            {value}
          </p>
          {subline && <p className="mt-1 text-[10.5px] text-ink-500">{subline}</p>}
        </div>
      </div>
    </Link>
  )
}

// =============================================================================
// PendingEditsDiff — proposed vs live for PENDING_EDIT_REVIEW (restyled to v2)
// =============================================================================

function PendingEditsDiff({
  live,
  proposed,
}: {
  live: {
    name: string
    description: string | null
    priceFloorCents: number
    allergenCrossContamination: string | null
  }
  proposed: Record<string, unknown>
}) {
  const fields = [
    { key: 'name', label: 'Name', liveVal: live.name },
    { key: 'description', label: 'Description', liveVal: live.description ?? '—' },
    {
      key: 'priceFloorCents',
      label: 'Base price',
      liveVal: `$${(live.priceFloorCents / 100).toFixed(2)}`,
      format: (v: unknown) => `$${(((v as number) ?? 0) / 100).toFixed(2)}`,
    },
    {
      key: 'allergenCrossContamination',
      label: 'Cross-contamination',
      liveVal: live.allergenCrossContamination ?? '—',
    },
  ] as const

  const changed = fields.filter((f) => f.key in proposed && proposed[f.key] !== undefined)
  if (changed.length === 0) return null

  return (
    <section className="rounded-2xl border border-sky-200 bg-sky-50/40 p-5">
      <div className="flex items-start gap-2.5">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
          <FileText className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[15px] font-semibold text-sky-900">
            Proposed edits to live product
          </h2>
          <p className="mt-0.5 text-[12px] text-sky-800">
            Live version keeps serving until you approve or send back.
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {changed.map((f) => {
          const proposedRaw = proposed[f.key]
          const proposedDisplay =
            'format' in f && f.format ? f.format(proposedRaw) : String(proposedRaw ?? '—')
          return (
            <div
              key={f.key}
              className="grid grid-cols-[120px,1fr,1fr] items-start gap-3 text-[12.5px]"
            >
              <div className="pt-1 text-[12px] font-bold uppercase tracking-wider text-ink-700">
                {f.label}
              </div>
              <div className="rounded-lg border border-ink-100 bg-white px-2.5 py-1.5 text-ink-600 line-through">
                {f.liveVal}
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 font-medium text-emerald-900">
                {proposedDisplay}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// =============================================================================
// SnapshotCard + Row + Empty — shared chrome helpers
// =============================================================================

function SnapshotCard({
  id,
  icon: Icon,
  title,
  subtitle,
  compact = false,
  children,
}: {
  id?: string
  icon: LucideIcon
  title: string
  subtitle?: string
  compact?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className="overflow-hidden rounded-2xl border border-ink-200 bg-white scroll-mt-6"
    >
      <header className="flex items-center justify-between gap-3 border-b border-ink-100 bg-zinc-50/60 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-ink-100 text-ink-700">
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-[14px] font-semibold leading-none tracking-tight text-ink-900">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1 text-[11px] text-ink-500">{subtitle}</p>
            )}
          </div>
        </div>
      </header>
      <div className={compact ? 'p-3' : 'p-4'}>{children}</div>
    </section>
  )
}

function Row({
  label,
  multiline,
  children,
}: {
  label: string
  multiline?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'grid gap-1 py-2 first:pt-0 last:pb-0',
        multiline ? '' : 'sm:grid-cols-[160px,1fr] sm:gap-3',
      )}
    >
      <span className="text-[12px] font-bold uppercase tracking-wider text-ink-700">
        {label}
      </span>
      <span
        className={cn(
          'text-[12.5px] text-ink-900',
          multiline ? 'whitespace-pre-wrap' : '',
        )}
      >
        {children}
      </span>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-ink-200 bg-ink-50/40 px-3 py-2.5 text-[12px] text-ink-500">
      {children}
    </p>
  )
}

function humanizeTopology(t: string): string {
  return t
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// =============================================================================
// New-builder render helpers — media rows, option tags, delta formatting
// =============================================================================

function MediaAssetRow({
  kind,
  label,
  assetId,
}: {
  kind: 'hero' | 'image' | 'video'
  label: string
  assetId: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-ink-100 bg-zinc-50/60 px-3 py-2 text-[12.5px] text-ink-900">
      <ImageIcon
        className={cn(
          'h-3.5 w-3.5 shrink-0',
          kind === 'hero'
            ? 'text-pink-600'
            : kind === 'video'
              ? 'text-sky-600'
              : 'text-ink-500',
        )}
        aria-hidden="true"
      />
      <span className="shrink-0 text-[12px] font-bold uppercase tracking-wider text-ink-700">
        {label}
      </span>
      <span className="truncate font-mono text-[11px] text-ink-600" title={assetId}>
        {assetId}
      </span>
    </div>
  )
}

type OptionTagTone = 'pink' | 'amber' | 'sky' | 'emerald' | 'neutral'

function OptionTag({ tone, label }: { tone: OptionTagTone; label: string }) {
  const cls: Record<OptionTagTone, string> = {
    pink: 'border-pink-200 bg-pink-50 text-pink-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    sky: 'border-sky-200 bg-sky-50 text-sky-800',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    neutral: 'border-ink-200 bg-zinc-50 text-ink-600',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wider',
        cls[tone],
      )}
    >
      {label}
    </span>
  )
}

/** Signed delta for option-value economics. unit '$' = cents→dollars, 'd' = days. */
function formatDelta(value: number, unit: '$' | 'd'): string {
  if (unit === '$') {
    const dollars = value / 100
    const sign = dollars > 0 ? '+' : dollars < 0 ? '−' : ''
    return `${sign}$${Math.abs(dollars).toFixed(2)}`
  }
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${Math.abs(value)}d`
}

// =============================================================================
// #141 — Ingredient risk surfacing (banner + per-row pill)
// =============================================================================

function IngredientRiskBanner({
  highRisk,
  lowRiskCount,
}: {
  highRisk: Array<{ name: string; weightPct: number }>
  lowRiskCount: number
}) {
  // High-risk path: rose-50/60 urgent strip — matches the v2 urgent-callout
  // pattern from /admin/partners and /admin/orders.
  if (highRisk.length > 0) {
    return (
      <section
        role="alert"
        className="rounded-2xl border border-rose-200 bg-rose-50/60 px-5 py-4"
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
            <AlertTriangle className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[15px] font-semibold text-rose-900">
              {highRisk.length === 1
                ? '1 high-weight SELF_ATTESTED ingredient'
                : `${highRisk.length} high-weight SELF_ATTESTED ingredients`}
            </h2>
            <p className="mt-0.5 text-[12px] text-rose-800">
              Each is above the {HIGH_WEIGHT_THRESHOLD_PCT}% recipe-weight threshold and
              hasn&rsquo;t been admin-verified — their nutrient + allergen data carries the
              FDA-printed label. Review the ingredient in{' '}
              <Link href="/ingredients" className="font-semibold underline">
                the queue
              </Link>{' '}
              before approving this product.
            </p>
            <ul className="mt-2 space-y-1 text-[12px] text-rose-900">
              {highRisk.map((i) => (
                <li key={i.name} className="flex items-center gap-2">
                  <span className="font-mono text-[11px] tabular-nums">
                    {i.weightPct.toFixed(1)}%
                  </span>
                  <span className="font-medium">{i.name}</span>
                </li>
              ))}
            </ul>
            {lowRiskCount > 0 && (
              <p className="mt-2 text-[11px] text-rose-700/80">
                Plus {lowRiskCount} additional SELF_ATTESTED ingredient
                {lowRiskCount === 1 ? '' : 's'} under the threshold (lower risk, still
                attestation-only).
              </p>
            )}
          </div>
        </div>
      </section>
    )
  }

  // Low-risk only path — softer amber informational strip.
  if (lowRiskCount > 0) {
    return (
      <section
        role="status"
        className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 px-5 py-3.5"
      >
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
          <FlaskConical className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 text-[12.5px] text-amber-900">
          <span className="font-semibold">
            {lowRiskCount} SELF_ATTESTED ingredient
            {lowRiskCount === 1 ? '' : 's'} in this recipe.
          </span>{' '}
          All under the {HIGH_WEIGHT_THRESHOLD_PCT}%-weight threshold — partner attestation
          is the only verification. Promote in{' '}
          <Link href="/ingredients" className="font-semibold underline">
            the queue
          </Link>{' '}
          if any get repeated across partners.
        </div>
      </section>
    )
  }

  return null
}

function IngredientRiskPill({
  risk,
  status,
}: {
  risk: IngredientRisk
  status: string
}) {
  if (risk === 'HIGH_RISK') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-100 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wider text-rose-800"
        title="Above 5% of recipe weight + only partner attestation. Verify before approving."
      >
        <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
        Risk
      </span>
    )
  }
  if (risk === 'LOW_RISK') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wider text-amber-800"
        title="Partner self-attested. Under the 5% threshold so lower-risk, but unverified."
      >
        Self-attested
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
      {status === 'ADMIN_VERIFIED' ? 'Verified' : 'Library'}
    </span>
  )
}

// =============================================================================
// FlavorStatusPill — FlavorPreset.status chip
// =============================================================================

function FlavorStatusPill({ status }: { status: FlavorPresetStatus }) {
  const map: Record<FlavorPresetStatus, { label: string; cls: string }> = {
    ACTIVE: {
      label: 'Active',
      cls: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    },
    DRAFT: { label: 'Draft', cls: 'border-ink-200 bg-zinc-50 text-ink-700' },
    RETIRED: { label: 'Retired', cls: 'border-ink-200 bg-zinc-100 text-ink-500' },
  }
  const tone = map[status]!
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wider',
        tone.cls,
      )}
    >
      {tone.label}
    </span>
  )
}

// =============================================================================
// ConstraintRow — used by the Partner Constraints panel.
// Tones map 1:1 to the spec's request: pass = emerald, warn = amber,
// block = rose, info = neutral.
// =============================================================================

function ConstraintRow({
  tone,
  icon: Icon,
  title,
  detail,
  chip,
}: {
  tone: 'pass' | 'warn' | 'block' | 'info'
  icon: LucideIcon
  title: string
  detail: React.ReactNode
  chip?: string
}) {
  const palette: Record<
    typeof tone,
    { ring: string; iconBg: string; iconColor: string; titleColor: string; StatusIcon: LucideIcon }
  > = {
    pass: {
      ring: 'border-emerald-100',
      iconBg: 'bg-emerald-50',
      iconColor: 'text-emerald-700',
      titleColor: 'text-emerald-900',
      StatusIcon: CheckCircle2,
    },
    warn: {
      ring: 'border-amber-100',
      iconBg: 'bg-amber-50',
      iconColor: 'text-amber-700',
      titleColor: 'text-amber-900',
      StatusIcon: AlertTriangle,
    },
    block: {
      ring: 'border-rose-100',
      iconBg: 'bg-rose-50',
      iconColor: 'text-rose-700',
      titleColor: 'text-rose-900',
      StatusIcon: XCircle,
    },
    info: {
      ring: 'border-ink-100',
      iconBg: 'bg-zinc-50',
      iconColor: 'text-ink-600',
      titleColor: 'text-ink-900',
      StatusIcon: Eye,
    },
  }
  const p = palette[tone]
  const StatusIcon = p.StatusIcon
  return (
    <li className={cn('flex items-start gap-3 px-4 py-2.5', p.ring)}>
      <span
        className={cn(
          'mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
          p.iconBg,
          p.iconColor,
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn('text-[12.5px] font-semibold', p.titleColor)}>{title}</span>
          {chip && (
            <span className="inline-flex items-center rounded-full border border-ink-200 bg-zinc-50 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wider text-ink-700">
              {chip}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[11.5px] leading-snug text-ink-600">{detail}</div>
      </div>
      <StatusIcon
        className={cn('mt-1 h-3.5 w-3.5 shrink-0', p.iconColor)}
        aria-hidden="true"
      />
    </li>
  )
}
