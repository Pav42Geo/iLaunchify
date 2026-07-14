// Labeling page folded into /services (Pavel 2026-07-13) — the "Labeling &
// value-added" accordion there renders the same cards (LabelingSettingsForm
// components + actions in this directory stay; the accordion imports them).
import { redirect } from 'next/navigation'

export default function MovedLabelingPage() {
  redirect('/services?sec=labeling')
}
