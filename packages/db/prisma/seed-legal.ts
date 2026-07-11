// Seed the core Legal Document identities for the admin-managed Legal CMS.
// Spec: docs/LEGAL_DOCUMENT_MANAGEMENT_SPEC_2026-07-11.md (Phase L0 substrate).
//
// L0 seeds document IDENTITIES + an initial DRAFT version each (placeholder body).
// The REAL bodies are backfilled in L2 from the current sources
// (apps/marketing/src/content/legal/content.ts, membership-terms.ts, and the
// existing PartnerAgreement rows) when the public renderers are switched to
// getPublishedLegalDocument(). Nothing here is published, so no live page changes.
//
// Idempotent: upserts each document by slug; creates a v0.1-draft version only if
// the document has none yet. Never edits a published version.
// Run: pnpm --filter @ilaunchify/db seed:legal

import { createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const sha256 = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex')

type Kind = 'POLICY' | 'AGREEMENT' | 'NOTICE'
type Audience = 'PUBLIC' | 'CREATOR' | 'PARTNER' | 'ALL'

interface Seed {
  slug: string
  title: string
  kind: Kind
  audience: Audience
  requiresAcceptance: boolean
  reconsentIntervalDays?: number | null
}

// The core set. Missing docs (cookie-policy, accessibility, refund/dispute, AUP,
// sub-processors, DPA) are created here as identities so admin can author them.
const DOCS: Seed[] = [
  { slug: 'terms', title: 'Terms of Service', kind: 'POLICY', audience: 'ALL', requiresAcceptance: true },
  { slug: 'privacy', title: 'Privacy Policy', kind: 'POLICY', audience: 'ALL', requiresAcceptance: true, reconsentIntervalDays: 365 },
  { slug: 'cookie-policy', title: 'Cookie Policy', kind: 'POLICY', audience: 'PUBLIC', requiresAcceptance: false },
  { slug: 'creator-agreement', title: 'Creator Agreement', kind: 'AGREEMENT', audience: 'CREATOR', requiresAcceptance: true },
  { slug: 'partner-agreement', title: 'iLaunchify Standard Partner Agreement', kind: 'AGREEMENT', audience: 'PARTNER', requiresAcceptance: true },
  { slug: 'membership-subscription-terms', title: 'Membership & Subscription Terms', kind: 'POLICY', audience: 'CREATOR', requiresAcceptance: true },
  { slug: 'accessibility', title: 'Accessibility Statement', kind: 'NOTICE', audience: 'PUBLIC', requiresAcceptance: false },
]

const PLACEHOLDER = (title: string) =>
  `<p><strong>${title}</strong></p><p><em>Draft placeholder — content is backfilled from the ` +
  `current source in Phase L2. Not published, not live, not legally binding.</em></p>`

async function main() {
  for (const d of DOCS) {
    const doc = await prisma.legalDocument.upsert({
      where: { slug: d.slug },
      update: {
        title: d.title,
        kind: d.kind,
        audience: d.audience,
        requiresAcceptance: d.requiresAcceptance,
        reconsentIntervalDays: d.reconsentIntervalDays ?? null,
      },
      create: {
        slug: d.slug,
        title: d.title,
        kind: d.kind,
        audience: d.audience,
        requiresAcceptance: d.requiresAcceptance,
        reconsentIntervalDays: d.reconsentIntervalDays ?? null,
      },
    })

    const existingVersions = await prisma.legalDocumentVersion.count({
      where: { documentId: doc.id },
    })
    if (existingVersions === 0) {
      const bodyHtml = PLACEHOLDER(d.title)
      const bodyText = `${d.title} — draft placeholder (backfilled in L2).`
      await prisma.legalDocumentVersion.create({
        data: {
          documentId: doc.id,
          version: 'v0.1-draft',
          status: 'DRAFT',
          bodyHtml,
          bodyText,
          contentSha256: sha256(bodyText),
        },
      })
      console.log(`  + ${d.slug}: created identity + v0.1-draft`)
    } else {
      console.log(`  = ${d.slug}: identity present (${existingVersions} version[s]), left as-is`)
    }
  }
  console.log(`Seeded ${DOCS.length} legal document identities.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
