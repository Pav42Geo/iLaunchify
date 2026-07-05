'use client'

// CanvasLayoutShell — full canvas page layout matching the legacy screenshots
// (Pavel's reference from FOD-reference/frontend/src/app/design-studio/[productId]/canvas).
// Per docs/DESIGN_STUDIO_REBUILD.md §3.
//
// Layout structure:
//   Top bar (~73px): iLaunchify mark / Saved / undo+redo / COMPLIANCE / MOCKUP / Exit Studio
//   Left rail (80px): 11 tool icons (Product, Label, Text, Images, Graphics,
//                     Clipart, Background, Pattern, QR Code, Barcode, Layers)
//   Slide-out drawer (400px): opens to the right of the rail when a tool is selected
//   Center canvas: Fabric.js stage + die-cut frame overlay
//   Bottom floating toolbar: zoom / fit / rotate / pan / undo / redo
//   Top floating text-format toolbar: appears when text object selected
//
// Phase C ships the layout shell + canvas + Product drawer (die-cut guide
// toggles). All other tool drawers are placeholder buttons that just toggle
// state — they get wired in Phase D one at a time per
// docs/DESIGN_STUDIO_REBUILD.md §5 build sequence.

import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  Brand,
  BrandMark,
  DieCutFrame,
  DieCutLegend,
  resolveLayout,
  frameKindFromCanvasRole,
  type ResolvedFrame,
  type ComplianceContext,
  type BrandCanvasAssets,
  type DieCutSpec,
  type FabricCanvas,
  type GuideVisibility,
  DEFAULT_GUIDES,
  reconcileCertBadges,
  addCertBadge,
  type NutritionPanelData,
  type AggregateNutritionData,
  type SupplementPanelData,
  type AafcoPanelData,
  SavedIndicator,
  snapshotCanvasAsPng,
  CANVAS_PROPERTIES_TO_INCLUDE,
  type FrameLayout,
  type SnapshotItem,
} from '@ilaunchify/ui'
import type { CertBadge, CertBadgeVariant } from './cert-badge-actions'
import type { PreflightPartnerSpecResolved } from './partner-spec-actions'
import type { BarcodeMode } from './retail-identity-actions'
import type { DielineFramesData } from '@/lib/dieline-frames'
import type { LabelingType } from '@ilaunchify/db'
import { useCanvasHistory } from './useCanvasHistory'
import {
  useSelectedObject,
  isTextObject,
  getCustomType,
  isCodeCustomType,
  isLabelPanelType,
} from './useSelectedObject'
import { useAutoSave, type SaveStatus } from './useAutoSave'
import {
  useCanvasShortcuts,
  rotateActive,
  resetRotation,
} from './useCanvasShortcuts'
import { usePanMode } from './usePanMode'
import { useLabelMinSize } from './useLabelMinSize'
import { useCertBadgeSizeRules } from './useCertBadgeSizeRules'
import { useWheelZoom } from './useWheelZoom'
import { useDeselectOnOutsideClick } from './useDeselectOnOutsideClick'
import { useObjectClipboard } from './useObjectClipboard'
import { ObjectActions } from './ObjectActions'
import { ObjectContextMenu } from './ObjectContextMenu'
import { UpgradeOverlay } from './UpgradeOverlay'
// R14.d — single tier helper now lives in @ilaunchify/auth. The TierKey
// re-export here is structurally identical to @ilaunchify/ui's so the
// UpgradeOverlay (which still imports from ui) continues to type-check.
import type { FabricObject } from '@ilaunchify/ui'
import { hasTier, canRecolorTemplate, type TierKey } from '@ilaunchify/auth'
import { TextFormatToolbar } from './TextFormatToolbar'
import { NutritionFactsToolbar } from './NutritionFactsToolbar'
import { ImageToolbar } from './ImageToolbar'
import { CodeToolbar } from './CodeToolbar'
import { CompliancePanel } from './CompliancePanel'
import type { FrameDims } from './frameComplianceCanvas'
import { MockupModal, type StudioMockup } from './MockupModal'
import { LivePreview3DDock } from './LivePreview3DDock'
import { FlavorSwitcher } from './drawers/FlavorSwitcher'
import { FlavorLabelSections } from './drawers/FlavorLabelSections'
import { FlavorMismatchNotice } from './drawers/FlavorMismatchNotice'
import { detectFlavorMismatch, type FlavorMismatchWarning } from './lib/flavorMismatch'
import { checkFlavorCompleteness, type CompletenessResult } from './lib/flavorCompleteness'
import { flavorTokenOf } from './flavorBind'
import { resolvePbrPreset } from '@ilaunchify/packaging-3d'
import { applyBaseToAllFlavors } from './flavor-actions'
import { findNutritionPanel, regenerateNutritionPanel } from './lib/managedNutritionPanel'
import { ExportModal } from './ExportModal'
import { StudioHeaderMenu } from '@/components/labels/StudioHeaderMenu'
import { recordDesignExport, snapshotDesign, listDesignSnapshots, restoreDesignSnapshot, getSavedFlavorIds } from './actions'
import { VersionHistoryPanel } from './VersionHistoryPanel'
import { TextDrawer } from './drawers/TextDrawer'
import { TextFontDrawer } from './drawers/TextFontDrawer'
import { LayersDrawer } from './drawers/LayersDrawer'
import { ProductDetailsDrawer, type ProductDetailsData, type CostTier } from './drawers/ProductDetailsDrawer'
import { QrCodeDrawer } from './drawers/QrCodeDrawer'
import { BarcodeDrawer } from './drawers/BarcodeDrawer'
import { LabelDrawer } from './drawers/LabelDrawer'
import { BrandDrawer } from './drawers/BrandDrawer'
import { TemplatesDrawer } from './drawers/TemplatesDrawer'
import { AiCreateDrawer } from './drawers/AiCreateDrawer'
import { TemplateAuthorSaveDialog } from '../../../../studio/TemplateAuthorSaveDialog'
import { saveAsBrandTemplate } from './brand-actions'
import { FinishesDrawer } from './drawers/FinishesDrawer'
import type { StudioFinish } from './page'
import { ComponentsDrawer } from './drawers/ComponentsDrawer'
import { ElementsDrawer } from './drawers/ElementsDrawer'
import { PhrasesDrawer } from './drawers/PhrasesDrawer'
import { CertConsentModal } from './CertConsentModal'
import { recordLabelClaimConsent } from './claim-consent-actions'
import { toast } from 'sonner'
import {
  Inbox,
  Tag,
  Palette,
  Type as TypeIcon,
  Sparkles,
  Shapes,
  QrCode,
  Barcode,
  Layers,
  Boxes,
  LayoutTemplate,
  ScrollText,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  Maximize,
  RotateCw,
  RotateCcw,
  Hand,
  Undo2,
  Redo2,
  ShieldCheck,
  ShieldAlert,
  Eye,
  Download,
  Wand2,
  X,
  Lock,
} from 'lucide-react'

// Stage is dynamically imported with ssr:false because Fabric.js needs `window`.
const Stage = dynamic(() => import('@ilaunchify/ui').then((m) => ({ default: m.Stage })), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-ink-100 text-sm text-ink-500">
      Loading canvas…
    </div>
  ),
})

/** Server-derived product meta for the Product details drawer. */
export interface ProductMeta {
  category: string | null
  manufacturerName: string | null
  moq: number | null
  leadTimeDays: number | null
  fulfillment: string | null
  cost: { low: string; high: string; single: boolean; tiers: CostTier[] } | null
  packaging: { container: string; category: string | null; fragility: string | null; dimensions: string | null; format: string | null } | null
}

interface Props {
  studioLogo?: { kind: 'full' | 'mark'; src: string | null; sublabel: string | null }
  productId: string
  productName: string
  dieCut: DieCutSpec
  /** Product-details drawer meta (category + owner-pinned manufacturer + pricing summary),
   *  derived server-side in page.tsx. Feeds the Printify-style Product panel. Optional: the
   *  admin template-author mount hides the Product tool, so it defaults to empty. */
  productMeta?: ProductMeta
  brandAssets: BrandCanvasAssets
  /** Existing Fabric JSON to hydrate the canvas with on mount. */
  initialDesignJson: object | null
  /**
   * The product's earned cert badges (DESIGN_STUDIO.md §Certificate badges V1).
   * Reconciled onto the canvas as a managed cert zone once the stage is ready.
   */
  certBadges: CertBadge[]
  /** C4.b — product's labeling type, drives label-format recommendation. */
  labelingType: LabelingType
  /**
   * Server-derived product context used by the compliance scan + label
   * drawer pre-fill. allergens / bioengineered come from the recipe;
   * netQuantity + netQuantityKind from the bound variant. See
   * page.tsx#deriveProductCtx.
   */
  productCtx: {
    allergens: string[]
    bioengineered: boolean
    netQuantity: string | null
    netQuantityKind: 'solid' | 'liquid' | 'count'
    lockedPhrases?: Array<{
      id: string
      slug: string
      title: string
      body: string
      citation?: string | null
    }>
  }
  /**
   * DS-70b — when the bound print partner has ≥ 1 ACTIVE PartnerFinish
   * compatible with the chosen substrate, the Finishes rail icon
   * appears. V1 always false (no partner data + drawer is placeholder).
   * Resolution lives in page.tsx — keeps the shell agnostic.
   */
  partnerOffersFinishes?: boolean
  /**
   * Platform-wide AI generator kill switch (admin → AI Generator settings →
   * master toggle). When false the AI Templator rail tool is hidden and the
   * generator is unreachable from the Studio. Defaults to true so admin
   * template-author mode (which doesn't pass it) is unaffected.
   */
  aiGeneratorEnabled?: boolean
  /**
   * F3a — the finishes THIS product offers (partner's ProductTemplateFinish
   * allow-list), serialized server-side in page.tsx#loadStudioFinishes.
   * DISPLAY-ONLY: rendered by the Finishes drawer; no object-apply yet (F3b).
   * Empty unless partnerOffersFinishes is true.
   */
  finishes?: StudioFinish[]
  /**
   * DS-73d — current creator subscription tier. Drives the EXPORT
   * upgrade gate: Maker creators get the UpgradeOverlay instead of the
   * print-ready ExportModal. V1 default is 'maker' until the
   * subscription model is wired into CreatorProfile (forward-pointer
   * in page.tsx).
   */
  creatorTier?: TierKey
  /**
   * C9 — the bound print partner's resolved output spec, when the product's
   * PRIMARY packaging component is routed to a partner service with a
   * PartnerPrintOutputSpec. Null for almost all products today → the export
   * modal skips prepress pre-flight entirely. Resolved server-side in
   * page.tsx#resolvePartnerPrintSpec.
   */
  partnerPrintSpec?: PreflightPartnerSpecResolved | null
  /**
   * Restricted-category labels (labeling ≠ licensing). Non-empty → a top-bar
   * banner warns the creator the product can't be ordered (alcohol / hemp-CBD /
   * tobacco / OTC / kratom). Same evaluator the checkout gate uses; surfaced
   * here so the block isn't a surprise at the final Pay step.
   */
  restrictionLabels?: string[]
  /**
   * Retail identity (GTIN / internal SKU / barcode mode) — relocated from the
   * retired product hub (2026-06-18) into the Product panel. Persisted on the
   * Product; the Dieline barcode frame keys off barcodeMode/gtin.
   */
  retailIdentity: {
    gtin: string | null
    internalSku: string | null
    barcodeMode: BarcodeMode
  }
  /** Dieline Phase B — resolved die-line frames + context, or null when the
   *  product has no ACTIVE/PARTNER_CONFIRMED die-line. Drives the frame guides. */
  dielineFrames: DielineFramesData | null
  /** Mockup Slice 2/3 — ACTIVE photo-mockups for the product's packaging type,
   *  front-first. Empty when none is curated (MockupModal falls back to
   *  stylized variants). >1 enables the surface switcher. */
  mockups: StudioMockup[]
  /** Per-flavor labels — the flavor pool when this product is individually
   *  labeled (labelTopology PER_FLAVOR). Empty = single shared design. */
  flavors: Array<{ id: string; name: string; swatchHex: string | null }>
  /** The flavor whose Design is loaded (null = the shared base design). */
  activeFlavorPresetId: string | null
  /** Phase 2b — REAL Nutrition Facts data for the active flavor/base (null →
   *  non-FOOD or no recipe). Fed to the Label drawer's panel add. */
  nutritionPanelData: NutritionPanelData | null
  /** Phase 2b — REAL multi-column aggregate (variety box). null → sample. */
  aggregateNutritionData: AggregateNutritionData | null
  /** Phase 2b — REAL non-FOOD panels (supplement / pet). null → sample. */
  nonFoodPanelData: { supplement: SupplementPanelData | null; aafco: AafcoPanelData | null } | null
  /**
   * Admin Design Studio — template-author mode (docs/DESIGN_TEMPLATE_LIBRARY.md §8).
   * When set, the Studio is mounted (admin-gated, product-less) to author a LIBRARY
   * template on a die-line: "Save as template" routes to the admin library save dialog
   * instead of the creator's brand kit, and product-only rail tools are hidden.
   */
  templateAuthor?: { domain: string; container: string | null; aspectBucket: string | null; dieCutId?: string | null } | null
}

