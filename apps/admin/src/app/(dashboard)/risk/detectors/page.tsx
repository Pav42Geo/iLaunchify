// Detector settings — the RiskSetting manager (Risk Center M2; the Risk
// Center's equivalent of Logistics gates). One card per detector: mode ladder
// (MONITOR → WARN → GATE → ACT), thresholds, ops note, and the measured
// false-positive rate that justifies (or blocks) promotion.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { DETECTORS, ALL_DETECTOR_KEYS } from '@ilaunchify/risk'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { DetectorCard } from './DetectorCard'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Risk detectors — Admin' }

export default async function RiskDetectorsPage() {
  await requireCapability('risk:admin')

  const [settings, firedCounts, fpCounts] = await Promise.all([
    prisma.riskSetting.findMany(),
    prisma.riskEvent.groupBy({ by: ['detectorKey'], _count: { _all: true } }),
    prisma.riskEvent.groupBy({
      by: ['detectorKey'],
      where: { status: 'FALSE_POSITIVE' },
      _count: { _all: true },
    }),
  ])

  const settingOf = (key: string) => settings.find((s) => s.detectorKey === key)
  const firedOf = (key: string) => firedCounts.find((c) => c.detectorKey === key)?._count._all ?? 0
  const fpOf = (key: string) => fpCounts.find((c) => c.detectorKey === key)?._count._all ?? 0
  const unseeded = ALL_DETECTOR_KEYS.filter((k) => !settingOf(k))

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Operate · Risk Center"
        title="Detector settings"
        description="Every detector starts in MONITOR (shadow mode) and earns promotion with a measured false-positive rate under 20%. Mode and threshold changes are audited with the FP stats at decision time."
        actions={
          <Link
            href="/risk"
            className="inline-flex items-center rounded-full border border-ink-200 bg-white px-4 py-2 text-[13px] font-semibold text-ink-900 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            ← Risk Inbox
          </Link>
        }
      />

      {unseeded.length > 0 && (
        <section className="rounded-2xl border border-warning-200 bg-warning-50 px-5 py-4 text-[13px] leading-relaxed text-warning-800">
          {unseeded.length} detector{unseeded.length === 1 ? ' is' : 's are'} not seeded yet (
          {unseeded.join(', ')}). Run <code className="font-mono text-[12px]">pnpm --filter @ilaunchify/db seed:risk</code>.
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {ALL_DETECTOR_KEYS.map((key) => {
          const setting = settingOf(key)
          if (!setting) return null
          const meta = DETECTORS[key]
          return (
            <DetectorCard
              key={key}
              detectorKey={key}
              title={meta.title}
              trigger={meta.trigger}
              benchmark={meta.benchmark}
              mode={setting.mode as 'MONITOR' | 'WARN' | 'GATE' | 'ACT'}
              thresholds={(setting.thresholdsJson ?? {}) as Record<string, number>}
              notes={setting.notes ?? ''}
              fired={firedOf(key)}
              falsePositives={fpOf(key)}
            />
          )
        })}
      </div>
    </div>
  )
}
