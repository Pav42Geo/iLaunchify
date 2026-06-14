// Cosmetic INCI declaration (21 CFR 701.3). The pure ordering logic now lives in
// @ilaunchify/nutrition (domain-labels.ts) so the partner preview and the creator
// label download share one implementation — labels are legal artifacts and must
// not diverge. This file is a re-export shim; existing imports keep working.

export { toInciDeclaration, type CosmeticIngredient, type InciDeclaration } from '@ilaunchify/nutrition'
