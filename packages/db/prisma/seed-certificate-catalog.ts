// C1 — master cert catalog importer.
//
// Reads docs/builds/_certificates-master-catalog.json (THE source of truth — never
// re-derive it) and upserts each cert type with its applicability metadata.
// Idempotent. Two-pass: pass 1 upserts every cert by slug; pass 2 resolves each
// `alternativeOf` slug → the target's id (so the FK exists before linking).
//
// On UPDATE we deliberately do NOT touch description / verificationNotes — those
// may carry curated copy from seed-certificate-types. On CREATE we derive a
// description (the catalog has none) so the NOT NULL column is satisfied.

import type { PrismaClient, CertScope } from '@prisma/client'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

interface CatalogCert {
  slug: string
  name: string
  issuingBody?: string | null
  applicableLabelingTypes?: string[]
  applicableCategorySlugs?: string[]
  applicableMarketSlugs?: string[]
  scope?: string | null
  claimCategories?: string[]
  alternativeOf?: string | null
  issuingBodyUrl?: string | null
  applicabilityNotes?: string | null
}

export async function seedCertificateCatalog(prisma: PrismaClient): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url))
  const catalogPath = join(here, '../../../docs/builds/_certificates-master-catalog.json')
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as { certs?: CatalogCert[] }
  const certs = catalog.certs ?? []

  let created = 0
  let updated = 0

  // ---- Pass 1: upsert metadata by slug (alternativeOfId resolved in pass 2). ----
  for (const c of certs) {
    const metadata = {
      name: c.name,
      issuingBodyUrl: c.issuingBodyUrl ?? null,
      applicabilityNotes: c.applicabilityNotes ?? null,
      scope: (c.scope ?? null) as CertScope | null,
      applicableLabelingTypes: c.applicableLabelingTypes ?? [],
      applicableCategorySlugs: c.applicableCategorySlugs ?? [],
      applicableMarketSlugs: c.applicableMarketSlugs ?? [],
      claimCategories: c.claimCategories ?? [],
    }

    const existing = await prisma.certificateType.findUnique({
      where: { slug: c.slug },
      select: { id: true },
    })

    if (existing) {
      await prisma.certificateType.update({ where: { slug: c.slug }, data: metadata })
      updated++
    } else {
      await prisma.certificateType.create({
        data: {
          slug: c.slug,
          ...metadata,
          status: 'ACTIVE',
          // Catalog has no `description`; derive one for the NOT NULL column.
          description:
            c.applicabilityNotes ??
            (c.issuingBody ? `${c.name} — issued by ${c.issuingBody}.` : c.name),
          verificationNotes: c.applicabilityNotes ?? null,
        },
      })
      created++
    }
  }

  // ---- Pass 2: link alternativeOf (slug → id). ----
  const all = await prisma.certificateType.findMany({ select: { id: true, slug: true } })
  const idBySlug = new Map(all.map((r) => [r.slug, r.id]))
  let linked = 0
  for (const c of certs) {
    if (!c.alternativeOf) continue
    const targetId = idBySlug.get(c.alternativeOf)
    if (!targetId) continue
    await prisma.certificateType.update({
      where: { slug: c.slug },
      data: { alternativeOfId: targetId },
    })
    linked++
  }

  console.log(
    `✅ Certificate catalog: ${created} created + ${updated} updated (${certs.length} in catalog) · ${linked} alternative-of links`,
  )
}
