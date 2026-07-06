// resolveApplicationPoint — "the honey problem" engine
// (docs/PRINT_PROVIDER_SELECTION.md §8.2). For every decorated component the
// application point is the first graph node downstream of decoration that
// (a) physically holds the unlabeled goods and (b) declares application
// capability. Label legs ALWAYS address the application point — the creator's
// ship-to pick changes the FINISHED-GOODS destination only (the invariant that
// kills the honey scenario by construction).
//
// UNRESOLVED = the graph cannot terminate in a finished product. Hard-block at
// product publish AND checkout pre-flight; NEVER silently proceed. Pure module.

export interface ApplicationGraphInput {
  /** Does the decoration need application at all? DIRECT_PRINT et al are
   *  printed upstream ON the substrate — no separate application step. */
  decorationMethod: string
  manufacturer: {
    serviceId: string
    /** PartnerService.appliesLabels — can they stick labels at fill? */
    appliesLabels: boolean
  }
  /** Present only when the workflow graph has a co-pack leg. */
  coPacker?: {
    serviceId: string
    appliesLabels: boolean
  } | null
  /** Present only when the order ships to an FC (WAREHOUSE_PARTNER ship-to). */
  fc?: {
    serviceId: string
    /** ACTIVE FcValueAddedService RELABEL row's labelMethods (§8.1a). */
    relabelMethods: string[]
  } | null
  /** True when a separate print partner produces the decoration (vs self-label
   *  — a self-labeling manufacturer applies what they print, by definition). */
  externalPrint: boolean
}

/** Decoration methods applied POST-PRODUCTION to filled/finished goods. */
export const APPLIED_DECORATIONS = new Set([
  'PRESSURE_SENSITIVE_LABEL',
  'SHRINK_SLEEVE',
  'HEAT_TRANSFER',
])

export type ApplicationPointResult =
  | {
      ok: true
      /** null = no application step needed (printed-in decoration or self-label). */
      node: { kind: 'MANUFACTURER' | 'COPACKER' | 'FC'; serviceId: string } | null
    }
  | { ok: false; reason: 'UNRESOLVED' }

export function resolveApplicationPoint(graph: ApplicationGraphInput): ApplicationPointResult {
  // No separate application step: decoration is printed into/onto the substrate
  // upstream (direct print, in-mold label…) — the producing node ships finished.
  if (!APPLIED_DECORATIONS.has(graph.decorationMethod)) return { ok: true, node: null }

  // Self-label: the manufacturer prints AND applies — one node, no label leg.
  if (!graph.externalPrint) return { ok: true, node: null }

  // 1 — manufacturer applies at fill (the common case; fewest hops, goods in hand).
  if (graph.manufacturer.appliesLabels) {
    return { ok: true, node: { kind: 'MANUFACTURER', serviceId: graph.manufacturer.serviceId } }
  }

  // 2 — a co-pack node in the graph (application is their core trade).
  if (graph.coPacker?.appliesLabels) {
    return { ok: true, node: { kind: 'COPACKER', serviceId: graph.coPacker.serviceId } }
  }

  // 3 — an FC with a VERIFIED RELABEL capability covering THIS method (§8.1a).
  // Labels never route to an FC "because it's the destination" — only because
  // the FC declared (and admin verified) it can do the job.
  if (graph.fc && graph.fc.relabelMethods.includes(graph.decorationMethod)) {
    return { ok: true, node: { kind: 'FC', serviceId: graph.fc.serviceId } }
  }

  return { ok: false, reason: 'UNRESOLVED' }
}

// ---------------------------------------------------------------------------
// Graph completeness (§8.2.4 / §8.4) — the publish + checkout pre-flight
// ---------------------------------------------------------------------------

export interface GraphCompletenessInput {
  /** One entry per decorated component on the order/product. */
  decoratedComponents: Array<ApplicationGraphInput & { componentId: string }>
  /** Variety/multipack: CARTON/SHIPPER components need an assembly point. */
  assembly?: {
    hasCartonComponents: boolean
    manufacturerSelfAssembles: boolean
    hasAssembler: boolean
  }
}

export type GraphIncompleteness =
  | { kind: 'APPLICATION_UNRESOLVED'; componentId: string }
  | { kind: 'ASSEMBLY_UNRESOLVED' }

export interface GraphCompletenessResult {
  complete: boolean
  problems: GraphIncompleteness[]
  /** Resolved application points per component (for dispatch-planner shipTo). */
  applicationPoints: Array<{
    componentId: string
    node: { kind: 'MANUFACTURER' | 'COPACKER' | 'FC'; serviceId: string } | null
  }>
}

/**
 * Every order must terminate in a FINISHED product: every applied decoration
 * has an application point, every carton set has an assembler. Run at product
 * PUBLISH (a no-apply manufacturer can't list a PSL product without a co-pack
 * route) and again at CHECKOUT (belt + suspenders; catches capability changes
 * between publish and order, and the FC pick's interaction with the graph).
 */
export function validateGraphCompleteness(input: GraphCompletenessInput): GraphCompletenessResult {
  const problems: GraphIncompleteness[] = []
  const applicationPoints: GraphCompletenessResult['applicationPoints'] = []

  for (const component of input.decoratedComponents) {
    const resolved = resolveApplicationPoint(component)
    if (!resolved.ok) {
      problems.push({ kind: 'APPLICATION_UNRESOLVED', componentId: component.componentId })
      applicationPoints.push({ componentId: component.componentId, node: null })
    } else {
      applicationPoints.push({ componentId: component.componentId, node: resolved.node })
    }
  }

  if (
    input.assembly?.hasCartonComponents &&
    !input.assembly.manufacturerSelfAssembles &&
    !input.assembly.hasAssembler
  ) {
    problems.push({ kind: 'ASSEMBLY_UNRESOLVED' })
  }

  return { complete: problems.length === 0, problems, applicationPoints }
}
