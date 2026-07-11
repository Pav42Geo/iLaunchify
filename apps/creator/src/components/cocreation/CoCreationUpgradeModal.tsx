'use client'

// Co-creation upgrade gate (Pavel 2026-07-11).
//
// Thin wrapper over the shared TierUpgradeModal — the single source of truth for
// every tier-gated creator upgrade. This file only names the feature; all copy,
// pricing, and the comparison table live in @ilaunchify/ui's tier-upgrade-data
// (CREATOR_UPGRADE_FEATURES.cocreation → the "Unlocks co-creation" tag + the
// spotlighted row). Gate another feature by adding a registry entry, not a modal.

import { TierUpgradeModal, CREATOR_UPGRADE_FEATURES } from '@ilaunchify/ui'

export function CoCreationUpgradeModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <TierUpgradeModal
      open={open}
      onClose={onClose}
      feature={CREATOR_UPGRADE_FEATURES.cocreation}
      manageHref="/settings/plan"
    />
  )
}
