// template-graph.ts — publish-time honey-problem gate (PS-7 §8.2.4 / §8.4).
//
// Validates that a manufacturer publishing a DECORATED template has an
// application point for every APPLIED decoration its dielines declare: either
// the bound manufacturer self-applies, or — when the admin gate
// `graph:publish_allow_copack_application` is ON — a co-pack node applies.
//
// Deliberately conservative — it only reports UNRESOLVED for the CERTAIN
// "no application point at all" case the handoff names ("a no-apply
// manufacturer can't list a PSL product without a co-pack route"). Two things
// are intentionally NOT judged here, so the gate never over-blocks:
//   - FC RELABEL is an ORDER-time escape (there is no FC at publish) → checkout.
//   - ASSEMBLY resolution needs concrete carton components → checkout, where the
//     product's PackagingComponents exist. `graph:enforce_assembly_resolution`
//     is applied there, not here.
// Fails SOFT (applicable:false, complete:true) on any missing datum.

import { prisma, getLogisticsSettings } from '@ilaunchify/db'
import { effectivePrintSourcing } from './print-sourcing'
import {
  APPLIED_DECORATIONS,
  validateGraphCompleteness,
  type ApplicationGraphInput,
  type GraphCompletenessResult,
} from './application-point'

interface Applier {
  serviceId: string
  appliesLabels: boolean
}

/**
 * PURE core: one ApplicationGraphInput per APPLIED decoration the template
 * declares. Returns [] when the manufacturer prints/applies in-house (self-label
 * resolves everything → no honey problem). `coPacker` must already be null when
 * the co-pack gate is OFF — that is how Option 1 (manufacturer-only) is enforced.
 */
export function templatePublishGraphInputs(args: {
  appliedMethods: string[]
  manufacturer: Applier
  coPacker: Applier | null
  externalPrint: boolean
}): Array<ApplicationGraphInput & { componentId: string }> {
  if (!args.externalPrint) return []
  return args.appliedMethods.map((method) => ({
    componentId: method,
    decorationMethod: method,
    manufacturer: args.manufacturer,
    coPacker: args.coPacker,
    fc: null, // no FC at publish — FC relabel is an order-time escape
    externalPrint: true,
  }))
}

export interface TemplateGraphResult extends GraphCompletenessResult {
  /** false = nothing to gate (no manufacturer / IN_HOUSE / no applied decoration). */
  applicable: boolean
}

const NOT_APPLICABLE: TemplateGraphResult = {
  applicable: false,
  complete: true,
  problems: [],
  applicationPoints: [],
}

/**
 * Load a template's publish graph and validate it. Reads the admin gate
 * `graph:publish_allow_copack_application`. The caller decides whether to BLOCK
 * (that is `graph:enforce_publish_gate`, checked at the publish action) — this
 * only computes completeness. Never throws.
 */
export async function validateTemplateGraph(templateId: string): Promise<TemplateGraphResult> {
  try {
    const gates = await getLogisticsSettings()
    const allowCoPack = gates['graph:publish_allow_copack_application'] === true

    const template = await prisma.productTemplate.findUnique({
      where: { id: templateId },
      select: {
        manufacturerServiceId: true,
        packagingSystems: {
          select: {
            coPackerServiceId: true,
            packagingSystem: { select: { packagingTypeId: true } },
          },
        },
      },
    })
    if (!template?.manufacturerServiceId) return NOT_APPLICABLE

    const manufacturer = await prisma.partnerService.findUnique({
      where: { id: template.manufacturerServiceId },
      select: { appliesLabels: true, labelingMode: true },
    })
    if (!manufacturer) return NOT_APPLICABLE

    // IN_HOUSE self-labels (prints AND applies its own decoration) — no external
    // application step, so no honey problem to gate. Mirrors computeTemplatePrintCoverage.
    if (effectivePrintSourcing(null, manufacturer) === 'IN_HOUSE') return NOT_APPLICABLE

    const packagingTypeIds = [
      ...new Set(
        template.packagingSystems
          .map((p) => p.packagingSystem.packagingTypeId)
          .filter((x): x is string => !!x),
      ),
    ]
    if (packagingTypeIds.length === 0) return NOT_APPLICABLE

    // The APPLIED decoration methods the manufacturer authored dielines for on
    // these packaging types — the only ones that need a post-production applier.
    const dielines = await prisma.packagingDieline.findMany({
      where: {
        partnerServiceId: template.manufacturerServiceId,
        packagingTypeId: { in: packagingTypeIds },
        decorationMethod: { in: [...APPLIED_DECORATIONS] as never[] },
      },
      select: { decorationMethod: true },
    })
    const appliedMethods = [...new Set(dielines.map((d) => String(d.decorationMethod)))]
    if (appliedMethods.length === 0) return NOT_APPLICABLE

    // Co-pack node: any packaging config with a co-packer that appliesLabels.
    // Gated — null when the admin turned Option 2 off (manufacturer-only).
    let coPacker: Applier | null = null
    if (allowCoPack) {
      const coPackerIds = [
        ...new Set(
          template.packagingSystems
            .map((p) => p.coPackerServiceId)
            .filter((x): x is string => !!x),
        ),
      ]
      if (coPackerIds.length > 0) {
        const svc = await prisma.partnerService.findFirst({
          where: { id: { in: coPackerIds }, appliesLabels: true },
          select: { id: true },
        })
        if (svc) coPacker = { serviceId: svc.id, appliesLabels: true }
      }
    }

    const inputs = templatePublishGraphInputs({
      appliedMethods,
      manufacturer: { serviceId: template.manufacturerServiceId, appliesLabels: manufacturer.appliesLabels },
      coPacker,
      externalPrint: true,
    })
    const result = validateGraphCompleteness({ decoratedComponents: inputs })
    return { applicable: inputs.length > 0, ...result }
  } catch {
    return NOT_APPLICABLE
  }
}
