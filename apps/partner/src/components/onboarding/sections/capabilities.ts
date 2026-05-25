// Pure, server-and-client-safe helpers for Section 3 (What you can do).
//
// These can't live in WhatYouCanDoSection.tsx because that file is marked
// 'use client' — Next.js then forbids server components from invoking any
// of its exports as plain functions. The server page imports
// `capsFromJson` to hydrate initial state, so it has to live in its own
// non-client module.

import type { ServiceType } from '@prisma/client'

// ----- Per-type capability shapes (loose; admin enforces strictness) -----

export type ManufacturingCaps = {
  productTypes: string // comma-separated for V1; ingredient picker is V1.5+
  productionSpecs: string // 'hot_fill, HPP, pasteurization'
  moqUnitsTypical: string // string for input; coerced to int on save
  leadTimeDaysMin: string
  leadTimeDaysMax: string
}

export type CopackingCaps = {
  packagingFormats: string // '12oz_slim_can, 16oz_pet_bottle'
  moqUnitsTypical: string
  leadTimeDaysMin: string
  leadTimeDaysMax: string
}

export type LabelPrintingCaps = {
  substrates: string // 'paper, BOPP, vinyl'
  colorModes: string // 'CMYK, CMYK+W, Pantone'
  dieCuts: string // 'standard rectangle, oval, custom'
  leadTimeDaysMin: string
  leadTimeDaysMax: string
}

export type WarehouseCaps = {
  storageType: string // 'ambient, refrigerated, frozen'
  palletCapacity: string
  pickPackFeeCents: string
}

export type CapsByType = {
  MANUFACTURING?: ManufacturingCaps
  COPACKING?: CopackingCaps
  LABEL_PRINTING?: LabelPrintingCaps
  WAREHOUSE?: WarehouseCaps
}

// -----------------------------------------------------------------------------
// Hydration helper — converts stored JSON shape back to string-form for inputs.
// -----------------------------------------------------------------------------

export function capsFromJson(services: Array<{ type: ServiceType; capabilities: unknown }>): CapsByType {
  const out: CapsByType = {}
  for (const s of services) {
    const c = (s.capabilities ?? {}) as Record<string, unknown>
    switch (s.type) {
      case 'MANUFACTURING':
        out.MANUFACTURING = {
          productTypes: arrToStr(c.productTypes),
          productionSpecs: arrToStr(c.productionSpecs),
          moqUnitsTypical: numToStr(c.moqUnitsTypical),
          leadTimeDaysMin: numToStr(c.leadTimeDaysMin),
          leadTimeDaysMax: numToStr(c.leadTimeDaysMax),
        }
        break
      case 'COPACKING':
        out.COPACKING = {
          packagingFormats: arrToStr(c.packagingFormats),
          moqUnitsTypical: numToStr(c.moqUnitsTypical),
          leadTimeDaysMin: numToStr(c.leadTimeDaysMin),
          leadTimeDaysMax: numToStr(c.leadTimeDaysMax),
        }
        break
      case 'LABEL_PRINTING':
        out.LABEL_PRINTING = {
          substrates: arrToStr(c.substrates),
          colorModes: arrToStr(c.colorModes),
          dieCuts: arrToStr(c.dieCuts),
          leadTimeDaysMin: numToStr(c.leadTimeDaysMin),
          leadTimeDaysMax: numToStr(c.leadTimeDaysMax),
        }
        break
      case 'WAREHOUSE':
        out.WAREHOUSE = {
          storageType: arrToStr(c.storageType),
          palletCapacity: numToStr(c.palletCapacity),
          pickPackFeeCents: numToStr(c.pickPackFeeCents),
        }
        break
    }
  }
  return out
}

function arrToStr(v: unknown): string {
  return Array.isArray(v) ? v.join(', ') : ''
}
function numToStr(v: unknown): string {
  return typeof v === 'number' && Number.isFinite(v) ? String(v) : ''
}
