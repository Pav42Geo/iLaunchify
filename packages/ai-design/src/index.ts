// @ilaunchify/ai-design — pure engines for the AI Packaging Generator (P0).
// docs/AI_PACKAGING_GENERATOR.md. No model / DB / DOM — deterministic + testable.

export {
  assemblePrompt,
  type PromptInput,
  type AssembledPrompt,
} from './prompt'

export {
  requiredElements,
  evaluateCompliance,
  type LabelingDomain,
  type MarketCode,
  type LabelElementKind,
  type Requirement,
  type SatisfiedBy,
  type MandatoryElement,
  type ComplianceReport,
} from './mandatory'
