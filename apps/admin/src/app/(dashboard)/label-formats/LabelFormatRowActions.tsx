'use client'

// =============================================================================
// LabelFormatRowActions — 3-dot menu for the read-only label-format catalog.
//
// These rows are seed-curated presets (LabelFormatRule), so there are NO
// mutations here. Every action is a deep-link:
//   • View details   → /label-formats/[key]   (key = `<format>~<labelingType>`)
//   • Look up CFR     → ecfr.gov search (external)
//   • Copy CFR citation
// =============================================================================

import { Eye, ExternalLink, Copy } from 'lucide-react'
import {
  RowActionsMenu,
  RowActionItem,
  RowActionLabel,
  RowActionSeparator,
} from '@ilaunchify/ui'

interface Props {
  rowKey: string
  formatLabel: string
  cfrCitation: string
}

export function LabelFormatRowActions({ rowKey, formatLabel, cfrCitation }: Props) {
  function copyToClipboard(value: string, what: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(value).then(
        () => {},
        () => window.prompt(`Copy ${what}:`, value),
      )
    } else {
      window.prompt(`Copy ${what}:`, value)
    }
  }

  const ecfrUrl = `https://www.ecfr.gov/search?search[query]=${encodeURIComponent(cfrCitation)}`

  return (
    <RowActionsMenu label={`Actions for ${formatLabel}`}>
      <RowActionLabel>{formatLabel}</RowActionLabel>
      <RowActionItem href={`/label-formats/${encodeURIComponent(rowKey)}`} icon={Eye}>
        View details
      </RowActionItem>

      <RowActionSeparator />

      <RowActionItem href={ecfrUrl} icon={ExternalLink}>
        Look up CFR
      </RowActionItem>
      <RowActionItem onSelect={() => copyToClipboard(cfrCitation, 'CFR citation')} icon={Copy}>
        Copy CFR citation
      </RowActionItem>
    </RowActionsMenu>
  )
}
