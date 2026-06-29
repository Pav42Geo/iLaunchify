'use client'

// Right-sidebar reviewer panel on the admin product review page.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §8 + #133.
//
// Three sub-panels:
//   1. Decision — Approve / Request changes / Reject / Pause-Resume buttons
//      gated by current status.
//   2. Open checklist — ProductReviewItem rows the partner has to address.
//      Admin can add new items inline when requesting changes.
//   3. Notes thread — bidirectional admin↔partner messaging (ProductNote rows).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@ilaunchify/ui'
import { toast } from 'sonner'
import {
  CheckCircle2,
  MessageCircle,
  Pause,
  Play,
  Plus,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react'
import type { ProductTemplateStatus, NoteAuthor } from '@ilaunchify/db'
import {
  approveProductTemplate,
  requestProductChanges,
  rejectProductTemplate,
  setProductPaused,
  postProductNote,
} from '../actions'

const CATEGORIES = ['ingredients', 'packaging', 'media', 'compliance', 'pricing', 'other']

interface ChecklistItem {
  id: string
  category: string
  description: string
}

interface NoteRow {
  id: string
  authorName: string
  authorType: NoteAuthor
  body: string
  createdAt: Date
}

interface Props {
  productTemplateId: string
  currentStatus: ProductTemplateStatus
  openReviewItems: ChecklistItem[]
  notes: NoteRow[]
}

export function ProductReviewer({
  productTemplateId,
  currentStatus,
  openReviewItems,
  notes,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Request-changes inline composer state
  const [showChecklist, setShowChecklist] = useState(false)
  const [pendingItems, setPendingItems] = useState<Array<{ category: string; description: string }>>(
    [],
  )
  const [newItemCategory, setNewItemCategory] = useState('other')
  const [newItemDescription, setNewItemDescription] = useState('')
  const [generalNote, setGeneralNote] = useState('')

  // Reject form state
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  // Notes composer
  const [noteBody, setNoteBody] = useState('')

  const isPendingStatus =
    currentStatus === 'PENDING_REVIEW' || currentStatus === 'PENDING_EDIT_REVIEW'
  const canApprove =
    isPendingStatus ||
    currentStatus === 'NEEDS_CHANGES' ||
    currentStatus === 'PAUSED' ||
    currentStatus === 'UNDER_REVIEW'
  const canPause = currentStatus === 'PUBLISHED'
  const canResume = currentStatus === 'PAUSED'

  // -------- Actions --------

  function handleApprove() {
    startTransition(async () => {
      const result = await approveProductTemplate(productTemplateId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Published')
      router.refresh()
    })
  }

  function handleRequestChanges() {
    if (pendingItems.length === 0 && !newItemDescription.trim()) {
      toast.error('Add at least one checklist item.')
      return
    }
    // Auto-include the in-progress item if it has content
    const items = newItemDescription.trim()
      ? [...pendingItems, { category: newItemCategory, description: newItemDescription.trim() }]
      : pendingItems

    startTransition(async () => {
      const result = await requestProductChanges({
        productTemplateId,
        items,
        generalNote: generalNote.trim() || undefined,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Sent back to partner with checklist')
      setShowChecklist(false)
      setPendingItems([])
      setNewItemDescription('')
      setGeneralNote('')
      router.refresh()
    })
  }

  function handleReject() {
    if (!rejectReason.trim()) {
      toast.error('Reason required.')
      return
    }
    startTransition(async () => {
      const result = await rejectProductTemplate({
        productTemplateId,
        reason: rejectReason.trim(),
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Rejected')
      setShowRejectForm(false)
      setRejectReason('')
      router.refresh()
    })
  }

  function handlePause(to: 'PAUSED' | 'PUBLISHED') {
    startTransition(async () => {
      const result = await setProductPaused(productTemplateId, to)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(to === 'PAUSED' ? 'Paused' : 'Resumed')
      router.refresh()
    })
  }

  function handlePostNote() {
    if (!noteBody.trim()) return
    startTransition(async () => {
      const result = await postProductNote({
        productTemplateId,
        body: noteBody.trim(),
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Note posted')
      setNoteBody('')
      router.refresh()
    })
  }

  function addItemToList() {
    if (!newItemDescription.trim()) return
    setPendingItems([
      ...pendingItems,
      { category: newItemCategory, description: newItemDescription.trim() },
    ])
    setNewItemDescription('')
  }

  return (
    <div className="space-y-3">
      {/* Decision panel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Decision</CardTitle>
          <CardDescription>
            {isPendingStatus
              ? 'Approve to publish, send back with a checklist, or reject.'
              : currentStatus === 'PUBLISHED'
                ? 'Live in marketplace. You can pause to temporarily hide.'
                : currentStatus === 'NEEDS_CHANGES'
                  ? 'Waiting on the partner. You can short-circuit + publish if items are moot.'
                  : currentStatus === 'DRAFT'
                    ? 'Draft — the partner hasn’t submitted this for review yet.'
                    : currentStatus === 'REJECTED'
                      ? 'Rejected (terminal). The partner must clone to retry.'
                      : 'No actions for this status.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!canApprove && !isPendingStatus && !canPause && !canResume && (
            <p className="rounded-md border border-dashed border-ink-200 bg-ink-50 px-3 py-2 text-ui-caption text-ink-600">
              {currentStatus === 'DRAFT'
                ? 'Nothing to approve yet — this product is still a draft. Once the partner finishes the builder and submits, it moves to “Pending review” and the Approve / Request changes / Reject actions appear here.'
                : currentStatus === 'REJECTED'
                  ? 'This product was rejected (terminal). The partner must clone it to try again.'
                  : currentStatus === 'ARCHIVED'
                    ? 'This product is archived — no review actions.'
                    : 'No review actions are available for this status.'}
            </p>
          )}
          {canApprove && (
            <Button
              onClick={handleApprove}
              disabled={isPending}
              className="w-full bg-success-600 hover:bg-success-700"
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              {currentStatus === 'PAUSED' ? 'Resume + publish' : 'Approve + publish'}
            </Button>
          )}
          {isPendingStatus && (
            <Button
              variant="outline"
              className="w-full border-warning-300 text-warning-700 hover:bg-warning-50"
              onClick={() => setShowChecklist(!showChecklist)}
              disabled={isPending}
            >
              <Send className="mr-1.5 h-4 w-4" />
              {showChecklist ? 'Cancel changes request' : 'Request changes'}
            </Button>
          )}
          {(isPendingStatus || currentStatus === 'NEEDS_CHANGES') && (
            <Button
              variant="outline"
              className="w-full border-danger-300 text-danger-700 hover:bg-danger-50"
              onClick={() => setShowRejectForm(!showRejectForm)}
              disabled={isPending}
            >
              <XCircle className="mr-1.5 h-4 w-4" />
              {showRejectForm ? 'Cancel reject' : 'Reject'}
            </Button>
          )}
          {canPause && (
            <Button
              variant="outline"
              onClick={() => handlePause('PAUSED')}
              disabled={isPending}
              className="w-full"
            >
              <Pause className="mr-1.5 h-4 w-4" /> Pause (hide from marketplace)
            </Button>
          )}
          {canResume && (
            <Button
              onClick={() => handlePause('PUBLISHED')}
              disabled={isPending}
              className="w-full bg-success-600 hover:bg-success-700"
            >
              <Play className="mr-1.5 h-4 w-4" /> Resume
            </Button>
          )}

          {/* Inline reject form */}
          {showRejectForm && (
            <div className="mt-3 space-y-2 rounded-md border border-danger-200 bg-danger-50 p-3">
              <Label className="text-ui-label text-danger-800">
                Rejection reason (shown to partner)
              </Label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
                placeholder='e.g. "Product category is not currently supported on iLaunchify."'
                className="w-full rounded border border-danger-200 bg-white px-2 py-1.5 text-ui-body focus:border-danger-400 focus:outline-none"
                disabled={isPending}
              />
              <Button
                size="sm"
                onClick={handleReject}
                disabled={isPending || !rejectReason.trim()}
                className="w-full bg-danger-600 hover:bg-danger-700"
              >
                Confirm rejection
              </Button>
            </div>
          )}

          {/* Inline request-changes composer */}
          {showChecklist && (
            <div className="mt-3 space-y-3 rounded-md border border-warning-200 bg-warning-50 p-3">
              <div className="text-ui-label text-warning-800">
                Checklist of changes
              </div>

              {pendingItems.length > 0 && (
                <ul className="space-y-1.5">
                  {pendingItems.map((item, i) => (
                    <li
                      key={i}
                      className="flex items-start justify-between gap-2 rounded bg-white px-2 py-1.5 text-ui-body"
                    >
                      <span>
                        <span className="text-ui-label text-warning-700">
                          {item.category}:
                        </span>{' '}
                        {item.description}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setPendingItems(pendingItems.filter((_, idx) => idx !== i))
                        }
                        className="text-ink-400 hover:text-danger-600"
                        aria-label="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-[100px,1fr]">
                  <select
                    value={newItemCategory}
                    onChange={(e) => setNewItemCategory(e.target.value)}
                    className="rounded border border-warning-200 bg-white px-2 py-1.5 text-ui-body focus:border-warning-400 focus:outline-none"
                    disabled={isPending}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={newItemDescription}
                    onChange={(e) => setNewItemDescription(e.target.value)}
                    placeholder="What needs to change?"
                    disabled={isPending}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addItemToList()
                      }
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addItemToList}
                  disabled={!newItemDescription.trim() || isPending}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add item
                </Button>
              </div>

              <div>
                <Label className="text-ui-label text-warning-800">
                  General note (optional)
                </Label>
                <textarea
                  value={generalNote}
                  onChange={(e) => setGeneralNote(e.target.value)}
                  rows={2}
                  placeholder="Anything else the partner should know…"
                  className="mt-1 w-full rounded border border-warning-200 bg-white px-2 py-1.5 text-ui-body focus:border-warning-400 focus:outline-none"
                  disabled={isPending}
                />
              </div>

              <Button
                size="sm"
                onClick={handleRequestChanges}
                disabled={isPending}
                className="w-full bg-warning-500 hover:bg-warning-600"
              >
                {isPending ? 'Sending…' : 'Send to partner'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Open review items (visible regardless of action panel state) */}
      {openReviewItems.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Open items ({openReviewItems.length})</CardTitle>
            <CardDescription>The partner can see these on their /edit page.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {openReviewItems.map((item) => (
                <li key={item.id} className="rounded bg-warning-50 px-2 py-1.5 text-ui-body">
                  <span className="text-ui-label text-warning-700">
                    {item.category}:
                  </span>{' '}
                  {item.description}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Notes thread */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-4 w-4 text-ink-500" />
            Notes
            <span className="text-ui-body text-ink-500">{notes.length}</span>
          </CardTitle>
          <CardDescription>Visible to the partner on their /edit page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {notes.length === 0 ? (
            <p className="rounded border border-dashed border-ink-200 px-3 py-2 text-ui-caption text-ink-500">
              No notes yet. Post the first message below.
            </p>
          ) : (
            <ul className="space-y-2">
              {notes.map((n) => (
                <li
                  key={n.id}
                  className={`rounded-md border px-3 py-2 text-ui-body ${
                    n.authorType === 'ADMIN'
                      ? 'border-success-200 bg-success-50/50'
                      : 'border-ink-200 bg-ink-50'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-ui-label text-ink-500">
                      {n.authorType} · {n.authorName}
                    </span>
                    <span className="text-[10px] text-ink-400">
                      {new Date(n.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-ink-800">{n.body}</p>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-2 border-t border-ink-100 pt-3">
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={2}
              placeholder="Post a note to the partner…"
              className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-ui-body focus:border-ink-400 focus:outline-none"
              disabled={isPending}
            />
            <Button
              size="sm"
              onClick={handlePostNote}
              disabled={isPending || !noteBody.trim()}
              className="w-full"
            >
              <Send className="mr-1.5 h-3.5 w-3.5" /> Post note
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
