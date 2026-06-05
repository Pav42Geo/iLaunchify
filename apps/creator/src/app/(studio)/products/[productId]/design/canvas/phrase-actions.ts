'use server'

// Track C — mandatory-phrase catalog for the Studio Phrases drawer.
//
// Replaces the Studio's hardcoded phrase chips with the admin-managed
// MandatoryPhrase catalog, filtered to the product's labeling type. The creator
// drops a phrase onto the canvas as editable text (the bracketed placeholders
// are theirs to fill — net weight, allergen list, etc.).

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'

export interface StudioPhrase {
  id: string
  title: string
  body: string
  category: string
  cfrCitation: string | null
  appliesWhen: string | null
}

export async function listMandatoryPhrases(labelingType: string): Promise<StudioPhrase[]> {
  await requireUser()
  return prisma.mandatoryPhrase.findMany({
    where: { isActive: true, labelingTypes: { has: labelingType } },
    orderBy: [{ category: 'asc' }, { displayOrder: 'asc' }],
    select: {
      id: true,
      title: true,
      body: true,
      category: true,
      cfrCitation: true,
      appliesWhen: true,
    },
  })
}
