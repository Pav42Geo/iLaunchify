'use client'

// Die-cut Templates module — tab shell. Two tabs, per docs/DIE_CUT_TEMPLATES_MODULE.md:
//   • Library            — the canonical DieCutTemplate shapes (create/toggle/usage).
//   • Container assignments — per-container default die-cut + domains (folded from the old
//     Container Die-lines page).

import * as React from 'react'
import { Shapes, Boxes } from 'lucide-react'
import { DieCutTemplatesClient } from './DieCutTemplatesClient'
import { ContainerAssignmentsClient } from './ContainerAssignmentsClient'
import type { DieCutLibraryData, ContainerAssignmentsData } from './loader'

type TabKey = 'library' | 'containers'

export function DieCutModuleClient({
  library,
  assignments,
  initialTab = 'library',
}: {
  library: DieCutLibraryData
  assignments: ContainerAssignmentsData
  initialTab?: TabKey
}) {
  const [tab, setTab] = React.useState<TabKey>(initialTab)

  const tabs: { key: TabKey; label: string; icon: React.ReactNode; count: number }[] = [
    { key: 'library', label: 'Library', icon: <Shapes className="h-4 w-4" />, count: library.stats.total },
    { key: 'containers', label: 'Container assignments', icon: <Boxes className="h-4 w-4" />, count: assignments.stats.total },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1 border-b border-ink-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium ${tab === t.key ? 'border-pink-500 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-900'}`}
          >
            {t.icon}{t.label}
            <span className="rounded-full bg-ink-100 px-1.5 text-[11px] text-ink-600">{t.count}</span>
          </button>
        ))}
      </div>

      {tab === 'library' ? <DieCutTemplatesClient data={library} /> : <ContainerAssignmentsClient data={assignments} />}
    </div>
  )
}
