// Standalone runner for the CertificateType library seed (idempotent upserts).
// seed-certificate-types.ts only exports its function (the main seed calls it),
// so this wrapper lets you run just the cert types:
//   pnpm --filter @ilaunchify/db seed:certificate-types
import { PrismaClient } from '@prisma/client'
import { seedCertificateTypes } from './seed-certificate-types'

const prisma = new PrismaClient()

seedCertificateTypes(prisma)
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
