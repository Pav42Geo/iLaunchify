// =============================================================================
// @ilaunchify/marketplace — Layer 1 (Niche) auto-suggestion engine.
// =============================================================================
//
// Slice 3A — evaluates a ProductTemplate against every active NicheRule and
// returns the niches the deterministic engine would suggest. Used by:
//   • Partner Product Builder NichesAndTagsCard (Slice 3B) — to surface
//     "we suggest these" chips before submit.
//   • Admin Product Review page (Slice 3C) — "Why these niches?" disclosure
//     panel so the admin can see exactly which rules matched.
//
// Rules conditions semantics:
//   • AND across rows in NicheRule.conditions
//   • OR within values[] inside each row
//
// Supported condition kinds (NicheRuleConditionKind):
//   LABELING_TYPE   — ProductTemplate.labelingType
//   CATEGORY        — Subcategory.categoryId
//   SUBCATEGORY     — ProductTemplate.subcategoryId
//   CERT_ATTACHED   — any linked ProductCertificate.instance.certificateType.slug
//   LIFESTYLE_TAG   — any ProductTemplateLifestyleTag.lifestyleTag.slug
//
// All rule evaluation happens server-side; the package is import-safe from
// either RSC or server actions.

export { suggestNiches } from './suggestNiches'
export { recordNicheAssignment } from './recordNicheAssignment'
export { suggestPhrases } from './suggestPhrases'
export { recordPhraseAssignment } from './recordPhraseAssignment'
export { PHRASE_FACT_FLAGS, PHRASE_FACT_KEYS } from './phraseFacts'
export type { PhraseFactFlag } from './phraseFacts'

export type {
  NicheSuggestion,
  SuggestNichesInput,
  SuggestNichesResult,
  NicheRuleCondition,
  NicheRuleConditionKind,
  RecordNicheAssignmentInput,
  // Phrase auto-suggestion engine
  PhraseSuggestion,
  SuggestPhrasesInput,
  SuggestPhrasesResult,
  PhraseRecipeContext,
  PhraseRuleCondition,
  PhraseRuleConditionKind,
  RecordPhraseAssignmentInput,
} from './types'
