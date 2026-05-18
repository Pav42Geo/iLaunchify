// Discriminated capability schemas per PartnerService.type.
// PartnerService.capabilities is `Json` in the schema; this is the validator.

import { z } from 'zod'

export const ManufacturingCapabilitiesSchema = z.object({
  type: z.literal('MANUFACTURING'),
  categories: z.array(z.enum(['FOOD', 'BEVERAGE_FUNCTIONAL', 'SUPPLEMENT'])),
  moqMin: z.number().int().positive(),
  moqMax: z.number().int().positive(),
  leadTimeStockDays: z.number().int().positive(),
  leadTimeCustomDays: z.number().int().positive(),
  certifications: z.array(z.string()),                  // ["FDA", "GMP", "USDA_ORGANIC", "KOSHER", "HALAL", "VEGAN"]
  containerFormats: z.array(z.string()),                // ["bottle", "tub", "pouch", "sachet"]
  fillTypes: z.array(z.string()),                       // ["powder", "liquid", "capsule", "tablet", "softgel"]
})
export type ManufacturingCapabilities = z.infer<typeof ManufacturingCapabilitiesSchema>

export const CopackingCapabilitiesSchema = z.object({
  type: z.literal('COPACKING'),
  containerFormats: z.array(z.string()),
  fillTypes: z.array(z.string()),
  moqMin: z.number().int().positive(),
  moqMax: z.number().int().positive(),
  leadTimeDays: z.number().int().positive(),
  certifications: z.array(z.string()),
})
export type CopackingCapabilities = z.infer<typeof CopackingCapabilitiesSchema>

export const LabelPrintingCapabilitiesSchema = z.object({
  type: z.literal('LABEL_PRINTING'),
  preferredFormats: z.array(z.enum(['PDF_X1A', 'PDF_X4'])),
  iccProfileAssetId: z.string().optional(),             // CMYK ICC profile reference
  bleedMm: z.number().default(3.0),
  trimMarks: z.boolean().default(true),
  registrationMarks: z.boolean().default(false),
  totalInkLimitPct: z.number().int().default(300),
  supportedMaterials: z.array(z.string()),              // ["paper", "vinyl", "polypropylene"]
  moqMin: z.number().int().positive(),
  leadTimeDays: z.number().int().positive(),
})
export type LabelPrintingCapabilities = z.infer<typeof LabelPrintingCapabilitiesSchema>

export const ServiceCapabilitiesSchema = z.discriminatedUnion('type', [
  ManufacturingCapabilitiesSchema,
  CopackingCapabilitiesSchema,
  LabelPrintingCapabilitiesSchema,
])
export type ServiceCapabilities = z.infer<typeof ServiceCapabilitiesSchema>
