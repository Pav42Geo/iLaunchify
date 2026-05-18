import { PrismaClient } from '@prisma/client'

// Singleton Prisma client with hot-reload safety for Next.js dev.
// See https://www.prisma.io/docs/orm/more/help-and-troubleshooting/help-articles/nextjs-prisma-client-dev-practices

declare global {
  // eslint-disable-next-line no-var
  var __ilaunchifyPrisma: PrismaClient | undefined
}

export const prisma =
  globalThis.__ilaunchifyPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalThis.__ilaunchifyPrisma = prisma
}

export * from '@prisma/client'
