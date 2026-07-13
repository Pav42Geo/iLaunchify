// LABEL build-object payload for a creator-self-designed label
// (CO_CREATION_MARKETPLACE_SPEC §7 — Design Studio bridge).
//
// THE SEAM. Three parties build to this contract:
//   • Studio producer (Code)  — composes the normalized label-proof SVG (see
//     @ilaunchify/ui composeLabelProofSvg), uploads it under labelProofKey()
//     (@ilaunchify/storage), and writes this payload via submitObjectVersion.
//   • Room PayloadSchema (Cowork, apps/*/rooms/[roomId]/actions.ts) — validates
//     the LABEL branch as `recipeLabelSchema.or(labelProofPayloadSchema)`.
//   • LABEL viewer (Cowork, CoCreationRoomShell) — renders proof by fetching
//     `svgKey`, sized from `widthMm`/`heightMm`.
//
// The platform artifact is the composited NORMALIZED SVG (mm units): maker's
// immutable dieline substrate + deterministic regulated panels + the creator's
// brand layer. The partner's original artwork stays immutable; this proof is a
// NEW artifact. Keep this schema additive.

import { z } from 'zod'

/** Discriminator on a LABEL BuildObjectVersion payload: creator self-design vs. a recipe-derived label blob. */
export const LABEL_PROOF_KIND = 'SELF_DESIGN' as const

export const labelProofPayloadSchema = z
  .object({
    /** Marks this LABEL payload as a self-designed proof (vs. the recipe/label-math shape). */
    proofKind: z.literal(LABEL_PROOF_KIND),
    /** R2 storage key of the composited normalized label-proof SVG (mm units), from labelProofKey(). */
    svgKey: z.string().min(1),
    /** The maker's PackagingDieline this proof was designed on — provenance + the substrate source. */
    dielineId: z.string().min(1),
    /** Full canvas width incl. bleed, in mm — lets the viewer size the proof without fetching first. */
    widthMm: z.number().positive(),
    /** Full canvas height incl. bleed, in mm. */
    heightMm: z.number().positive(),
    /** Studio design provenance — traceability back to the editable source (Design row). */
    designId: z.string().optional(),
    /** Design version that produced this proof. */
    designVersion: z.number().int().positive().optional(),
    /** SHA-256 of the composited SVG bytes — integrity + dedup across resubmits. */
    sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/i, 'sha256 must be 64 hex chars')
      .optional(),
    /**
     * Regulated frame kinds auto-composed as deterministic vector (audit trail).
     * The creator NEVER edits these — they are platform-generated (FrameScope
     * RECIPE/IDENTITY/MATERIAL/PRODUCT + the locked nutrition-panel groups).
     */
    regulatedFrames: z.array(z.string()).default([]),
    /** Optional free-text note the creator attaches on submit. */
    note: z.string().max(2000).optional(),
  })
  .strict()

export type LabelProofPayload = z.infer<typeof labelProofPayloadSchema>

/** Type guard — is this LABEL version payload a creator self-design proof? */
export function isLabelProofPayload(payload: unknown): payload is LabelProofPayload {
  return labelProofPayloadSchema.safeParse(payload).success
}
