'use client'

// Co-creation Collaboration Room shell — PRESENTATIONAL-ONLY, shared by the
// creator and partner apps via a `mode` prop (same pattern as
// PackagingStudioShell). UX contract: design/co-creation-demo.html screens
// ④/⑤/⑥ matched 1:1 with the token system (Pavel 2026-07-10) — dark room top
// bar, object rail + milestone strip, versioned detail with per-line threads,
// LABEL pin-proofing board, decision-log rail, messages.
//
// All mutations arrive as async callbacks (server-action wrappers owned by
// the rendering app, which also owns membership guards + revalidation). Copy
// rule: "milestone payment protection", never "escrow" (Stripe posture).

import * as React from 'react'
import Link from 'next/link'
import type { PanelData } from '@ilaunchify/types'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
import { Textarea } from '../primitives/textarea'
import { Checkbox } from '../primitives/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../primitives/dialog'
import { cn } from '../lib/utils'
import { productGradient, type ProductGradient } from '../tokens/colors'
// Print-grade, CSS-immune label artifacts — the platform's single source of
// truth for how regulated labels LOOK (21 CFR 101.9(d) / INCI / AAFCO). The
// room previews the same artifacts the product builder and label download use.
import { checkRoomLabelReadiness } from '../lib/room-compliance'
import {
  SAMPLE_CARRIERS,
  CARRIER_LABELS,
  carrierTrackingUrl,
  sampleShipmentFromPayload,
  type SampleCarrier,
} from '../lib/sample-shipment'
import { NutritionFactsSvg } from '../nutrition/NutritionFactsSvg'
import { SupplementFactsSvg } from '../nutrition/SupplementFactsSvg'
import { InciDeclarationSvg } from '../nutrition/InciDeclarationSvg'
import { GuaranteedAnalysisSvg } from '../nutrition/GuaranteedAnalysisSvg'
import { DrugFactsSvg } from '../nutrition/DrugFactsSvg'
import { formatNetQuantity } from '../canvas/netQuantity'

// ---------------------------------------------------------------------------
// Data shapes (serialized by the server page — no Prisma types cross here)
// ---------------------------------------------------------------------------

export interface RoomObjectVersion {
  version: number
  /** { rows: [{name, amount, note}] } for RECIPE; { fields: [{label, value}] } otherwise. */
  payload: unknown
  submittedByPartner: boolean
  createdAt: string
}

export interface RoomObjectComment {
  id: string
  anchor: string | null
  authorRole: string // CREATOR | PARTNER
  body: string
  createdAt: string
}

export interface RoomShellObject {
  id: string
  kind: string // RECIPE | LABEL | PACKAGING | SAMPLE | SPEC_SHEET
  status: string // BuildObjectStatus
  currentVersion: number
  versions: RoomObjectVersion[]
  comments: RoomObjectComment[]
}

export interface RoomShellMilestone {
  id: string
  kind: string
  status: string
  /** Dollar amount as a decimal string ("450.00"); "0" while terms are unset. */
  amount: string
  /** UNSET | PROPOSED | AGREED — negotiation stage within PENDING. */
  termsStatus: string
  termsNote: string | null
}

export interface RoomShellEvent {
  id: string
  kind: string
  data: Record<string, unknown>
  createdAt: string
}

export interface RoomShellMessage {
  id: string
  authorRole: string
  body: string
  createdAt: string
}

type Result = { ok: boolean; error?: string }

export interface CoCreationRoomShellProps {
  mode: 'creator' | 'partner'
  briefTitle: string
  creatorName: string
  partnerName: string
  ndaSigned: boolean
  /** Niche gradient key for artwork surfaces (label proof, header avatar). */
  accentGradient?: ProductGradient
  objects: RoomShellObject[]
  /** Deep-link target (?object=<id> from a chat object card) — selects this
   *  build object on first render when it belongs to the room. */
  initialObjectId?: string
  milestones: RoomShellMilestone[]
  events: RoomShellEvent[]
  messages: RoomShellMessage[]
  onSubmitVersion: (objectId: string, payload: Record<string, unknown>) => Promise<Result>
  onReview: (objectId: string, decision: 'APPROVE' | 'REQUEST_CHANGES', note?: string) => Promise<Result>
  onReopen: (objectId: string) => Promise<Result>
  onComment: (objectId: string, body: string, anchor?: string) => Promise<Result>
  onMessage: (body: string) => Promise<Result>
  /** Creator-only: recipe approved + room active → offer "confirm & create product". */
  canCloseWon?: boolean
  onCloseWon?: () => Promise<Result>
  /** Creator-only (D-CC3): switch to a different maker — policy + cutoffs
      enforced server-side; this only shows the entry point. */
  canSwitchMaker?: boolean
  onSwitchMaker?: () => Promise<Result>
  /** P1 two-sided reviews: shown when the room is CLOSED_WON. Each side
      rates its counterpart on its own dimension set; server owns the guards. */
  rating?: {
    counterpartName: string
    dimensions: { slug: string; label: string; sublabel: string }[]
    /** This viewer's existing rating, if any (pre-fills; edit-window server-side). */
    mine: { dimensions: Record<string, number>; comment: string | null } | null
  }
  onRateCounterpart?: (scores: Record<string, number>, comment?: string) => Promise<Result>
  /** P1 dispute surface — opens a support ticket linked to this room; the
      caller navigates to the ticket on success. */
  onOpenDispute?: (description: string) => Promise<Result>
  /** Milestone terms negotiation — maker proposes, creator agrees/declines.
      Funding stays gated on payments verification (no fund action here). */
  onProposeMilestoneTerms?: (milestoneId: string, amount: number, note?: string) => Promise<Result>
  onAgreeMilestoneTerms?: (milestoneId: string) => Promise<Result>
  onDeclineMilestoneTerms?: (milestoneId: string) => Promise<Result>
  /** Fill the viewport below the page chrome; columns scroll internally (lg+). */
  fullScreen?: boolean
  /** All of this user's active rooms (incl. the current one) — the title
      becomes a switcher dropdown when there's more than one. */
  rooms?: RoomSwitcherEntry[]
  /** Live domain-aware label bundles, one per recipe version (unresolvable
      versions omitted) — the facts sidebar follows the viewed version and
      the compare view diffs the two labels. */
  recipeLabels?: { version: number; label: RoomRecipeLabelView }[]
  /** Partner-side: catalog search for pinning ingredient matches in the
      recipe draft editor (visibility scoping lives in the server action). */
  onSearchIngredients?: (query: string) => Promise<IngredientPick[]>
  /** Brief's product domain (FOOD / BEVERAGE_FUNCTIONAL / SUPPLEMENT / COSMETIC
      / PET) — drives domain-specific recipe editor sections. */
  briefDomain?: string
  /** Partner-side: create a partner-private catalog ingredient from the match
      picker (banned-list gate + audit live in the server action). */
  onCreateIngredient?: (input: IngredientCreateInput) => Promise<
    { ok: true; ingredient: IngredientPick } | { ok: false; error: string }
  >
}

/** One catalog candidate in the recipe-row match picker. */
export interface IngredientPick {
  id: string
  name: string
  declarationName: string
  source: string
  allergenFlags: string[]
}

/** Inputs for creating a partner-private ingredient from the room. */
export interface IngredientCreateInput {
  internalName: string
  labelDeclarationName: string
  allergenFlags: string[]
  densityGPerML: number | null
}

/** FALCPA Big-9 for the create form's allergen multiselect. */
const BIG9_ALLERGENS = [
  'milk',
  'eggs',
  'fish',
  'shellfish',
  'tree_nuts',
  'peanuts',
  'wheat',
  'soybeans',
  'sesame',
] as const

/** Serialized label bundle (structural mirror of @ilaunchify/orders' RoomRecipeLabel). */
export interface RoomRecipeLabelView {
  domain: string
  rows: {
    name: string
    amount: string
    note: string
    grams: number | null
    ingredientId: string | null
    declarationName: string | null
    source: string | null
  }[]
  coverage: { resolved: number; total: number; unresolvedNames: string[] }
  serving: {
    sizeG: number | null
    sizeDesc: string | null
    perContainer: number | null
    netQuantity: {
      kind: 'solid' | 'liquid' | 'count'
      grams?: number
      milliliters?: number
      count?: number
      countUnit?: string
    } | null
  }
  panel: PanelData | null
  statement: string | null
  containsLine: string | null
  containsIncomplete: boolean
  inciText: string | null
  petOrder: string[] | null
  /** SUPPLEMENT: "Other ingredients:" items rendered below the box. */
  otherIngredients: string[] | null
  /** PET: maker-entered Guaranteed Analysis (lab results, never computed). */
  petGa: {
    rows: { label: string; value: string }[]
    adequacyStatement: string | null
    feedingDirections: string | null
  } | null
  /** OTC: maker-entered Drug Facts (21 CFR 201.66), carried verbatim.
      Dormant until the admin enables the OTC domain toggle. */
  drugFacts: {
    activeIngredients: { name: string; purpose: string }[]
    uses: string[]
    warnings: { text: string; bold?: boolean }[]
    directions: string
    otherInformation?: string[]
    inactiveIngredients: string
    questions?: string
  } | null
}

export interface RoomSwitcherEntry {
  id: string
  title: string
  counterpartName: string
  /** e.g. "recipe v2 in review" — derived by the page from the RECIPE object. */
  statusLine: string
  /** Chip text when this room needs the viewer's action (e.g. "your review"). */
  attention: string | null
  icon: string
  gradientKey: ProductGradient
  href: string
}

// ---------------------------------------------------------------------------

const OBJECT_META: Record<string, { icon: string; name: string }> = {
  RECIPE: { icon: '🧪', name: 'Recipe / formula' },
  LABEL: { icon: '🏷️', name: 'Label' },
  PACKAGING: { icon: '📦', name: 'Packaging' },
  SAMPLE: { icon: '🧾', name: 'Sample & spec' },
  SPEC_SHEET: { icon: '📄', name: 'Spec sheet' },
}

/** Canonical rail order (Pavel 2026-07-10) — independent of DB insertion order. */
const OBJECT_KIND_ORDER = ['RECIPE', 'PACKAGING', 'LABEL', 'SAMPLE', 'SPEC_SHEET'] as const
function kindRank(kind: string): number {
  const i = (OBJECT_KIND_ORDER as readonly string[]).indexOf(kind)
  return i === -1 ? OBJECT_KIND_ORDER.length : i
}

/** Demo status pills (.p-*) on token ramps. */
const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-ink-100 text-ink-600' },
  SUBMITTED: { label: 'Submitted', cls: 'bg-info-50 text-info-700' },
  IN_REVIEW: { label: 'Needs review', cls: 'bg-warning-50 text-warning-700' },
  CHANGES_REQUESTED: { label: 'Changes requested', cls: 'bg-danger-50 text-danger-700' },
  APPROVED: { label: 'Approved', cls: 'bg-success-50 text-success-700' },
  LOCKED: { label: 'Locked', cls: 'bg-success-50 text-success-700' },
}

const MILESTONE_LABEL: Record<string, string> = {
  DISCOVERY: 'Discovery',
  SAMPLE: 'Sample',
  TOOLING: 'Tooling',
  PRODUCTION: 'Production',
}

/** Activity dot color per event kind (demo .act .d variants). */
function eventDotCls(kind: string): string {
  switch (kind) {
    case 'OBJECT_APPROVED':
    case 'ROOM_CLOSED_WON':
      return 'bg-success-500'
    case 'OBJECT_SUBMITTED':
      return 'bg-ink-900'
    case 'OBJECT_CHANGES_REQUESTED':
    case 'OBJECT_REOPENED':
    case 'MILESTONE_TERMS_DECLINED':
      return 'bg-warning-500'
    case 'ROOM_DISPUTE_OPENED':
      return 'bg-danger-500'
    case 'MILESTONE_TERMS_PROPOSED':
      return 'bg-ink-900'
    case 'MILESTONE_TERMS_AGREED':
      return 'bg-success-500'
    case 'COMMENT_ADDED':
      return 'bg-pink-500'
    default:
      return 'bg-ink-400'
  }
}

interface RecipeRow {
  name: string
  amount: string
  note: string
  /** Pinned catalog match — preserved across resubmits. */
  ingredientId?: string
}

function recipeRows(payload: unknown): RecipeRow[] {
  if (payload && typeof payload === 'object' && Array.isArray((payload as { rows?: unknown }).rows)) {
    return ((payload as { rows: unknown[] }).rows as Partial<RecipeRow>[]).map((r) => ({
      name: String(r.name ?? ''),
      amount: String(r.amount ?? ''),
      note: String(r.note ?? ''),
      ...(r.ingredientId ? { ingredientId: String(r.ingredientId) } : {}),
    }))
  }
  return []
}

/** Ingredient.source → resolution chip label. */
function sourceChipLabel(source: string | null): string {
  switch (source) {
    case 'USDA':
      return 'USDA'
    case 'PARTNER_PRIVATE':
      return "Maker's own"
    default:
      return 'Catalog'
  }
}

interface FieldRow {
  label: string
  value: string
}

function fieldRows(payload: unknown): FieldRow[] {
  if (payload && typeof payload === 'object' && Array.isArray((payload as { fields?: unknown }).fields)) {
    return ((payload as { fields: unknown[] }).fields as Partial<FieldRow>[]).map((f) => ({
      label: String(f.label ?? ''),
      value: String(f.value ?? ''),
    }))
  }
  return []
}