type ToolKey =
  | 'product'
  | 'label'
  | 'templates'
  | 'ai'
  | 'brand'
  | 'text'
  | 'elements'
  | 'images'
  | 'graphics'
  | 'clipart'
  | 'background'
  | 'pattern'
  | 'qrcode'
  | 'barcode'
  | 'layers'
  | 'finishes'
  | 'components'
  | 'phrases'

/**
 * `conditional` tools (DS-70b) only appear in the rail when the runtime
 * passes their gate. Finishes is the first: it shows only when the
 * bound partner has ≥1 active PartnerFinish — V1 always false. See
 * `partnerOffersFinishes` prop + the rail filter below.
 */
const TOOLS: Array<{
  key: ToolKey
  label: string
  icon: typeof Inbox
  v1: boolean
  conditional?: 'finishes' | 'ai'
}> = [
  { key: 'product', label: 'Product', icon: Inbox, v1: true },
  { key: 'label', label: 'Label & Compliance', icon: Tag, v1: true },
  { key: 'templates', label: 'Templates', icon: LayoutTemplate, v1: true },
  // AI Templator — opens the AI packaging generator for this product's die-line set.
  // Conditional: hidden platform-wide when the admin master toggle is off.
  { key: 'ai', label: 'AI Templator', icon: Sparkles, v1: true, conditional: 'ai' },
  { key: 'brand', label: 'Brand', icon: Palette, v1: true },
  { key: 'text', label: 'Text', icon: TypeIcon, v1: true },
  // Elements (Pavel 2026-06-23) — Canva-style merge of Images / Graphics /
  // Clipart / Background / Patterns into one grouped menu.
  { key: 'elements', label: 'Elements', icon: Shapes, v1: true },
  { key: 'components', label: 'Components', icon: Boxes, v1: true },
  // 'phrases' merged into the Label tool as "Label & Compliance" (2026-07-04) — no rail entry.
  { key: 'qrcode', label: 'QR Code', icon: QrCode, v1: true },
  { key: 'barcode', label: 'Barcode', icon: Barcode, v1: true },
  { key: 'layers', label: 'Layers', icon: Layers, v1: true },
  // Conditional — only renders when partnerOffersFinishes flag is true.
  {
    key: 'finishes',
    label: 'Finishes',
    icon: Wand2,
    v1: true,
    conditional: 'finishes',
  },
]

