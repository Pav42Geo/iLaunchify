// Pet labeling (AAFCO Model Regulations). The pure ordering/format/adequacy logic
// now lives in @ilaunchify/nutrition (domain-labels.ts) so the partner preview and
// the creator label download share one implementation — labels are legal artifacts
// and must not diverge. This file is a re-export shim; existing imports keep working.

export {
  petIngredientOrder,
  formatGuaranteedAnalysis,
  adequacyStatement,
  type PetIngredient,
  type GuaranteedAnalysis,
  type PetSpecies,
  type AdequacyMethod,
  type LifeStage,
} from '@ilaunchify/nutrition'
