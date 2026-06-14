// Domain on/off seed (2026-06-14). Idempotent upsert keyed on DomainSetting.domain.
// Seeds the five product domains; OTC ships DISABLED (the Drug Facts renderer
// exists but the OTC flow isn't live). Re-running only fills in missing rows and
// leaves admin edits to existing rows intact — except OTC, which is force-kept
// off until the OTC flow ships (remove from FORCE_OFF when going live).
//
// Run:
//   cd packages/db && pnpm exec dotenv -e ../../.env.local -- \
//     tsx prisma/seed-domain-settings.ts

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEFAULTS: Array<{ domain: string; enabled: boolean }> = [
  { domain: 'FOOD', enabled: true },
  { domain: 'DIETARY_SUPPLEMENT', enabled: true },
  { domain: 'COSMETIC', enabled: true },
  { domain: 'PET_PRODUCT', enabled: true },
  { domain: 'OTC', enabled: false },
]

// Domains we hard-keep disabled until their builder flow is live.
const FORCE_OFF = new Set(['OTC'])

async function main() {
  for (const d of DEFAULTS) {
    await prisma.domainSetting.upsert({
      where: { domain: d.domain },
      // Don't clobber an admin's choice on re-seed — except FORCE_OFF domains.
      update: FORCE_OFF.has(d.domain) ? { enabled: false } : {},
      create: { domain: d.domain, enabled: d.enabled },
    })
  }
  const rows = await prisma.domainSetting.findMany({ orderBy: { domain: 'asc' } })
  console.log('DomainSetting rows:')
  for (const r of rows) console.log(`  ${r.domain.padEnd(20)} ${r.enabled ? 'ENABLED' : 'disabled'}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => void prisma.$disconnect())
