'use client'

// Per-row 3-dot menu for /logistics/carriers.
//
// Actions deep-link to the edit page — we never inline-mutate from the list
// page (locked admin surface pattern). Audit entries for carrier rules log
// under entityType 'LogisticsSetting' (see actions.ts).

import { Pencil, History, Copy } from 'lucide-react'
import {
  RowActionsMenu,
  RowActionItem,
  RowActionSeparator,
  RowActionLabel,
} from '@ilaunchify/ui'

interface Props {
  ruleId: string
  carrier: string
  serviceLevel: string
}

export function CarrierRuleRowActions({ ruleId, carrier, serviceLevel }: Props) {
  function copy(value: string, what: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(value).catch(() => window.prompt(`Copy ${what}:`, value))
    } else {
      window.prompt(`Copy ${what}:`, value)
    }
  }

  return (
    <RowActionsMenu label={`Actions for ${carrier} ${serviceLevel}`}>
      <RowActionLabel>
        {carrier} · {serviceLevel}
      </RowActionLabel>

      <RowActionItem href={`/logistics/carriers/${ruleId}`} icon={Pencil}>
        Edit rule
      </RowActionItem>

      <RowActionSeparator />

      <RowActionItem
        href={`/audit?entityType=LogisticsSetting&entityId=${ruleId}`}
        icon={History}
      >
        Audit history
      </RowActionItem>

      <RowActionSeparator />

      <RowActionItem onSelect={() => copy(ruleId, 'rule ID')} icon={Copy}>
        Copy rule ID
      </RowActionItem>
    </RowActionsMenu>
  )
}
