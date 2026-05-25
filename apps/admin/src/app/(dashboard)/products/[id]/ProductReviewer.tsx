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
import type { ProductTemplateStatus, NoteAuthor } from '@prisma/client'
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
                  : 'No actions for this status.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {canApprove && (
            <Button
              onClick={handleApprove}
              disabled={isPending}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              {currentStatus === 'PAUSED' ? 'Resume + publish' : 'Approve + publish'}
            </Button>
          )}
          {isPendingStatus && (
            <Button
              variant="outline"
              className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
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
              className="w-full border-red-300 text-red-700 hover:bg-red-50"
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
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              <Play className="mr-1.5 h-4 w-4" /> Resume
            </Button>
          )}

          {/* Inline reject form */}
          {showRejectForm && (
            <div className="mt-3 space-y-2 rounded-md border border-red-200 bg-red-50 p-3">
              <Label className="text-xs font-medium uppercase tracking-wider text-red-800">
                Rejection reason (shown to partner)
              </Label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
                placeholder='e.g. "Product category is not currently supported on iLaunchify."'
                className="w-full rounded border border-red-200 bg-white px-2 py-1.5 text-sm focus:border-red-400 focus:outline-none"
                disabled={isPending}
              />
              <Button
                size="sm"
                onClick={handleReject}
                disabled={isPending || !rejectReason.trim()}
                className="w-full bg-red-600 hover:bg-red-700"
              >
                Confirm rejection
              </Button>
            </div>
          )}

          {/* Inline request-changes composer */}
          {showChecklist && (
            <div className="mt-3 space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs font-medium uppercase tracking-wider text-amber-800">
                Checklist of changes
              </div>

              {pendingItems.length > 0 && (
                <ul className="space-y-1.5">
                  {pendingItems.map((item, i) => (
                    <li
                      key={i}
                      className="flex items-start justify-between gap-2 rounded bg-white px-2 py-1.5 text-sm"
                    >
                      <span>
                        <span className="text-xs font-semibold uppercase text-amber-700">
                          {item.category}:
                        </span>{' '}
                        {item.description}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setPendingItems(pendingItems.filter((_, idx) => idx !== i))
                        }
                        className="text-zinc-400 hover:text-red-600"
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
                    className="rounded border border-amber-200 bg-white px-2 py-1.5 text-sm focus:border-amber-400 focus:outline-none"
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
                <Label className="text-xs font-medium uppercase tracking-wider text-amber-800">
                  General note (optional)
                </Label>
                <textarea
                  value={generalNote}
                  onChange={(e) => setGeneralNote(e.target.value)}
                  rows={2}
                  placeholder="Anything else the partner should know…"
                  className="mt-1 w-full rounded border border-amber-200 bg-white px-2 py-1.5 text-sm focus:border-amber-400 focus:outline-none"
                  disabled={isPending}
                />
              </div>

              <Button
                size="sm"
                onClick={handleRequestChanges}
                disabled={isPending}
                className="w-full bg-amber-500 hover:bg-amber-600"
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
                <li key={item.id} className="rounded bg-amber-50 px-2 py-1.5 text-sm">
                  <span className="text-xs font-semibold uppercase text-amber-700">
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
            <MessageCircle className="h-4 w-4 text-zinc-500" />
            Notes
            <span className="text-sm font-normal text-zinc-500">{notes.length}</span>
          </CardTitle>
          <CardDescription>Visible to the partner on their /edit page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {notes.length === 0 ? (
            <p className="rounded border border-dashed border-zinc-200 px-3 py-2 text-xs text-zinc-500">
              No notes yet. Post the first message below.
            </p>
          ) : (
            <ul className="space-y-2">
              {notes.map((n) => (
                <li
                  key={n.id}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    n.authorType === 'ADMIN'
                      ? 'border-emerald-200 bg-emerald-50/50'
                      : 'border-zinc-200 bg-zinc-50'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      {n.authorType} · {n.authorName}
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      {new Date(n.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-zinc-800">{n.body}</p>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-2 border-t border-zinc-100 pt-3">
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={2}
              placeholder="Post a note to the partner…"
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
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
