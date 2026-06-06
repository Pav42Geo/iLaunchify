// Plain (non-"use server") constants for the mandatory-phrase catalog.
//
// These MUST NOT live in actions.ts: that file is a "use server" module, and
// Next.js only exposes async functions from such modules to the client — any
// non-function export arrives as `undefined` in a client component (PhraseForm),
// which is why PHRASE_REQUIREMENTS.map threw. Both PhraseForm (client) and
// actions.ts (server) import these from here.

import type { MandatoryPhraseCategory, PhraseRequirement } from '@ilaunchify/db'

export const PHRASE_CATEGORIES: MandatoryPhraseCategory[] = [
  'ALLERGEN',
  'DISCLAIMER',
  'WARNING',
  'IDENTITY',
  'DIRECTIONS',
  'CLAIM',
  'SUSTAINABILITY',
  'MARKETING',
  'OTHER',
]

export const PHRASE_REQUIREMENTS: PhraseRequirement[] = ['MANDATORY', 'RECOMMENDED']

export const PHRASE_LABELING_TYPES = [
  'FOOD',
  'DIETARY_SUPPLEMENT',
  'OTC',
  'PET_PRODUCT',
  'BEVERAGE',
  'COSMETIC',
] as const
