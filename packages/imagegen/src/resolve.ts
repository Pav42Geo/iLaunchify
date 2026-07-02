// =============================================================================
// Provider resolution (AI_PACKAGING_GENERATOR §5/§13).
//
// Composes a single ImageGenProvider from env: fal for raster + upscale, Recraft
// for vector type. Any capability without a key falls back to the deterministic
// stub, so the pipeline ALWAYS runs — keyless in dev/demos, real in prod as keys
// land. Keys are read from the passed env record (Integrations registry), never
// hard-coded or stored in the DB.
// =============================================================================

import type { ImageGenProvider, PanelGenRequest, VectorTypeRequest, UpscaleRequest, OutpaintRequest, ImageRef } from './provider'
import { PROVIDER_ENV } from './provider'
import { createStubProvider } from './adapters/stub'
import { createFalProvider, type FalConfig } from './adapters/fal'
import { createRecraftProvider, type RecraftConfig } from './adapters/recraft'

export interface ResolveOptions {
  /** Test injection for both adapters. */
  fetchImpl?: typeof fetch
  /** Force the stub even if keys are present (dev/preview). */
  forceStub?: boolean
  fal?: Partial<FalConfig>
  recraft?: Partial<RecraftConfig>
}

export interface ResolvedProvider extends ImageGenProvider {
  /** True when every capability is served by real providers (no stub fallback). */
  fullyReal: boolean
  /** Per-capability backing id, for logging/telemetry. */
  backing: { raster: string; vectorType: string; upscale: string }
}

/**
 * Build the composed provider. Raster/upscale ← fal (or stub); vector ← Recraft (or
 * stub). Reads `env[FAL_KEY]` / `env[RECRAFT_API_KEY]`.
 */
export function resolveImageGenProvider(env: Record<string, string | undefined>, opts: ResolveOptions = {}): ResolvedProvider {
  const stub = createStubProvider()
  const falKey = opts.forceStub ? undefined : env[PROVIDER_ENV.raster]
  const recraftKey = opts.forceStub ? undefined : env[PROVIDER_ENV.vectorType]

  const fal = falKey ? createFalProvider({ apiKey: falKey, fetchImpl: opts.fetchImpl, ...opts.fal }) : null
  const recraft = recraftKey ? createRecraftProvider({ apiKey: recraftKey, fetchImpl: opts.fetchImpl, ...opts.recraft }) : null

  const rasterId = fal?.id ?? stub.id
  const vectorId = recraft?.id ?? stub.id
  const upscaleId = fal?.upscale ? fal.id : stub.id

  return {
    id: `resolved(${rasterId}+${vectorId})`,
    fullyReal: !!fal && !!recraft,
    backing: { raster: rasterId, vectorType: vectorId, upscale: upscaleId },
    async generatePanels(req: PanelGenRequest): Promise<ImageRef[]> {
      return (fal ?? stub).generatePanels(req)
    },
    async generateVectorType(req: VectorTypeRequest): Promise<ImageRef> {
      const p = recraft ?? stub
      return p.generateVectorType!(req)
    },
    async upscale(req: UpscaleRequest): Promise<ImageRef> {
      const p = fal?.upscale ? fal : stub
      return p.upscale!(req)
    },
    async outpaint(req: OutpaintRequest): Promise<ImageRef[]> {
      const p = fal?.outpaint ? fal : stub
      return p.outpaint!(req)
    },
  }
}