/** Label pin anchors are "x,y" viewport percentages. */
const PIN_ANCHOR = /^(\d{1,3}),(\d{1,3})$/

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)}d ago`
}

// Exported: MessagesShell interleaves the same decision-log copy as system
// chips in the chat stream (Rooms & Messages, 2026-07-13) — one vocabulary.
export function eventText(e: RoomShellEvent): string {
  const by = typeof e.data.by === 'string' ? e.data.by : 'Someone'
  const kind =
    typeof e.data.objectKind === 'string' ? (OBJECT_META[e.data.objectKind]?.name ?? e.data.objectKind) : ''
  const v = typeof e.data.version === 'number' ? ` v${e.data.version}` : ''
  switch (e.kind) {
    case 'ROOM_CREATED':
      return 'Room created — private workspace initialized.'
    case 'ROOM_CLOSED_WON':
      return 'Room closed — recipe materialized into a draft product.'
    case 'ROOM_CLOSED_SWITCHED':
      return `${by} switched makers — room archived, shortlist re-opened.`
    case 'ROOM_DISPUTE_OPENED':
      return `${by} opened a dispute — an admin will mediate (decision log is the evidence trail).`
    case 'OBJECT_SUBMITTED':
      return `${by} submitted ${kind}${v} for review.`
    case 'OBJECT_APPROVED':
      return `${by} approved ${kind}${v}.`
    case 'OBJECT_CHANGES_REQUESTED':
      return `${by} requested changes on ${kind}${v}.`
    case 'OBJECT_REOPENED':
      return `${by} re-opened ${kind}.`
    case 'COMMENT_ADDED':
      return `${by} commented on ${kind}.`
    case 'MILESTONE_TERMS_PROPOSED': {
      const mk = typeof e.data.milestoneKind === 'string' ? (MILESTONE_LABEL[e.data.milestoneKind] ?? e.data.milestoneKind) : 'milestone'
      const amt = typeof e.data.amount === 'string' ? ` — $${e.data.amount}` : ''
      return `${by} proposed ${mk} terms${amt}.`
    }
    case 'MILESTONE_TERMS_AGREED': {
      const mk = typeof e.data.milestoneKind === 'string' ? (MILESTONE_LABEL[e.data.milestoneKind] ?? e.data.milestoneKind) : 'milestone'
      return `${by} agreed to the ${mk} terms.`
    }
    case 'MILESTONE_TERMS_DECLINED': {
      const mk = typeof e.data.milestoneKind === 'string' ? (MILESTONE_LABEL[e.data.milestoneKind] ?? e.data.milestoneKind) : 'milestone'
      return `${by} declined the ${mk} proposal.`
    }
    default:
      return e.kind.replaceAll('_', ' ').toLowerCase()
  }
}

/** Author avatar — demo .cav (creator = pink, maker = ink-900 with neon ring). */
function AuthorAvatar({ role, className }: { role: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'h-6 w-6 flex-none rounded-pill',
        role === 'CREATOR' ? 'bg-pink-500' : 'bg-ink-900 shadow-[inset_0_0_0_2px_var(--neon-500,#B5FF3D)]',
        className,
      )}
    />
  )
}

// ---------------------------------------------------------------------------

export function CoCreationRoomShell(props: CoCreationRoomShellProps) {
  const { mode, fullScreen } = props
  const objects = React.useMemo(
    () => [...props.objects].sort((a, b) => kindRank(a.kind) - kindRank(b.kind)),
    [props.objects],
  )
  // Deep link from a chat object card (?object=<id>) selects that build
  // object on arrival (Rooms & Messages, Pavel 2026-07-13); falls back to the
  // first object when the id is stale/foreign.
  const [selectedId, setSelectedId] = React.useState(() =>
    props.initialObjectId && objects.some((o) => o.id === props.initialObjectId)
      ? props.initialObjectId
      : (objects[0]?.id ?? ''),
  )
  const [rightTab, setRightTab] = React.useState<'activity' | 'messages'>('activity')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  /** Milestone row whose terms panel is expanded. */
  const [openMilestone, setOpenMilestone] = React.useState<string | null>(null)
  const selected = objects.find((o) => o.id === selectedId) ?? objects[0]

  // fullScreen: size the shell to the viewport remainder by MEASURING its own
  // offset (header/stepper heights are theme-variable — no magic numbers).
  // Desktop only; small screens keep natural stacking + page scroll.
  const rootRef = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    if (!fullScreen) return
    const el = rootRef.current
    if (!el) return
    const update = () => {
      if (window.matchMedia('(min-width: 1024px)').matches) {
        el.style.height = `${window.innerHeight - el.getBoundingClientRect().top}px`
      } else {
        el.style.height = ''
      }
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [fullScreen])

  async function run(fn: () => Promise<Result>) {
    setBusy(true)
    setError(null)
    const res = await fn()
    if (!res.ok) setError(res.error ?? 'Something went wrong')
    setBusy(false)
  }

  const released = props.milestones.filter((m) => m.status === 'RELEASED').length
  const meName = mode === 'creator' ? props.creatorName : props.partnerName
  const gradient = productGradient[props.accentGradient ?? 'pink']

  return (
    <div
      ref={rootRef}
      className={cn(
        'bg-white',
        fullScreen
          ? 'flex flex-col overflow-hidden border-b border-ink-200'
          : 'overflow-hidden rounded-xl border border-ink-200 shadow-sm',
      )}
    >
      {/* Room top bar — WHITE variant (Pavel 2026-07-10; was demo's dark
          .roomtop). Neon is dark-surface-only, so status dots use the
          semantic ramps here. Sits flush against the stepper. */}
      <div className="flex flex-wrap items-center gap-s-3 border-b border-ink-200 bg-white px-s-4 py-s-3">
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-md text-ui-subhead"
          style={{ background: gradient }}
        >
          {props.rooms?.find((r) => r.title === props.briefTitle)?.icon ?? '🥤'}
        </span>
        <div>
          <RoomSwitcher mode={mode} title={props.briefTitle} rooms={props.rooms ?? []} />
          <span className="text-ui-label normal-case tracking-normal text-ink-500">
            {props.creatorName} × {props.partnerName} · viewing as {meName} (
            {mode === 'creator' ? 'Creator' : 'Manufacturer'})
          </span>
        </div>
        <span className="flex-1" />
        <span className="inline-flex items-center gap-s-1 rounded-pill border border-ink-200 bg-ink-50 px-s-3 py-s-1 text-ui-label normal-case tracking-normal text-ink-700">
          <span
            aria-hidden
            className={cn('h-2 w-2 rounded-pill', props.ndaSigned ? 'bg-success-500' : 'bg-warning-500')}
          />
          {props.ndaSigned ? 'NDA signed' : 'NDA pending — with counsel'}
        </span>
        <span className="rounded-pill border border-ink-200 bg-ink-50 px-s-3 py-s-1 text-ui-label normal-case tracking-normal text-ink-700">
          🔒 IP: Creator-owned
        </span>
        {mode === 'creator' && props.canSwitchMaker && props.onSwitchMaker ? (
          <SwitchMakerControl
            partnerName={props.partnerName}
            busy={busy}
            onConfirm={() => void run(props.onSwitchMaker!)}
          />
        ) : null}
      </div>

      {error ? (
        <p className="border-b border-danger-100 bg-danger-50 px-s-4 py-s-2 text-ui-caption text-danger-700" role="alert">
          {error}
        </p>
      ) : null}

      {props.onOpenDispute ? (
        <RoomDisputeControl
          counterpartName={mode === 'creator' ? props.partnerName : props.creatorName}
          busy={busy}
          onSubmit={(description) => run(() => props.onOpenDispute!(description))}
        />
      ) : null}

      {props.rating && props.onRateCounterpart ? (
        <RoomRatingCard
          rating={props.rating}
          busy={busy}
          onSubmit={(scores, comment) => run(() => props.onRateCounterpart!(scores, comment))}
        />
      ) : null}

      {mode === 'creator' && props.canCloseWon && props.onCloseWon ? (
        <div className="flex flex-wrap items-center gap-s-3 border-b border-pink-200 bg-pink-50 px-s-4 py-s-3">
          <div className="text-ui-caption text-pink-700">
            <b>Recipe approved.</b> Closing the room creates your draft product with this formula —
            you finish packaging and place the production order from your products page.
          </div>
          <span className="flex-1" />
          <Button variant="primary" size="sm" disabled={busy} onClick={() => run(props.onCloseWon!)}>
            {busy ? 'Creating…' : '✓ Confirm & create product →'}
          </Button>
        </div>
      ) : null}

      {/* 3-column body (demo .roombody 250/1fr/290) */}
      <div className={cn('grid lg:grid-cols-[250px_1fr_290px]', fullScreen && 'min-h-0 flex-1')}>
        {/* Left rail — objects + payment-protection strip */}
        <div className={cn('flex flex-col border-b border-ink-200 lg:border-b-0 lg:border-r', fullScreen && 'lg:min-h-0 lg:overflow-y-auto')}>
          <div className="border-b border-ink-100 px-s-4 py-s-3 text-ui-label uppercase text-ink-500">
            Build objects
          </div>
          {objects.map((o) => {
            const meta = OBJECT_META[o.kind] ?? { icon: '▫️', name: o.kind }
            const pill = STATUS_PILL[o.status] ?? STATUS_PILL.DRAFT!
            const sel = selected?.id === o.id
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setSelectedId(o.id)}
                className={cn(
                  'relative flex items-center gap-s-3 border-b border-ink-100 px-s-4 py-s-3 text-left transition',
                  sel ? 'bg-pink-50' : 'hover:bg-ink-50',
                )}
              >
                {sel ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-pink-500" /> : null}
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-ink-100 text-ui-subhead">
                  {meta.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-ui-caption font-bold">{meta.name}</b>
                  <span className="text-ui-label normal-case tracking-normal text-ink-500">
                    v{o.currentVersion}
                    {o.comments.length ? ` · ${o.comments.length} comments` : ''}
                  </span>
                </span>
                <span className={cn('rounded-pill px-s-2 py-0.5 text-ui-label tracking-normal', pill.cls)}>
                  {pill.label}
                </span>
              </button>
            )
          })}

          <div className="mt-auto border-t border-ink-100 bg-ink-50 px-s-4 py-s-3">
            <div className="flex justify-between text-ui-caption">
              <b>Milestones · payment protection</b>
              <span className="text-ink-500">
                {released} / {props.milestones.length} released
              </span>
            </div>
            <div className="my-s-2 h-1.5 overflow-hidden rounded-pill bg-ink-200">
              <div
                className="h-full rounded-pill bg-success-500"
                style={{ width: `${props.milestones.length ? (released / props.milestones.length) * 100 : 0}%` }}
              />
            </div>
            {props.milestones.map((m) => (
              <MilestoneTermsRow
                key={m.id}
                milestone={m}
                mode={mode}
                busy={busy}
                open={openMilestone === m.id}
                onToggle={() => setOpenMilestone(openMilestone === m.id ? null : m.id)}
                onPropose={
                  props.onProposeMilestoneTerms
                    ? (amount, note) => run(() => props.onProposeMilestoneTerms!(m.id, amount, note))
                    : undefined
                }
                onAgree={
                  props.onAgreeMilestoneTerms
                    ? () => run(() => props.onAgreeMilestoneTerms!(m.id))
                    : undefined
                }
                onDecline={
                  props.onDeclineMilestoneTerms
                    ? () => run(() => props.onDeclineMilestoneTerms!(m.id))
                    : undefined
                }
              />
            ))}
          </div>
        </div>

        {/* Center — object detail on ink-50 canvas */}
        <div className={cn('flex min-h-[420px] flex-col border-b border-ink-200 bg-ink-50 lg:border-b-0 lg:border-r', fullScreen && 'lg:min-h-0')}>
          {selected ? (
            <ObjectDetail
              key={selected.id}
              object={selected}
              mode={mode}
              meName={meName}
              busy={busy}
              gradient={gradient}
              briefTitle={props.briefTitle}
              partnerName={props.partnerName}
              recipeLabels={props.recipeLabels ?? []}
              onSearchIngredients={props.onSearchIngredients}
              onCreateIngredient={props.onCreateIngredient}
              briefDomain={props.briefDomain}
              onSubmitVersion={(payload) => run(() => props.onSubmitVersion(selected.id, payload))}
              onReview={(d, note) => run(() => props.onReview(selected.id, d, note))}
              onReopen={() => run(() => props.onReopen(selected.id))}
              onComment={(body, anchor) => run(() => props.onComment(selected.id, body, anchor))}
            />
          ) : (
            <p className="p-s-5 text-ui-caption text-ink-500">No objects in this room yet.</p>
          )}
        </div>

        {/* Right rail — activity / messages (demo .rtab/.feed2) */}
        <div className={cn('flex min-h-[420px] flex-col', fullScreen && 'lg:min-h-0')}>
          <div className="flex border-b border-ink-100">
            {(
              [
                ['activity', 'Activity log'],
                ['messages', 'Messages'],
              ] as const
            ).map(([t, label]) => (
              <button
                key={t}
                type="button"
                onClick={() => setRightTab(t)}
                className={cn(
                  'flex-1 border-b-2 py-s-3 text-ui-caption font-bold transition',
                  rightTab === t ? 'border-pink-500 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-900',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {rightTab === 'activity' ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-s-4">
              {props.events.length === 0 ? (
                <p className="text-ui-caption text-ink-500">Decisions and submissions log here.</p>
              ) : (
                props.events.map((e, i) => (
                  <div key={e.id} className="flex gap-s-2">
                    <span className="flex flex-col items-center">
                      <span aria-hidden className={cn('mt-s-1 h-2 w-2 rounded-pill', eventDotCls(e.kind))} />
                      {i < props.events.length - 1 ? (
                        <span aria-hidden className="mt-s-1 w-0.5 flex-1 bg-ink-200" />
                      ) : null}
                    </span>
                    <div className="pb-s-3">
                      <div className="text-ui-caption">{eventText(e)}</div>
                      <div className="text-ui-label normal-case tracking-normal text-ink-400">{timeAgo(e.createdAt)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <MessagesRail
              messages={props.messages}
              mode={mode}
              creatorName={props.creatorName}
              partnerName={props.partnerName}
              busy={busy}
              onSend={(body) => run(() => props.onMessage(body))}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Room switcher — the title opens a dropdown of the user's active rooms
// (Pavel 2026-07-10, mockup-approved). Renders a plain title with 0–1 rooms.
// ---------------------------------------------------------------------------

function RoomSwitcher({
  mode,
  title,
  rooms,
}: {
  mode: 'creator' | 'partner'
  title: string
  rooms: RoomSwitcherEntry[]
}) {
  const [open, setOpen] = React.useState(false)
  const wrapRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  if (rooms.length < 2) {
    return <b className="block text-ui-value">{title}</b>
  }

  const footer =
    mode === 'creator'
      ? { label: 'All briefs →', href: '/briefs' }
      : { label: 'My interests →', href: '/opportunities?tab=mine' }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-s-1 rounded-md text-ui-value font-bold transition hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
      >
        {title}
        <span aria-hidden className={cn('text-ink-400 transition-transform', open && 'rotate-180')}>
          ⌄
        </span>
        <span className="rounded-pill bg-pink-50 px-s-2 py-0.5 text-ui-label tracking-normal text-pink-700">
          {rooms.length} rooms
        </span>
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Your active rooms"
          className="absolute left-0 top-full z-30 mt-s-1 w-80 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-lg"
        >
          <p className="px-s-3 pb-s-1 pt-s-2 text-ui-label uppercase text-ink-500">Your active rooms</p>
          {rooms.map((r) => {
            const current = r.title === title
            return (
              <Link
                key={r.id}
                href={r.href}
                role="option"
                aria-selected={current}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-s-2 border-t border-ink-100 px-s-3 py-s-2 transition',
                  current ? 'bg-pink-50' : 'hover:bg-ink-50',
                )}
              >
                <span
                  aria-hidden
                  className="flex h-7 w-7 flex-none items-center justify-center rounded-md text-ui-caption"
                  style={{ background: productGradient[r.gradientKey] }}
                >
                  {r.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-ui-caption font-bold', current && 'text-pink-800')}>
                    {r.title}
                  </span>
                  <span className={cn('block truncate text-ui-label normal-case tracking-normal', current ? 'text-pink-700' : 'text-ink-500')}>
                    {r.counterpartName} · {r.statusLine}
                  </span>
                </span>
                {current ? (
                  <span aria-hidden className="text-ui-caption text-pink-700">✓</span>
                ) : r.attention ? (
                  <span className="inline-flex flex-none items-center gap-s-1 rounded-pill bg-warning-50 px-s-2 py-0.5 text-ui-label tracking-normal text-warning-700">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-pill bg-warning-500" />
                    {r.attention}
                  </span>
                ) : null}
              </Link>
            )
          })}
          <div className="border-t border-ink-100 px-s-3 py-s-2">
            <Link
              href={footer.href}
              onClick={() => setOpen(false)}
              className="text-ui-caption font-bold text-pink-700 hover:underline"
            >
              {footer.label}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Object detail (versions, comments, pin board, role-aware actions)
// ---------------------------------------------------------------------------

function ObjectDetail({
  object,
  mode,
  meName,
  busy,
  gradient,
  briefTitle,
  partnerName,
  recipeLabels,
  onSearchIngredients,
  onCreateIngredient,
  briefDomain,
  onSubmitVersion,
  onReview,
  onReopen,
  onComment,
}: {
  object: RoomShellObject
  mode: 'creator' | 'partner'
  meName: string
  busy: boolean
  gradient: string
  briefTitle: string
  partnerName: string
  recipeLabels: { version: number; label: RoomRecipeLabelView }[]
  onSearchIngredients?: (query: string) => Promise<IngredientPick[]>
  onCreateIngredient?: (input: IngredientCreateInput) => Promise<
    { ok: true; ingredient: IngredientPick } | { ok: false; error: string }
  >
  briefDomain?: string
  onSubmitVersion: (payload: Record<string, unknown>) => void
  onReview: (decision: 'APPROVE' | 'REQUEST_CHANGES', note?: string) => void
  onReopen: () => void
  onComment: (body: string, anchor?: string) => void
}) {
  const meta = OBJECT_META[object.kind] ?? { icon: '▫️', name: object.kind }
  const pill = STATUS_PILL[object.status] ?? STATUS_PILL.DRAFT!
  const versions = [...object.versions].sort((a, b) => a.version - b.version)
  const latest = versions[versions.length - 1]
  const [viewVersion, setViewVersion] = React.useState<number | 'compare'>(latest?.version ?? 1)
  const [editing, setEditing] = React.useState(false)
  /** Draft-row index whose catalog match picker is open. */
  const [matchOpen, setMatchOpen] = React.useState<number | null>(null)
  /** Declaration names for draft pins made this session (display only). */
  const [draftPinNames, setDraftPinNames] = React.useState<Record<string, string>>({})
  const [changeNote, setChangeNote] = React.useState('')
  const [openThread, setOpenThread] = React.useState<string | null>(null)
  const [reply, setReply] = React.useState('')

  const viewing =
    viewVersion === 'compare' ? latest : versions.find((v) => v.version === viewVersion) ?? latest
  const previous = versions.length > 1 ? versions[versions.length - 2] : undefined

  const isRecipe = object.kind === 'RECIPE'
  const isLabel = object.kind === 'LABEL'
  const isSample = object.kind === 'SAMPLE'
  const rows = viewing ? recipeRows(viewing.payload) : []
  const prevRows = previous ? recipeRows(previous.payload) : []
  const fields = viewing ? fieldRows(viewing.payload) : []

  const [draftRows, setDraftRows] = React.useState<RecipeRow[]>(() =>
    latest ? recipeRows(latest.payload) : [{ name: '', amount: '', note: '' }],
  )
  const [draftFields, setDraftFields] = React.useState<FieldRow[]>(() =>
    latest && fieldRows(latest.payload).length ? fieldRows(latest.payload) : [{ label: '', value: '' }],
  )
  // Serving block (RECIPE) — seeds the live facts panel; carried on the payload.
  const latestServing =
    latest?.payload && typeof latest.payload === 'object'
      ? ((latest.payload as { serving?: Record<string, unknown> }).serving ?? null)
      : null
  const [draftServing, setDraftServing] = React.useState(() => ({
    sizeG: typeof latestServing?.sizeG === 'number' ? String(latestServing.sizeG) : '',
    sizeDesc: typeof latestServing?.sizeDesc === 'string' ? latestServing.sizeDesc : '',
    perContainer:
      typeof latestServing?.perContainer === 'number' ? String(latestServing.perContainer) : '',
    nqKind: ((latestServing?.netQuantity as { kind?: string } | null)?.kind ?? 'liquid') as
      | 'solid'
      | 'liquid'
      | 'count',
    nqValue: (() => {
      const nq = latestServing?.netQuantity as
        | { grams?: number; milliliters?: number; count?: number }
        | null
        | undefined
      const v = nq?.milliliters ?? nq?.grams ?? nq?.count
      return typeof v === 'number' ? String(v) : ''
    })(),
  }))

  // Supplement formulation draft (SUPPLEMENT-domain recipe only). Amounts are
  // per-serving mg/mcg/g — the structured shape the Supplement Facts engine
  // needs; it is NEVER derived from the free-text formula rows.
  const isSupplement = briefDomain === 'SUPPLEMENT'
  const latestSupp =
    latest?.payload && typeof latest.payload === 'object'
      ? ((latest.payload as { supplement?: Record<string, unknown> }).supplement ?? null)
      : null
  const [draftSupp, setDraftSupp] = React.useState<{
    rows: { name: string; amount: string; unit: string; dv: string; isOther: boolean; blendId: string }[]
    blends: { id: string; name: string; total: string; unit: string }[]
    servingForm: string
    perContainer: string
  }>(() => {
    const raw = Array.isArray(latestSupp?.dietaryIngredients)
      ? (latestSupp!.dietaryIngredients as Partial<{
          name: string
          amountPerServing: number
          unit: string
          percentDV: number | null
          isOtherIngredient: boolean
          blendId: string | null
        }>[])
      : []
    const rawBlends = Array.isArray(latestSupp?.blends)
      ? (latestSupp!.blends as Partial<{ id: string; name: string; totalAmount: number; unit: string }>[])
      : []
    return {
      rows: raw.length
        ? raw.map((d) => ({
            name: String(d.name ?? ''),
            amount: typeof d.amountPerServing === 'number' ? String(d.amountPerServing) : '',
            unit: String(d.unit ?? 'mg'),
            dv: typeof d.percentDV === 'number' ? String(d.percentDV) : '',
            isOther: !!d.isOtherIngredient,
            blendId: d.blendId ? String(d.blendId) : '',
          }))
        : [{ name: '', amount: '', unit: 'mg', dv: '', isOther: false, blendId: '' }],
      blends: rawBlends
        .filter((b) => String(b?.name ?? '').trim())
        .map((b, i) => ({
          id: String(b.id ?? `blend-${i}`),
          name: String(b.name),
          total: typeof b.totalAmount === 'number' ? String(b.totalAmount) : '',
          unit: String(b.unit ?? 'mg'),
        })),
      servingForm: String(latestSupp?.servingForm ?? ''),
      perContainer:
        typeof latestSupp?.servingsPerContainer === 'number'
          ? String(latestSupp.servingsPerContainer)
          : '',
    }
  })

  // PET Guaranteed Analysis draft — values are the maker's LAB RESULTS,
  // carried verbatim (nothing computed). Seeds AAFCO's standard four rows.
  const isPet = briefDomain === 'PET'
  const latestPet =
    latest?.payload && typeof latest.payload === 'object'
      ? ((latest.payload as { pet?: Record<string, unknown> }).pet ?? null)
      : null
  const [draftPet, setDraftPet] = React.useState<{
    rows: { label: string; value: string }[]
    adequacyStatement: string
    feedingDirections: string
  }>(() => {
    const raw = Array.isArray(latestPet?.gaRows)
      ? (latestPet!.gaRows as Partial<{ label: string; value: string }>[])
      : []
    return {
      rows: raw.length
        ? raw.map((r) => ({ label: String(r.label ?? ''), value: String(r.value ?? '') }))
        : [
            { label: 'Crude Protein (min)', value: '' },
            { label: 'Crude Fat (min)', value: '' },
            { label: 'Crude Fiber (max)', value: '' },
            { label: 'Moisture (max)', value: '' },
          ],
      adequacyStatement: typeof latestPet?.adequacyStatement === 'string' ? latestPet.adequacyStatement : '',
      feedingDirections: typeof latestPet?.feedingDirections === 'string' ? latestPet.feedingDirections : '',
    }
  })

  // OTC Drug Facts draft (21 CFR 201.66) — regulated copy authored by the
  // maker, carried verbatim. otherInformation/questions carry forward from
  // the previous version (no in-room editor for them yet).
  const isOtc = briefDomain === 'OTC'
  const latestOtc =
    latest?.payload && typeof latest.payload === 'object'
      ? ((latest.payload as { otc?: Record<string, unknown> }).otc ?? null)
      : null
  const [draftOtc, setDraftOtc] = React.useState<{
    actives: { name: string; purpose: string }[]
    uses: string[]
    warnings: { text: string; bold: boolean }[]
    directions: string
    inactives: string
  }>(() => {
    const rawA = Array.isArray(latestOtc?.activeIngredients)
      ? (latestOtc!.activeIngredients as Partial<{ name: string; purpose: string }>[])
      : []
    const rawW = Array.isArray(latestOtc?.warnings)
      ? (latestOtc!.warnings as Partial<{ text: string; bold: boolean }>[])
      : []
    return {
      actives: rawA.length
        ? rawA.map((a) => ({ name: String(a.name ?? ''), purpose: String(a.purpose ?? '') }))
        : [{ name: '', purpose: '' }],
      uses: Array.isArray(latestOtc?.uses) && latestOtc!.uses.length
        ? (latestOtc!.uses as unknown[]).map((u) => String(u ?? ''))
        : [''],
      warnings: rawW.length
        ? rawW.map((w) => ({ text: String(w.text ?? ''), bold: !!w.bold }))
        : [{ text: '', bold: false }],
      directions: typeof latestOtc?.directions === 'string' ? latestOtc.directions : '',
      inactives:
        typeof latestOtc?.inactiveIngredients === 'string' ? latestOtc.inactiveIngredients : '',
    }
  })

  // P2 sample logistics — shipment block on the SAMPLE payload; the object
  // FSM does the rest (submit = shipped → review = inspect on arrival).
  const viewShipment = isSample && viewing ? sampleShipmentFromPayload(viewing.payload) : null
  const latestShipment =
    isSample && latest ? sampleShipmentFromPayload(latest.payload) : null
  const [draftShip, setDraftShip] = React.useState<{
    carrier: SampleCarrier
    trackingNumber: string
    eta: string
    notes: string
  }>(() => ({
    carrier: (SAMPLE_CARRIERS as readonly string[]).includes(latestShipment?.carrier ?? '')
      ? ((latestShipment?.carrier ?? 'USPS') as SampleCarrier)
      : 'USPS',
    trackingNumber: latestShipment?.trackingNumber ?? '',
    eta: latestShipment?.eta ?? '',
    notes: latestShipment?.notes ?? '',
  }))

  // Facts sidebar follows the VIEWED version (every version gets its own
  // computed label); compare mode diffs previous → latest side by side.
  const labelFor = React.useCallback(
    (v: number | undefined) =>
      v === undefined ? null : (recipeLabels.find((x) => x.version === v)?.label ?? null),
    [recipeLabels],
  )
  const viewLabel =
    viewVersion === 'compare' ? labelFor(latest?.version) : labelFor(viewVersion)
  const prevLabel = labelFor(previous?.version)
  const viewingLatest = viewVersion === latest?.version
  const hasFactsData = isRecipe && viewLabel !== null && viewLabel.rows.length > 0
  const showFacts = hasFactsData && viewVersion !== 'compare'
  const showFactsCompare = hasFactsData && viewVersion === 'compare'

  const canSubmit =
    (mode === 'partner' || isLabel) && (object.status === 'DRAFT' || object.status === 'CHANGES_REQUESTED')
  const canReview = mode === 'creator' && object.status === 'IN_REVIEW'
  const canReopen = object.status === 'APPROVED' || object.status === 'LOCKED'

  function threadFor(anchor: string) {
    return object.comments.filter((c) => c.anchor === anchor)
  }

  function submitDraft() {
    const nqValue = Number(draftServing.nqValue)
    // Supplement block — mirrors toSupplementPanelData inputs; blends from the
    // previous version carry forward untouched (no blend editor in-room yet).
    const suppRows = draftSupp.rows.filter(
      (r) => r.name.trim() && Number(r.amount) > 0 && r.unit.trim(),
    )
    // Blends need a name + positive total; rows pointing at a dropped blend unpin.
    const suppBlends = draftSupp.blends.filter((b) => b.name.trim() && Number(b.total) > 0)
    const blendIds = new Set(suppBlends.map((b) => b.id))
    const supplementBlock =
      isSupplement && suppRows.length > 0
        ? {
            supplement: {
              dietaryIngredients: suppRows.map((r, i) => ({
                id: `row-${i}`,
                name: r.name.trim(),
                amountPerServing: Number(r.amount),
                unit: r.unit.trim(),
                percentDV: r.dv.trim() ? Number(r.dv) : null,
                isOtherIngredient: r.isOther,
                sortWeight: suppRows.length - i,
                ...(r.blendId && blendIds.has(r.blendId) ? { blendId: r.blendId } : {}),
              })),
              blends: suppBlends.map((b) => ({
                id: b.id,
                name: b.name.trim(),
                totalAmount: Number(b.total),
                unit: b.unit.trim(),
                percentDV: null,
              })),
              servingForm: draftSupp.servingForm.trim() || '1 serving',
              servingsPerContainer: Number(draftSupp.perContainer) > 0 ? Number(draftSupp.perContainer) : 1,
            },
          }
        : {}
    // PET block — only rows with a value make it onto the label.
    const gaRows = draftPet.rows.filter((r) => r.label.trim() && r.value.trim())
    const petBlock =
      isPet && (gaRows.length > 0 || draftPet.adequacyStatement.trim() || draftPet.feedingDirections.trim())
        ? {
            pet: {
              gaRows,
              ...(draftPet.adequacyStatement.trim()
                ? { adequacyStatement: draftPet.adequacyStatement.trim() }
                : {}),
              ...(draftPet.feedingDirections.trim()
                ? { feedingDirections: draftPet.feedingDirections.trim() }
                : {}),
            },
          }
        : {}
    // OTC block — needs ≥1 active ingredient; other sections optional.
    const otcActives = draftOtc.actives.filter((a) => a.name.trim())
    const otcBlock =
      isOtc && otcActives.length > 0
        ? {
            otc: {
              activeIngredients: otcActives.map((a) => ({
                name: a.name.trim(),
                purpose: a.purpose.trim(),
              })),
              uses: draftOtc.uses.map((u) => u.trim()).filter(Boolean),
              warnings: draftOtc.warnings
                .filter((w) => w.text.trim())
                .map((w) => ({ text: w.text.trim(), ...(w.bold ? { bold: true } : {}) })),
              directions: draftOtc.directions.trim(),
              inactiveIngredients: draftOtc.inactives.trim(),
              // Carry forward sections without an in-room editor yet.
              ...(Array.isArray(latestOtc?.otherInformation)
                ? { otherInformation: latestOtc!.otherInformation }
                : {}),
              ...(typeof latestOtc?.questions === 'string' ? { questions: latestOtc.questions } : {}),
            },
          }
        : {}
    const payload = isRecipe
      ? {
          ...supplementBlock,
          ...petBlock,
          ...otcBlock,
          rows: draftRows.filter((r) => r.name.trim()),
          serving: {
            sizeG: draftServing.sizeG ? Number(draftServing.sizeG) : null,
            ...(draftServing.sizeDesc.trim() ? { sizeDesc: draftServing.sizeDesc.trim() } : {}),
            perContainer: draftServing.perContainer ? Number(draftServing.perContainer) : null,
            netQuantity:
              draftServing.nqValue && Number.isFinite(nqValue) && nqValue > 0
                ? {
                    kind: draftServing.nqKind,
                    ...(draftServing.nqKind === 'liquid'
                      ? { milliliters: nqValue }
                      : draftServing.nqKind === 'solid'
                        ? { grams: nqValue }
                        : { count: Math.round(nqValue) }),
                  }
                : null,
          },
        }
      : {
          fields: draftFields.filter((f) => f.label.trim() || f.value.trim()),
          // SAMPLE (P2): shipment block — submit = "sample shipped".
          ...(isSample && draftShip.trackingNumber.trim()
            ? {
                shipment: {
                  carrier: draftShip.carrier,
                  trackingNumber: draftShip.trackingNumber.trim(),
                  ...(draftShip.eta.trim() ? { eta: draftShip.eta.trim() } : {}),
                  ...(draftShip.notes.trim() ? { notes: draftShip.notes.trim() } : {}),
                },
              }
            : {}),
        }
    onSubmitVersion(payload)
    setEditing(false)
  }

  const submittedBy = latest
    ? latest.submittedByPartner
      ? `submitted by ${partnerName}`
      : 'submitted by creator'
    : 'nothing submitted yet'

  return (
    <>
      {/* Detail header (demo .deth) */}
      <div className="flex items-center gap-s-3 border-b border-ink-100 bg-white px-s-4 py-s-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-100 text-ui-section">
          {meta.icon}
        </span>
        <div>
          <h2 className="font-display text-ui-section">{meta.name}</h2>
          <div className="text-ui-label normal-case tracking-normal text-ink-500">
            v{object.currentVersion} · {submittedBy}
          </div>
        </div>
        <span className="flex-1" />
        <span className={cn('rounded-pill px-s-3 py-s-1 text-ui-caption font-bold', pill.cls)}>{pill.label}</span>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-s-4">
        {/* Version tabs (demo .vtabs segmented) */}
        {versions.length > 0 && !isLabel ? (
          <div className="mb-s-3 inline-flex rounded-lg bg-ink-100 p-s-1">
            {versions.map((v) => (
              <button
                key={v.version}
                type="button"
                onClick={() => setViewVersion(v.version)}
                className={cn(
                  'rounded-md px-s-3 py-s-1 text-ui-caption font-bold transition',
                  viewVersion === v.version ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900',
                )}
              >
                v{v.version}
                {v.version === latest?.version ? ' · latest' : ''}
              </button>
            ))}
            {versions.length > 1 && isRecipe ? (
              <button
                type="button"
                onClick={() => setViewVersion('compare')}
                className={cn(
                  'rounded-md px-s-3 py-s-1 text-ui-caption font-bold transition',
                  viewVersion === 'compare' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900',
                )}
              >
                ⇄ Compare
              </button>
            ) : null}
          </div>
        ) : null}
        {viewVersion === 'compare' ? (
          <p className="mb-s-3 text-ui-caption text-ink-500">
            v{latest?.version} with changes vs v{previous?.version} highlighted.
          </p>
        ) : null}

        {isLabel ? (
          <LabelPinBoard
            object={object}
            mode={mode}
            meName={meName}
            busy={busy}
            gradient={gradient}
            briefTitle={briefTitle}
            partnerName={partnerName}
            onComment={onComment}
          />
        ) : versions.length === 0 && !editing ? (
          <p className="rounded-lg bg-white px-s-3 py-s-4 text-center text-ui-caption text-ink-500">
            {canSubmit
              ? 'Nothing submitted yet — add the first version below.'
              : `Waiting for ${mode === 'creator' ? 'the maker' : 'the creator'} to submit the first version.`}
          </p>
        ) : isRecipe ? (
          // Breathing room: extra right padding past the label column; the
          // formula column caps its width so ingredient rows don't sprawl.
          <div className={cn(hasFactsData && 'gap-s-5 xl:grid xl:grid-cols-[minmax(0,1fr)_270px] xl:pr-s-4')}>
          <div className={cn(hasFactsData && 'xl:max-w-xl')}>
          {rows.map((r, idx) => {
            const anchor = `row:${idx}`
            const thread = threadFor(anchor)
            const prev = viewVersion === 'compare' ? prevRows[idx] : undefined
            const changed = prev && (prev.amount !== r.amount || prev.name !== r.name || prev.note !== r.note)
            // viewLabel always matches the displayed rows (compare shows latest).
            const res = hasFactsData ? (viewLabel?.rows[idx] ?? null) : null
            return (
              <div key={idx}>
                <div
                  className={cn(
                    'mb-s-2 flex items-center gap-s-3 rounded-lg border bg-white px-s-3 py-s-2',
                    changed ? 'border-danger-200 bg-danger-50' : res && !res.ingredientId ? 'border-warning-200' : 'border-ink-200',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-ui-caption">
                    <b>{r.name}</b>
                    {r.note ? <span className="text-ink-500"> · {r.note}</span> : null}
                  </span>
                  {res ? (
                    res.ingredientId ? (
                      <span className="flex-none rounded-pill bg-success-50 px-s-2 py-0.5 text-ui-label tracking-normal text-success-700">
                        {sourceChipLabel(res.source)}
                      </span>
                    ) : (
                      <span className="flex-none rounded-pill bg-warning-50 px-s-2 py-0.5 text-ui-label tracking-normal text-warning-700">
                        unmatched
                      </span>
                    )
                  ) : null}
                  <span className="text-ui-caption font-bold">
                    {r.amount}
                    {changed && prev ? (
                      <span className="ml-s-1 rounded-sm bg-info-50 px-s-1 py-0.5 text-ui-label tracking-normal text-info-700">
                        was {prev.amount || '—'}
                      </span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpenThread(openThread === anchor ? null : anchor)}
                    className={cn(
                      'rounded-md border px-s-2 py-s-1 text-ui-label normal-case tracking-normal',
                      thread.length ? 'border-pink-500 bg-white text-pink-700' : 'border-ink-200 bg-white text-ink-500 hover:text-ink-900',
                    )}
                  >
                    💬{thread.length ? ` ${thread.length}` : ''}
                  </button>
                </div>
                {openThread === anchor ? (
                  <div className="mb-s-2 ml-s-4 rounded-r-lg border border-l-[3px] border-ink-200 border-l-pink-500 bg-white p-s-3">
                    {thread.map((c) => (
                      <div key={c.id} className="mb-s-2 flex gap-s-2">
                        <AuthorAvatar role={c.authorRole} />
                        <div className="text-ui-caption">
                          <b>{c.authorRole === 'CREATOR' ? 'Creator' : 'Maker'}</b>{' '}
                          <span className="text-ui-label normal-case tracking-normal text-ink-400">
                            {timeAgo(c.createdAt)}
                          </span>
                          <div className="text-ink-700">{c.body}</div>
                        </div>
                      </div>
                    ))}
                    <div className="mt-s-1 flex gap-s-2">
                      <Input
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        placeholder={`Reply as ${meName}…`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && reply.trim()) {
                            onComment(reply, anchor)
                            setReply('')
                          }
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy || !reply.trim()}
                        onClick={() => {
                          onComment(reply, anchor)
                          setReply('')
                        }}
                      >
                        Send
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
          {/* Discussion stays under the formula column — never under the label. */}
          <ObjectThread
            comments={object.comments.filter((c) => !c.anchor)}
            meName={meName}
            busy={busy}
            onComment={(b) => onComment(b)}
          />
          </div>
          {showFactsCompare && viewLabel ? (
            <RecipeFactsCompare
              latest={viewLabel}
              previous={prevLabel}
              latestVersion={latest?.version ?? 0}
              prevVersion={previous?.version ?? 0}
            />
          ) : showFacts && viewLabel ? (
            <RecipeFactsSidebar
              label={viewLabel}
              versionNote={
                viewingLatest
                  ? null
                  : `Label computed for v${viewVersion} — not the latest formula.`
              }
            />
          ) : null}
          </div>
        ) : fields.length || viewShipment ? (
          <>
            {viewShipment ? (
              <div className="mb-s-2 rounded-lg border border-ink-200 bg-white p-s-3">
                <div className="flex flex-wrap items-center gap-s-2">
                  <span className="rounded-pill bg-ink-900 px-s-2 py-0.5 text-ui-label tracking-normal text-white">
                    📦 {CARRIER_LABELS[(viewShipment.carrier as SampleCarrier)] ?? viewShipment.carrier}
                  </span>
                  {carrierTrackingUrl(viewShipment.carrier, viewShipment.trackingNumber) ? (
                    <a
                      href={carrierTrackingUrl(viewShipment.carrier, viewShipment.trackingNumber)!}
                      target="_blank"
                      rel="noreferrer"
                      className="text-ui-caption font-bold text-pink-700 underline-offset-2 hover:underline"
                    >
                      {viewShipment.trackingNumber} ↗
                    </a>
                  ) : (
                    <span className="text-ui-caption font-bold">{viewShipment.trackingNumber || 'No tracking number'}</span>
                  )}
                  {viewShipment.eta ? (
                    <span className="text-ui-label normal-case tracking-normal text-ink-500">
                      · maker's ETA {viewShipment.eta}
                    </span>
                  ) : null}
                </div>
                {viewShipment.notes ? (
                  <p className="mt-s-1 text-ui-caption text-ink-600">{viewShipment.notes}</p>
                ) : null}
                {mode === 'creator' && object.status === 'IN_REVIEW' ? (
                  <p className="mt-s-2 text-ui-label normal-case tracking-normal text-ink-500">
                    Approve once the sample arrives and passes your inspection — request changes to
                    flag issues (the maker ships a revised sample).
                  </p>
                ) : null}
              </div>
            ) : null}
            {fields.map((f, idx) => (
              <div key={idx} className="mb-s-2 flex items-center gap-s-3 rounded-lg border border-ink-200 bg-white px-s-3 py-s-2">
                <span className="min-w-0 flex-1 truncate text-ui-caption font-bold">{f.label}</span>
                <span className="text-ui-caption text-ink-700">{f.value}</span>
              </div>
            ))}
          </>
        ) : versions.length > 0 ? (
          <p className="rounded-lg bg-white px-s-3 py-s-3 text-ui-caption text-ink-500">
            This version has no structured fields.
          </p>
        ) : null}

        {/* New-version editor */}
        {!isLabel && canSubmit ? (
          editing || versions.length === 0 ? (
            <div className="mt-s-3 rounded-lg border border-ink-200 bg-white p-s-3">
              <div className="text-ui-caption font-bold">
                {versions.length === 0 ? 'First version' : `Submit v${object.currentVersion + 1}`}
              </div>
              <div className="mt-s-2">
                {isRecipe
                  ? draftRows.map((r, i) => (
                      <div key={i} className="mb-s-2">
                        <div className="flex gap-s-2">
                          <Input
                            value={r.name}
                            placeholder="Ingredient"
                            onChange={(e) =>
                              setDraftRows((rows2) =>
                                rows2.map((x, j) =>
                                  // Renaming voids the pin — the name no longer describes it.
                                  j === i ? { ...x, name: e.target.value, ingredientId: undefined } : x,
                                ),
                              )
                            }
                            className="flex-[2]"
                          />
                          <Input
                            value={r.amount}
                            placeholder="Amount"
                            onChange={(e) =>
                              setDraftRows((rows2) => rows2.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))
                            }
                            className="flex-1"
                          />
                          <Input
                            value={r.note}
                            placeholder="Note"
                            onChange={(e) =>
                              setDraftRows((rows2) => rows2.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))
                            }
                            className="flex-[2]"
                          />
                          {onSearchIngredients ? (
                            <button
                              type="button"
                              onClick={() => setMatchOpen(matchOpen === i ? null : i)}
                              className={cn(
                                'flex-none rounded-pill px-s-2 py-s-1 text-ui-label tracking-normal transition',
                                r.ingredientId
                                  ? 'bg-success-50 text-success-700 hover:bg-success-100'
                                  : 'bg-warning-50 text-warning-700 hover:bg-warning-100',
                              )}
                              title={
                                r.ingredientId
                                  ? `Matched to ${draftPinNames[r.ingredientId] ?? 'a catalog ingredient'} — click to change`
                                  : 'Match to a catalog ingredient so the facts label can compute'
                              }
                            >
                              {r.ingredientId ? '✓ matched' : 'match'}
                            </button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Remove row"
                            onClick={() => setDraftRows((rows2) => rows2.filter((_, j) => j !== i))}
                          >
                            ✕
                          </Button>
                        </div>
                        {onSearchIngredients && matchOpen === i ? (
                          <IngredientMatchPicker
                            initialQuery={r.name}
                            pinned={!!r.ingredientId}
                            search={onSearchIngredients}
                            create={onCreateIngredient}
                            onPick={(p) => {
                              setDraftRows((rows2) =>
                                rows2.map((x, j) => (j === i ? { ...x, ingredientId: p.id } : x)),
                              )
                              setDraftPinNames((m) => ({ ...m, [p.id]: p.declarationName || p.name }))
                              setMatchOpen(null)
                            }}
                            onClear={() => {
                              setDraftRows((rows2) =>
                                rows2.map((x, j) => (j === i ? { ...x, ingredientId: undefined } : x)),
                              )
                              setMatchOpen(null)
                            }}
                            onClose={() => setMatchOpen(null)}
                          />
                        ) : null}
                      </div>
                    ))
                  : draftFields.map((f, i) => (
                      <div key={i} className="mb-s-2 flex gap-s-2">
                        <Input
                          value={f.label}
                          placeholder="Field (e.g. Format)"
                          onChange={(e) =>
                            setDraftFields((fs) => fs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                          }
                          className="w-36"
                        />
                        <Input
                          value={f.value}
                          placeholder="Value (e.g. 12oz slim can, matte)"
                          onChange={(e) =>
                            setDraftFields((fs) => fs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                          }
                          className="flex-1"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Remove field"
                          onClick={() => setDraftFields((fs) => fs.filter((_, j) => j !== i))}
                        >
                          ✕
                        </Button>
                      </div>
                    ))}
                {isSample ? (
                  <div className="mb-s-2 mt-s-3 rounded-lg bg-ink-50 p-s-3">
                    <div className="mb-s-2 text-ui-label uppercase text-ink-500">
                      Shipment — submitting marks the sample as SHIPPED
                    </div>
                    <div className="flex flex-wrap items-center gap-s-2">
                      <select
                        aria-label="Carrier"
                        value={draftShip.carrier}
                        onChange={(e) =>
                          setDraftShip((s) => ({ ...s, carrier: e.target.value as SampleCarrier }))
                        }
                        className="rounded-md border border-ink-300 bg-white px-s-2 py-s-1 text-ui-caption"
                      >
                        {SAMPLE_CARRIERS.map((c) => (
                          <option key={c} value={c}>
                            {CARRIER_LABELS[c]}
                          </option>
                        ))}
                      </select>
                      <Input
                        aria-label="Tracking number"
                        value={draftShip.trackingNumber}
                        placeholder="Tracking number"
                        onChange={(e) => setDraftShip((s) => ({ ...s, trackingNumber: e.target.value }))}
                        className="min-w-44 flex-1"
                      />
                      <Input
                        aria-label="Expected arrival date"
                        type="date"
                        value={draftShip.eta}
                        onChange={(e) => setDraftShip((s) => ({ ...s, eta: e.target.value }))}
                        className="w-40"
                      />
                    </div>
                    <Input
                      aria-label="Shipment note"
                      value={draftShip.notes}
                      placeholder="What's in the box, e.g. 2× passion-fruit bench samples + 1 control"
                      onChange={(e) => setDraftShip((s) => ({ ...s, notes: e.target.value }))}
                      className="mt-s-2"
                    />
                    <p className="mt-s-2 text-ui-label normal-case tracking-normal text-ink-500">
                      The creator inspects on arrival and approves (or requests changes) — same
                      review flow as every other build object.
                    </p>
                  </div>
                ) : null}
                {isRecipe && isOtc ? (
                  <div className="mb-s-2 mt-s-3 rounded-lg bg-ink-50 p-s-3">
                    <div className="mb-s-2 text-ui-label uppercase text-ink-500">
                      Drug Facts (21 CFR 201.66) — a panel needs at least one active ingredient
                    </div>
                    {draftOtc.actives.map((a, i) => (
                      <div key={i} className="mb-s-2 flex items-center gap-s-2">
                        <Input
                          value={a.name}
                          placeholder="Active ingredient, e.g. Acetaminophen 500 mg (in each caplet)"
                          onChange={(e) =>
                            setDraftOtc((s) => ({
                              ...s,
                              actives: s.actives.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                            }))
                          }
                          className="flex-[3]"
                        />
                        <Input
                          value={a.purpose}
                          placeholder="Purpose, e.g. Pain reliever"
                          onChange={(e) =>
                            setDraftOtc((s) => ({
                              ...s,
                              actives: s.actives.map((x, j) => (j === i ? { ...x, purpose: e.target.value } : x)),
                            }))
                          }
                          className="flex-[2]"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Remove active ingredient"
                          onClick={() =>
                            setDraftOtc((s) => ({ ...s, actives: s.actives.filter((_, j) => j !== i) }))
                          }
                        >
                          ✕
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setDraftOtc((s) => ({ ...s, actives: [...s.actives, { name: '', purpose: '' }] }))
                      }
                    >
                      ＋ Active ingredient
                    </Button>

                    <div className="mb-s-1 mt-s-3 text-ui-label uppercase text-ink-500">Uses</div>
                    {draftOtc.uses.map((u, i) => (
                      <div key={i} className="mb-s-2 flex items-center gap-s-2">
                        <Input
                          value={u}
                          placeholder="e.g. temporarily relieves minor aches and pains"
                          onChange={(e) =>
                            setDraftOtc((s) => ({
                              ...s,
                              uses: s.uses.map((x, j) => (j === i ? e.target.value : x)),
                            }))
                          }
                          className="flex-1"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Remove use"
                          onClick={() =>
                            setDraftOtc((s) => ({ ...s, uses: s.uses.filter((_, j) => j !== i) }))
                          }
                        >
                          ✕
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDraftOtc((s) => ({ ...s, uses: [...s.uses, ''] }))}
                    >
                      ＋ Use
                    </Button>

                    <div className="mb-s-1 mt-s-3 text-ui-label uppercase text-ink-500">Warnings</div>
                    {draftOtc.warnings.map((w, i) => (
                      <div key={i} className="mb-s-2 flex items-center gap-s-2">
                        <Input
                          value={w.text}
                          placeholder='Warning line — bold for sub-headers like "Do not use"'
                          onChange={(e) =>
                            setDraftOtc((s) => ({
                              ...s,
                              warnings: s.warnings.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)),
                            }))
                          }
                          className="flex-1"
                        />
                        <label className="flex items-center gap-s-1 text-ui-label normal-case tracking-normal text-ink-600">
                          <input
                            type="checkbox"
                            checked={w.bold}
                            onChange={(e) =>
                              setDraftOtc((s) => ({
                                ...s,
                                warnings: s.warnings.map((x, j) =>
                                  j === i ? { ...x, bold: e.target.checked } : x,
                                ),
                              }))
                            }
                          />
                          bold
                        </label>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Remove warning line"
                          onClick={() =>
                            setDraftOtc((s) => ({ ...s, warnings: s.warnings.filter((_, j) => j !== i) }))
                          }
                        >
                          ✕
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setDraftOtc((s) => ({ ...s, warnings: [...s.warnings, { text: '', bold: false }] }))
                      }
                    >
                      ＋ Warning line
                    </Button>

                    <div className="mt-s-3 flex flex-col gap-s-2">
                      <Input
                        aria-label="Directions"
                        value={draftOtc.directions}
                        placeholder="Directions, e.g. Adults: take 2 caplets every 6 hours…"
                        onChange={(e) => setDraftOtc((s) => ({ ...s, directions: e.target.value }))}
                      />
                      <Input
                        aria-label="Inactive ingredients"
                        value={draftOtc.inactives}
                        placeholder="Inactive ingredients, e.g. corn starch, hypromellose…"
                        onChange={(e) => setDraftOtc((s) => ({ ...s, inactives: e.target.value }))}
                      />
                    </div>
                    <p className="mt-s-2 text-ui-label normal-case tracking-normal text-ink-500">
                      Regulated copy is yours — the platform prints it verbatim in the 201.66 format.
                    </p>
                  </div>
                ) : null}
                {isRecipe && isPet ? (
                  <div className="mb-s-2 mt-s-3 rounded-lg bg-ink-50 p-s-3">
                    <div className="mb-s-2 text-ui-label uppercase text-ink-500">
                      Guaranteed Analysis — values from your lab results
                    </div>
                    {draftPet.rows.map((r, i) => (
                      <div key={i} className="mb-s-2 flex items-center gap-s-2">
                        <Input
                          value={r.label}
                          placeholder="Guarantee, e.g. Crude Protein (min)"
                          onChange={(e) =>
                            setDraftPet((s) => ({
                              ...s,
                              rows: s.rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                            }))
                          }
                          className="flex-[2]"
                        />
                        <Input
                          aria-label="Guaranteed value"
                          value={r.value}
                          placeholder="e.g. 26.0%"
                          onChange={(e) =>
                            setDraftPet((s) => ({
                              ...s,
                              rows: s.rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                            }))
                          }
                          className="w-28"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Remove guarantee row"
                          onClick={() =>
                            setDraftPet((s) => ({ ...s, rows: s.rows.filter((_, j) => j !== i) }))
                          }
                        >
                          ✕
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setDraftPet((s) => ({ ...s, rows: [...s.rows, { label: '', value: '' }] }))
                      }
                    >
                      ＋ Add guarantee
                    </Button>
                    <div className="mt-s-2 flex flex-col gap-s-2">
                      <Input
                        aria-label="Nutritional adequacy statement"
                        value={draftPet.adequacyStatement}
                        placeholder="Adequacy statement, e.g. Formulated to meet AAFCO … profiles for adult dogs"
                        onChange={(e) => setDraftPet((s) => ({ ...s, adequacyStatement: e.target.value }))}
                      />
                      <Input
                        aria-label="Feeding directions"
                        value={draftPet.feedingDirections}
                        placeholder="Feeding directions, e.g. Feed 1 cup per 10 lbs body weight daily"
                        onChange={(e) => setDraftPet((s) => ({ ...s, feedingDirections: e.target.value }))}
                      />
                    </div>
                    <p className="mt-s-2 text-ui-label normal-case tracking-normal text-ink-500">
                      Rows without a value are left off the label — nothing is invented.
                    </p>
                  </div>
                ) : null}
                {isRecipe && isSupplement ? (
                  <div className="mb-s-2 mt-s-3 rounded-lg bg-ink-50 p-s-3">
                    <div className="mb-s-2 text-ui-label uppercase text-ink-500">
                      Supplement Facts formulation — per-serving amounts drive the panel
                    </div>
                    {draftSupp.rows.map((r, i) => (
                      <div key={i} className="mb-s-2 flex flex-wrap items-center gap-s-2">
                        <Input
                          value={r.name}
                          placeholder="Dietary ingredient, e.g. Vitamin C (as ascorbic acid)"
                          onChange={(e) =>
                            setDraftSupp((s) => ({
                              ...s,
                              rows: s.rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                            }))
                          }
                          className="min-w-40 flex-[2]"
                        />
                        <Input
                          aria-label="Amount per serving"
                          type="number"
                          min={0}
                          value={r.amount}
                          placeholder="Amt"
                          onChange={(e) =>
                            setDraftSupp((s) => ({
                              ...s,
                              rows: s.rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)),
                            }))
                          }
                          className="w-20"
                        />
                        <select
                          aria-label="Unit"
                          value={r.unit}
                          onChange={(e) =>
                            setDraftSupp((s) => ({
                              ...s,
                              rows: s.rows.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)),
                            }))
                          }
                          className="rounded-md border border-ink-300 bg-white px-s-2 py-s-1 text-ui-caption"
                        >
                          {['mg', 'mcg', 'g', 'IU', 'mcg DFE', 'mg NE', 'billion CFU', 'mL'].map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                        <Input
                          aria-label="Percent daily value (blank = no established DV)"
                          type="number"
                          min={0}
                          value={r.dv}
                          placeholder="%DV"
                          title="Blank = Daily Value not established (†)"
                          onChange={(e) =>
                            setDraftSupp((s) => ({
                              ...s,
                              rows: s.rows.map((x, j) => (j === i ? { ...x, dv: e.target.value } : x)),
                            }))
                          }
                          className="w-20"
                        />
                        <label className="flex items-center gap-s-1 text-ui-label normal-case tracking-normal text-ink-600">
                          <input
                            type="checkbox"
                            checked={r.isOther}
                            onChange={(e) =>
                              setDraftSupp((s) => ({
                                ...s,
                                rows: s.rows.map((x, j) => (j === i ? { ...x, isOther: e.target.checked } : x)),
                              }))
                            }
                          />
                          other
                        </label>
                        {draftSupp.blends.length > 0 ? (
                          <select
                            aria-label="Proprietary blend membership"
                            value={r.blendId}
                            onChange={(e) =>
                              setDraftSupp((s) => ({
                                ...s,
                                rows: s.rows.map((x, j) => (j === i ? { ...x, blendId: e.target.value } : x)),
                              }))
                            }
                            className="rounded-md border border-ink-300 bg-white px-s-2 py-s-1 text-ui-caption"
                          >
                            <option value="">No blend</option>
                            {draftSupp.blends.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name || 'Unnamed blend'}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Remove dietary ingredient"
                          onClick={() =>
                            setDraftSupp((s) => ({ ...s, rows: s.rows.filter((_, j) => j !== i) }))
                          }
                        >
                          ✕
                        </Button>
                      </div>
                    ))}
    {/* Proprietary blends (21 CFR 101.36(c)) — members hide their amounts,
                        only the blend total prints. Assign rows via the per-row select. */}
                    {draftSupp.blends.length > 0 ? (
                      <div className="mb-s-2 mt-s-1 border-t border-ink-200 pt-s-2">
                        <div className="mb-s-1 text-ui-label uppercase text-ink-500">Proprietary blends</div>
                        {draftSupp.blends.map((b, i) => (
                          <div key={b.id} className="mb-s-2 flex items-center gap-s-2">
                            <Input
                              value={b.name}
                              placeholder="Blend name, e.g. Energy Blend"
                              onChange={(e) =>
                                setDraftSupp((s) => ({
                                  ...s,
                                  blends: s.blends.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                                }))
                              }
                              className="flex-[2]"
                            />
                            <Input
                              aria-label="Blend total per serving"
                              type="number"
                              min={0}
                              value={b.total}
                              placeholder="Total"
                              onChange={(e) =>
                                setDraftSupp((s) => ({
                                  ...s,
                                  blends: s.blends.map((x, j) => (j === i ? { ...x, total: e.target.value } : x)),
                                }))
                              }
                              className="w-20"
                            />
                            <select
                              aria-label="Blend unit"
                              value={b.unit}
                              onChange={(e) =>
                                setDraftSupp((s) => ({
                                  ...s,
                                  blends: s.blends.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)),
                                }))
                              }
                              className="rounded-md border border-ink-300 bg-white px-s-2 py-s-1 text-ui-caption"
                            >
                              {['mg', 'mcg', 'g'].map((u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label="Remove blend"
                              onClick={() =>
                                setDraftSupp((s) => ({
                                  ...s,
                                  blends: s.blends.filter((_, j) => j !== i),
                                  // Unassign members of the removed blend.
                                  rows: s.rows.map((x) => (x.blendId === b.id ? { ...x, blendId: '' } : x)),
                                }))
                              }
                            >
                              ✕
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-s-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setDraftSupp((s) => ({
                            ...s,
                            rows: [
                              ...s.rows,
                              { name: '', amount: '', unit: 'mg', dv: '', isOther: false, blendId: '' },
                            ],
                          }))
                        }
                      >
                        ＋ Add dietary ingredient
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setDraftSupp((s) => ({
                            ...s,
                            blends: [
                              ...s.blends,
                              { id: `blend-${Date.now()}-${s.blends.length}`, name: '', total: '', unit: 'mg' },
                            ],
                          }))
                        }
                      >
                        ＋ Add blend
                      </Button>
                      <span className="flex-1" />
                      <Input
                        aria-label="Serving form"
                        value={draftSupp.servingForm}
                        placeholder="e.g. 2 capsules"
                        onChange={(e) => setDraftSupp((s) => ({ ...s, servingForm: e.target.value }))}
                        className="w-36"
                      />
                      <Input
                        aria-label="Servings per container"
                        type="number"
                        min={1}
                        value={draftSupp.perContainer}
                        placeholder="Servings"
                        onChange={(e) => setDraftSupp((s) => ({ ...s, perContainer: e.target.value }))}
                        className="w-24"
                      />
                    </div>
                    <p className="mt-s-2 text-ui-label normal-case tracking-normal text-ink-500">
                      Blank %DV prints “†” (Daily Value not established). “Other” rows print in the
                      Other-ingredients line below the box. Blend members hide their amounts — only
                      the blend total prints (101.36(c)).
                    </p>
                  </div>
                ) : null}
                {isRecipe ? (
                  <div className="mb-s-2 mt-s-3 rounded-lg bg-ink-50 p-s-3">
                    <div className="mb-s-2 text-ui-label uppercase text-ink-500">
                      Serving &amp; net quantity — drives the live facts label
                    </div>
                    <div className="flex flex-wrap gap-s-2">
                      <Input
                        aria-label="Serving size in grams"
                        type="number"
                        min={0}
                        value={draftServing.sizeG}
                        placeholder="Serving g"
                        onChange={(e) => setDraftServing((s) => ({ ...s, sizeG: e.target.value }))}
                        className="w-24"
                      />
                      <Input
                        aria-label="Serving size household measure"
                        value={draftServing.sizeDesc}
                        placeholder="e.g. 12 fl oz — grams are added automatically"
                        onChange={(e) => setDraftServing((s) => ({ ...s, sizeDesc: e.target.value }))}
                        className="flex-1"
                      />
                      <Input
                        aria-label="Servings per container"
                        type="number"
                        min={1}
                        value={draftServing.perContainer}
                        placeholder="Servings"
                        onChange={(e) => setDraftServing((s) => ({ ...s, perContainer: e.target.value }))}
                        className="w-24"
                      />
                    </div>
                    <div className="mt-s-2 flex gap-s-2">
                      <select
                        aria-label="Net quantity kind"
                        value={draftServing.nqKind}
                        onChange={(e) =>
                          setDraftServing((s) => ({ ...s, nqKind: e.target.value as 'solid' | 'liquid' | 'count' }))
                        }
                        className="rounded-md border border-ink-300 bg-white px-s-2 py-s-1 text-ui-caption"
                      >
                        <option value="liquid">Net contents (mL)</option>
                        <option value="solid">Net weight (g)</option>
                        <option value="count">Count</option>
                      </select>
                      <Input
                        aria-label="Net quantity value"
                        type="number"
                        min={0}
                        value={draftServing.nqValue}
                        placeholder="e.g. 355"
                        onChange={(e) => setDraftServing((s) => ({ ...s, nqValue: e.target.value }))}
                        className="w-28"
                      />
                    </div>
                  </div>
                ) : null}
                <div className="flex gap-s-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      isRecipe
                        ? setDraftRows((r) => [...r, { name: '', amount: '', note: '' }])
                        : setDraftFields((f) => [...f, { label: '', value: '' }])
                    }
                  >
                    ＋ Add {isRecipe ? 'ingredient' : 'field'}
                  </Button>
                  <span className="flex-1" />
                  {versions.length > 0 ? (
                    <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                  ) : null}
                  <Button variant="primary" size="sm" disabled={busy} onClick={submitDraft}>
                    {busy ? 'Submitting…' : 'Submit for review'}
                  </Button>
                </div>
              </div>
            </div>
          ) : null
        ) : null}

        {/* Unanchored discussion (recipe renders it inside its formula column) */}
        {!isLabel && !isRecipe ? (
          <ObjectThread
            comments={object.comments.filter((c) => !c.anchor)}
            meName={meName}
            busy={busy}
            onComment={(b) => onComment(b)}
          />
        ) : null}
      </div>

      {/* Sticky actions bar (demo .actions) */}
      <div className="sticky bottom-0 flex items-center gap-s-2 border-t border-ink-100 bg-white px-s-4 py-s-3">
        <span className="text-ui-caption text-ink-500">
          {canReview
            ? `Review the ${meta.name.toLowerCase()}, then decide.`
            : canSubmit && !isLabel
              ? object.status === 'CHANGES_REQUESTED'
                ? 'Changes requested — revise & resubmit.'
                : 'Draft — submit when ready.'
              : object.status === 'APPROVED'
                ? '✓ Approved — any change re-opens review.'
                : object.status === 'LOCKED'
                  ? '🔒 Locked.'
                  : mode === 'creator'
                    ? `Awaiting ${partnerName}.`
                    : 'Submitted for review.'}
        </span>
        <span className="flex-1" />
        {canReview ? (
          <>
            <Input
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder="Optional note…"
              className="max-w-48"
            />
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onReview('REQUEST_CHANGES', changeNote.trim() || undefined)}>
              Request changes
            </Button>
            <Button variant="primary" size="sm" disabled={busy} onClick={() => onReview('APPROVE', changeNote.trim() || undefined)}>
              ✓ Approve v{object.currentVersion}
            </Button>
          </>
        ) : null}
        {!isLabel && canSubmit && versions.length > 0 && !editing ? (
          <Button variant="pink" size="sm" onClick={() => setEditing(true)}>
            Submit new version
          </Button>
        ) : null}
        {canReopen ? (
          <Button variant="ghost" size="sm" disabled={busy} onClick={onReopen}>
            Re-open
          </Button>
        ) : null}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Switch-maker guard (Pavel 2026-07-12) — replaces the old window.confirm.
// Switching makers DISCONNECTS a working relationship, so it must not be a
// one-click action: a warning dialog spells out the consequences and the
// destructive button stays disabled until the creator explicitly acknowledges
// the disconnect. Policy + cutoffs remain server-enforced (D-CC3); this is
// only the entry-point friction.
// ---------------------------------------------------------------------------

function SwitchMakerControl({
  partnerName,
  busy,
  onConfirm,
}: {
  partnerName: string
  busy: boolean
  onConfirm: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [ack, setAck] = React.useState(false)

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setAck(false)
          setOpen(true)
        }}
        className="rounded-pill border border-ink-200 bg-white px-s-3 py-s-1 text-ui-label normal-case tracking-normal text-ink-500 transition hover:border-danger-200 hover:text-danger-700"
      >
        Switch maker…
      </button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) setAck(false)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Disconnect from {partnerName}?</DialogTitle>
            <DialogDescription>
              Switching makers ends your working relationship with {partnerName}. This is a real
              disconnect, not a setting — here's what happens:
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-s-2 text-ui-caption text-ink-700">
            <li className="flex gap-s-2">
              <span aria-hidden className="mt-1 h-1.5 w-1.5 flex-none rounded-pill bg-danger-500" />
              This room is <b>archived</b> — its messages and decision log are kept for the record,
              but the collaboration stops.
            </li>
            <li className="flex gap-s-2">
              <span aria-hidden className="mt-1 h-1.5 w-1.5 flex-none rounded-pill bg-danger-500" />
              {partnerName} is <b>notified</b> that you've ended the collaboration.
            </li>
            <li className="flex gap-s-2">
              <span aria-hidden className="mt-1 h-1.5 w-1.5 flex-none rounded-pill bg-danger-500" />
              Any unfunded work in progress with them <b>stops</b>; your shortlist re-opens so you
              can pick a different maker.
            </li>
          </ul>
          <Checkbox
            checked={ack}
            onChange={(e) => setAck(e.currentTarget.checked)}
            label={
              <span className="text-ui-caption text-ink-700">
                I understand this ends the collaboration with <b>{partnerName}</b>.
              </span>
            }
          />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Keep working together
            </Button>
            <button
              type="button"
              disabled={!ack || busy}
              onClick={() => {
                setOpen(false)
                onConfirm()
              }}
              className="inline-flex items-center justify-center rounded-pill bg-danger-600 px-s-4 py-s-2 text-ui-caption font-bold text-white transition hover:bg-danger-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Disconnect &amp; switch maker
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// P1 dispute control (2026-07-10) — a quiet entry point that expands into a
// description box. Opens a HIGH-priority support ticket linked to the room;
// the decision log is the evidence trail and admin mediates. Deliberately
// understated: disputes are the exception, not a call to action.
// ---------------------------------------------------------------------------

function RoomDisputeControl({
  counterpartName,
  busy,
  onSubmit,
}: {
  counterpartName: string
  busy: boolean
  onSubmit: (description: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [text, setText] = React.useState('')

  if (!open) {
    return (
      // Danger-colored + pulled in from the right edge (Pavel 2026-07-12) — the
      // help entry reads as a warning-grade affordance, not chrome in a corner.
      <div className="flex justify-end border-b border-ink-100 bg-white px-s-4 py-s-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mr-s-6 text-ui-label normal-case tracking-normal text-danger-600 underline-offset-2 transition hover:text-danger-700 hover:underline"
        >
          Problem with this collaboration? Get help
        </button>
      </div>
    )
  }

  return (
    <div className="border-b border-danger-100 bg-danger-50/50 px-s-4 py-s-3">
      <div className="text-ui-caption font-bold">Open a dispute about this room</div>
      <p className="text-ui-label normal-case tracking-normal text-ink-500">
        This creates a support ticket for our team — the room's decision log is attached as
        evidence, {counterpartName} sees the dispute in the activity feed, and an admin mediates.
        Nothing in the room changes until then.
      </p>
      <div className="mt-s-2 flex flex-wrap items-center gap-s-2">
        <Input
          value={text}
          placeholder="What happened? (specifics + dates help the mediator)"
          onChange={(e) => setText(e.target.value)}
          className="min-w-64 flex-1"
        />
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={busy || text.trim().length < 20}
          onClick={() => onSubmit(text)}
        >
          {busy ? 'Opening…' : 'Open dispute'}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// P1 two-sided review card (2026-07-10) — appears once the room is CLOSED_WON.
// Star rows per dimension (mirrors the order rating page's Amazon-modal rows);
// pink stars per FEEDBACK_MODULE; server enforces the 30-day edit window.
// ---------------------------------------------------------------------------

function StarRow({
  label,
  sublabel,
  value,
  onChange,
}: {
  label: string
  sublabel: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-s-3">
      <div className="w-40 min-w-0">
        <div className="text-ui-caption font-bold">{label}</div>
        <div className="truncate text-ui-label normal-case tracking-normal text-ink-500">{sublabel}</div>
      </div>
      <div className="flex gap-0.5" role="radiogroup" aria-label={`${label} stars`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            onClick={() => onChange(value === n ? 0 : n)}
            className={cn('text-ui-section transition', n <= value ? 'text-pink-500' : 'text-ink-200 hover:text-pink-300')}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  )
}

function RoomRatingCard({
  rating,
  busy,
  onSubmit,
}: {
  rating: NonNullable<CoCreationRoomShellProps['rating']>
  busy: boolean
  onSubmit: (scores: Record<string, number>, comment?: string) => void
}) {
  const [open, setOpen] = React.useState(!rating.mine)
  const [scores, setScores] = React.useState<Record<string, number>>(rating.mine?.dimensions ?? {})
  const [comment, setComment] = React.useState(rating.mine?.comment ?? '')
  const rated = Object.entries(scores).filter(([, v]) => v > 0)

  if (!open) {
    const mine = rating.mine
    const mean =
      mine && Object.values(mine.dimensions).length
        ? (
            Object.values(mine.dimensions).reduce((a, b) => a + b, 0) /
            Object.values(mine.dimensions).length
          ).toFixed(1)
        : null
    return (
      <div className="flex flex-wrap items-center gap-s-3 border-b border-success-100 bg-success-50 px-s-4 py-s-2">
        <span className="text-ui-caption text-success-700">
          ✓ You rated {rating.counterpartName}
          {mean ? (
            <>
              {' '}
              — <span className="text-pink-500">★</span> <b>{mean}</b>
            </>
          ) : null}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-ui-label normal-case tracking-normal text-ink-500 underline-offset-2 hover:underline"
        >
          Edit (30-day window)
        </button>
      </div>
    )
  }

  return (
    <div className="border-b border-pink-100 bg-pink-50/50 px-s-4 py-s-3">
      <div className="text-ui-caption font-bold">
        How was working with {rating.counterpartName}?
      </div>
      <p className="text-ui-label normal-case tracking-normal text-ink-500">
        Your rating feeds their standing on the platform — rate what you experienced.
      </p>
      <div className="mt-s-2 grid gap-s-2 sm:grid-cols-2">
        {rating.dimensions.map((d) => (
          <StarRow
            key={d.slug}
            label={d.label}
            sublabel={d.sublabel}
            value={scores[d.slug] ?? 0}
            onChange={(v) => setScores((s) => ({ ...s, [d.slug]: v }))}
          />
        ))}
      </div>
      <div className="mt-s-2 flex flex-wrap items-center gap-s-2">
        <Input
          value={comment}
          placeholder="Optional note (visible to admins and the rated party)"
          onChange={(e) => setComment(e.target.value)}
          className="min-w-56 flex-1"
        />
        {rating.mine ? (
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        ) : null}
        <Button
          variant="primary"
          size="sm"
          disabled={busy || rated.length === 0}
          onClick={() => {
            onSubmit(Object.fromEntries(rated), comment.trim() || undefined)
            setOpen(false)
          }}
        >
          {busy ? 'Saving…' : rating.mine ? 'Update rating' : 'Submit rating'}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Milestone terms row (2026-07-10). Terms settle while PENDING: the maker
// proposes amount + scope, the creator agrees or declines. Funding stays
// gated on payments verification — copy says "payment protection", never
// "escrow" (D-CC1 mechanics note).
// ---------------------------------------------------------------------------

function milestoneStatusLine(m: RoomShellMilestone): string {
  if (m.status !== 'PENDING') return m.status.toLowerCase().replaceAll('_', ' ')
  if (m.termsStatus === 'PROPOSED') return `$${m.amount} proposed`
  if (m.termsStatus === 'AGREED') return `$${m.amount} agreed`
  return 'awaiting terms'
}

function MilestoneTermsRow({
  milestone: m,
  mode,
  busy,
  open,
  onToggle,
  onPropose,
  onAgree,
  onDecline,
}: {
  milestone: RoomShellMilestone
  mode: 'creator' | 'partner'
  busy: boolean
  open: boolean
  onToggle: () => void
  onPropose?: (amount: number, note?: string) => void
  onAgree?: () => void
  onDecline?: () => void
}) {
  const [amount, setAmount] = React.useState(Number(m.amount) > 0 ? m.amount : '')
  const [note, setNote] = React.useState(m.termsNote ?? '')
  const negotiable = m.status === 'PENDING'
  const canPropose = mode === 'partner' && negotiable && !!onPropose
  const canDecide = mode === 'creator' && negotiable && m.termsStatus === 'PROPOSED'

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-md px-s-1 py-0.5 text-left text-ui-label normal-case tracking-normal text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
      >
        <span>{MILESTONE_LABEL[m.kind] ?? m.kind}</span>
        <span
          className={cn(
            m.termsStatus === 'AGREED' && m.status === 'PENDING' && 'text-success-700',
            m.termsStatus === 'PROPOSED' && m.status === 'PENDING' && 'text-ink-900 font-bold',
          )}
        >
          {milestoneStatusLine(m)}
        </span>
      </button>

      {open ? (
        <div className="mb-s-2 mt-s-1 rounded-lg border border-ink-200 bg-white p-s-2">
          {m.termsNote && !(canPropose && m.termsStatus !== 'PROPOSED') ? (
            <p className="mb-s-2 text-ui-label normal-case tracking-normal text-ink-700">
              <b>Scope:</b> {m.termsNote}
            </p>
          ) : null}

          {canPropose ? (
            <>
              <div className="flex gap-s-2">
                <Input
                  aria-label="Milestone amount in dollars"
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount}
                  placeholder="$ amount"
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-24"
                />
                <Input
                  aria-label="Scope note"
                  value={note}
                  placeholder="Scope, e.g. 2 bench samples + 1 revision"
                  onChange={(e) => setNote(e.target.value)}
                  className="flex-1"
                />
              </div>
              <div className="mt-s-2 flex items-center gap-s-2">
                <span className="flex-1 text-ui-label normal-case tracking-normal text-ink-500">
                  {m.termsStatus === 'AGREED'
                    ? 'Agreed — re-proposing restarts the agreement.'
                    : m.termsStatus === 'PROPOSED'
                      ? 'Waiting on the creator.'
                      : null}
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy || !(Number(amount) > 0)}
                  onClick={() => onPropose!(Number(amount), note.trim() || undefined)}
                >
                  {m.termsStatus === 'UNSET' ? 'Propose terms' : 'Re-propose'}
                </Button>
              </div>
            </>
          ) : canDecide ? (
            <div className="flex items-center gap-s-2">
              <span className="flex-1 text-ui-label normal-case tracking-normal text-ink-700">
                <b>${m.amount}</b> proposed by the maker.
              </span>
              {onDecline ? (
                <Button variant="ghost" size="sm" disabled={busy} onClick={onDecline}>
                  Decline
                </Button>
              ) : null}
              {onAgree ? (
                <Button variant="primary" size="sm" disabled={busy} onClick={onAgree}>
                  ✓ Agree
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="text-ui-label normal-case tracking-normal text-ink-500">
              {m.status !== 'PENDING'
                ? `This milestone is ${m.status.toLowerCase().replaceAll('_', ' ')}.`
                : m.termsStatus === 'AGREED'
                  ? 'Terms agreed. Funding with payment protection opens once payments verification completes.'
                  : m.termsStatus === 'PROPOSED'
                    ? 'Waiting on the creator to agree or decline.'
                    : mode === 'creator'
                      ? 'Waiting for the maker to propose terms.'
                      : 'Terms not set yet.'}
            </p>
          )}

          {m.termsStatus === 'AGREED' && m.status === 'PENDING' && canPropose ? (
            <p className="mt-s-1 text-ui-label normal-case tracking-normal text-ink-500">
              Funding with payment protection opens once payments verification completes.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ingredient match picker (Pavel 2026-07-10) — pins a catalog ingredient to a
// draft recipe row so the facts label can compute. Search runs through the
// caller's server action (partner visibility scoping + rate limit live there).
// ---------------------------------------------------------------------------

function IngredientMatchPicker({
  initialQuery,
  pinned,
  search,
  create,
  onPick,
  onClear,
  onClose,
}: {
  initialQuery: string
  pinned: boolean
  search: (query: string) => Promise<IngredientPick[]>
  create?: (input: IngredientCreateInput) => Promise<
    { ok: true; ingredient: IngredientPick } | { ok: false; error: string }
  >
  onPick: (pick: IngredientPick) => void
  onClear: () => void
  onClose: () => void
}) {
  const [query, setQuery] = React.useState(initialQuery)
  const [results, setResults] = React.useState<IngredientPick[] | null>(null)
  const [loading, setLoading] = React.useState(false)
  // Inline private-ingredient create form (banned-list gate lives server-side).
  const [creating, setCreating] = React.useState(false)
  const [createBusy, setCreateBusy] = React.useState(false)
  const [createError, setCreateError] = React.useState<string | null>(null)
  const [form, setForm] = React.useState({ internalName: '', declarationName: '', density: '' })
  const [formAllergens, setFormAllergens] = React.useState<string[]>([])

  function openCreate() {
    setForm({ internalName: query.trim(), declarationName: '', density: '' })
    setFormAllergens([])
    setCreateError(null)
    setCreating(true)
  }

  async function submitCreate() {
    if (!create || !form.internalName.trim()) return
    setCreateBusy(true)
    setCreateError(null)
    const density = Number(form.density)
    const res = await create({
      internalName: form.internalName.trim(),
      labelDeclarationName: form.declarationName.trim() || form.internalName.trim(),
      allergenFlags: formAllergens,
      densityGPerML: form.density.trim() && Number.isFinite(density) && density > 0 ? density : null,
    })
    setCreateBusy(false)
    if (res.ok) onPick(res.ingredient)
    else setCreateError(res.error)
  }

  // Debounced search — also fires once on mount with the row's name.
  React.useEffect(() => {
    let alive = true
    const t = setTimeout(() => {
      setLoading(true)
      search(query)
        .then((r) => {
          if (alive) setResults(r)
        })
        .catch(() => {
          if (alive) setResults([])
        })
        .finally(() => {
          if (alive) setLoading(false)
        })
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [query, search])

  return (
    <div className="mt-s-1 rounded-lg border border-ink-200 bg-ink-50 p-s-2">
      <div className="flex items-center gap-s-2">
        <Input
          autoFocus
          value={query}
          placeholder="Search the ingredient catalog…"
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1"
        />
        {pinned ? (
          <Button variant="ghost" size="sm" onClick={onClear}>
            Unlink
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" aria-label="Close match picker" onClick={onClose}>
          ✕
        </Button>
      </div>
      {creating ? (
        <div className="mt-s-2 rounded-lg border border-ink-200 bg-white p-s-3">
          <div className="text-ui-caption font-bold">New private ingredient</div>
          <div className="mt-s-2 flex flex-col gap-s-2">
            <Input
              aria-label="Internal name"
              value={form.internalName}
              placeholder="Internal name (recipe / cost / COA)"
              onChange={(e) => setForm((f) => ({ ...f, internalName: e.target.value }))}
            />
            <Input
              aria-label="Label declaration name"
              value={form.declarationName}
              placeholder="Label declaration name (defaults to internal name)"
              onChange={(e) => setForm((f) => ({ ...f, declarationName: e.target.value }))}
            />
            <div className="flex flex-wrap gap-s-1">
              {BIG9_ALLERGENS.map((a) => {
                const on = formAllergens.includes(a)
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() =>
                      setFormAllergens((xs) => (on ? xs.filter((x) => x !== a) : [...xs, a]))
                    }
                    className={cn(
                      'rounded-pill px-s-2 py-s-1 text-ui-label tracking-normal transition',
                      on ? 'bg-warning-50 text-warning-700' : 'bg-ink-100 text-ink-600 hover:text-ink-900',
                    )}
                  >
                    {on ? '⚠ ' : ''}
                    {a.replace('_', ' ')}
                  </button>
                )
              })}
            </div>
            <Input
              aria-label="Density grams per milliliter"
              type="number"
              min={0}
              step="0.01"
              value={form.density}
              placeholder="Density g/mL (optional — volume↔mass conversion)"
              onChange={(e) => setForm((f) => ({ ...f, density: e.target.value }))}
            />
          </div>
          {createError ? (
            <p className="mt-s-2 text-ui-label normal-case tracking-normal text-danger-700">
              {createError}
            </p>
          ) : null}
          <p className="mt-s-2 text-ui-label normal-case tracking-normal text-ink-500">
            Saved as your private, self-attested catalog row. Add nutrition data in your product
            editor so the facts label computes real values for it.
          </p>
          <div className="mt-s-2 flex gap-s-2">
            <span className="flex-1" />
            <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
              Back
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={createBusy || !form.internalName.trim()}
              onClick={submitCreate}
            >
              {createBusy ? 'Creating…' : 'Create & match'}
            </Button>
          </div>
        </div>
      ) : (
      <div className="mt-s-1 max-h-44 overflow-y-auto">
        {loading && !results ? (
          <p className="px-s-2 py-s-1 text-ui-label normal-case tracking-normal text-ink-500">Searching…</p>
        ) : results && results.length === 0 ? (
          <div className="px-s-2 py-s-1">
            <p className="text-ui-label normal-case tracking-normal text-ink-500">
              No catalog match.
            </p>
            {create ? (
              <Button variant="outline" size="sm" className="mt-s-1" onClick={openCreate}>
                ＋ Create private ingredient “{query.trim() || '…'}”
              </Button>
            ) : null}
          </div>
        ) : (
          (results ?? []).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p)}
              className="flex w-full items-center gap-s-2 rounded-md px-s-2 py-s-1 text-left transition hover:bg-white"
            >
              <span className="min-w-0 flex-1 truncate text-ui-caption">
                <b>{p.name}</b>
                {p.declarationName && p.declarationName !== p.name ? (
                  <span className="text-ink-500"> · label: {p.declarationName}</span>
                ) : null}
              </span>
              {p.allergenFlags.length > 0 ? (
                <span className="flex-none text-ui-label normal-case tracking-normal text-warning-700">
                  ⚠ {p.allergenFlags.join(', ')}
                </span>
              ) : null}
              <span className="flex-none rounded-pill bg-ink-100 px-s-2 py-0.5 text-ui-label tracking-normal text-ink-600">
                {sourceChipLabel(p.source)}
              </span>
            </button>
          ))
        )}
        {create && results && results.length > 0 ? (
          <button
            type="button"
            onClick={openCreate}
            className="mt-s-1 w-full rounded-md px-s-2 py-s-1 text-left text-ui-label normal-case tracking-normal text-pink-700 transition hover:bg-white"
          >
            ＋ None of these — create a private ingredient
          </button>
        ) : null}
      </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Live facts label + MANDATORY statements (Pavel 2026-07-10, mockup-approved).
// Domain-aware; every value computed by @ilaunchify/nutrition from resolved
// catalog rows — coverage is always disclosed, allergens gated on 100%.
// ---------------------------------------------------------------------------

function RecipeFactsSidebar({
  label,
  versionNote,
}: {
  label: RoomRecipeLabelView
  /** Shown instead of the live-preview footnote when viewing an OLDER version. */
  versionNote?: string | null
}) {
  const partial = label.coverage.resolved < label.coverage.total
  const netLine = label.serving.netQuantity ? formatNetQuantity(label.serving.netQuantity) : null
  const isFoodish = label.domain === 'FOOD' || label.domain === 'BEVERAGE_FUNCTIONAL'

  return (
    <aside aria-label="Live label preview" className="mt-s-4 xl:mt-0">
      {partial ? (
        <div className="mb-s-2 rounded-lg bg-warning-50 px-s-3 py-s-2 text-ui-label normal-case tracking-normal text-warning-700">
          ⚠ Facts from {label.coverage.resolved} of {label.coverage.total} ingredients — match{' '}
          {label.coverage.unresolvedNames.slice(0, 2).join(', ')}
          {label.coverage.unresolvedNames.length > 2 ? '…' : ''} to complete.
        </div>
      ) : null}

      {/* FALCPA safety gate — UI status, never printed on the artifact */}
      {label.containsIncomplete ? (
        <div className="mb-s-2 rounded-lg bg-warning-50 px-s-3 py-s-2 text-ui-label normal-case tracking-normal text-warning-700">
          ⚠ Allergen statement pending — {label.coverage.unresolvedNames.length} ingredient
          {label.coverage.unresolvedNames.length === 1 ? '' : 's'} unresolved.
        </div>
      ) : null}

      {/* The regulated artifact itself — same SVG renderers as the product
          builder + label download (statements print INSIDE the artifact). */}
      {isFoodish ? (
        label.panel ? (
          <div className="rounded-lg border border-ink-200 bg-white p-s-2">
            <NutritionFactsSvg
              data={label.panel}
              ingredientStatement={label.statement ?? undefined}
              contains={label.containsLine ?? undefined}
              widthPx={null}
            />
          </div>
        ) : (
          <p className="rounded-lg bg-white px-s-3 py-s-3 text-ui-label normal-case tracking-normal text-ink-500">
            Add serving size &amp; servings per container in the next version to compute the
            Nutrition Facts panel.
          </p>
        )
      ) : label.domain === 'SUPPLEMENT' ? (
        label.panel ? (
          <div className="rounded-lg border border-ink-200 bg-white p-s-2">
            <SupplementFactsSvg
              data={label.panel}
              otherIngredients={label.otherIngredients ?? []}
              widthPx={null}
            />
          </div>
        ) : (
          <p className="rounded-lg bg-white px-s-3 py-s-3 text-ui-label normal-case tracking-normal text-ink-500">
            Add the structured formulation (dietary ingredients with per-serving amounts) in the
            next version to render the Supplement Facts panel.
          </p>
        )
      ) : label.domain === 'OTC' ? (
        label.drugFacts ? (
          <div className="rounded-lg border border-ink-200 bg-white p-s-2">
            <DrugFactsSvg data={label.drugFacts} widthPx={null} />
          </div>
        ) : (
          <p className="rounded-lg bg-white px-s-3 py-s-3 text-ui-label normal-case tracking-normal text-ink-500">
            Add the Drug Facts sections (at least one active ingredient) in the next version to
            render the panel.
          </p>
        )
      ) : label.domain === 'COSMETIC' && label.inciText ? (
        <div className="rounded-lg border border-ink-200 bg-white p-s-2">
          <InciDeclarationSvg
            ingredients={label.inciText}
            netContents={netLine ?? undefined}
            widthPx={null}
          />
        </div>
      ) : label.domain === 'PET' && (label.petOrder || label.petGa) ? (
        <>
          <div className="rounded-lg border border-ink-200 bg-white p-s-2">
            <GuaranteedAnalysisSvg
              gaRows={label.petGa?.rows ?? []}
              ingredients={label.petOrder?.join(', ') ?? undefined}
              adequacyStatement={label.petGa?.adequacyStatement ?? undefined}
              feedingDirections={label.petGa?.feedingDirections ?? undefined}
              netContents={netLine ?? undefined}
              widthPx={null}
            />
          </div>
          {!label.petGa ? (
            <p className="mt-s-1 text-ui-label normal-case tracking-normal text-ink-500">
              Add guaranteed-analysis values from lab results in the next version to complete
              the panel.
            </p>
          ) : null}
        </>
      ) : label.statement ? (
        // No printable artifact yet (e.g. SUPPLEMENT panel pending) — show the
        // computed 101.4 statement as text until the artifact can render.
        <div className="rounded-lg border border-ink-200 bg-white p-s-3">
          <div className="text-ui-label uppercase text-ink-900">Ingredients</div>
          <p className="mt-s-1 text-ui-label normal-case tracking-normal text-ink-700">{label.statement}</p>
        </div>
      ) : (
        <p className="rounded-lg bg-white px-s-3 py-s-3 text-ui-label normal-case tracking-normal text-ink-500">
          Ingredient statement needs gram amounts on matched rows.
        </p>
      )}

      {/* Net quantity is a principal-display-panel element (101.105) — shown
          as a caption where the artifact doesn't carry it. */}
      {isFoodish && netLine ? (
        <p className="mt-s-1 text-ui-label uppercase tracking-normal text-ink-900">{netLine}</p>
      ) : null}
      {!label.containsIncomplete && !label.containsLine ? (
        <p className="mt-s-1 text-ui-label normal-case tracking-normal text-ink-500">
          No Big-9 allergens declared by the matched ingredients.
        </p>
      ) : null}
      {versionNote ? (
        <p className="mt-s-1 text-ui-label normal-case tracking-normal text-warning-700">
          ⚠ {versionNote}
        </p>
      ) : (
        <p className="mt-s-1 text-ui-label normal-case tracking-normal text-ink-400">
          Live preview — computed from catalog data, updates with each version.
        </p>
      )}

      <CompliancePrecheck label={label} />
    </aside>
  )
}

/** P2 label compliance pre-check — per-domain mandatory-element readiness.
 *  INFORMS, never blocks: the full compliance scan runs in the Studio. */
function CompliancePrecheck({ label }: { label: RoomRecipeLabelView }) {
  const [open, setOpen] = React.useState(false)
  const report = checkRoomLabelReadiness(label)
  const blocking = report.items.filter((i) => i.severity === 'BLOCKING').length
  const warnings = report.items.length - blocking

  return (
    <div className="mt-s-2 rounded-lg border border-ink-200 bg-white p-s-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-s-2 text-left"
        aria-expanded={open}
      >
        <span
          className={cn(
            'rounded-pill px-s-2 py-0.5 text-ui-label tracking-normal',
            report.outcome === 'READY'
              ? 'bg-success-50 text-success-700'
              : report.outcome === 'READY_WITH_WARNINGS'
                ? 'bg-warning-50 text-warning-700'
                : 'bg-danger-50 text-danger-700',
          )}
        >
          {report.outcome === 'READY'
            ? '✓ label pre-check passed'
            : report.outcome === 'READY_WITH_WARNINGS'
              ? `⚠ ${warnings} warning${warnings === 1 ? '' : 's'}`
              : `✕ ${blocking} blocking · ${warnings} warning${warnings === 1 ? '' : 's'}`}
        </span>
        <span className="flex-1" />
        {report.items.length > 0 ? (
          <span className="text-ui-label normal-case tracking-normal text-ink-400">{open ? '▴' : '▾'}</span>
        ) : null}
      </button>
      {open && report.items.length > 0 ? (
        <ul className="mt-s-2 space-y-s-1">
          {report.items.map((i) => (
            <li
              key={i.id}
              className={cn(
                'text-ui-label normal-case tracking-normal',
                i.severity === 'BLOCKING' ? 'text-danger-700' : 'text-warning-700',
              )}
              title={i.cfr}
            >
              {i.severity === 'BLOCKING' ? '✕' : '⚠'} {i.message}
              {i.cfr ? <span className="text-ink-400"> · {i.cfr}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <p className="mt-s-2 text-ui-label normal-case tracking-normal text-ink-400">
          Early warning only — the full compliance scan runs when the product is finished in the
          Studio.
        </p>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Label compare (Pavel 2026-07-10) — diffs the previous vs latest computed
// labels: serving line, every panel nutrient (by row id), ingredient
// statement / INCI / pet order, Contains line, net quantity. Rendered next
// to the formula compare so the two diffs read together.
// ---------------------------------------------------------------------------

interface LabelDiffItem {
  name: string
  from: string | null
  to: string | null
}

function panelRowMap(panel: PanelData | null) {
  const m = new Map<string, { label: string; value: string }>()
  for (const r of panel?.rows ?? []) {
    const dv =
      r.dvText ?? (r.noDailyValue ? '†' : r.percentDailyValue != null ? `${r.percentDailyValue}%` : null)
    m.set(r.id || r.label, {
      label: r.label,
      value: `${r.amount}${r.unit ?? ''}${dv ? ` · ${dv} DV` : ''}`,
    })
  }
  return m
}

function diffLabels(prev: RoomRecipeLabelView, next: RoomRecipeLabelView): LabelDiffItem[] {
  const items: LabelDiffItem[] = []

  // Serving line
  const servingOf = (l: RoomRecipeLabelView) =>
    l.serving.sizeG != null
      ? `${l.serving.sizeDesc ?? `${l.serving.sizeG}g`}${l.serving.perContainer != null ? ` × ${l.serving.perContainer}` : ''}`
      : null
  const sPrev = servingOf(prev)
  const sNext = servingOf(next)
  if (sPrev !== sNext) items.push({ name: 'Serving', from: sPrev, to: sNext })

  // Panel nutrients, keyed by row id — next's order first, then prev-only rows.
  const pm = panelRowMap(prev.panel)
  const nm = panelRowMap(next.panel)
  for (const [key, n] of nm) {
    const p = pm.get(key)
    if (!p) items.push({ name: n.label, from: null, to: n.value })
    else if (p.value !== n.value) items.push({ name: n.label, from: p.value, to: n.value })
  }
  for (const [key, p] of pm) {
    if (!nm.has(key)) items.push({ name: p.label, from: p.value, to: null })
  }

  // PET Guaranteed Analysis — diff by row label (values are lab results).
  const gaPrev = new Map((prev.petGa?.rows ?? []).map((r) => [r.label, r.value]))
  const gaNext = new Map((next.petGa?.rows ?? []).map((r) => [r.label, r.value]))
  for (const [k, v] of gaNext) {
    const p = gaPrev.get(k)
    if (p === undefined) items.push({ name: k, from: null, to: v })
    else if (p !== v) items.push({ name: k, from: p, to: v })
  }
  for (const [k, v] of gaPrev) {
    if (!gaNext.has(k)) items.push({ name: k, from: v, to: null })
  }

  // OTC Drug Facts — actives diffed by name; long sections collapse to "updated".
  const dfPrev = prev.drugFacts
  const dfNext = next.drugFacts
  if (dfPrev || dfNext) {
    const aPrev = new Map((dfPrev?.activeIngredients ?? []).map((a) => [a.name, a.purpose]))
    const aNext = new Map((dfNext?.activeIngredients ?? []).map((a) => [a.name, a.purpose]))
    for (const [k, v] of aNext) {
      const p = aPrev.get(k)
      if (p === undefined) items.push({ name: k, from: null, to: v || 'added' })
      else if (p !== v) items.push({ name: k, from: p, to: v })
    }
    for (const [k, v] of aPrev) {
      if (!aNext.has(k)) items.push({ name: k, from: v || 'present', to: null })
    }
    const section = (name: string, a: string, b: string) => {
      if (a !== b) items.push({ name, from: a ? 'previous' : null, to: b ? 'updated' : null })
    }
    section('Uses', (dfPrev?.uses ?? []).join('|'), (dfNext?.uses ?? []).join('|'))
    section(
      'Warnings',
      (dfPrev?.warnings ?? []).map((w) => w.text).join('|'),
      (dfNext?.warnings ?? []).map((w) => w.text).join('|'),
    )
    section('Directions', dfPrev?.directions ?? '', dfNext?.directions ?? '')
    section('Inactive ingredients', dfPrev?.inactiveIngredients ?? '', dfNext?.inactiveIngredients ?? '')
  }

  // Mandatory statements — long text collapses to "updated".
  const stmtOf = (l: RoomRecipeLabelView) =>
    l.inciText ?? l.petOrder?.join(', ') ?? l.otherIngredients?.join(', ') ?? l.statement
  if (stmtOf(prev) !== stmtOf(next) && (stmtOf(prev) || stmtOf(next))) {
    items.push({
      name: 'Ingredient statement',
      from: stmtOf(prev) ? 'previous order' : null,
      to: stmtOf(next) ? 'updated' : null,
    })
  }
  if (prev.containsLine !== next.containsLine) {
    items.push({ name: 'Contains', from: prev.containsLine, to: next.containsLine })
  }
  const netOf = (l: RoomRecipeLabelView) =>
    l.serving.netQuantity ? formatNetQuantity(l.serving.netQuantity) : null
  if (netOf(prev) !== netOf(next)) items.push({ name: 'Net quantity', from: netOf(prev), to: netOf(next) })

  return items
}

function RecipeFactsCompare({
  latest,
  previous,
  latestVersion,
  prevVersion,
}: {
  latest: RoomRecipeLabelView
  previous: RoomRecipeLabelView | null
  latestVersion: number
  prevVersion: number
}) {
  const diff = previous ? diffLabels(previous, latest) : []

  return (
    <aside aria-label="Label comparison" className="mt-s-4 xl:mt-0">
      <div className="mb-s-2 rounded-lg border border-ink-200 bg-white p-s-3">
        <div className="text-ui-label uppercase text-ink-900">
          Label · v{prevVersion} → v{latestVersion}
        </div>
        {!previous ? (
          <p className="mt-s-1 text-ui-label normal-case tracking-normal text-ink-500">
            v{prevVersion} has no computable label (missing serving or unmatched rows) — showing
            v{latestVersion} only.
          </p>
        ) : diff.length === 0 ? (
          <p className="mt-s-1 text-ui-label normal-case tracking-normal text-success-700">
            ✓ No label impact — facts, statements and net quantity are unchanged.
          </p>
        ) : (
          <div className="mt-s-1">
            {diff.map((d, i) => (
              <div
                key={i}
                className="flex items-baseline justify-between gap-s-2 border-b border-ink-100 py-s-1 last:border-0"
              >
                <span className="text-ui-label normal-case tracking-normal text-ink-600">{d.name}</span>
                <span className="text-right text-ui-label normal-case tracking-normal text-ink-900">
                  {d.from ? <span className="text-ink-400 line-through">{d.from}</span> : null}
                  {d.from && d.to ? ' ' : null}
                  {d.to ? <b>{d.to}</b> : d.from ? <b className="text-danger-700">removed</b> : null}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Latest label for context under the diff — same print-grade artifact */}
      {(latest.domain === 'FOOD' || latest.domain === 'BEVERAGE_FUNCTIONAL') && latest.panel ? (
        <div className="rounded-lg border border-ink-200 bg-white p-s-2">
          <NutritionFactsSvg
            data={latest.panel}
            ingredientStatement={latest.statement ?? undefined}
            contains={latest.containsLine ?? undefined}
            widthPx={null}
          />
        </div>
      ) : latest.domain === 'SUPPLEMENT' && latest.panel ? (
        <div className="rounded-lg border border-ink-200 bg-white p-s-2">
          <SupplementFactsSvg
            data={latest.panel}
            otherIngredients={latest.otherIngredients ?? []}
            widthPx={null}
          />
        </div>
      ) : latest.domain === 'OTC' && latest.drugFacts ? (
        <div className="rounded-lg border border-ink-200 bg-white p-s-2">
          <DrugFactsSvg data={latest.drugFacts} widthPx={null} />
        </div>
      ) : latest.domain === 'PET' && (latest.petOrder || latest.petGa) ? (
        <div className="rounded-lg border border-ink-200 bg-white p-s-2">
          <GuaranteedAnalysisSvg
            gaRows={latest.petGa?.rows ?? []}
            ingredients={latest.petOrder?.join(', ') ?? undefined}
            adequacyStatement={latest.petGa?.adequacyStatement ?? undefined}
            feedingDirections={latest.petGa?.feedingDirections ?? undefined}
            widthPx={null}
          />
        </div>
      ) : null}
      <p className="mt-s-1 text-ui-label normal-case tracking-normal text-ink-400">
        Both labels computed from catalog data for their own formula version.
      </p>
    </aside>
  )
}

// ---------------------------------------------------------------------------
// LABEL pin-proofing board (demo screen ⑥ .proof/.can/.pin)
// ---------------------------------------------------------------------------

function LabelPinBoard({
  object,
  mode,
  meName,
  busy,
  gradient,
  briefTitle,
  partnerName,
  onComment,
}: {
  object: RoomShellObject
  mode: 'creator' | 'partner'
  meName: string
  busy: boolean
  gradient: string
  briefTitle: string
  partnerName: string
  onComment: (body: string, anchor?: string) => void
}) {
  const [pending, setPending] = React.useState<{ x: number; y: number } | null>(null)
  const [note, setNote] = React.useState('')

  const pins = object.comments
    .map((c) => {
      const m = c.anchor?.match(PIN_ANCHOR)
      return m ? { ...c, x: Number(m[1]), y: Number(m[2]) } : null
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)

  function dropPin(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    setPending({
      x: Math.round(((e.clientX - r.left) / r.width) * 100),
      y: Math.round(((e.clientY - r.top) / r.height) * 100),
    })
  }

  function sendPin() {
    if (!pending || !note.trim()) return
    onComment(note, `${pending.x},${pending.y}`)
    setPending(null)
    setNote('')
  }

  const titleWords = briefTitle.replace(/^Demo — /, '').split(' ')

  return (
    <div className="grid gap-s-3 sm:grid-cols-2">
      {/* Proof canvas */}
      <div className="flex flex-col items-center rounded-lg border border-dashed border-ink-300 bg-white p-s-4">
        <div
          role="button"
          aria-label="Label proof — click to drop a feedback pin"
          tabIndex={0}
          onClick={dropPin}
          className="relative h-48 w-28 cursor-crosshair rounded-lg shadow-lg"
          style={{ background: gradient }}
        >
          <div className="absolute inset-x-s-2 bottom-1/4 top-1/4 flex flex-col items-center justify-center rounded-md bg-white/90">
            <div className="text-center font-display text-ui-label normal-case leading-tight tracking-normal text-ink-900">
              {titleWords.slice(0, 2).join(' ').toUpperCase()}
            </div>
            <div className="mt-s-1 text-center text-[0.5rem] text-ink-500">{titleWords.slice(2).join(' ')}</div>
          </div>
          {pins.map((p, i) => (
            <span
              key={p.id}
              title={p.body}
              className="absolute flex h-5 w-5 -translate-x-1/2 -translate-y-full items-center justify-center rounded-[50%_50%_50%_2px] border-2 border-white bg-pink-500 text-ui-label tracking-normal text-white shadow-md"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            >
              {i + 1}
            </span>
          ))}
          {pending ? (
            <span
              aria-hidden
              className="absolute flex h-5 w-5 -translate-x-1/2 -translate-y-full animate-pulse items-center justify-center rounded-[50%_50%_50%_2px] border-2 border-white bg-ink-900 text-ui-label tracking-normal text-white shadow-md"
              style={{ left: `${pending.x}%`, top: `${pending.y}%` }}
            >
              +
            </span>
          ) : null}
        </div>
        <p className="mt-s-2 text-ui-label normal-case tracking-normal text-ink-500">
          💡 Click the label to drop a feedback pin
        </p>
        {pending ? (
          <div className="mt-s-2 flex w-full gap-s-2">
            <Input
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Pin note…"
              onKeyDown={(e) => e.key === 'Enter' && sendPin()}
            />
            <Button variant="primary" size="sm" disabled={busy || !note.trim()} onClick={sendPin}>
              Pin
            </Button>
          </div>
        ) : null}
      </div>

      {/* Pin list */}
      <div>
        <div className="mb-s-2 text-ui-caption font-bold">Pinned feedback ({pins.length})</div>
        {pins.length === 0 ? (
          <p className="text-ui-caption text-ink-500">No pins yet.</p>
        ) : (
          pins.map((p, i) => (
            <div key={p.id} className="mb-s-2 flex gap-s-2 rounded-lg border border-ink-200 bg-white px-s-3 py-s-2">
              <span className="flex h-5 w-5 flex-none items-center justify-center rounded-pill bg-pink-500 text-ui-label tracking-normal text-white">
                {i + 1}
              </span>
              <div className="text-ui-caption">
                <span className="text-ink-700">{p.body}</span>
                <span className="ml-s-1 text-ui-label normal-case tracking-normal text-ink-400">
                  {p.authorRole === 'CREATOR' ? 'Creator' : 'Maker'} · {timeAgo(p.createdAt)}
                </span>
              </div>
            </div>
          ))
        )}
        <p className="mt-s-2 text-ui-label normal-case tracking-normal text-ink-500">
          {mode === 'creator'
            ? `Pins go to ${partnerName} with the next change request.`
            : `Awaiting ${meName === partnerName ? 'the creator' : meName}’s pins before revising.`}
        </p>
      </div>
    </div>
  )
}

function ObjectThread({
  comments,
  meName,
  busy,
  onComment,
}: {
  comments: RoomObjectComment[]
  meName: string
  busy: boolean
  onComment: (body: string) => void
}) {
  const [body, setBody] = React.useState('')
  return (
    <div className="mt-s-4 border-t border-ink-100 pt-s-3">
      <div className="text-ui-label uppercase text-ink-500">Discussion ({comments.length})</div>
      <div className="mt-s-2">
        {comments.map((c) => (
          <div key={c.id} className="mb-s-2 flex gap-s-2">
            <AuthorAvatar role={c.authorRole} />
            <div className="text-ui-caption">
              <b>{c.authorRole === 'CREATOR' ? 'Creator' : 'Maker'}</b>{' '}
              <span className="text-ui-label normal-case tracking-normal text-ink-400">{timeAgo(c.createdAt)}</span>
              <div className="text-ink-700">{c.body}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-s-2 flex gap-s-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={`Comment as ${meName}…`}
          rows={2}
          className="flex-1"
        />
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || !body.trim()}
          onClick={() => {
            onComment(body)
            setBody('')
          }}
        >
          Send
        </Button>
      </div>
    </div>
  )
}

function MessagesRail({
  messages,
  mode,
  creatorName,
  partnerName,
  busy,
  onSend,
}: {
  messages: RoomShellMessage[]
  mode: 'creator' | 'partner'
  creatorName: string
  partnerName: string
  busy: boolean
  onSend: (body: string) => void
}) {
  const [body, setBody] = React.useState('')
  const meRole = mode === 'creator' ? 'CREATOR' : 'PARTNER'
  const endRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto p-s-4">
        {messages.length === 0 ? (
          <p className="text-ui-caption text-ink-500">
            Say hello — everything stays in the room, no email needed.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.authorRole === meRole
            return (
              <div key={m.id} className={cn('mb-s-3 flex gap-s-2', mine && 'flex-row-reverse')}>
                <AuthorAvatar role={m.authorRole} />
                <div
                  className={cn(
                    'max-w-[80%] rounded-lg px-s-3 py-s-2 text-ui-caption',
                    mine ? 'bg-pink-50' : 'bg-ink-100',
                  )}
                >
                  <div className="text-ui-label normal-case tracking-normal text-ink-500">
                    {m.authorRole === 'CREATOR' ? creatorName : partnerName}
                  </div>
                  {m.body}
                </div>
              </div>
            )
          })
        )}
        <div ref={endRef} />
      </div>
      <div className="flex gap-s-2 border-t border-ink-100 bg-white p-s-3">
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Message…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && body.trim()) {
              onSend(body)
              setBody('')
            }
          }}
        />
        <Button
          variant="primary"
          size="sm"
          disabled={busy || !body.trim()}
          onClick={() => {
            onSend(body)
            setBody('')
          }}
        >
          ➤
        </Button>
      </div>
    </>
  )
}
