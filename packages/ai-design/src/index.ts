// @ilaunchify/ai-design — pure engines for the AI Packaging Generator (P0).
// docs/AI_PACKAGING_GENERATOR.md. No model / DB / DOM — deterministic + testable.

export {
  assemblePrompt,
  type PromptInput,
  type AssembledPrompt,
} from './prompt'

export {
  domainPreset,
  resolveDomainOptions,
  resolveDomainVocabulary,
  recommendedPackageTypes,
  type DomainPreset,
  type VocabGroup,
} from './domainPreset'

export {
  requiredElements,
  evaluateCompliance,
  evaluateCompliancePackage,
  elementKindsForFrame,
  satisfiedElementsFromFrames,
  type LabelingDomain,
  type MarketCode,
  type LabelElementKind,
  type Requirement,
  type SatisfiedBy,
  type MandatoryElement,
  type ComplianceReport,
} from './mandatory'

export {
  planFlavorSeries,
  type FlavorSpec,
  type FlavorDerivative,
  type FlavorSeriesPlan,
} from './flavorSeries'
