import { NextResponse } from 'next/server'
import { prisma } from '@ilaunchify/db'

// Uptime / readiness probe (P6). Returns 200 only when the DB is reachable so
// an external monitor can distinguish "app up" from "app up but DB down".
export const dynamic = 'force-dynamic'

const SERVICE = 'partner'
const VERSION = '0.1.0'

export async function GET() {
  let dbReachable = false
  try {
    await prisma.$queryRaw`SELECT 1`
    dbReachable = true
  } catch {
    dbReachable = false
  }
  return NextResponse.json(
    {
      ok: dbReachable,
      service: SERVICE,
      version: VERSION,
      dbReachable,
      time: new Date().toISOString(),
    },
    { status: dbReachable ? 200 : 503 },
  )
}
