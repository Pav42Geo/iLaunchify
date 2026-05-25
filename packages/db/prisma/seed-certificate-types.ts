// V1 seed for admin-curated CertificateType library.
// Idempotent — safe to re-run.
//
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §7.2 — 12 starter types covering
// ~95% of partner certification requests. Admin can add more via
// /admin/certificates CRUD (task #129) post-launch.
//
// Note: thumbnailFileId is NULL at seed time — admin uploads branded thumbnails
// via the admin CRUD UI before the public product detail pages can show badges.
// Until thumbnails are uploaded, the public detail page hides the badge for that
// CertificateType. This is intentional: keeps untrademarked / unbranded
// placeholders out of public display.

import { PrismaClient, CertificateTypeStatus } from '@prisma/client'

const STARTER_CERTIFICATE_TYPES: Array<{
  slug: string
  name: string
  description: string
  verificationNotes: string
}> = [
  {
    slug: 'nsf',
    name: 'NSF',
    description: 'NSF International certification — independent third-party testing for product safety, quality, and label accuracy.',
    verificationNotes:
      'Look for NSF certificate PDF showing product name + facility + valid date range. Cross-check NSF certificate number on nsf.org if unfamiliar issuing body.',
  },
  {
    slug: 'usda-organic',
    name: 'USDA Organic',
    description: 'USDA National Organic Program certification — at least 95% organic ingredients, no synthetic fertilizers or pesticides.',
    verificationNotes:
      'PDF must show USDA Organic seal usage rights + certifier name + facility. Verify certifier is USDA-accredited via ams.usda.gov.',
  },
  {
    slug: 'non-gmo-project',
    name: 'Non-GMO Project Verified',
    description: 'Non-GMO Project Verified — third-party testing confirms no genetically modified ingredients above 0.9% threshold.',
    verificationNotes:
      'PDF should show product name + lot/batch reference + Non-GMO Project verification number. Check number on nongmoproject.org.',
  },
  {
    slug: 'kosher',
    name: 'Kosher',
    description: 'Kosher certification — produced in accordance with Jewish dietary law. Common agencies: OU, KOF-K, OK, Star-K.',
    verificationNotes:
      'PDF must show certifying agency + product name + valid date. Common agencies: OU (Orthodox Union), KOF-K, OK, Star-K. Cross-check agency website if unfamiliar.',
  },
  {
    slug: 'halal',
    name: 'Halal',
    description: 'Halal certification — produced in accordance with Islamic dietary law. Common agencies: IFANCA, IFCO, Halal Transactions of Omaha.',
    verificationNotes:
      'PDF must show certifying agency + product name + valid date. Common US agencies: IFANCA, IFCO, Halal Transactions of Omaha.',
  },
  {
    slug: 'gluten-free-certified',
    name: 'Gluten-Free Certified',
    description: 'Gluten-Free Certification Organization (GFCO) or similar third-party gluten-free certification — typically <10ppm gluten.',
    verificationNotes:
      'PDF should show certifier (GFCO, BRCGS Gluten-Free, NSF Gluten-Free) + product name + ppm threshold.',
  },
  {
    slug: 'vegan-certified',
    name: 'Vegan Certified',
    description: 'Third-party vegan certification — no animal-derived ingredients, no animal testing. Common: Vegan Action, Vegan Society.',
    verificationNotes:
      'PDF must show certifying body + product name + valid date. Common: Vegan Action (US), Vegan Society (UK + intl).',
  },
  {
    slug: 'cgmp',
    name: 'cGMP',
    description: 'Current Good Manufacturing Practices (cGMP) compliance — typically NSF/ANSI 173 for dietary supplements, FDA 21 CFR 117 for food.',
    verificationNotes:
      'PDF must show facility-level certification (cGMP audits are facility-wide, not product-specific) + auditor + valid date range. NSF, NSF International, UL all common auditors.',
  },
  {
    slug: 'fssc-22000',
    name: 'FSSC 22000',
    description: 'FSSC 22000 — international food safety management certification recognized by GFSI. Covers production, processing, and packaging.',
    verificationNotes:
      'PDF must show facility scope + FSSC accredited certification body + audit date. Verify CB on fssc22000.com.',
  },
  {
    slug: 'sqf',
    name: 'SQF',
    description: 'Safe Quality Food (SQF) certification — GFSI-recognized food safety + quality management system. Three levels (Fundamentals, Food Safety, Quality).',
    verificationNotes:
      'PDF must show facility scope + SQF level (1/2/3) + auditor + audit date. Verify on sqfi.com facility lookup.',
  },
  {
    slug: 'informed-sport',
    name: 'Informed Sport',
    description: 'Informed Sport — batch-level testing for banned substances under WADA prohibited list. Common for athletic supplements.',
    verificationNotes:
      'PDF must show product name + LOT number tested + valid date. Cross-check LOT on informed-sport.com.',
  },
  {
    slug: 'iso-22000',
    name: 'ISO 22000',
    description: 'ISO 22000 — international food safety management standard, broader than FSSC 22000 (less retail acceptance but recognized).',
    verificationNotes:
      'PDF must show ISO 22000:2018 scope + facility + auditor + valid date range.',
  },
]

export async function seedCertificateTypes(prisma: PrismaClient) {
  console.log('Seeding admin-curated CertificateType library (12 starter types)...')

  for (const ct of STARTER_CERTIFICATE_TYPES) {
    await prisma.certificateType.upsert({
      where: { slug: ct.slug },
      update: {},
      create: {
        slug: ct.slug,
        name: ct.name,
        description: ct.description,
        verificationNotes: ct.verificationNotes,
        thumbnailFileId: null, // admin uploads via /admin/certificates after launch
        status: CertificateTypeStatus.ACTIVE,
      },
    })
  }

  console.log(`Seeded ${STARTER_CERTIFICATE_TYPES.length} certificate types.`)
}
