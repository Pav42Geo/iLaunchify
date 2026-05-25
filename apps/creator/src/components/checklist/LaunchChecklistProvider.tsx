'use client'

// Provider that holds the drawer's open/close state + the snapshot of
// checklist progress. Lives at the (dashboard) layout level so both the
// sidebar trigger and the drawer itself read the same state without prop
// drilling.
//
// Auto-open behavior:
//   - On first dashboard visit (no checklistOpenedAt stamp), drawer renders
//     open. The server-side initial state passed in via initialState.shouldAutoOpen.
//   - User dismisses it -> we stamp checklistOpenedAt server-side (so future
//     visits don't auto-open) and close locally.
//   - User can re-open from the sidebar "Launch Checklist" nav item any time.

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { markChecklistOpened } from '../../app/(dashboard)/_actions/checklist-actions'

export type StripeStatus = 'NONE' | 'PENDING' | 'ACTIVE' | 'RESTRICTED' | 'REJECTED'

export interface ChecklistSnapshot {
  step1: {
    targetMarketIds: string[]
    audienceSizeBand: string | null
    completedAt: string | null
  }
  step2: { stripeAccountStatus: StripeStatus }
  step3CompletedAt: string | null
  step4CompletedAt: string | null
  step5CompletedAt: string | null
}

export interface ChecklistMeta {
  shouldAutoOpen: boolean
}

interface ContextValue {
  isOpen: boolean
  open: () => void
  close: () => void
  snapshot: ChecklistSnapshot
}

const Ctx = createContext<ContextValue | null>(null)

export function LaunchChecklistProvider({
  initialSnapshot,
  meta,
  children,
}: {
  initialSnapshot: ChecklistSnapshot
  meta: ChecklistMeta
  children: ReactNode
}) {
  const [isOpen, setIsOpen] = useState(meta.shouldAutoOpen)

  // First-open side effect — stamp the server flag so subsequent dashboard
  // visits don't auto-open. We do this on FIRST visit, not on every open.
  useEffect(() => {
    if (meta.shouldAutoOpen) {
      void markChecklistOpened()
    }
    // intentional: fire-once on mount with the initial meta value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = useMemo<ContextValue>(
    () => ({
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      snapshot: initialSnapshot,
    }),
    [isOpen, initialSnapshot],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLaunchChecklist(): ContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) {
    throw new Error(
      'useLaunchChecklist must be used inside <LaunchChecklistProvider>. Wrap the dashboard layout.',
    )
  }
  return ctx
}

// -----------------------------------------------------------------------------
// Pure helpers — also useful for the sidebar count badge and any inline
// surfaces that want to display progress.
// -----------------------------------------------------------------------------

export function computeChecklistCompletion(snapshot: ChecklistSnapshot) {
  return {
    1: !!snapshot.step1.completedAt && snapshot.step1.targetMarketIds.length > 0,
    2: snapshot.step2.stripeAccountStatus === 'ACTIVE',
    3: !!snapshot.step3CompletedAt,
    4: !!snapshot.step4CompletedAt,
    5: !!snapshot.step5CompletedAt,
  } as const
}

export function pendingChecklistCount(snapshot: ChecklistSnapshot): number {
  const c = computeChecklistCompletion(snapshot)
  return Object.values(c).filter((done) => !done).length
}
