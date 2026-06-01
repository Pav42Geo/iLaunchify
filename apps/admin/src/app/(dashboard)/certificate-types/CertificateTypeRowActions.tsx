'use client'

// =============================================================================
// CertificateTypeRowActions — reference implementation of the platform
// 3-dot menu (Pavel 2026-06-01).
//
// Wires the @ilaunchify/ui RowActionsMenu into the certificate-types row:
//   • View    → /certificate-types/[id]
//   • Edit    → /certificate-types/[id] (same page; form fields editable)
//   • Toggle status (Deprecate / Reactivate) via setCertificateTypeStatus
//   • Submenu "More" → Copy slug / Copy ID
//
// Uses the SubMenu pattern to demo extended menu options Pavel asked for.

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Eye,
  Pencil,
  Archive,
  ArchiveRestore,
  Copy,
  Sparkles,
  ExternalLink,
} from 'lucide-react'
import {
  RowActionsMenu,
  RowActionItem,
  RowActionSeparator,
  RowActionSubMenu,
  RowActionLabel,
} from '@ilaunchify/ui'
import { setCertificateTypeStatus } from './actions'

interface Props {
  id: string
  name: string
  slug: string
  status: 'ACTIVE' | 'DEPRECATED'
  instanceCount: number
}

export function CertificateTypeRowActions({
  id,
  name,
  slug,
  status,
  instanceCount,
}: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function toggleStatus() {
    const next = status === 'ACTIVE' ? 'DEPRECATED' : 'ACTIVE'
    start(async () => {
      const res = await setCertificateTypeStatus(id, next)
      if (!res.ok) {
        window.alert(res.error)
        return
      }
      router.refresh()
    })
  }

  function copyToClipboard(value: string, what: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(value).then(
        () => {
          /* could toast in future; silent for now */
        },
        () => window.prompt(`Copy ${what}:`, value),
      )
    } else {
      window.prompt(`Copy ${what}:`, value)
    }
  }

  return (
    <RowActionsMenu label={`Actions for ${name}`}>
      <RowActionLabel>{name}</RowActionLabel>
      <RowActionItem href={`/certificate-types/${id}`} icon={Eye}>
        View
      </RowActionItem>
      <RowActionItem href={`/certificate-types/${id}`} icon={Pencil}>
        Edit
      </RowActionItem>

      <RowActionSeparator />

      {status === 'ACTIVE' ? (
        <RowActionItem
          onSelect={toggleStatus}
          icon={Archive}
          disabled={pending}
          danger
        >
          {pending ? 'Deprecating…' : 'Deprecate'}
        </RowActionItem>
      ) : (
        <RowActionItem
          onSelect={toggleStatus}
          icon={ArchiveRestore}
          disabled={pending}
        >
          {pending ? 'Reactivating…' : 'Reactivate'}
        </RowActionItem>
      )}

      <RowActionSeparator />

      <RowActionSubMenu label="More" icon={Sparkles}>
        <RowActionItem
          onSelect={() => copyToClipboard(slug, 'slug')}
          icon={Copy}
        >
          Copy slug
        </RowActionItem>
        <RowActionItem
          onSelect={() => copyToClipboard(id, 'ID')}
          icon={Copy}
        >
          Copy ID
        </RowActionItem>
        <RowActionSeparator />
        <RowActionItem
          href={`/audit?entityType=CertificateType&entityId=${id}`}
          icon={ExternalLink}
        >
          View in audit log
        </RowActionItem>
        {instanceCount > 0 && (
          <RowActionItem
            href={`/audit?entityType=PartnerCertificateInstance&action=&since=`}
            icon={ExternalLink}
          >
            {instanceCount} partner claim{instanceCount === 1 ? '' : 's'}
          </RowActionItem>
        )}
      </RowActionSubMenu>
    </RowActionsMenu>
  )
}
