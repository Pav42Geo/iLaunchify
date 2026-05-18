// Compliance types — mirror the JSON contract returned by services/compliance.
// Keep in sync with services/compliance/app/schemas.py.

import { z } from 'zod'

export type ComplianceOutcome = 'PASSED' | 'PASSED_WITH_WARNINGS' | 'FAILED'
export type ViolationSeverity = 'BLOCKING' | 'WARNING'

export const ViolationSchema = z.object({
  severity: z.enum(['BLOCKING', 'WARNING']),
  ruleId: z.string(),
  cfrCitation: z.string().optional(),
  message: z.string(),
  field: z.string().optional(),
  suggestedFix: z.string().optional(),
})
export type Violation = z.infer<typeof ViolationSchema>

export const DisclosureSchema = z.object({
  id: z.string(),
  text: z.string(),
  placement: z.string(),
  required: z.boolean(),
})
export type Disclosure = z.infer<typeof DisclosureSchema>

export const NutrientRowSchema = z.object({
  id: z.string(),
  label: z.string(),
  amount: z.union([z.number(), z.string()]),       // string allows "less than 1 g" form
  unit: z.string().optional(),
  percentDailyValue: z.number().optional(),
  indent: z.number().int().min(0).max(2).default(0),
})
export type NutrientRow = z.infer<typeof NutrientRowSchema>

export const PanelDataSchema = z.object({
  format: z.enum(['STANDARD', 'SUPPLEMENT_FACTS', 'TABULAR', 'LINEAR']),
  rows: z.array(NutrientRowSchema),
  servingSize: z.string(),
  servingsPerContainer: z.string(),
  requiredFooter: z.string(),
  requiredWarnings: z.array(z.string()),
})
export type PanelData = z.infer<typeof PanelDataSchema>

export const ComplianceResultSchema = z.object({
  passed: z.boolean(),
  outcome: z.enum(['PASSED', 'PASSED_WITH_WARNINGS', 'FAILED']),
  violations: z.array(ViolationSchema),
  warnings: z.array(ViolationSchema),
  disclosures: z.array(DisclosureSchema),
  panelData: PanelDataSchema,
  auditRef: z.string(),
  rulePackVersion: z.string(),
  evaluatedAt: z.string(),
})
export type ComplianceResult = z.infer<typeof ComplianceResultSchema>
