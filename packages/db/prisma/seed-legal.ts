// Seed the core Legal Document identities for the admin-managed Legal CMS.
// Spec: docs/LEGAL_DOCUMENT_MANAGEMENT_SPEC_2026-07-11.md.
//
// Creates each document IDENTITY + an initial DRAFT version. For most docs the
// body is a placeholder backfilled from the current source; for the net-new docs
// authored in L5 (Accessibility Statement, Cookie Policy) a real draft body is
// seeded from BODY_OVERRIDES. Nothing here is published, so no live page changes
// until an admin publishes in Settings → Legal.
//
// Idempotent: upserts each document by slug; creates a v0.1-draft only if none
// exists; and BACKFILLS an override body into an existing placeholder draft (so
// re-running after L0 fills in the L5-authored content). Never edits a PUBLISHED
// version. Run: pnpm --filter @ilaunchify/db seed:legal

import { createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { LEGAL_BODIES } from './legal-content'

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

const DOCS: Seed[] = [
  { slug: 'terms', title: 'Terms of Service', kind: 'POLICY', audience: 'ALL', requiresAcceptance: true },
  { slug: 'privacy', title: 'Privacy Policy', kind: 'POLICY', audience: 'ALL', requiresAcceptance: true, reconsentIntervalDays: 365 },
  { slug: 'cookie-policy', title: 'Cookie Policy', kind: 'POLICY', audience: 'PUBLIC', requiresAcceptance: false },
  { slug: 'creator-agreement', title: 'Creator Agreement', kind: 'AGREEMENT', audience: 'CREATOR', requiresAcceptance: true },
  { slug: 'partner-agreement', title: 'iLaunchify Standard Partner Agreement', kind: 'AGREEMENT', audience: 'PARTNER', requiresAcceptance: true },
  { slug: 'membership-subscription-terms', title: 'Membership & Subscription Terms', kind: 'POLICY', audience: 'CREATOR', requiresAcceptance: true },
  { slug: 'accessibility', title: 'Accessibility Statement', kind: 'NOTICE', audience: 'PUBLIC', requiresAcceptance: false },
  // L5 — additional identities so admin can author them (draft, pending counsel).
  { slug: 'acceptable-use', title: 'Acceptable Use Policy', kind: 'POLICY', audience: 'ALL', requiresAcceptance: false },
  { slug: 'refund-dispute-policy', title: 'Cancellation, Refund & Dispute Policy', kind: 'POLICY', audience: 'ALL', requiresAcceptance: false },
  { slug: 'subprocessors', title: 'Sub-processors', kind: 'NOTICE', audience: 'PUBLIC', requiresAcceptance: false },
  { slug: 'dpa', title: 'Data Processing Addendum', kind: 'AGREEMENT', audience: 'PARTNER', requiresAcceptance: false },
]

// Authored professional draft bodies for every document, kept in ./legal-content.
// NOT legal advice / not counsel-reviewed — seeded as DRAFT until an admin reviews
// and publishes. The seed backfills these into a still-placeholder DRAFT version.
const BODY_OVERRIDES: Record<string, { html: string; text: string }> = LEGAL_BODIES

const PLACEHOLDER = (title: string) =>
  `<p><strong>${title}</strong></p><p><em>Draft placeholder — content is authored in ` +
  `Settings → Legal. Not published, not live, not legally binding.</em></p>`
const PLACEHOLDER_TEXT = (title: string) => `${title} — draft placeholder.`
const isPlaceholder = (bodyText: string) => bodyText.includes('draft placeholder')

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

    const override = BODY_OVERRIDES[d.slug]
    const versions = await prisma.legalDocumentVersion.findMany({
      where: { documentId: doc.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, bodyText: true },
    })

    if (versions.length === 0) {
      const html = override?.html ?? PLACEHOLDER(d.title)
      const text = override?.text ?? PLACEHOLDER_TEXT(d.title)
      await prisma.legalDocumentVersion.create({
        data: {
          documentId: doc.id,
          version: 'v0.1-draft',
          status: 'DRAFT',
          bodyHtml: html,
          bodyText: text,
          contentSha256: sha256(text),
        },
      })
      console.log(`  + ${d.slug}: created identity + v0.1-draft${override ? ' (authored body)' : ''}`)
      continue
    }

    // Backfill an authored body into a still-placeholder DRAFT (idempotent).
    if (override) {
      const draft = versions.find((v) => v.status === 'DRAFT')
      if (draft && isPlaceholder(draft.bodyText)) {
        await prisma.legalDocumentVersion.update({
          where: { id: draft.id },
          data: {
            bodyHtml: override.html,
            bodyText: override.text,
            contentSha256: sha256(override.text),
          },
        })
        console.log(`  ~ ${d.slug}: backfilled authored draft body`)
        continue
      }
    }
    console.log(`  = ${d.slug}: identity present (${versions.length} version[s]), left as-is`)
  }
  console.log(`Seeded ${DOCS.length} legal document identities.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
