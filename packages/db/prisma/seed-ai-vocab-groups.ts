// Starter creative-vocabulary groups (AI_PACKAGING_GENERATOR §14, Phase 2).
//
// Seeds a few reusable AiVocabGroup rows so the admin "Vocabulary groups" card
// isn't empty on first load. Groups are seeded UNASSIGNED to any domain (no
// AiDomainVocabGroup rows) — they change nothing for creators until an admin
// assigns them in AI Generator → Per-domain creative vocabulary. Purely creative;
// never touches compliance.
//
// Idempotent: keyed on the (non-unique) label via findFirst → create-if-absent, so
// re-seeding never duplicates and never clobbers admin edits to an existing group.
//
// Run standalone:
//   cd packages/db && pnpm exec dotenv -e ../../.env.local -- tsx prisma/seed-ai-vocab-groups.ts
// Or as part of the full seed (registered in seed.ts).

import { PrismaClient } from '@prisma/client'
import { fileURLToPath } from 'node:url'

interface StarterGroup {
  label: string
  styles: string[]
  colors: string[]
  elements: string[]
}

// A small, cross-domain starter set. Reusable across Food / Supplement / Cosmetic /
// Pet — the admin decides which domains each one feeds.
const STARTER_GROUPS: StarterGroup[] = [
  {
    label: 'Premium / Luxury',
    styles: ['Premium', 'Luxury', 'Elegant', 'Minimal', 'Modern'],
    colors: ['Metallic', 'Monochrome', 'Muted', 'Jewel Tones'],
    elements: ['Line Art', 'Abstract Shapes', 'Geometric'],
  },
  {
    label: 'Playful / Kids',
    styles: ['Playful', 'Bold', 'Hand-drawn', 'Friendly'],
    colors: ['Vibrant', 'Pastel', 'Warm Tones'],
    elements: ['Doodles', 'Patterns', 'Characters'],
  },
  {
    label: 'Botanical / Natural',
    styles: ['Natural', 'Organic', 'Hand-drawn', 'Warm'],
    colors: ['Earthy', 'Muted', 'Pastel'],
    elements: ['Botanicals', 'Leaves', 'Florals', 'Textures'],
  },
]

export async function seedAiVocabGroups(prisma: PrismaClient): Promise<void> {
  let created = 0
  for (let i = 0; i < STARTER_GROUPS.length; i++) {
    const g = STARTER_GROUPS[i]!
    const existing = await prisma.aiVocabGroup.findFirst({ where: { label: g.label } })
    if (existing) continue
    await prisma.aiVocabGroup.create({
      data: {
        label: g.label,
        styles: g.styles,
        colors: g.colors,
        elements: g.elements,
        sortOrder: i,
        active: true,
      },
    })
    created++
  }
  console.log(`✅ AiVocabGroups: ${created} starter group(s) created (${STARTER_GROUPS.length} total, unassigned to domains).`)
}

// Standalone entry — only runs when this file is invoked directly, not on import.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const prisma = new PrismaClient()
  seedAiVocabGroups(prisma)
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
    .finally(() => void prisma.$disconnect())
}
