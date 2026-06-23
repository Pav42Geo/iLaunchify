/**
 * Design Template Library — pure matching engine (docs/DESIGN_TEMPLATE_LIBRARY.md §6).
 *
 * Given a product's packaging components (each a die-line surface) and the candidate
 * templates for the product's domain, returns one section per component, with the
 * matched templates grouped by their primary style category. Matching is by die-line
 * GEOMETRY (shape-family) with EXACT packagingTypeId preferred. No React, no Fabric,
 * no Prisma — fully unit-testable.
 */

export type AspectBucket = 'WRAP' | 'PANEL_WIDE' | 'PANEL_SQUARE' | 'PANEL_TALL' | 'LONG_STRIP'
export type TemplateMatchMode = 'SHAPE_FAMILY' | 'EXACT'

/** A product's packaging component = one die-line surface to design. */
export interface ProductComponentDieline {
  componentId: string
  label: string // "Bottle label", "6-pack carton"
  packagingTypeId: string | null
  containerCategory: string | null // ContainerCategory enum value (CAN, CARTON, …)
  widthMm?: number | null
  heightMm?: number | null
}

/** A candidate template (already scoped to the product's domain by the caller, but we
 *  re-check `domain` defensively when provided). */
export interface MatchableTemplate {
  id: string
  name: string
  thumbnailUrl: string | null
  isPremium: boolean
  domain?: string | null
  matchMode: TemplateMatchMode
  packagingTypeId: string | null
  targetContainerCategory: string | null
  aspectBucket: AspectBucket | null
  primaryStyleId: string | null
  primaryStyleLabel: string | null
}

export interface MatchedTemplate extends MatchableTemplate {
  /** Matched the component's exact packagingTypeId (sorts first). */
  exact: boolean
}

export interface TemplateStyleGroup {
  styleId: string | null
  styleLabel: string
  templates: MatchedTemplate[]
}

export interface TemplateSection {
  componentId: string
  label: string
  aspectBucket: AspectBucket | null
  groups: TemplateStyleGroup[]
}

// --- Aspect-ratio buckets (thresholds are an open knob — docs §10.1) ---
const RATIO_WRAP = 2.5
const RATIO_PANEL_WIDE = 1.3
const RATIO_PANEL_SQUARE = 0.8
const RATIO_PANEL_TALL = 0.3

/** Width/height (mm) → aspect bucket. Returns null if dimensions are missing. */
export function aspectBucketFor(
  widthMm?: number | null,
  heightMm?: number | null,
): AspectBucket | null {
  if (!widthMm || !heightMm || widthMm <= 0 || heightMm <= 0) return null
  const ratio = widthMm / heightMm
  if (ratio >= RATIO_WRAP) return 'WRAP'
  if (ratio >= RATIO_PANEL_WIDE) return 'PANEL_WIDE'
  if (ratio >= RATIO_PANEL_SQUARE) return 'PANEL_SQUARE'
  if (ratio >= RATIO_PANEL_TALL) return 'PANEL_TALL'
  return 'LONG_STRIP'
}

const UNCATEGORIZED = '__uncategorized__'

function templateMatchesComponent(
  t: MatchableTemplate,
  component: ProductComponentDieline,
  componentBucket: AspectBucket | null,
): boolean {
  if (t.matchMode === 'EXACT') {
    return !!t.packagingTypeId && t.packagingTypeId === component.packagingTypeId
  }
  // SHAPE_FAMILY: same container category, and (if both buckets known) same bucket.
  if (!t.targetContainerCategory || !component.containerCategory) return false
  if (t.targetContainerCategory !== component.containerCategory) return false
  if (t.aspectBucket && componentBucket && t.aspectBucket !== componentBucket) return false
  return true
}

/**
 * Build the template library view for a product.
 *
 * @param components  the product's packaging components (die-line surfaces)
 * @param domain      the product's LabelingType (used to drop wrong-domain templates)
 * @param templates   candidate templates (ideally already domain-scoped)
 */
export function matchTemplatesToProduct(
  components: ProductComponentDieline[],
  domain: string,
  templates: MatchableTemplate[],
): TemplateSection[] {
  const inDomain = templates.filter((t) => !t.domain || t.domain === domain)

  return components.map((component) => {
    const componentBucket = aspectBucketFor(component.widthMm, component.heightMm)

    const matched: MatchedTemplate[] = inDomain
      .filter((t) => templateMatchesComponent(t, component, componentBucket))
      .map((t) => ({
        ...t,
        exact: !!t.packagingTypeId && t.packagingTypeId === component.packagingTypeId,
      }))

    // Group by primary style; exact-first within each group.
    const byStyle = new Map<string, TemplateStyleGroup>()
    for (const t of matched) {
      const key = t.primaryStyleId ?? UNCATEGORIZED
      let group = byStyle.get(key)
      if (!group) {
        group = {
          styleId: t.primaryStyleId,
          styleLabel: t.primaryStyleLabel ?? 'Other',
          templates: [],
        }
        byStyle.set(key, group)
      }
      group.templates.push(t)
    }
    for (const group of byStyle.values()) {
      group.templates.sort(sortTemplate)
    }

    const groups = [...byStyle.values()].sort(sortGroup)
    return { componentId: component.componentId, label: component.label, aspectBucket: componentBucket, groups }
  })
}

// Exact templates first, then premium, then name.
function sortTemplate(a: MatchedTemplate, b: MatchedTemplate): number {
  if (a.exact !== b.exact) return a.exact ? -1 : 1
  if (a.isPremium !== b.isPremium) return a.isPremium ? -1 : 1
  return a.name.localeCompare(b.name)
}

// Named groups alphabetically; "Other" (uncategorized) last.
function sortGroup(a: TemplateStyleGroup, b: TemplateStyleGroup): number {
  const au = a.styleId === null
  const bu = b.styleId === null
  if (au !== bu) return au ? 1 : -1
  return a.styleLabel.localeCompare(b.styleLabel)
}
