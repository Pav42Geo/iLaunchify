/**
 * @ilaunchify/packaging-3d — publish-readiness engine (G7.3 gate).
 *
 * Composes the channel export + compliance modules into the single decision the
 * publish flow asks: given the creator's selected mockups and their connected
 * channels, for EACH channel — which render is the main image, does every selected
 * render pass compliance, and what blocks publish? Pure; the app calls this before
 * kicking the ChannelProductLink FSM (@ilaunchify/channels publish-fsm).
 */

import { pickPrimaryRender, type ExportChannel } from './channel-export'
import { validateForChannel, type MockupImageFacts, type ComplianceResult } from './channel-compliance'

/** One selected mockup with its measured facts. `facts.isMain` is ignored here —
 *  the engine sets it per channel from the chosen primary. */
export interface SelectedRender {
  id: string
  facts: MockupImageFacts
}

export interface RenderReadiness {
  id: string
  isPrimary: boolean
  result: ComplianceResult
}

export interface ChannelPublishReadiness {
  channel: ExportChannel
  primaryRenderId: string | null
  ready: boolean
  renders: RenderReadiness[]
  /** ERROR-level, human-readable — what must be fixed before publishing to this channel. */
  blockers: string[]
}

export interface PublishReadinessReport {
  channels: ChannelPublishReadiness[]
  overallReady: boolean
}

/**
 * Evaluate publish readiness across channels. A channel is ready when it has an
 * eligible main image AND no selected render has an ERROR-level compliance issue
 * (WARN-level issues are auto-fixable by the normalization plan, so they don't block).
 * Deterministic; no I/O.
 */
export function evaluatePublishReadiness(channels: ExportChannel[], renders: SelectedRender[]): PublishReadinessReport {
  const out: ChannelPublishReadiness[] = channels.map((channel) => {
    const candidates = renders.map((r) => ({ id: r.id, kind: r.facts.kind }))
    const primaryRenderId = pickPrimaryRender(channel, candidates)
    const blockers: string[] = []

    if (primaryRenderId === null) {
      blockers.push(`${channel}: no eligible main image — add a clean studio render (STANDARD_RENDER).`)
    }

    const renderReadiness: RenderReadiness[] = renders.map((r) => {
      const isPrimary = r.id === primaryRenderId
      const result = validateForChannel(channel, { ...r.facts, isMain: isPrimary })
      for (const issue of result.issues) {
        if (issue.level === 'ERROR') blockers.push(`${channel}/${r.id}: ${issue.message}`)
      }
      return { id: r.id, isPrimary, result }
    })

    return {
      channel,
      primaryRenderId,
      ready: primaryRenderId !== null && blockers.length === 0,
      renders: renderReadiness,
      blockers,
    }
  })

  return { channels: out, overallReady: out.length > 0 && out.every((c) => c.ready) }
}
