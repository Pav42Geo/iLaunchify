import { PrismaClient } from '@prisma/client'

// Singleton Prisma client with hot-reload safety for Next.js dev.
// See https://www.prisma.io/docs/orm/more/help-and-troubleshooting/help-articles/nextjs-prisma-client-dev-practices

declare global {
  // eslint-disable-next-line no-var
  var __ilaunchifyPrisma: PrismaClient | undefined
}

export const prisma =
  globalThis.__ilaunchifyPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalThis.__ilaunchifyPrisma = prisma
}

export * from '@prisma/client'

// Theme Studio — runtime design-token overrides (Phase 3b, 2026-06-25).
export {
  EDITABLE_THEME_TOKENS,
  THEME_PAIRINGS,
  FONT_OPTIONS,
  FONT_STACKS,
  SCOPES,
  SCOPE_LABELS,
  isThemeScope,
  getScopeOnlyOverrides,
  type ThemeScope,
  getThemeOverrides,
  getThemeOverrideCss,
  upsertThemeOverride,
  deleteThemeOverride,
  getThemeDraft,
  saveThemeDraftRow,
  getThemePreviewCss,
  recordThemeVersion,
  listThemeVersions,
  getThemeVersion,
  type ThemeVersionRow,
  validateThemeToken,
  validateTheme,
  defaultThemeValue,
  contrastRatio,
  rgbToHex,
  resolveHex,
  type EditableThemeToken,
  type ThemeTokenKind,
  type ValidationResult,
} from './theme-tokens'

