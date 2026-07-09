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
const TITLE = 'iLaunchify Standard Partner Agreement'
const BODY = `# iLaunchify Standard Partner Agreement

**Version 1.0**

_Beta version. This Agreement governs participation in the iLaunchify production network during the platform's private-beta period and may be updated as the service matures; Partners will be notified of material changes and asked to re-accept. It is written in plain, professional terms and is intended to be binding, but has not yet completed independent legal review._

This Standard Partner Agreement (the "Agreement") is entered into between **iLaunchify, Inc.**, a Delaware corporation ("iLaunchify", "we", "us", or the "Platform"), and the business accepting this Agreement (the "Partner", "you"). By clicking "I agree", signing electronically, or accepting or performing any order through the Platform, you agree to be bound by this Agreement as of that date (the "Effective Date").

## 1. Definitions
- **Platform** — the iLaunchify software, marketplace, and orchestration services that connect creators (brand owners) with production and fulfillment partners.
- **Creator** — a brand owner that designs and orders products through the Platform.
- **Services** — the production, co-packing, packaging-printing, warehousing, fulfillment, and related capabilities a Partner offers, as configured in the Partner's profile and Activation Setup.
- **Order** — a request routed to the Partner through the Platform for the production or handling of goods.
- **Facility** — a physical site operated by the Partner from which Services are performed.
- **Platform Transaction** — any transaction, order, or commercial relationship that originates from, is introduced by, or is facilitated through the Platform.

## 2. Eligibility, Onboarding & Verification
2.1 Partner represents that it is a validly organized business, in good standing, and legally authorized to perform its Services in the United States.
2.2 Partner shall complete onboarding truthfully, including its legal entity information, facility location(s), certifications, insurance, and capability data, and shall keep this information current.
2.3 iLaunchify may verify Partner's identity, registrations, certifications, and insurance, and may approve, decline, suspend, or remove a Partner at its discretion. Approval is not a guarantee of any volume of Orders.
2.4 Partner may only perform Services in domains and at facilities for which it holds the required registrations and certifications (including, where applicable, FDA facility registration, cGMP, and GFSI-recognized certification).

## 3. The Partner Relationship
3.1 Partner is an independent contractor. Nothing in this Agreement creates a partnership, joint venture, employment, or agency relationship. Neither party may bind the other.
3.2 iLaunchify operates as an orchestration platform and marketplace. iLaunchify is not the manufacturer, seller, or shipper of Partner's goods and does not take title to them except where expressly stated for a specific service.
3.3 Partner is solely responsible for its personnel, subcontractors, equipment, facilities, and methods of performing the Services.

## 4. Services & Performance Standards
4.1 Partner shall perform each accepted Order in a professional and workmanlike manner, consistent with the specifications, lead times, quantities, and quality standards it has declared on the Platform and those stated in the Order.
4.2 Partner shall maintain the accuracy of its capabilities, minimum order quantities, capacity, lead times, and pricing on the Platform, and shall promptly update them when they change.
4.3 Partner shall notify iLaunchify without undue delay of any circumstance—capacity constraint, delay, defect, shortage, equipment failure, or compliance issue—that may affect an Order.

## 5. Orders, Routing, Pinning & Nomination
5.1 iLaunchify may route Orders to Partner based on capability, capacity, geography, certifications, price, and performance. Partner is not obligated to accept an Order it cannot fulfill but shall respond promptly.
5.2 Certain Orders may be directed to Partner by pinning or by nomination from a Creator or a manufacturing partner for a specific production leg. Partner accepts such directed assignments subject to its capacity and remains fully bound by this Agreement for them.
5.3 Once Partner accepts an Order, Partner shall fulfill it in accordance with its terms, or promptly notify iLaunchify if it becomes unable to do so.

## 6. Quality, Compliance & Certifications
6.1 Partner shall comply with all applicable laws, regulations, and industry standards for the goods it produces or handles, including, as applicable, the U.S. Federal Food, Drug, and Cosmetic Act, FDA regulations, cGMP, allergen-control requirements, and labeling requirements.
6.2 Partner shall maintain in force all certifications and registrations it attests to on the Platform and shall not perform Services outside its certified or registered domains. Expired or withdrawn certifications may automatically suspend routing for the affected domain.
6.3 Partner shall maintain lot traceability and records sufficient to support a product trace or recall, and shall retain such records for the period required by law or industry standard.

## 7. Product Safety, Holds & Recalls
7.1 Partner shall promptly notify iLaunchify of any product-safety issue, quality escape, regulatory action, or recall affecting goods produced or handled for a Platform Order.
7.2 Partner shall cooperate in good faith with any hold, corrective action, mock or actual recall, or regulatory response, and shall bear the costs attributable to its acts or omissions.

## 8. Fees, Pricing & Payment
8.1 Prices for Services are those quoted or configured on the Platform for the relevant Order. Applicable platform or production fees are disclosed on the Platform and may be updated prospectively.
8.2 Payments and payouts are processed through Stripe Connect. Partner must maintain an active, verified payout account. Partner is responsible for the accuracy of its payout and tax information.
8.3 Partner is responsible for its own taxes. iLaunchify may collect and remit taxes only where required by law or expressly stated.
8.4 iLaunchify may set off, hold, or reverse amounts to correct errors, chargebacks, refunds, or amounts owed to iLaunchify or a Creator arising from Partner's default.

## 9. Anti-Circumvention
9.1 For any Creator or counterparty introduced to Partner through the Platform, Partner shall transact all Platform Transactions on and through the Platform.
9.2 During the term and for twelve (12) months after, Partner shall not solicit, divert, or accept off-platform payment for Platform Transactions, or otherwise circumvent the Platform with a counterparty first introduced through it, except with iLaunchify's prior written consent.

## 10. Intellectual Property
10.1 Creators retain all rights in their brands, designs, artwork, formulations, and specifications provided for an Order. Partner receives a limited, non-exclusive license to use them solely to perform that Order, and for no other purpose.
10.2 iLaunchify retains all rights in the Platform, its software, and its trademarks. Partner receives no rights in them except the limited right to use the Platform per this Agreement.
10.3 Partner shall not reproduce, sell, or reuse a Creator's designs, formulations, or specifications outside the Platform, and shall not manufacture the same or a substantially similar product for a third party using a Creator's proprietary inputs.

## 11. Confidentiality
11.1 Each party may receive confidential information of the other or of a Creator. The receiving party shall use it only to perform this Agreement, protect it with reasonable care, and not disclose it except to personnel and subcontractors bound by equivalent obligations.
11.2 Confidentiality obligations survive termination for three (3) years, and indefinitely for trade secrets.

## 12. Data Protection & Privacy
12.1 Each party shall comply with applicable data-protection laws. iLaunchify's handling of personal information is described in its Privacy Policy.
12.2 Partner shall protect any personal or business information it receives through the Platform and use it only to perform the Services.

## 13. Insurance
13.1 Partner shall maintain, throughout the term, commercial general liability and product liability insurance appropriate to its Services, with limits customary for its industry (a minimum of USD 1,000,000 per occurrence is recommended; higher limits may be required for certain categories).
13.2 Partner shall provide a certificate of insurance on request and shall maintain workers' compensation and other coverage required by law.

## 14. Representations & Warranties
14.1 Each party represents that it has the authority to enter into this Agreement.
14.2 Partner represents and warrants that it will perform the Services in compliance with this Agreement and applicable law; that goods produced or handled will conform to the applicable specifications and be free from defects in materials and workmanship; and that its certifications, registrations, and Platform data are accurate.

## 15. Indemnification
15.1 Partner shall defend, indemnify, and hold harmless iLaunchify, its affiliates, and Creators from third-party claims, damages, and losses arising from (a) Partner's breach of this Agreement, (b) Partner's negligence or willful misconduct, (c) defective goods or Services provided by Partner, or (d) Partner's violation of law or infringement of third-party rights (other than from a Creator's own inputs).
15.2 iLaunchify shall defend, indemnify, and hold harmless Partner from third-party claims arising from iLaunchify's breach of this Agreement or its own negligence or willful misconduct.

## 16. Limitation of Liability
16.1 To the maximum extent permitted by law, neither party is liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits or goodwill.
16.2 Except for a party's indemnification obligations, breach of confidentiality, anti-circumvention obligations, or a party's gross negligence or willful misconduct, each party's aggregate liability arising out of this Agreement is limited to the greater of the amounts paid or payable through the Platform to Partner in the six (6) months preceding the claim, or USD 1,000.

## 17. Term, Suspension & Termination
17.1 This Agreement is effective on the Effective Date and continues until terminated.
17.2 Either party may terminate for convenience on thirty (30) days' written notice, and either party may terminate immediately for the other's material breach not cured within fifteen (15) days of notice.
17.3 iLaunchify may suspend or restrict Partner's access or routing immediately to protect the Platform, Creators, or the public—for example, for a compliance lapse, safety issue, expired certification, or suspected fraud.
17.4 Termination does not affect accepted Orders in progress, which shall be completed or wound down in good faith. Sections concerning confidentiality, intellectual property, anti-circumvention, fees owed, indemnification, and limitation of liability survive termination.

## 18. Dispute Resolution & Governing Law
18.1 This Agreement is governed by the laws of the State of Delaware, without regard to conflict-of-laws rules.
18.2 The parties shall first attempt to resolve disputes informally in good faith. Any unresolved dispute shall be resolved by binding arbitration administered under the rules of a recognized U.S. arbitration body, seated in the United States, except that either party may seek injunctive relief in court to protect its intellectual property or confidential information.

## 19. Force Majeure
Neither party is liable for delay or failure caused by events beyond its reasonable control, including natural disasters, labor disputes, supply-chain disruption, utility or transportation failures, pandemics, or government action, provided the affected party gives prompt notice and works diligently to resume performance.

## 20. General
20.1 **Assignment.** Partner may not assign this Agreement without iLaunchify's consent; iLaunchify may assign it to an affiliate or successor.
20.2 **Notices.** Notices may be given through the Platform or to the contact details on file.
20.3 **Amendment.** iLaunchify may update this Agreement prospectively and will notify Partner of material changes; continued use after the effective date of an update constitutes acceptance.
20.4 **Severability & Waiver.** If any provision is unenforceable, the remainder stays in effect. A party's failure to enforce a provision is not a waiver.
20.5 **Entire Agreement.** This Agreement, together with the Platform terms and any order-specific terms, is the entire agreement between the parties regarding its subject matter and supersedes prior understandings.

## 21. Acceptance
By signing below or accepting electronically, Partner acknowledges it has read, understood, and agrees to be bound by this Agreement. Partner's electronic signature is intended to be legally binding under the U.S. ESIGN Act and UETA.`

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