export function CanvasLayoutShell({
  studioLogo,
  productId,
  productName,
  dieCut,
  productMeta = { category: null, manufacturerName: null, moq: null, leadTimeDays: null, fulfillment: null, cost: null, packaging: null },
  brandAssets,
  initialDesignJson,
  certBadges: initialCertBadges,
  labelingType,
  productCtx: serverProductCtx,
  partnerOffersFinishes = false,
  aiGeneratorEnabled = true,
  finishes = [],
  creatorTier = 'maker',
  partnerPrintSpec = null,
  restrictionLabels = [],
  retailIdentity,
  dielineFrames,
  mockups,
  flavors,
  activeFlavorPresetId,
  nutritionPanelData,
  aggregateNutritionData,
  nonFoodPanelData,
  templateAuthor = null,
}: Props) {
  const [activeTool, setActiveTool] = useState<ToolKey | null>(templateAuthor ? 'templates' : 'product')
  const [templateAuthorSaveOpen, setTemplateAuthorSaveOpen] = useState(false)
  // Brand Kit — the active kit the Studio pulls assets/templates from (and saves
  // templates to). Defaults to the product's own brand; the Brand drawer switches it.
  const [activeBrandId, setActiveBrandId] = useState(brandAssets.brandId)
  const [guides, setGuides] = useState<GuideVisibility>(DEFAULT_GUIDES)
  const [showFrames, setShowFrames] = useState(true)
  // G1.3e — resolve the product's default finish → a PBR preset for the live 3D dock.
  // FOIL_METALLIC finishes read as metal; otherwise the finish name (matte/gloss/
  // soft-touch/…) drives the preset. Undefined → the viewer's matte substrate default.
  const dockMaterial = useMemo(() => {
    const f = finishes.find((x) => x.isDefault) ?? finishes[0]
    if (!f) return undefined
    const name = f.category === 'FOIL_METALLIC' ? `${f.name} foil` : f.name
    return resolvePbrPreset({ name })
  }, [finishes])
  // Resolve die-line frames for the current context. Empty when no die-line —
  // resolveLayout would otherwise fall back to a DEFAULT layout, so guard on it.
  const resolvedFrames = useMemo<ResolvedFrame[]>(
    () => (dielineFrames?.layout ? resolveLayout(dielineFrames.layout, dielineFrames.ctx) : []),
    [dielineFrames],
  )
  const recipeHash = dielineFrames?.recipeHash ?? null
  // Frame KINDs currently satisfied by an object on the canvas — a frame guide
  // is a placeholder that hides once its element fills it, and reappears when
  // the element is removed. Only EMPTY frames render a guide.
  const [filledFrameKinds, setFilledFrameKinds] = useState<Set<string>>(() => new Set())
  const emptyFrames = useMemo(
    () => resolvedFrames.filter((rf) => !filledFrameKinds.has(rf.frame.kind)),
    [resolvedFrames, filledFrameKinds],
  )
  const [zoom, setZoom] = useState(1) // multiplier on top of pxPerMm
  const [canvas, setCanvas] = useState<FabricCanvas | null>(null)

  // C8 — cert badges held in state so consenting flips `consented` live without
  // a reload. Seeded from the server (which already hydrated consent state).
  const [certBadges, setCertBadges] = useState<CertBadge[]>(initialCertBadges)
  const [pendingConsent, setPendingConsent] = useState<CertBadge | null>(null)
  const [consentRecording, startConsent] = React.useTransition()

  // Place a badge on the canvas (consent already satisfied). Uses the chosen
  // artwork variant's URL + reproduction bounds when one was picked.
  const placeCertBadge = React.useCallback(
    (badge: CertBadge, variant?: CertBadgeVariant | null) => {
      const url = variant?.url ?? badge.badgeUrl
      if (!canvas || !url) return
      void addCertBadge(
        canvas,
        {
          certInstanceId: badge.certInstanceId,
          badgeUrl: url,
          variantId: variant?.variantId,
          minWidthMm: variant?.minWidthMm ?? null,
          maxWidthMm: variant?.maxWidthMm ?? null,
          requiredCoText: variant?.requiredCoText ?? null,
          clearSpaceFactor: variant?.clearSpaceFactor ?? null,
        },
        { widthMm: dieCut.widthMm, heightMm: dieCut.heightMm, bleedMm: dieCut.bleedMm, safeAreaMm: dieCut.safeAreaMm },
      )
    },
    [canvas, dieCut],
  )

  // C8 render gate — consented badges place immediately; un-consented ones open
  // the consent modal first (never auto-stamp).
  const handleRequestAddCert = React.useCallback(
    (badge: CertBadge) => {
      if (badge.consented) placeCertBadge(badge)
      else setPendingConsent(badge)
    },
    [placeCertBadge],
  )

  const confirmConsent = React.useCallback(
    (variant: CertBadgeVariant | null) => {
      const badge = pendingConsent
      if (!badge) return
      startConsent(async () => {
        const res = await recordLabelClaimConsent({
          productId,
          certInstanceId: badge.certInstanceId,
        })
        if (!res.ok) {
          toast.error(res.error)
          return
        }
        setCertBadges((prev) =>
          prev.map((b) => (b.certInstanceId === badge.certInstanceId ? { ...b, consented: true } : b)),
        )
        placeCertBadge({ ...badge, consented: true }, variant)
        setPendingConsent(null)
      })
    },
    [pendingConsent, productId, placeCertBadge],
  )

  // Reconcile the managed cert-badge zone after the saved design hydrates.
  // Stage fires onHydrated post-loadFromJSON, so badges aren't wiped by the
  // async load and re-opens don't duplicate (identity = certInstanceId, which
  // round-trips through customData). DESIGN_STUDIO.md §Certificate badges V1.
  // Dieline Phase B — frame snapping is dormant until the saved design has
  // hydrated, so loading a design never re-snaps already-placed objects.
  const framesLiveRef = React.useRef(false)
  const handleCertReconcile = React.useCallback(
    (c: FabricCanvas) => {
      void reconcileCertBadges(c, certBadges, {
        widthMm: dieCut.widthMm,
        heightMm: dieCut.heightMm,
        bleedMm: dieCut.bleedMm,
        safeAreaMm: dieCut.safeAreaMm,
      })
      framesLiveRef.current = true
      // loadFromJSON doesn't fire object:added, so seed filledFrameKinds from the
      // hydrated objects here (the live listeners keep it in sync afterwards).
      const kinds = new Set<string>()
      for (const o of c.getObjects()) {
        const obj = o as { customType?: string; customRole?: string; visible?: boolean }
        if (obj.visible === false) continue
        const k = frameKindFromCanvasRole(obj.customType, obj.customRole)
        if (k) kinds.add(k)
      }
      setFilledFrameKinds(kinds)

      // Phase 2b — auto-bind the nutrition panel to the active flavor's REAL
      // recipe. After hydration (incl. apply-base-to-all clones + pre-2b sample
      // panels), if the panel isn't already bound to (activeFlavorPresetId,
      // recipeHash), regenerate it with the active context's computed nutrition.
      // One-time per flavor design — the binding persists via autosave, so
      // steady-state loads are no-ops. This is the "magic": switch to a flavor
      // and its label shows that flavor's nutrition, not the base's.
      if (nutritionPanelData) {
        const panel = findNutritionPanel(c)
        if (panel) {
          const p = panel as unknown as {
            customData?: { panelSource?: string; flavorPresetId?: string | null }
            recipeHash?: string | null
          }
          const bound =
            p.customData?.panelSource === 'recipe' &&
            (p.customData?.flavorPresetId ?? null) === activeFlavorPresetId &&
            (p.recipeHash ?? null) === recipeHash
          if (!bound) {
            void regenerateNutritionPanel(c, nutritionPanelData, {
              flavorPresetId: activeFlavorPresetId,
              recipeHash,
            })
          }
        }
      }
    },
    [certBadges, dieCut, nutritionPanelData, activeFlavorPresetId, recipeHash],
  )

  const [complianceOpen, setComplianceOpen] = useState(false)
  const [mockupOpen, setMockupOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  // DS-73d — Maker tier creators see the UpgradeOverlay instead of ExportModal.
  // R14.d — gate uses the shared hasTier() helper so Studio + checkout +
  // order detail all agree on what "Builder+" means.
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const isMakerLocked = !hasTier(creatorTier, 'builder')
  // DS-66f — Canva-style font drawer. Toggled by clicking the font
  // field in TextFormatToolbar; replaces whichever rail-tool drawer
  // is currently mounted in the drawer slot.
  const [fontDrawerOpen, setFontDrawerOpen] = useState(false)

  function openFontDrawer() {
    clearTimers()
    setActiveTool(null)
    setPinned(false)
    setFontDrawerOpen(true)
  }

  function closeFontDrawer() {
    setFontDrawerOpen(false)
  }
  // Selection-aware auto-close lives below useSelectedObject() — see the
  // useEffect there.

  // DS-60 — refs + state for object actions, context menu, wheel zoom.
  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  const canvasContainerRef = React.useRef<HTMLDivElement | null>(null)
  const [contextMenu, setContextMenu] = React.useState<{
    target: FabricObject | null
    x: number | null
    y: number | null
  }>({ target: null, x: null, y: null })
  const clipboard = useObjectClipboard(canvas)
  // DS-73b — useWheelZoom now also freezes objects during the wheel burst
  // so creators don't see them drifting relative to the die-line mid-zoom.
  useWheelZoom(scrollRef.current, zoom, setZoom, canvas)
  // DS-73a — click anywhere outside the canvas container clears selection.
  useDeselectOnOutsideClick(scrollRef.current, canvasContainerRef.current, canvas)

  // Right-click on a canvas object → open ObjectContextMenu at mouse pos.
  // Fabric routes pointer events through its own pipeline, so we hook the
  // upper DOM canvas's contextmenu directly and ask Fabric for the object
  // under the cursor.
  React.useEffect(() => {
    if (!canvas) return
    // Fabric v6 exposes the upper canvas element via .upperCanvasEl.
    const el = (canvas as unknown as { upperCanvasEl?: HTMLCanvasElement })
      .upperCanvasEl
    if (!el) return

    function onCtx(e: MouseEvent) {
      if (!canvas) return
      // Pick the topmost object under the mouse — null if user right-clicked
      // empty canvas.
      const fcanvas = canvas as unknown as {
        findTarget: (e: MouseEvent) => FabricObject | undefined
      }
      const target = fcanvas.findTarget?.(e) ?? null
      if (target) {
        e.preventDefault()
        canvas.setActiveObject(target)
        canvas.requestRenderAll()
        setContextMenu({ target, x: e.clientX, y: e.clientY })
      }
    }
    el.addEventListener('contextmenu', onCtx)
    return () => el.removeEventListener('contextmenu', onCtx)
  }, [canvas])

  // productCtx for the compliance scan + Label drawer pre-fill. productName
  // + brandName come from the shell props; allergens / bioengineered /
  // netQuantity / netQuantityKind are derived server-side in
  // page.tsx#deriveProductCtx and arrive via the productCtx prop
  // (DS-56 + DS-57).
  const productCtx = useMemo(
    () => ({
      productName,
      brandName: brandAssets.brandName,
      allergens: serverProductCtx.allergens,
      bioengineered: serverProductCtx.bioengineered,
      netQuantity: serverProductCtx.netQuantity,
      netQuantityKind: serverProductCtx.netQuantityKind,
      lockedPhrases: serverProductCtx.lockedPhrases ?? [],
    }),
    [
      productName,
      brandAssets.brandName,
      serverProductCtx.allergens,
      serverProductCtx.bioengineered,
      serverProductCtx.netQuantity,
      serverProductCtx.netQuantityKind,
      serverProductCtx.lockedPhrases,
    ],
  )
  const basePxPerMm = 3.0
  const pxPerMm = basePxPerMm * zoom

  // Inputs for the CompliancePanel's live die-line frame gate. Memoized so the
  // panel's rescan effect (which depends on these) doesn't re-fire every render.
  const frameLayout = dielineFrames?.layout ?? null
  const frameComplianceCtx = useMemo<ComplianceContext | null>(
    () =>
      dielineFrames
        ? {
            ...dielineFrames.ctx,
            currentRecipeHash: recipeHash,
            safeAreaBySurface: dielineFrames.safeAreaBySurface,
          }
        : null,
    [dielineFrames, recipeHash],
  )
  const frameDims = useMemo<FrameDims | null>(
    () =>
      dielineFrames
        ? {
            widthMm: dieCut.widthMm,
            heightMm: dieCut.heightMm,
            bleedMm: dieCut.bleedMm,
            basePxPerMm,
          }
        : null,
    [dielineFrames, dieCut, basePxPerMm],
  )

  // Dieline Phase B step 3 — snap a newly-added platform object into its die-line
  // frame (so required elements land IN the frame, not free-floating), and stamp
  // recipe-derived objects with the current recipeHash for the staleness gate.
  // Guards: only after hydration (framesLiveRef) and only once per object
  // (frameSnapped, persisted) so reload/undo never re-snap a moved object.
  useEffect(() => {
    if (!canvas || resolvedFrames.length === 0) return
    const RECIPE_DERIVED = new Set(['NUTRITION_FACTS', 'INGREDIENTS', 'ALLERGENS'])
    const onAdded = (e: { target?: unknown }) => {
      if (!framesLiveRef.current) return
      const obj = e.target as
        | (Record<string, unknown> & { set: (o: Record<string, unknown>) => void; setCoords?: () => void })
        | undefined
      if (!obj || obj.frameSnapped) return
      const kind = frameKindFromCanvasRole(obj.customType as string | undefined, obj.customRole as string | undefined)
      if (!kind) return
      const rf = resolvedFrames.find((r) => r.frame.kind === kind)
      if (!rf) return
      const box = rf.frame.box
      const fx = (dieCut.bleedMm + box.x * dieCut.widthMm) * basePxPerMm
      const fy = (dieCut.bleedMm + box.y * dieCut.heightMm) * basePxPerMm
      const fw = box.w * dieCut.widthMm * basePxPerMm
      const fh = box.h * dieCut.heightMm * basePxPerMm
      const ow = (Number(obj.width) || 1) * (Number(obj.scaleX) || 1)
      const oh = (Number(obj.height) || 1) * (Number(obj.scaleY) || 1)
      const fit = Math.min(fw / ow, fh / oh)
      const next: Record<string, unknown> = {
        originX: 'center',
        originY: 'center',
        left: fx + fw / 2,
        top: fy + fh / 2,
        frameSnapped: true,
      }
      if (isFinite(fit) && fit > 0 && fit < 1) {
        next.scaleX = (Number(obj.scaleX) || 1) * fit
        next.scaleY = (Number(obj.scaleY) || 1) * fit
      }
      if (RECIPE_DERIVED.has(kind) && recipeHash) next.recipeHash = recipeHash
      obj.set(next)
      obj.setCoords?.()
      canvas.requestRenderAll()
    }
    canvas.on('object:added', onAdded)
    return () => {
      canvas.off('object:added', onAdded)
    }
  }, [canvas, resolvedFrames, dieCut, basePxPerMm, recipeHash])

  // Keep filledFrameKinds in sync with the canvas so a frame guide hides when a
  // matching element is present and reappears when it's removed.
  useEffect(() => {
    if (!canvas) return
    const rescan = () => {
      const kinds = new Set<string>()
      for (const o of canvas.getObjects()) {
        const obj = o as { customType?: string; customRole?: string; visible?: boolean }
        if (obj.visible === false) continue
        const k = frameKindFromCanvasRole(obj.customType, obj.customRole)
        if (k) kinds.add(k)
      }
      setFilledFrameKinds((prev) => {
        if (prev.size === kinds.size && [...kinds].every((k) => prev.has(k))) return prev
        return kinds
      })
    }
    rescan()
    canvas.on('object:added', rescan)
    canvas.on('object:removed', rescan)
    canvas.on('object:modified', rescan)
    return () => {
      canvas.off('object:added', rescan)
      canvas.off('object:removed', rescan)
      canvas.off('object:modified', rescan)
    }
  }, [canvas])

  const history = useCanvasHistory(canvas)
  const selected = useSelectedObject(canvas)
  const selectedCustomType = getCustomType(selected)
  const showTextToolbar = isTextObject(selected)
  const showNutritionToolbar = selectedCustomType === 'nutrition-panel'
  const showCodeToolbar = isCodeCustomType(selectedCustomType)
  // ImageToolbar is the generic fallback for any non-text / non-code object that
  // isn't a regulated label panel — covers uploads, brand logos, AND all Elements
  // (graphics / clipart / backgrounds / patterns / shapes), which previously had
  // no contextual toolbar when their customType wasn't 'image'/'brand-logo'.
  const showImageToolbar =
    !!selected &&
    !showTextToolbar &&
    !showCodeToolbar &&
    !showNutritionToolbar &&
    !isLabelPanelType(selectedCustomType)

  // DS-66f — auto-close the font drawer when selection moves off the text
  // object that opened it (the trigger button is no longer visible, and
  // the user expects the rail tools to come back).
  React.useEffect(() => {
    if (fontDrawerOpen && !showTextToolbar) {
      setFontDrawerOpen(false)
    }
  }, [fontDrawerOpen, showTextToolbar])

  const autosave = useAutoSave(canvas, productId, { flavorPresetId: activeFlavorPresetId })

  // ---- Per-flavor label safety (Signal/Verify — docs/PER_FLAVOR_LABEL_SAFETY_UX.md) ----
  // Which selected flavors already have a saved label — initial load + refresh after
  // each autosave so the active flavor's ✓ appears without a reload.
  const [savedFlavorIds, setSavedFlavorIds] = useState<string[]>([])
  useEffect(() => {
    if (flavors.length === 0) return
    let cancelled = false
    void getSavedFlavorIds(productId).then((ids) => {
      if (!cancelled) setSavedFlavorIds(ids)
    })
    return () => {
      cancelled = true
    }
  }, [productId, flavors.length, autosave.lastSavedAt])

  // Wrong-flavor text lint (Verify): flag visible text on the ACTIVE flavor's surface
  // that mentions a DIFFERENT flavor. Re-runs as canvas text changes; only when a
  // specific flavor is being edited (the shared base is flavor-agnostic).
  const [mismatchWarnings, setMismatchWarnings] = useState<FlavorMismatchWarning[]>([])
  useEffect(() => {
    const activeName = flavors.find((f) => f.id === activeFlavorPresetId)?.name ?? null
    if (!canvas || !activeName || flavors.length === 0) {
      setMismatchWarnings((prev) => (prev.length === 0 ? prev : []))
      return
    }
    const pool = flavors.map((f) => ({ name: f.name }))
    const rescan = () => {
      const texts: string[] = []
      for (const o of canvas.getObjects()) {
        const t = (o as { text?: unknown }).text
        if (typeof t === 'string' && t.trim()) texts.push(t)
      }
      const next = detectFlavorMismatch(activeName, texts, pool)
      setMismatchWarnings((prev) =>
        prev.length === next.length &&
        prev.every((w, i) => w.text === next[i]?.text && w.matchedFlavor === next[i]?.matchedFlavor)
          ? prev
          : next,
      )
    }
    rescan()
    canvas.on('object:added', rescan)
    canvas.on('object:removed', rescan)
    canvas.on('object:modified', rescan)
    canvas.on('text:changed', rescan)
    return () => {
      canvas.off('object:added', rescan)
      canvas.off('object:removed', rescan)
      canvas.off('object:modified', rescan)
      canvas.off('text:changed', rescan)
    }
  }, [canvas, flavors, activeFlavorPresetId])

  // BIND (safety §1): on a flavor's design the statement-of-identity is a managed
  // token — lock text editing on the live canvas so it can't be retyped to another
  // flavor ("typed Chocolate on the Strawberry can"). Re-runs on load/add so it
  // survives re-hydration; the shared base (no active flavor) stays editable.
  useEffect(() => {
    if (!canvas || !activeFlavorPresetId) return
    const lockTokens = () => {
      for (const o of canvas.getObjects()) {
        const obj = o as {
          customRole?: string
          customData?: unknown
          editable?: boolean
          set?: (k: string, v: unknown) => void
        }
        if (flavorTokenOf(obj) === 'soi' && obj.editable !== false) {
          obj.set?.('editable', false)
        }
      }
    }
    lockTokens()
    canvas.on('object:added', lockTokens)
    return () => {
      canvas.off('object:added', lockTokens)
    }
  }, [canvas, activeFlavorPresetId])

  // Submit gate (Verify): every selected flavor needs a saved label before checkout.
  // needsAggregate is V1-false until aggregate detection is wired; selection-threading
  // (Cowork, Product.selectedFlavorPresetIds) will scope `flavors` to the creator's
  // picks, which auto-scopes this gate.
  const flavorCompleteness: CompletenessResult | null =
    flavors.length > 0
      ? checkFlavorCompleteness({ flavors, savedFlavorIds, needsAggregate: false, aggregateSaved: false })
      : null

  // Version history (EditSnapshot): docked panel + thumbnail previews + restore.
  // Snapshots copy the server-side working DesignVersion row; the client only
  // triggers them + supplies a small canvas PNG thumbnail. Prev/next move the
  // SELECTED version in the panel (browsing is safe — only Restore touches the
  // canvas). Retention/coalesce handled in @ilaunchify/db.
  const [historyOpen, setHistoryOpen] = useState(false)
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const lastSnapAtRef = React.useRef(0)

  const loadHistory = React.useCallback(async () => {
    const rows = await listDesignSnapshots(productId)
    setSnapshots(rows.map((r) => ({ id: r.id, kind: r.kind, label: r.label, pinned: r.pinned, createdAt: new Date(r.createdAt), thumbnail: r.thumbnail })))
  }, [productId])

  // Capture a small PNG of the live canvas for the version thumbnail.
  const grabThumb = React.useCallback((): string | null => {
    if (!canvas) return null
    const url = snapshotCanvasAsPng(canvas, { multiplier: 0.25 })
    return url || null
  }, [canvas])

  // Load the history list once the canvas is ready (so prev/next + panel work
  // without opening anything first).
  React.useEffect(() => {
    if (canvas) void loadHistory()
  }, [canvas, loadHistory])

  // Throttle background snapshots to once per 2 min after a successful save,
  // then refresh the list so the panel + prev/next see the new version.
  React.useEffect(() => {
    if (autosave.status !== 'saved' || !autosave.lastSavedAt) return
    const now = Date.now()
    if (now - lastSnapAtRef.current < 120_000) return
    lastSnapAtRef.current = now
    void snapshotDesign(productId, 'AUTO', undefined, grabThumb()).then(() => loadHistory())
  }, [autosave.status, autosave.lastSavedAt, productId, grabThumb, loadHistory])

  const handleRestore = React.useCallback(
    async (snapshotId: string) => {
      setRestoringId(snapshotId)
      const res = await restoreDesignSnapshot(productId, snapshotId)
      setRestoringId(null)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      if (canvas) {
        const c = canvas as unknown as { loadFromJSON: (j: unknown, cb?: () => void) => void; requestRenderAll: () => void }
        c.loadFromJSON(res.json, () => c.requestRenderAll())
      }
      toast.success('Version restored')
      setSelectedVersionId(null)
      void loadHistory()
    },
    [productId, canvas, loadHistory],
  )

  // "Save draft" (in the studio ☰ menu) — flush the autosave now, then pin a
  // MILESTONE version so the manual checkpoint is restorable from history.
  const handleSaveDraft = React.useCallback(async () => {
    await autosave.saveNow()
    await snapshotDesign(productId, 'MILESTONE', 'Saved draft', grabThumb())
    void loadHistory()
    toast.success('Draft saved')
  }, [autosave, productId, grabThumb, loadHistory])

  // Top-bar "Save now" (clickable status icon) — flush the autosave, then pin a
  // MANUAL checkpoint so the click appears in History. Returns false if the
  // flush failed, so the indicator shows the not-saved flash.
  const handleSaveNow = React.useCallback(async (): Promise<boolean> => {
    await autosave.saveNow()
    if (autosave.status === 'error') return false
    await snapshotDesign(productId, 'MANUAL', `Saved ${new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`, grabThumb())
    void loadHistory()
    return true
  }, [autosave, productId, grabThumb, loadHistory])

  // "Save as template" (☰ menu) — persist the current design to the ACTIVE brand
  // kit as a reusable BrandTemplate. The per-tier cap is enforced server-side; we
  // just surface the result. Fabric v6: toObject(props), not toJSON.
  const handleSaveAsTemplate = React.useCallback(async () => {
    if (!canvas) return
    const name = window.prompt('Name this template')?.trim()
    if (!name) return
    const toObj = canvas.toObject as (p?: string[]) => object
    const canvasJson = JSON.stringify(toObj.call(canvas, Array.from(CANVAS_PROPERTIES_TO_INCLUDE)))
    const res = await saveAsBrandTemplate({
      brandId: activeBrandId,
      name,
      canvasJson,
      thumbnailUrl: grabThumb(),
    })
    if (res.ok) toast.success(`Saved “${name}” to your brand kit`)
    else toast.error(res.error)
  }, [canvas, activeBrandId, grabThumb])

  // In admin template-author mode, "Save as template" opens the library save dialog
  // instead of saving to the creator's brand kit.
  const onSaveTemplateClick = templateAuthor ? () => setTemplateAuthorSaveOpen(true) : handleSaveAsTemplate

  const { panMode, togglePan } = usePanMode(canvas)
  useCanvasShortcuts(canvas)
  useLabelMinSize(canvas) // DS-58d — clamp scale handles to FDA min type sizes
  useCertBadgeSizeRules(canvas, dieCut) // C8 — clamp cert badge reproduction size

  // DS-61 / DS-62 — hover-to-open left rail with click-to-pin.
  //
  // Two timers manage the hover intent gestalt; a separate `pinned`
  // boolean overrides the close timer when the user has committed to a
  // tool by clicking it.
  //
  //   openTimer  = small delay on mouseenter so quick traverses across
  //                icons don't flicker drawers in and out (60ms).
  //   closeTimer = longer delay on mouseleave so the user can move
  //                from a rail icon INTO the drawer area without
  //                losing it (200ms).
  //   pinned     = true when the user clicked the icon. Pinned drawer
  //                ignores closeTimer; only an explicit menu action
  //                (click same icon, click different icon, click drawer
  //                X) closes it.
  const openTimerRef = React.useRef<number | null>(null)
  const closeTimerRef = React.useRef<number | null>(null)
  const [pinned, setPinned] = useState(false)
  // Mirror pinned into a ref so the timer callbacks always read the
  // latest value without needing pinned in their useCallback deps
  // (which would re-create them and orphan the timers).
  const pinnedRef = React.useRef(pinned)
  React.useEffect(() => {
    pinnedRef.current = pinned
  }, [pinned])

  const clearTimers = React.useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const cancelClose = React.useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const scheduleOpen = React.useCallback((key: ToolKey) => {
    cancelClose()
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current)
    }
    openTimerRef.current = window.setTimeout(() => {
      setActiveTool(key)
      openTimerRef.current = null
    }, 60)
  }, [cancelClose])

  const scheduleClose = React.useCallback(() => {
    // Pinned drawer doesn't auto-close on mouseleave — only explicit
    // menu actions close a pinned drawer.
    if (pinnedRef.current) return
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
    closeTimerRef.current = window.setTimeout(() => {
      setActiveTool(null)
      closeTimerRef.current = null
    }, 200)
  }, [])

  // Cleanup on unmount so no stray setState fires.
  React.useEffect(() => clearTimers, [clearTimers])

  function toggleTool(key: ToolKey) {
    // 'ai' opens the in-canvas AI Templator drawer in BOTH modes — creator (product
    // die-line set) and admin template-author (chosen die-cut + domain, product-less).
    // The drawer's "Full view" link reaches the full-screen generator when needed.
    // Click is decisive — cancel any pending hover schedules first.
    clearTimers()
    // Always defer to the rail tool over the font drawer (DS-66f).
    setFontDrawerOpen(false)
    // Click the same icon while pinned → unpin + close.
    if (pinned && activeTool === key) {
      setPinned(false)
      setActiveTool(null)
      return
    }
    // Otherwise: open + pin to this tool. Switching tools via click
    // stays pinned to the new one.
    setPinned(true)
    setActiveTool(key)
  }

  function closeDrawer() {
    clearTimers()
    setPinned(false)
    setActiveTool(null)
    setFontDrawerOpen(false)
  }

  // Keyboard shortcuts: Cmd/Ctrl+Z for undo, Cmd/Ctrl+Shift+Z (or Y) for redo.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        history.undo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        history.redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [history])

  return (
    <div className="fixed inset-0 flex flex-col bg-[var(--studio-canvas-bg)]">
      {/* Top bar */}
      <TopBar
        studioLogo={studioLogo}
        productName={productName}
        productId={productId}
        flavors={flavors}
        activeFlavorPresetId={activeFlavorPresetId}
        flavorCompleteness={flavorCompleteness}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={history.undo}
        onRedo={history.redo}
        saveStatus={autosave.status}
        lastSavedAt={autosave.lastSavedAt}
        onSaveNow={handleSaveNow}
        onOpenHistory={() => { setHistoryOpen(true); void loadHistory() }}
        onSaveDraft={handleSaveDraft}
        onSaveAsTemplate={onSaveTemplateClick}
        templateAuthorMode={!!templateAuthor}
        complianceOpen={complianceOpen}
        onToggleCompliance={() => setComplianceOpen((v) => !v)}
        mockupOpen={mockupOpen}
        onToggleMockup={() => setMockupOpen((v) => !v)}
        exportOpen={exportOpen}
        onToggleExport={() => {
          // DS-73d — Maker tier can't actually export. Show the upgrade
          // overlay instead of the print-ready ExportModal.
          if (isMakerLocked) {
            setUpgradeOpen(true)
            return
          }
          setExportOpen((v) => !v)
        }}
        exportLocked={isMakerLocked}
        canDownloadLabels={!isMakerLocked}
      />

      {/* Restricted-category banner (labeling ≠ licensing) — the product trips
          a category iLaunchify doesn't support yet, so it can't be ordered.
          Surfaced here so the creator learns it before investing design time. */}
      {restrictionLabels.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-2.5 border-b border-warning-300 bg-warning-50 px-4 py-2.5 text-warning-900"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-600" aria-hidden="true" />
          <p className="text-[12px] leading-relaxed">
            <span className="font-semibold">
              This product can&rsquo;t be ordered: {restrictionLabels.join(', ')}.
            </span>{' '}
            It&rsquo;s in a category that requires licensing iLaunchify doesn&rsquo;t
            support yet — you can keep designing, but checkout is disabled. This is
            not legal advice.
          </p>
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Rail + drawer wrap. Cursor moving anywhere inside this group
            cancels the pending close so the drawer doesn't disappear
            while the user reaches for it. Mouseleave schedules the
            close (DS-61). */}
        <div
          className="flex"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          {/* Left rail */}
          <LeftRail
            activeTool={activeTool}
            onToggle={toggleTool}
            onHover={scheduleOpen}
            partnerOffersFinishes={partnerOffersFinishes}
            aiGeneratorEnabled={aiGeneratorEnabled}
            templateAuthorMode={!!templateAuthor}
          />

          {/* Drawer slot — font drawer (DS-66f) takes precedence over the
              rail tool drawer when open. Only one drawer ever mounts. */}
          {fontDrawerOpen && selected && isTextObject(selected) ? (
            <TextFontDrawer
              canvas={canvas}
              active={selected}
              brandAssets={brandAssets}
              onClose={closeFontDrawer}
            />
          ) : activeTool ? (
            <ToolDrawer
              tool={activeTool}
              dieCut={dieCut}
              guides={guides}
              setGuides={setGuides}
              brandAssets={brandAssets}
              certBadges={certBadges}
              onRequestAddCert={handleRequestAddCert}
              labelingType={labelingType}
              canvas={canvas}
              productId={productId}
              productName={productName}
              productMeta={productMeta}
              productImageUrl={mockups[0]?.imageUrl ?? null}
              productCtx={productCtx}
              retailIdentity={retailIdentity}
              frameCount={emptyFrames.length}
              showFrames={showFrames}
              setShowFrames={setShowFrames}
              nutritionPanelData={nutritionPanelData}
              aggregateNutritionData={aggregateNutritionData}
              nonFoodPanelData={nonFoodPanelData}
              activeFlavorPresetId={activeFlavorPresetId}
              flavors={flavors}
              savedFlavorIds={savedFlavorIds}
              mismatchWarnings={mismatchWarnings}
              recipeHash={recipeHash}
              activeBrandId={activeBrandId}
              onActiveBrandChange={setActiveBrandId}
              creatorTier={creatorTier}
              onSaveAsTemplate={onSaveTemplateClick}
              finishes={finishes}
              templateAuthor={templateAuthor}
              dielineFrameLayout={frameLayout}
              onClose={closeDrawer}
            />
          ) : null}
        </div>

        {/* Canvas viewport — DS-59 fix.
            The outer container is non-scrolling (overflow-hidden). The
            inner abs+inset-0 div is the scroller for the canvas content
            only; all floating UI (toolbars, CompliancePanel, BottomToolbar)
            sits as a SIBLING of that scroller, so its absolute positions
            are relative to the fixed outer box and never move with scroll.
            Drawers in the left rail + CompliancePanel internals already
            scroll internally for tall content. */}
        <div className="relative flex-1 overflow-hidden bg-ink-100">
          {/* Scrolling canvas content layer. Ref captured for the
              ctrl+wheel zoom hook + the ObjectActions screen-space
              translation. */}
          <div ref={scrollRef} className="absolute inset-0 overflow-auto">
            <div className="flex min-h-full items-center justify-center p-12">
              <div ref={canvasContainerRef}>
                <CanvasStageWithFrame
                  dieCut={dieCut}
                  pxPerMm={pxPerMm}
                  viewZoom={zoom}
                  guides={guides}
                  frames={showFrames ? emptyFrames : []}
                  initialDesignJson={initialDesignJson}
                  onReady={setCanvas}
                  onHydrated={handleCertReconcile}
                />
              </div>
            </div>
          </div>

          {/* Top floating selection-aware toolbars — exactly one renders
              at a time based on the active object's customType. Drawers
              add new things; these toolbars edit selected things. */}
          {showTextToolbar && selected && (
            <TextFormatToolbar
              canvas={canvas}
              active={selected}
              brandAssets={brandAssets}
              onOpenFontDrawer={openFontDrawer}
            />
          )}
          {showNutritionToolbar && selected && (
            <NutritionFactsToolbar
              canvas={canvas}
              active={selected}
              brandAssets={brandAssets}
            />
          )}
          {showCodeToolbar && selected && (
            <CodeToolbar canvas={canvas} active={selected} brandAssets={brandAssets} />
          )}
          {showImageToolbar && selected && (
            <ImageToolbar canvas={canvas} active={selected} />
          )}

          {/* Per-object action chrome (DS-60d). Renders for any selected
              object that isn't currently in text-editing mode. Hides during
              drag/scale to avoid lag. */}
          {selected && (
            <ObjectActions
              canvas={canvas}
              active={selected}
              canvasContainer={canvasContainerRef.current}
              onShowMore={(x, y) =>
                setContextMenu({ target: selected, x, y })
              }
            />
          )}

          {/* Right-click + More-button context menu (DS-60c). */}
          <ObjectContextMenu
            canvas={canvas}
            target={contextMenu.target}
            x={contextMenu.x}
            y={contextMenu.y}
            clipboard={clipboard}
            onClose={() => setContextMenu({ target: null, x: null, y: null })}
          />

          {/* Compliance scan panel (DS-55) — fixed to the right edge. */}
          <CompliancePanel
            canvas={canvas}
            open={complianceOpen}
            onClose={() => setComplianceOpen(false)}
            productCtx={productCtx}
            certBadges={certBadges}
            onAddCert={handleRequestAddCert}
            frameLayout={frameLayout}
            frameCtx={frameComplianceCtx}
            frameDims={frameDims}
          />

          {/* Version history — right dock with thumbnail previews + restore. */}
          <VersionHistoryPanel
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
            items={snapshots}
            selectedId={selectedVersionId}
            onSelect={setSelectedVersionId}
            onRestore={handleRestore}
            restoringId={restoringId}
            currentId={snapshots[0]?.id ?? null}
          />

          {/* Bottom floating controls */}
          <BottomToolbar
            zoom={zoom}
            setZoom={setZoom}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={history.undo}
            onRedo={history.redo}
            canRotate={selected !== null}
            onRotateLeft={() => canvas && rotateActive(canvas, -15)}
            onRotateRight={() => canvas && rotateActive(canvas, 15)}
            onResetRotation={() => canvas && resetRotation(canvas)}
            panMode={panMode}
            onTogglePan={togglePan}
          />

          {/* Live 3D preview dock (Studio 3D+2D Phase 2) — floats bottom-right and
              updates as you edit. Visualization only; the die-line stays the print master. */}
          <LivePreview3DDock canvas={canvas} dieCut={dieCut} pxPerMm={pxPerMm} material={dockMaterial} />
        </div>
      </div>

      {/* Mockup viewer (DS-63) — full-screen overlay opened from the
          MOCKUP top-bar button. */}
      <MockupModal
        canvas={canvas}
        productId={productId}
        dieCut={dieCut}
        pxPerMm={pxPerMm}
        productName={productName}
        brandName={brandAssets.brandName}
        open={mockupOpen}
        onClose={() => setMockupOpen(false)}
        mockups={mockups}
      />

      {/* C8 — consent-at-claim before a cert badge is placed on the label. */}
      <CertConsentModal
        cert={pendingConsent}
        isPending={consentRecording}
        onConfirm={confirmConsent}
        onClose={() => setPendingConsent(null)}
      />

      {/* Export modal (DS-64) — generates print-ready PDF / PNG. DS-69
          surfaces a blocking compliance scan + at-your-own-risk
          override gate; the ack persists through recordDesignExport. */}
      <ExportModal
        canvas={canvas}
        dieCut={dieCut}
        pxPerMm={pxPerMm}
        productName={productName}
        brandName={brandAssets.brandName}
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        productCtx={productCtx}
        partnerPrintSpec={partnerPrintSpec}
        onOpenCompliance={() => setComplianceOpen(true)}
        onExported={async (ack) => {
          await recordDesignExport(productId, ack)
          // Pin a milestone version (with a fresh thumbnail) at each export.
          void snapshotDesign(productId, 'MILESTONE', 'Exported', grabThumb()).then(() => loadHistory())
        }}
      />

      {/* Admin Design Studio — template-author save dialog (§8). */}
      {templateAuthor && (
        <TemplateAuthorSaveDialog
          open={templateAuthorSaveOpen}
          canvas={canvas}
          domain={templateAuthor.domain}
          container={templateAuthor.container}
          aspectBucket={templateAuthor.aspectBucket}
          onClose={() => setTemplateAuthorSaveOpen(false)}
        />
      )}

      {/* DS-73d — Maker-tier upgrade overlay. Slides down from under the
          top header when a Maker creator clicks Export. */}
      <UpgradeOverlay
        currentTier={creatorTier}
        blockedAction="export"
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
      />
    </div>
  )
}