// Banned-ingredient runtime enforcement helpers (FDA_REGULATORY_POSTURE §5).
export {
  isIngredientBanned,
  findFirstBannedIngredient,
  type BannedIngredientMatch,
} from './banned-ingredients'
export {
  findBannedProductTerm,
  type BannedProductTerm,
  type BannedProductTermMatch,
} from './banned-product-categories'
export {
  getSampleSettings,
  SAMPLE_SETTINGS_DEFAULTS,
  type SampleSettingsValues,
} from './sample-settings'
export {
  getSupportSettings,
  SUPPORT_SETTINGS_DEFAULTS,
  type SupportSettingsValues,
  type SupportPriority,
} from './support-settings'
export { getCannedReplies, type CannedReplyRow } from './canned-replies'
// Default-brand provisioning — brand is optional for creators, but Product.brandId
// is required, so the launch flow lazily ensures a default brand (Pavel 2026-06-22).
export { getOrCreateDefaultBrand, type EnsureBrandResult } from './default-brand'
// Brand custom fonts (Brand Kit V2 Slice 2 — uploaded fonts scoped to a brand kit).
export {
  listBrandFonts,
  getBrandFontsByIds,
  createBrandFont,
  deleteBrandFont,
  countBrandFonts,
  type BrandFontRow,
} from './brand-fonts'
// Brand text-style → font assignments (Brand Kit V2 Slice 2c — Heading/Subheading/Body).
export {
  listBrandTextStyles,
  setBrandTextStyle,
  setBrandTextStyleSpec,
  clearBrandTextStyle,
  type BrandTextRole,
  type BrandTextStyleRow,
  type BrandTextStyleSpecInput,
} from './brand-text-styles'
// Brand visual-asset library (Brand Kit V2 Slice 3 — pinned photos/graphics/backgrounds).
export {
  listBrandAssets,
  isAssetPinnedToBrand,
  addBrandAsset,
  removeBrandAsset,
  type BrandAssetKind,
  type BrandAssetRow,
} from './brand-assets'
// Brand color palettes (Brand Kit V2 Slice 5 — multi-palette + gradients + CMYK/Pantone).
export {
  listBrandPalettes,
  countBrandPalettes,
  createBrandPalette,
  renameBrandPalette,
  deleteBrandPalette,
  addBrandSwatch,
  updateBrandSwatch,
  removeBrandSwatch,
  type BrandPaletteRow,
  type BrandSwatchRow,
  type BrandSwatchInput,
  type BrandGradient,
  type BrandGradientStop,
} from './brand-palettes'
export {
  getRoleCapabilityMatrix,
  getRoleCapabilities,
  setRoleCapability,
  setRoleCapabilities,
} from './role-capabilities'
export {
  createAdminInvite,
  getAdminInviteByTokenHash,
  listAdminInvites,
  markAdminInviteAccepted,
  revokeAdminInvite,
  type AdminInviteRow,
  type AdminInviteStatus,
} from './admin-invites'
export {
  getIntegrationMetaMap,
  markIntegrationRotated,
  setIntegrationCadence,
  type IntegrationMetaRow,
} from './integration-meta'
export {
  getOrderSettings,
  resolveOrderSettings,
  applyOrderOverrides,
  ORDER_SETTINGS_DEFAULTS,
  type OrderSettingsValues,
  type OrderSettingsScope,
  type OrderSettingsOverrideRow,
  type OrderSettingsContext,
} from './order-settings'
export {
  createSnapshot,
  listSnapshots,
  getSnapshotJson,
  SNAPSHOT_RING_SIZE,
  COALESCE_WINDOW_MS,
  snapshotsToPrune,
  coalesceTarget,
  isPinnedKind,
  type SnapshotEntity,
  type SnapshotKind,
  type SnapshotRow,
  type SnapshotMeta,
} from './snapshots'
export {
  getIngredientSourceConfigs,
  resolveIngredientSource,
  INGREDIENT_SOURCE_DEFAULTS,
  INGREDIENT_SOURCES,
  type IngredientSourceConfigValues,
  type IngredientSourceMode,
  type LabelingTypeKey,
} from './ingredient-sources'
export {
  getDomainSettings,
  getEnabledDomains,
  isDomainEnabled,
  DOMAIN_KEYS,
  DOMAIN_ENABLED_DEFAULTS,
  type DomainKey,
} from './domain-settings'
export {
  getBillingProfile,
  upsertBillingProfile,
  BILLING_PROFILE_EMPTY,
  type BillingProfileValues,
  type BillingAddress,
} from './billing-profile'
export {
  listPaymentMethodRefs,
  upsertPaymentMethodRef,
  setDefaultPaymentMethodRef,
  deletePaymentMethodRef,
  ownsPaymentMethodRef,
  type PaymentMethodRefValues,
} from './payment-methods'
export {
  listTaxDocuments,
  getPartnerAnnualEarnings,
  type TaxDocumentValues,
  type AnnualEarnings,
} from './tax-documents'
export {
  listBrandTemplates,
  getBrandTemplateCanvasJson,
  countBrandTemplates,
  createBrandTemplate,
  deleteBrandTemplate,
  listPremiumTemplates,
  getPremiumTemplate,
  getOrCreateSystemTemplatesBrand,
  getSystemTemplatesBrandId,
  updatePremiumTemplate,
  deletePremiumTemplate,
  setTemplateStyleAssignments,
  getPremiumTemplateMeta,
  listAdminLibraryTemplates,
  updateLibraryTemplate,
  deleteLibraryTemplate,
  type BrandTemplateValues,
  type PremiumTemplateValues,
  type PremiumTemplateMeta,
  type AdminLibraryTemplate,
  type TemplateColorRole,
  type TemplateColorRoles,
  type TemplateTargeting,
} from './brand-templates'

export {
  listTemplateStyles,
  listAllTemplateStyles,
  type TemplateStyleValues,
  type TemplateStyleFacet,
  type TemplateStyleDomain,
} from './template-styles'

export {
  listMatchablePremiumTemplates,
  listMatchableBrandTemplates,
  listMatchableRegularLibraryTemplates,
  listActiveDieCuts,
  getTemplateUsageStats,
  type MatchableTemplateRow,
  type AdminDieCutOption,
  type TemplateUsageStats,
} from './template-library'

export {
  getCanonicalShapeOptions,
  setDielineCanonicalShape,
  listDielineCanonicalLinks,
  propagateDielineFrames,
  type CanonicalShapeOption,
  type DielineCanonicalLink,
} from './dieline-canonical'
