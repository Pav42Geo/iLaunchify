// Seed the current Partner Agreement (v1.0) so the contract-signing flow has a
// document to render + hash + sign. docs/PARTNER_ONBOARDING_STRATEGY_2026-07.md §4.
//
// The bodyMarkdown here is a working baseline mirroring the counsel redlines in
// docs/legal/LEGAL_DOCS_REDLINE_RECOMMENDATIONS.md Addendum — REPLACE with the
// counsel-blessed final text before go-live (esp. the D7 nomination clause).
//
// Idempotent: upserts by version. Marks v1.0 isCurrent and clears isCurrent on
// any other version. Run: pnpm --filter @ilaunchify/db seed:partner-agreement

import { createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const VERSION = 'v1.0'
const TITLE = 'iLaunchify Partner Agreement'
const BODY = `# iLaunchify Partner Agreement (v1.0)

## 1. Parties & Purpose
This Agreement governs the Partner's participation in the iLaunchify production network across the services it configures in Activation Setup.

## 2. Scope of Services
Partner performs the services configured in its Activation Setup profile to the declared specifications, lead times, and quality standards, and maintains the accuracy of that data.

## 3. Quality, Compliance & Certifications
Partner maintains the certifications it attests to, including any domain-specific requirements. Partner shall not accept work outside its certified domains. Expired certifications automatically suspend routing for the affected domain.

## 4. Orders, Pinning & Nomination
Where a creator or manufacturer nominates Partner for a specific production leg, Partner accepts such directed assignments subject to capacity, and remains bound by the compliance, quality, and on-platform-transaction obligations of this Agreement. [D7 — final liability/indemnity language pending counsel.]

## 5. Fees, Payout & Anti-Circumvention
Partner shall transact all Platform-originated orders on the Platform and shall not solicit or accept off-platform payment for such orders.

## 6. Liability & Insurance
Each party is responsible for its own acts and defaults. Partner maintains general and product-liability insurance throughout the term.

## 7. Term & Termination
Effective until terminated per the notice provisions; confidentiality, open-order, and indemnity obligations survive.

## 8. Acceptance
By signing, Partner agrees to be bound by this Agreement. This electronic signature is legally binding under the U.S. ESIGN Act and UETA.`

async function main() {
  const documentSha256 = createHash('sha256').update(BODY, 'utf8').digest('hex')

  // Only one current version at a time.
  await prisma.partnerAgreement.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } })

  const existing = await prisma.partnerAgreement.findUnique({ where: { version: VERSION } })
  if (existing) {
    await prisma.partnerAgreement.update({
      where: { version: VERSION },
      data: { title: TITLE, bodyMarkdown: BODY, documentSha256, isCurrent: true },
    })
  } else {
    await prisma.partnerAgreement.create({
      data: { version: VERSION, title: TITLE, bodyMarkdown: BODY, documentSha256, isCurrent: true },
    })
  }

  console.log(`\n✓ Partner Agreement ${VERSION} seeded (isCurrent). documentSha256=${documentSha256.slice(0, 16)}…\n`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