// ============================================================================
// Top bar
// ============================================================================

/** "Apply base to all flavors" — clones the base art into every flavor's Design
 *  (with each flavor's name + accent applied). Shown on the Base tab. */
function ApplyBaseButton({ productId }: { productId: string }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  async function run() {
    setBusy(true)
    setMsg(null)
    const res = await applyBaseToAllFlavors(productId)
    setBusy(false)
    setMsg(res.ok ? `Applied to ${res.flavorCount} flavors ✓` : res.error)
  }
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        title="Copy this base design onto every flavor (name + accent applied per flavor)"
        className="rounded-full border border-ink-300 px-2.5 py-1 text-[11px] font-semibold text-ink-700 hover:bg-ink-100 disabled:opacity-40"
      >
        {busy ? 'Applying…' : 'Apply to all flavors'}
      </button>
      {msg && <span className="text-[10.5px] text-ink-500">{msg}</span>}
    </div>
  )
}

function TopBar({
  productName,
  productId,
  flavors,
  activeFlavorPresetId,
  flavorCompleteness,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  saveStatus,
  lastSavedAt,
  onSaveNow,
  complianceOpen,
  onToggleCompliance,
  mockupOpen,
  onToggleMockup,
  exportOpen,
  onToggleExport,
  exportLocked,
  canDownloadLabels,
  onOpenHistory,
  onSaveDraft,
  onSaveAsTemplate,
  templateAuthorMode,
  studioLogo,
}: {
  productName: string
  productId: string
  studioLogo?: { kind: 'full' | 'mark'; src: string | null; sublabel: string | null }
  flavors: Array<{ id: string; name: string; swatchHex: string | null }>
  activeFlavorPresetId: string | null
  /** Per-flavor submit gate — null when not a PER_FLAVOR product. */
  flavorCompleteness: CompletenessResult | null
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  saveStatus: SaveStatus
  lastSavedAt: Date | null
  /** Top-bar "Save now" — flush the debounced autosave on demand. Returns false
   *  when nothing was saved so the indicator can show the not-saved flash. */
  onSaveNow: () => void | boolean | Promise<void | boolean>
  onOpenHistory: () => void
  complianceOpen: boolean
  onToggleCompliance: () => void
  mockupOpen: boolean
  onToggleMockup: () => void
  exportOpen: boolean
  onToggleExport: () => void
  /** DS-73d — true when the creator's tier blocks export. Renders a
      lock cue but keeps the click-to-upgrade behaviour. */
  exportLocked: boolean
  /** Builder+ — show the compliance-label download (hidden for Maker). */
  canDownloadLabels: boolean
  /** Studio ☰ menu "Save draft" — flush autosave + pin a milestone. */
  onSaveDraft: () => void
  /** Studio ☰ menu "Save as template" — persist to the active brand kit. */
  onSaveAsTemplate: () => void
  /** Admin template-author mode — shows an "Admin Mode" badge by the wordmark. */
  templateAuthorMode: boolean
}) {
  return (
    <header className="flex h-[73px] items-center justify-between border-b border-ink-200 bg-[var(--studio-panel-bg)] px-4">
      <div className="flex items-center gap-2.5">
        <Link href={`/products/${productId}`} className="flex items-center gap-2">
          {studioLogo?.kind === 'full' ? (
            <Brand imageSrc={studioLogo.src} sublabel={studioLogo.sublabel ?? undefined} />
          ) : (
            <BrandMark imageSrc={studioLogo?.src ?? undefined} sublabel={studioLogo?.sublabel} size={28} />
          )}
        </Link>
        {templateAuthorMode && (
          <span className="inline-flex items-center gap-1 rounded-full border border-pink-200 bg-pink-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-pink-700">
            Admin Mode
          </span>
        )}
        {/* 3-line menu sits to the right of the logo. */}
        <StudioHeaderMenu productId={productId} productName={productName} canDownloadLabels={canDownloadLabels} onSaveDraft={onSaveDraft} onSaveAsTemplate={onSaveAsTemplate} />
        <div className="mx-1 h-6 w-px bg-ink-200" />
        {/* Autosave status + history, then undo/redo — all icon + tooltip, left-aligned. */}
        <SavedIndicator
          status={saveStatus}
          savedAt={lastSavedAt}
          onSave={onSaveNow}
          onOpenHistory={onOpenHistory}
        />
        <IconButton ariaLabel="Undo (⌘Z)" onClick={onUndo} disabled={!canUndo}>
          <Undo2 className="h-4 w-4" />
        </IconButton>
        <IconButton ariaLabel="Redo (⇧⌘Z)" onClick={onRedo} disabled={!canRedo}>
          <Redo2 className="h-4 w-4" />
        </IconButton>

        {/* Per-flavor labels — the switcher is the active-flavor Signal (safety
            UX). onSelect does a full-reload nav so the canvas re-hydrates that
            flavor's saved Design (no client re-hydration). */}
        {flavors.length > 0 && (
          <div className="ml-2 flex items-center gap-3 border-l border-ink-200 pl-4">
            <FlavorSwitcher
              flavors={flavors}
              activeId={activeFlavorPresetId}
              includeBase
              onSelect={(id) => {
                window.location.href = id
                  ? `/products/${productId}/design/canvas?flavor=${id}`
                  : `/products/${productId}/design/canvas`
              }}
            />
            {!activeFlavorPresetId && <ApplyBaseButton productId={productId} />}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Compliance — DS-68 styled as a primary pink CTA so creators
            don't ship un-checked. When the panel is open we switch to a
            quieter outline state to signal "engaged." */}
        <button
          type="button"
          onClick={onToggleCompliance}
          aria-pressed={complianceOpen}
          aria-label={complianceOpen ? 'Close compliance panel' : 'Open compliance panel'}
          className={
            'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ' +
            (complianceOpen
              ? 'border-pink-500 bg-white text-pink-700 hover:bg-pink-50'
              : 'border-pink-500 bg-pink-500 text-white shadow-sm hover:bg-pink-600 hover:border-pink-600')
          }
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Compliance
        </button>
        <button
          type="button"
          onClick={onToggleMockup}
          aria-pressed={mockupOpen}
          aria-label={mockupOpen ? 'Close preview' : 'Open preview'}
          className={
            'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ' +
            (mockupOpen
              ? 'border-pink-500 bg-pink-50 text-pink-700'
              : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50')
          }
        >
          <Eye className="h-3.5 w-3.5" />
          Preview
        </button>
        {/* DS-73d — Export sits in the same white-pill chrome as Preview
            but renders a small lock badge when the creator's tier blocks
            the action. Click handler in the shell routes Maker creators
            to the UpgradeOverlay; Builder/Agency open the print-ready
            ExportModal as before. */}
        <button
          type="button"
          onClick={onToggleExport}
          aria-pressed={exportOpen}
          aria-label={exportOpen ? 'Close export' : 'Open export'}
          className={
            'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ' +
            (exportOpen
              ? 'border-pink-500 bg-pink-50 text-pink-700'
              : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50')
          }
        >
          <Download className="h-3.5 w-3.5" />
          Export
          {exportLocked && (
            <span className="-mr-0.5 ml-0.5 inline-flex items-center rounded-sm bg-pink-100 px-1 py-px text-[9px] font-bold tracking-wider text-pink-700">
              PRO
            </span>
          )}
        </button>
        {/* DS-73e + R8 — "Next" (black pill) takes the creator directly
            into the 3-step checkout wizard. The Studio is the only
            entry point to checkout (we removed the dashboard
            shortcut), so this button is the seam between design and
            order placement. Per-flavor safety gate (Verify): blocked until
            every selected flavor has a saved label. */}
        {flavorCompleteness && !flavorCompleteness.complete ? (
          <button
            type="button"
            disabled
            title={`Add a label for every flavor before checkout — missing: ${flavorCompleteness.missingFlavors.join(', ')}${
              flavorCompleteness.missingAggregate ? ' + the aggregate label' : ''
            }`}
            className="ml-2 inline-flex cursor-not-allowed items-center gap-1.5 rounded-full bg-ink-200 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-ink-500"
          >
            <Lock className="h-3.5 w-3.5" />
            Next
          </button>
        ) : (
          <Link
            href={`/products/${productId}/checkout`}
            className="ml-2 inline-flex items-center rounded-full bg-ink-900 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-black"
          >
            Next
          </Link>
        )}
      </div>
    </header>
  )
}

// ============================================================================
// Left rail
// ============================================================================

function LeftRail({
  activeTool,
  onToggle,
  onHover,
  partnerOffersFinishes,
  aiGeneratorEnabled = true,
  templateAuthorMode = false,
}: {
  activeTool: ToolKey | null
  onToggle: (k: ToolKey) => void
  /** Schedule a hover-open with intent delay (DS-61). */
  onHover: (k: ToolKey) => void
  /** DS-70b — controls whether the Finishes icon renders. */
  partnerOffersFinishes: boolean
  /** Admin master toggle — hides the AI Templator when the generator is off. */
  aiGeneratorEnabled?: boolean
  /** Admin template-author mode — hide product-coupled tools (no real product). */
  templateAuthorMode?: boolean
}) {
  // Filter out conditional tools whose gates aren't met. V1 always
  // hides Finishes; later phases flip the gate per-product.
  // In admin template-author mode there is no product, so tools that read product
  // data (Product / Label facts / Components / Mandatory phrases) are hidden.
  const TEMPLATE_AUTHOR_HIDDEN: ToolKey[] = ['product', 'label', 'components', 'phrases']
  const visibleTools = TOOLS.filter((t) => {
    if (t.conditional === 'finishes') return partnerOffersFinishes
    // AI Templator is hidden platform-wide when the admin master toggle is off.
    // Admin template-author mode always keeps it (aiGeneratorEnabled defaults true).
    if (t.conditional === 'ai') return aiGeneratorEnabled
    if (templateAuthorMode && TEMPLATE_AUTHOR_HIDDEN.includes(t.key)) return false
    return true
  })
  return (
    <nav
      className="flex w-20 flex-col gap-0.5 border-r border-ink-200 bg-[var(--studio-panel-bg)] py-2"
      role="toolbar"
      aria-label="Design tools"
    >
      {visibleTools.map(({ key, label, icon: Icon, v1 }) => {
        const isActive = activeTool === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            onMouseEnter={() => onHover(key)}
            className={`flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors ${
              isActive
                ? 'bg-pink-50 text-pink-700'
                : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
            }`}
            aria-pressed={isActive}
          >
            <Icon className="h-5 w-5" />
            <span className="text-center leading-tight">{label}</span>
            {!v1 && (
              <span
                className="rounded bg-ink-100 px-1 text-[8px] font-semibold uppercase tracking-wider text-ink-500"
                title="Coming next"
              >
                soon
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}

// ============================================================================
// Tool drawer
// ============================================================================

function ToolDrawer({
  tool,
  dieCut,
  guides,
  setGuides,
  brandAssets,
  certBadges,
  onRequestAddCert,
  labelingType,
  canvas,
  productId,
  productName,
  productMeta,
  productImageUrl,
  productCtx,
  retailIdentity,
  frameCount,
  showFrames,
  setShowFrames,
  nutritionPanelData,
  aggregateNutritionData,
  nonFoodPanelData,
  activeFlavorPresetId,
  flavors,
  savedFlavorIds,
  mismatchWarnings,
  recipeHash,
  activeBrandId,
  onActiveBrandChange,
  creatorTier,
  onSaveAsTemplate,
  finishes,
  templateAuthor,
  dielineFrameLayout,
  onClose,
}: {
  tool: ToolKey
  dieCut: DieCutSpec
  guides: GuideVisibility
  setGuides: (g: GuideVisibility) => void
  brandAssets: BrandCanvasAssets
  certBadges: CertBadge[]
  onRequestAddCert: (badge: CertBadge) => void
  labelingType: LabelingType
  canvas: FabricCanvas | null
  productId: string
  productName: string
  productMeta: ProductMeta
  productImageUrl: string | null
  productCtx: {
    productName: string
    brandName: string
    allergens: string[]
    bioengineered: boolean
    netQuantity: string | null
    netQuantityKind: 'solid' | 'liquid' | 'count'
  }
  retailIdentity: { gtin: string | null; internalSku: string | null; barcodeMode: BarcodeMode }
  frameCount: number
  showFrames: boolean
  setShowFrames: (v: boolean) => void
  nutritionPanelData: NutritionPanelData | null
  aggregateNutritionData: AggregateNutritionData | null
  nonFoodPanelData: { supplement: SupplementPanelData | null; aafco: AafcoPanelData | null } | null
  activeFlavorPresetId: string | null
  /** Per-flavor label safety — the product's selected flavors, which of them have a
   *  saved label, and the wrong-flavor-text warnings for the active surface. */
  flavors: Array<{ id: string; name: string; swatchHex: string | null }>
  savedFlavorIds: string[]
  mismatchWarnings: FlavorMismatchWarning[]
  recipeHash: string | null
  activeBrandId: string
  onActiveBrandChange: (brandId: string) => void
  creatorTier: TierKey
  onSaveAsTemplate: () => void
  finishes: StudioFinish[]
  /** Admin template-author mode — the AI drawer loads product-less against this die-cut + domain. */
  templateAuthor: { domain: string; container: string | null; aspectBucket: string | null; dieCutId?: string | null } | null
  /** Resolved die-line FrameLayout — frame-aware template re-anchoring (Reshape R1). */
  dielineFrameLayout: FrameLayout | null
  onClose: () => void
}) {
  // canvas is the live Fabric instance — drawers that need it (Text /
  // Images / Layers / etc.) receive it through this prop.
  const titles: Record<ToolKey, string> = {
    product: 'Product',
    label: 'Label & Compliance',
    templates: 'Templates',
    ai: 'AI Templator',
    brand: 'Brand',
    text: 'Text',
    elements: 'Elements',
    images: 'Images',
    graphics: 'Graphics',
    clipart: 'Clipart',
    background: 'Background',
    pattern: 'Pattern',
    qrcode: 'QR Code',
    barcode: 'Barcode',
    layers: 'Layers',
    finishes: 'Finishes',
    components: 'Components',
    phrases: 'Mandatory phrases',
  }

  // Label & Compliance merged tab — two collapsible sections (Facts label + Mandatory phrases).
  const [openFacts, setOpenFacts] = useState(true)
  const [openPhrases, setOpenPhrases] = useState(false)

  return (
    <aside className="flex w-[400px] flex-col border-r border-ink-200 bg-[var(--studio-panel-bg)]">
      <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
        <h2 className="text-base font-semibold text-ink-900">{titles[tool]}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close drawer"
          className="rounded p-1 text-ink-500 hover:bg-ink-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {tool === 'product' && (
          <ProductDrawer
            dieCut={dieCut}
            details={{
              productName,
              thumbnailUrl: productImageUrl,
              quantityLabel: productMeta.moq ? `MOQ ${productMeta.moq.toLocaleString()} units` : null,
              category: productMeta.category,
              domain: labelingType,
              brandName: productCtx.brandName,
              manufacturerName: productMeta.manufacturerName,
              netQuantity: productCtx.netQuantity,
              allergens: productCtx.allergens,
              bioengineered: productCtx.bioengineered,
              retail: retailIdentity,
              moq: productMeta.moq,
              leadTimeDays: productMeta.leadTimeDays,
              fulfillment: productMeta.fulfillment,
              cost: productMeta.cost,
              packaging: productMeta.packaging,
              certs: certBadges.map((b) => ({ name: b.certTypeName, badgeUrl: b.badgeUrl })),
              dieCut,
            }}
            guides={guides}
            setGuides={setGuides}
            frameCount={frameCount}
            showFrames={showFrames}
            setShowFrames={setShowFrames}
          />
        )}
        {tool === 'label' && (
          <div className="space-y-3">
            {/* Per-flavor label safety (PER_FLAVOR only) — wrong-flavor text warning
                + the scoped per-flavor label list with completeness. */}
            {flavors.length > 0 && (
              <>
                <FlavorMismatchNotice
                  warnings={mismatchWarnings}
                  activeFlavorName={flavors.find((f) => f.id === activeFlavorPresetId)?.name ?? 'this flavor'}
                />
                <FlavorLabelSections
                  flavors={flavors.map((f) => ({
                    id: f.id,
                    name: f.name,
                    swatchHex: f.swatchHex,
                    hasLabel: savedFlavorIds.includes(f.id),
                  }))}
                  activeId={activeFlavorPresetId}
                  onSelect={(id) => {
                    window.location.href = `/products/${productId}/design/canvas?flavor=${id}`
                  }}
                />
              </>
            )}
            {/* Label & Compliance — Facts label + Mandatory phrases in one place (2026-07-04). */}
            <CollapseSection title="Facts label" open={openFacts} onToggle={() => setOpenFacts((v) => !v)}>
              <LabelDrawer
                canvas={canvas}
                brandAssets={brandAssets}
                certBadges={certBadges}
                onRequestAddCert={onRequestAddCert}
                labelingType={labelingType}
                dieCut={dieCut}
                nutritionPanelData={nutritionPanelData}
                aggregateNutritionData={aggregateNutritionData}
                nonFoodPanelData={nonFoodPanelData}
                activeFlavorPresetId={activeFlavorPresetId}
                recipeHash={recipeHash}
                productCtx={{
                  productName,
                  brandName: brandAssets.brandName,
                  netQuantity: productCtx.netQuantity,
                  allergens: productCtx.allergens,
                }}
              />
            </CollapseSection>
            <CollapseSection title="Mandatory phrases" open={openPhrases} onToggle={() => setOpenPhrases((v) => !v)}>
              <PhrasesDrawer canvas={canvas} productId={productId} labelingType={labelingType ?? 'FOOD'} />
            </CollapseSection>
          </div>
        )}
        {tool === 'templates' && (
          <TemplatesDrawer
            canvas={canvas}
            activeBrandId={activeBrandId}
            productId={productId}
            domain={labelingType}
            dieCut={dieCut}
            frames={dielineFrameLayout}
            canPremium={canRecolorTemplate(creatorTier)}
            onSaveAsTemplate={onSaveAsTemplate}
          />
        )}
        {tool === 'ai' && (
          <AiCreateDrawer
            canvas={canvas}
            productId={productId}
            dieCut={dieCut}
            admin={templateAuthor ? { domain: templateAuthor.domain, dieCutId: templateAuthor.dieCutId ?? null } : null}
            onClose={onClose}
          />
        )}
        {tool === 'brand' && (
          <BrandDrawer
            canvas={canvas}
            brandAssets={brandAssets}
            activeBrandId={activeBrandId}
            onActiveBrandChange={onActiveBrandChange}
            canRecolor={canRecolorTemplate(creatorTier)}
            onSaveAsTemplate={onSaveAsTemplate}
          />
        )}
        {tool === 'text' && <TextDrawer canvas={canvas} brandAssets={brandAssets} />}
        {tool === 'elements' && (
          <ElementsDrawer
            canvas={canvas}
            brandAssets={brandAssets}
            productId={productId}
          />
        )}
        {tool === 'qrcode' && <QrCodeDrawer canvas={canvas} />}
        {tool === 'barcode' && (
          <BarcodeDrawer
            canvas={canvas}
            productId={productId}
            retailIdentity={retailIdentity}
          />
        )}
        {tool === 'layers' && <LayersDrawer canvas={canvas} />}
        {tool === 'finishes' && <FinishesDrawer finishes={finishes} />}
        {tool === 'components' && <ComponentsDrawer productId={productId} />}
        {tool !== 'product' &&
          tool !== 'label' &&
          tool !== 'templates' &&
          tool !== 'ai' &&
          tool !== 'brand' &&
          tool !== 'text' &&
          tool !== 'elements' &&
          tool !== 'qrcode' &&
          tool !== 'barcode' &&
          tool !== 'layers' &&
          tool !== 'finishes' &&
          tool !== 'components' &&
          tool !== 'phrases' && <ComingSoonStub label={titles[tool]} />}
      </div>
    </aside>
  )
}

// Collapsible section for the merged "Label & Compliance" tab. Keeps children MOUNTED
// (CSS-hidden when collapsed) so LabelDrawer / PhrasesDrawer state survives collapsing.
function CollapseSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-ink-200">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
        <span className="text-[12px] font-bold uppercase tracking-wide text-ink-700">{title}</span>
        <ChevronDown className={`ml-auto h-4 w-4 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={open ? 'border-t border-ink-100 p-3' : 'hidden'}>{children}</div>
    </section>
  )
}

function ProductDrawer({
  dieCut,
  details,
  guides,
  setGuides,
  frameCount,
  showFrames,
  setShowFrames,
}: {
  dieCut: DieCutSpec
  details: ProductDetailsData
  guides: GuideVisibility
  setGuides: (g: GuideVisibility) => void
  frameCount: number
  showFrames: boolean
  setShowFrames: (v: boolean) => void
}) {
  return (
    <div className="space-y-5">
      {/* Printify-style product details panel (identity + pricing + print spec + compliance).
          Replaces the old print-only ProductSpecCard. docs/CREATOR_PRODUCT_DETAILS_DRAWER.md */}
      <ProductDetailsDrawer data={details} />

      {/* Surfaces — V1 single-surface, V1.5+ adds back / multi-panel.
          See docs/MULTI_SURFACE_PLAN.md (DS-67c). */}
      <SurfacesSection dieCut={dieCut} />

      {/* Die-cut guides toggles */}
      <section>
        <div className="mb-2 text-[12px] font-bold uppercase tracking-wider text-ink-700">
          Guides
        </div>
        <div className="space-y-1.5">
          <GuideToggle
            label="Show bleed line"
            checked={guides.bleed}
            onChange={(v) => setGuides({ ...guides, bleed: v })}
          />
          <GuideToggle
            label="Show trim / cut line"
            checked={guides.trim}
            onChange={(v) => setGuides({ ...guides, trim: v })}
          />
          <GuideToggle
            label="Show safety line"
            checked={guides.safe}
            onChange={(v) => setGuides({ ...guides, safe: v })}
          />
          <GuideToggle
            label="Show placement zones"
            checked={guides.zones}
            onChange={(v) => setGuides({ ...guides, zones: v })}
          />
          {frameCount > 0 && (
            <GuideToggle
              label={`Show label frames (${frameCount})`}
              checked={showFrames}
              onChange={setShowFrames}
            />
          )}
        </div>
        <div className="mt-3">
          <DieCutLegend guides={guides} />
        </div>
      </section>
    </div>
  )
}


// ============================================================================
// SurfacesSection — V1 single, V1.5+ multi (DS-67c forward-marker)
// ============================================================================

function SurfacesSection({ dieCut }: { dieCut: DieCutSpec }) {
  return (
    <section>
      <div className="mb-2 text-[12px] font-bold uppercase tracking-wider text-ink-700 flex items-center justify-between">
        <span>Surfaces</span>
        <span className="text-[9px] font-mono text-ink-400">1 of 1</span>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 rounded-md border border-pink-300 bg-pink-50/40 px-3 py-2">
          <div>
            <div className="text-[12.5px] font-semibold text-ink-900">
              {dieCut.name}
            </div>
            <div className="text-[10.5px] text-ink-500 mt-0.5">
              {dieCut.category.replace('_', ' ').toLowerCase()}
            </div>
          </div>
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-pink-700">
            Active
          </span>
        </div>
      </div>
    </section>
  )
}

function GuideToggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded accent-pink-500"
      />
      {label}
    </label>
  )
}

function ComingSoonStub({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-ink-300 bg-ink-50 p-8 text-center">
      <Sparkles className="mx-auto h-6 w-6 text-pink-500" />
      <h3 className="mt-3 text-sm font-semibold text-ink-900">{label} — coming next</h3>
      <p className="mx-auto mt-2 max-w-xs text-xs text-ink-500">
        Phase C ships the canvas foundation. Each tool drawer (Text, Label, Images, Layers,
        QR&nbsp;/&nbsp;Barcode, etc.) wires up in Phase D — see
        <code className="mx-1 rounded bg-ink-200 px-1 py-0.5 text-[10px]">docs/DESIGN_STUDIO_REBUILD.md §5</code>
        for the order.
      </p>
    </div>
  )
}

// ============================================================================
// Canvas viewport
// ============================================================================

function CanvasStageWithFrame({
  dieCut,
  pxPerMm,
  guides,
  frames,
  initialDesignJson,
  onReady,
  onHydrated,
  viewZoom,
}: {
  dieCut: DieCutSpec
  pxPerMm: number
  guides: GuideVisibility
  frames: ResolvedFrame[]
  initialDesignJson: object | null
  onReady: (canvas: FabricCanvas) => void
  onHydrated: (canvas: FabricCanvas) => void
  /** DS-73.1 — forwarded to Stage so fabric setZoom keeps object coords
      anchored to the resizing canvas. */
  viewZoom: number
}) {
  const fullWidthMm = dieCut.widthMm + 2 * dieCut.bleedMm
  const fullHeightMm = dieCut.heightMm + 2 * dieCut.bleedMm
  const pixelWidth = fullWidthMm * pxPerMm
  const pixelHeight = fullHeightMm * pxPerMm

  return (
    <div
      className="relative shadow-2xl"
      style={{ width: pixelWidth, height: pixelHeight }}
    >
      <Stage
        dieCut={dieCut}
        pxPerMm={pxPerMm}
        viewZoom={viewZoom}
        surfaceColor="#ffffff"
        initialDesignJson={initialDesignJson ?? undefined}
        onReady={onReady}
        onHydrated={onHydrated}
      />
      <DieCutFrame dieCut={dieCut} pxPerMm={pxPerMm} guides={guides} />
      <FrameGuides frames={frames} dieCut={dieCut} pxPerMm={pxPerMm} />
    </div>
  )
}

// Dieline Phase B — soft label-frame guide overlays. Each frame.box is a NormBox
// (0..1 of the trim area); map it into the bleed-inclusive stage px space. Scope
// drives the color (Recipe/Material/Product/Identity/Creative). Non-interactive
// for now (pointer-events:none) — movability lands with object pre-placement.
const FRAME_SCOPE_COLOR: Record<string, string> = {
  RECIPE: '#FF2E63', // pink — recipe-derived (Nutrition/Ingredients/Allergens)
  MATERIAL: '#0EA5E9', // sky — recycling / disposal marks
  PRODUCT: '#16A34A', // green — certifications / phrases
  IDENTITY: '#7C3AED', // violet — SOI / net qty / manufacturer / barcode
  CREATIVE: '#9CA3AF', // gray — logo / imagery / custom
}

function FrameGuides({
  frames,
  dieCut,
  pxPerMm,
}: {
  frames: ResolvedFrame[]
  dieCut: DieCutSpec
  pxPerMm: number
}) {
  if (frames.length === 0) return null
  const bleedPx = dieCut.bleedMm * pxPerMm
  const trimWpx = dieCut.widthMm * pxPerMm
  const trimHpx = dieCut.heightMm * pxPerMm
  return (
    <div className="pointer-events-none absolute inset-0">
      {frames.map((rf) => {
        const b = rf.frame.box
        const color = FRAME_SCOPE_COLOR[rf.scope] ?? '#9CA3AF'
        const left = bleedPx + b.x * trimWpx
        const top = bleedPx + b.y * trimHpx
        const width = b.w * trimWpx
        const height = b.h * trimHpx
        return (
          <div
            key={rf.frame.id}
            className="absolute rounded-[2px]"
            style={{
              left,
              top,
              width,
              height,
              border: `1.5px dashed ${color}`,
              background: `${color}0F`,
            }}
          >
            <span
              className="absolute left-0 top-0 -translate-y-full whitespace-nowrap rounded-t px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-white"
              style={{ background: color }}
            >
              {rf.frame.kind.replace(/_/g, ' ')}
              {rf.frame.required ? '' : ' (opt)'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// Bottom toolbar
// ============================================================================

function BottomToolbar({
  zoom,
  setZoom,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  canRotate,
  onRotateLeft,
  onRotateRight,
  onResetRotation,
  panMode,
  onTogglePan,
}: {
  zoom: number
  setZoom: (z: number) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  canRotate: boolean
  onRotateLeft: () => void
  onRotateRight: () => void
  onResetRotation: () => void
  panMode: boolean
  onTogglePan: () => void
}) {
  const display = useMemo(() => `${Math.round(zoom * 100)}%`, [zoom])
  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 z-20" style={{ zoom: 1.2 }}>
      <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-ink-200 bg-white px-2 py-1.5 shadow-md">
        <IconButton
          ariaLabel="Zoom out"
          onClick={() => setZoom(Math.max(0.3, +(zoom - 0.1).toFixed(2)))}
          disabled={zoom <= 0.3}
        >
          <ZoomOut className="h-4 w-4" />
        </IconButton>
        <span className="min-w-[44px] text-center text-xs font-mono text-ink-600">{display}</span>
        <IconButton
          ariaLabel="Zoom in"
          onClick={() => setZoom(Math.min(3, +(zoom + 0.1).toFixed(2)))}
          disabled={zoom >= 3}
        >
          <ZoomIn className="h-4 w-4" />
        </IconButton>
        <IconButton ariaLabel="Fit to screen" onClick={() => setZoom(1)}>
          <Maximize className="h-4 w-4" />
        </IconButton>
        <div className="mx-1 h-5 w-px bg-ink-200" />
        <IconButton
          ariaLabel="Rotate left 15°"
          onClick={onRotateLeft}
          disabled={!canRotate}
        >
          <RotateCcw className="h-4 w-4" />
        </IconButton>
        <IconButton
          ariaLabel="Rotate right 15°"
          onClick={onRotateRight}
          disabled={!canRotate}
        >
          <RotateCw className="h-4 w-4" />
        </IconButton>
        <IconButton
          ariaLabel="Reset rotation"
          onClick={onResetRotation}
          disabled={!canRotate}
        >
          <span className="text-[10px] font-bold">0°</span>
        </IconButton>
        <PanToggleButton active={panMode} onClick={onTogglePan} />
        <div className="mx-1 h-5 w-px bg-ink-200" />
        <IconButton ariaLabel="Undo (⌘Z)" onClick={onUndo} disabled={!canUndo}>
          <Undo2 className="h-4 w-4" />
        </IconButton>
        <IconButton ariaLabel="Redo (⇧⌘Z)" onClick={onRedo} disabled={!canRedo}>
          <Redo2 className="h-4 w-4" />
        </IconButton>
      </div>
    </div>
  )
}

// ============================================================================
// Shared
// ============================================================================

function PanToggleButton({
  active,
  onClick,
}: {
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? 'Exit pan mode' : 'Pan mode'}
      title={active ? 'Click to exit pan mode' : 'Drag the canvas to pan'}
      className={
        'rounded p-1.5 transition-colors ' +
        (active
          ? 'bg-ink-900 text-white hover:bg-black'
          : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900')
      }
    >
      <Hand className="h-4 w-4" />
    </button>
  )
}

function IconButton({
  children,
  ariaLabel,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  ariaLabel: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="rounded p-1.5 text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}
