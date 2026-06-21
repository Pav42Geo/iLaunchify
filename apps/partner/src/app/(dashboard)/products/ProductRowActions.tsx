'use client'

// Per-row 3-dot menu for the partner /products table.
// Platform-standard RowActionsMenu primitive (@ilaunchify/ui).
//
// Status-aware (Pavel 2026-06-05): the menu adapts to the product's lifecycle
// phase so the partner always sees the right next move and never an "Edit"
// that's actually blocked.
//
//   DRAFT / NEEDS_CHANGES   authoring      → Edit, Submit, Clone, Discard
//   PENDING_* / UNDER_REVIEW  in review    → Preview, Clone (editing frozen)
//   PUBLISHED                live          → Preview, Propose edit, Turn off,
//                                            View in marketplace, Clone
//   PAUSED                   off-market    → Preview, Re-list, Propose edit, Clone
//   REJECTED / ARCHIVED      archived      → Preview, Clone
//
// Pause/resume call the server actions directly; everything else deep-links.

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Pencil,
  Eye,
  Copy,
  FileStack,
  ShieldAlert,
  Send,
  Trash2,
  PowerOff,
  Power,
  ExternalLink,
  PencilLine,
  LifeBuoy,
} from 'lucide-react'
import {
  RowActionsMenu,
  RowActionItem,
  RowActionSeparator,
  RowActionLabel,
} from '@ilaunchify/ui'
import type { ProductTemplateStatus } from '@ilaunchify/db'
import { pauseProduct, resumeProduct, deleteDraft } from './actions'

interface Props {
  id: string
  name: string
  status: ProductTemplateStatus
  slug?: string
  marketingUrl?: string
  certRefreshNeeded?: boolean
}

function copy(value: string, what: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(value).catch(() => window.prompt(`Copy ${what}:`, value))
  } else {
    window.prompt(`Copy ${what}:`, value)
  }
}

const AUTHORING = new Set<ProductTemplateStatus>(['DRAFT', 'NEEDS_CHANGES'])

export function ProductRowActions({
  id,
  name,
  status,
  marketingUrl,
  certRefreshNeeded,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const isLive = status === 'PUBLISHED'
  const isPaused = status === 'PAUSED'
  const authoring = AUTHORING.has(status)

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return
    startTransition(async () => {
      const r = await fn()
      if (!r.ok) {
        toast.error(r.error ?? 'Failed')
        return
      }
      toast.success(success)
      router.refresh()
    })
  }

  return (
    <RowActionsMenu label={`Actions for ${name}`}>
      <RowActionLabel>{name}</RowActionLabel>

      {/* Primary affordance per phase */}
      {authoring ? (
        <RowActionItem href={`/products/new?draft=${id}`} icon={Pencil}>
          Edit product
        </RowActionItem>
      ) : (
        <RowActionItem href={`/products/${id}/preview`} icon={Eye}>
          Preview
        </RowActionItem>
      )}

      {/* DRAFT: resume the guided builder where it left off (load-back). */}
      {status === 'DRAFT' && (
        <RowActionItem href={`/products/new?draft=${id}`} icon={FileStack}>
          Resume in builder
        </RowActionItem>
      )}

      {/* Authoring: move it forward */}
      {authoring && (
        <RowActionItem href={`/products/new?draft=${id}`} icon={Send}>
          Open to submit for review
        </RowActionItem>
      )}

      {/* Live / paused: propose an edit (goes to review, live keeps serving) */}
      {(isLive || isPaused) && (
        <RowActionItem href={`/products/new?draft=${id}`} icon={PencilLine}>
          Propose an edit
        </RowActionItem>
      )}

      {/* Live: turn off + view in marketplace */}
      {isLive && (
        <>
          <RowActionItem
            icon={PowerOff}
            onSelect={() =>
              run(
                () => pauseProduct(id),
                `“${name}” turned off — hidden from marketplace`,
                `Turn off “${name}”? It disappears from the creator marketplace immediately. Reversible anytime.`,
              )
            }
          >
            Turn off live
          </RowActionItem>
          {marketingUrl && (
            <RowActionItem href={marketingUrl} icon={ExternalLink}>
              View in marketplace
            </RowActionItem>
          )}
        </>
      )}

      {/* Paused: re-list */}
      {isPaused && (
        <RowActionItem
          icon={Power}
          onSelect={() => run(() => resumeProduct(id), `“${name}” is live again`)}
        >
          Re-list (turn back on)
        </RowActionItem>
      )}

      {/* Everyone can start a new product */}
      <RowActionItem href="/products/new" icon={FileStack}>
        Start a new product
      </RowActionItem>

      {/* Cert renewal nudge */}
      {certRefreshNeeded && (
        <RowActionItem href="/certifications" icon={ShieldAlert} danger>
          Renew expired certificate
        </RowActionItem>
      )}

      <RowActionSeparator />
      <RowActionItem href={`/help/new?productId=${id}`} icon={LifeBuoy}>
        Get product support
      </RowActionItem>
      <RowActionItem onSelect={() => copy(id, 'product ID')} icon={Copy}>
        Copy product ID
      </RowActionItem>

      {/* Authoring drafts can be discarded — deletes immediately after confirm */}
      {authoring && (
        <RowActionItem
          icon={Trash2}
          danger
          onSelect={() =>
            run(
              () => deleteDraft(id),
              `“${name}” discarded`,
              `Discard “${name}”? This permanently deletes the draft and can’t be undone.`,
            )
          }
        >
          Discard draft
        </RowActionItem>
      )}
    </RowActionsMenu>
  )
}
