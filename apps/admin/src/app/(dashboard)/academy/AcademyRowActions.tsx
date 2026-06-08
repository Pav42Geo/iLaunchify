'use client'

// Admin Academy 3-dot row actions (v2 pattern). Deep-links to the editor
// (Phase C) + audit history; never inline-mutates. One component for all three
// entity types — the `entity` prop picks the editor route + audit entityType.

import { useRouter } from 'next/navigation'
import { Pencil, History, Copy, ExternalLink } from 'lucide-react'
import {
  RowActionsMenu,
  RowActionItem,
  RowActionSeparator,
  RowActionLabel,
  RowActionSubMenu,
} from '@ilaunchify/ui'

type AcademyEntity = 'course' | 'lesson' | 'category'

const AUDIT_ENTITY: Record<AcademyEntity, string> = {
  course: 'AcademyCourse',
  lesson: 'AcademyLesson',
  category: 'AcademyCategory',
}

// Editor routes (Phase C). Categories are managed on the list itself, so they
// have no separate editor route.
function editorHref(entity: AcademyEntity, id: string): string | null {
  if (entity === 'course') return `/academy/courses/${id}/edit`
  if (entity === 'lesson') return `/academy/lessons/${id}/edit`
  return null
}

export function AcademyRowActions({
  entity,
  id,
  title,
  slug,
}: {
  entity: AcademyEntity
  id: string
  title: string
  slug: string
}) {
  const router = useRouter()
  const edit = editorHref(entity, id)

  function copy(value: string, what: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(value).catch(() => window.prompt(`Copy ${what}:`, value))
    } else {
      window.prompt(`Copy ${what}:`, value)
    }
  }

  const auditHref = `/audit?entityType=${AUDIT_ENTITY[entity]}&entityId=${id}`

  return (
    <RowActionsMenu label={`Actions for ${title}`}>
      <RowActionLabel>{title}</RowActionLabel>
      {edit && (
        <RowActionItem href={edit} icon={Pencil}>
          Open editor
        </RowActionItem>
      )}
      <RowActionItem onSelect={() => router.push(auditHref)} icon={History}>
        Audit history
      </RowActionItem>
      <RowActionSeparator />
      <RowActionSubMenu label="More" icon={Copy}>
        <RowActionItem onSelect={() => copy(id, 'ID')} icon={Copy}>
          Copy ID
        </RowActionItem>
        <RowActionItem onSelect={() => copy(slug, 'slug')} icon={Copy}>
          Copy slug
        </RowActionItem>
        <RowActionItem href={auditHref} icon={ExternalLink}>
          View in audit log
        </RowActionItem>
      </RowActionSubMenu>
    </RowActionsMenu>
  )
}
