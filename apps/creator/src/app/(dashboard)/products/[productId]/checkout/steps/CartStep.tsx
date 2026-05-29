'use client'

// Step 7 — My cart (G5).
//
// Final review surface. Renders a digest of every prior choice + a promo
// code input + the DS-69 'Proceed at my risk' ack panel when blocking
// compliance findings remain. Pay button hands off to
// placeOrderFromCheckoutDraft → Stripe Checkout → success page.
//
// V1 compliance scan note: the canvas-side scan runs against a Fabric
// Canvas, which is heavy to stage here. The CartStep instead trusts the
// latest scan that the canvas / ExportModal performed, surfaced via the
// product's last DesignVersion.generationMeta.complianceAckHistory. A
// re-scan happens canvas-side; this step's job is to honour that result
// + collect the explicit acknowledgement when the creator is overriding.

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertOctagon, Loader2, RefreshCcw, ShieldCheck, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { StepShell } from './_StepShell'
import type { CartState, CheckoutDraftState } from '../types'
import { placeOrderFromCheckoutDraft } from '../cart-actions'
import { applyOrderAdjustment } from '../adjust-actions'

interface Props {
  productId: string
  state: CartState
  draft: CheckoutDraftState
  onChange: (patch: Partial<CartState>) => void
}

export function CartStep({ productId, state, draft, onChange }: Props) {
  const router = useRouter()
  const [isPaying, startPaying] = useTransition()
  const isAdjustment = Boolean(draft.isAdjustmentForOrderId)

  // For now, the wizard trusts the canvas's blocking state via a count we
  // could persist on the draft (G2 will fill this in). V1 surfaces the
  // ack panel only when the creator has consciously turned it on by
  // ticking the box themselves on this step. G2 will set
  // blockingFindingIds dynamically.
  const blockingCount = state.complianceAck?.blockingFindingIds.length ?? 0
  const hasBlockings = blockingCount > 0
  const acknowledged = !!state.complianceAck?.acknowledged

  const ready = isReadyToPay(draft)

  function toggleAck() {
    if (acknowledged) {
      onChange({ complianceAck: null })
      return
    }
    onChange({
      complianceAck: {
        acknowledged: true,
        acknowledgedAt: new Date().toISOString(),
        blockingFindingIds: state.complianceAck?.blockingFindingIds ?? [],
      },
    })
  }

  function pay() {
    if (!ready.ok) {
      toast.error(ready.error)
      return
    }
    if (hasBlockings && !acknowledged) {
      toast.error('Tick the Proceed-at-my-risk acknowledgement before paying.')
      return
    }
    startPaying(async () => {
      if (isAdjustment) {
        // H3.1 — resubmit instead of pay. No Stripe handoff; the order
        // is already paid. We only revoke acceptances on impacted
        // dispatches and bump manifestVersion.
        const result = await applyOrderAdjustment({
          productId,
          draft,
        })
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        toast.success(
          `Adjustment submitted — ${result.data.adjustedDispatchCount} partner gate${
            result.data.adjustedDispatchCount === 1 ? '' : 's'
          } notified.`,
        )
        router.push(`/orders/${draft.isAdjustmentForOrderId}`)
        return
      }

      const result = await placeOrderFromCheckoutDraft(productId, {
        complianceAck: state.complianceAck,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      // Hand off to Stripe Checkout. Cancel returns to /checkout where
      // the draft will be missing — the success page handles both legs.
      window.location.href = result.data.checkoutUrl
    })
  }

  return (
    <StepShell
      index={7}
      title="My cart"
      subtitle="One last review before payment."
    >
      <div className="space-y-5">
        {/* Snapshot of the order from the draft */}
        <DraftSnapshot draft={draft} />

        {/* Promo code */}
        <div className="rounded-lg border border-ink-200 bg-white p-4">
          <label className="text-[10.5px] font-semibold uppercase tracking-widest text-ink-500">
            Promo code (optional)
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              value={state.promoCode ?? ''}
              onChange={(e) =>
                onChange({
                  promoCode: e.target.value.trim().toUpperCase() || null,
                })
              }
              placeholder="LAUNCH50"
              className="block w-48 rounded-md border border-ink-200 px-3 py-1.5 text-sm uppercase tracking-wider focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
            />
            {state.promoCode && (
              <span className="text-[11px] text-ink-500">
                Validated at payment time — invalid codes won&apos;t block payment.
              </span>
            )}
          </div>
        </div>

        {/* Compliance ack panel — only when blockings remain */}
        {hasBlockings && (
          <BlockingAckPanel
            count={blockingCount}
            acknowledged={acknowledged}
            onToggle={toggleAck}
          />
        )}

        {/* Pay / Resubmit button + readiness messaging */}
        <div
          className={
            'rounded-xl border p-5 ' +
            (isAdjustment
              ? 'border-amber-300 bg-amber-50/40'
              : 'border-pink-200 bg-pink-50/40')
          }
        >
          <div className="mb-2 flex items-center gap-2">
            {isAdjustment ? (
              <RefreshCcw className="h-4 w-4 text-amber-700" />
            ) : (
              <Sparkles className="h-4 w-4 text-pink-600" />
            )}
            <p
              className={
                'text-[10.5px] font-semibold uppercase tracking-widest ' +
                (isAdjustment ? 'text-amber-800' : 'text-pink-700')
              }
            >
              {isAdjustment ? 'Resubmit for re-acceptance' : 'Ready to ship'}
            </p>
          </div>
          {ready.ok ? (
            <p className="text-sm text-ink-700">
              {isAdjustment
                ? 'No additional charge. Only the partner gates whose terms you changed will need to re-accept the new spec.'
                : "Stripe will collect payment and we'll route the order to your chosen partners. You can track progress from My orders."}
            </p>
          ) : (
            <p className="text-sm text-pink-700">{ready.error}</p>
          )}
          <button
            type="button"
            onClick={pay}
            disabled={isPaying || !ready.ok || (hasBlockings && !acknowledged)}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink-900 px-6 py-2.5 text-xs font-semibold uppercase tracking-wider text-white shadow-sm hover:bg-black disabled:opacity-50"
          >
            {isPaying ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {isAdjustment ? 'Resubmitting…' : 'Handing off to Stripe…'}
              </>
            ) : isAdjustment ? (
              'Resubmit adjustment'
            ) : hasBlockings && acknowledged ? (
              'Proceed at my risk + pay'
            ) : (
              'Pay with Stripe'
            )}
          </button>
          {/* Forward-pointer for G8 — production export bundle generation
              kicks off in the Stripe webhook, not here. The creator's
              client just rides Stripe → success page. */}
        </div>
      </div>
    </StepShell>
  )
}

// =============================================================================
// Draft snapshot — read-only digest so creators see what they're paying for
// =============================================================================

function DraftSnapshot({ draft }: { draft: CheckoutDraftState }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-5">
      <h3 className="text-[10.5px] font-semibold uppercase tracking-widest text-ink-500">
        Your order
      </h3>
      <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
        <Line label="Quantity" value={draft.production.quantity ?? '—'} />
        <Line label="Substrate" value={draft.production.substrateSlug ?? '—'} />
        <Line
          label="Packaging"
          value={draft.production.packagingMaterialSlug ?? '—'}
        />
        <Line
          label="Finishes"
          value={
            draft.production.finishPartnerFinishIds.length === 0
              ? 'None'
              : `${draft.production.finishPartnerFinishIds.length} applied`
          }
        />
        <Line
          label="Ship to"
          value={humanShipTo(draft)}
        />
        <Line
          label="Save address"
          value={draft.fulfillment.saveNewAddress ? 'Yes' : '—'}
        />
      </dl>
    </div>
  )
}

function Line({
  label,
  value,
}: {
  label: string
  value: string | number
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-ink-100 py-1 last:border-0">
      <dt className="text-[11px] uppercase tracking-wider text-ink-500">
        {label}
      </dt>
      <dd className="truncate text-right text-ink-800">{value}</dd>
    </div>
  )
}

function humanShipTo(draft: CheckoutDraftState): string {
  const t = draft.fulfillment.shipToType
  if (!t) return '—'
  if (t === 'CLOSEST_WAREHOUSE') return 'Closest WAREHOUSE'
  if (t === 'SPECIFIC_WAREHOUSE') return 'Specific WAREHOUSE'
  if (t === 'SAVED_ADDRESS') return 'Saved address'
  if (t === 'NEW_ADDRESS' && draft.fulfillment.newAddress) {
    const a = draft.fulfillment.newAddress
    return `${a.city}, ${a.state ?? a.country}`
  }
  return 'New address'
}

// =============================================================================
// Readiness check — same gates the server action enforces, surfaced early.
// =============================================================================

function isReadyToPay(
  draft: CheckoutDraftState,
): { ok: true } | { ok: false; error: string } {
  if (!draft.production.quantity || draft.production.quantity <= 0) {
    return { ok: false, error: 'Pick a quantity in step 2 first.' }
  }
  if (!draft.production.substrateSlug) {
    return { ok: false, error: 'Pick a label substrate in step 2 first.' }
  }
  if (!draft.production.packagingMaterialSlug) {
    return { ok: false, error: 'Pick a packaging material in step 2 first.' }
  }
  if (!draft.fulfillment.shipToType) {
    return { ok: false, error: 'Pick a ship-to in step 4 first.' }
  }
  return { ok: true }
}

// =============================================================================
// Blocking ack panel (DS-69 pattern, verb switched to Proceed)
// =============================================================================

function BlockingAckPanel({
  count,
  acknowledged,
  onToggle,
}: {
  count: number
  acknowledged: boolean
  onToggle: () => void
}) {
  return (
    <section
      role="alert"
      className={
        'rounded-md border p-4 ' +
        (acknowledged
          ? 'border-amber-300 bg-amber-50/60'
          : 'border-pink-500 bg-pink-50')
      }
    >
      <div className="flex items-start gap-2.5">
        <AlertOctagon
          className={
            'mt-0.5 h-4 w-4 flex-shrink-0 ' +
            (acknowledged ? 'text-amber-700' : 'text-pink-700')
          }
        />
        <div className="flex-1">
          <div className="text-[12.5px] font-bold text-ink-900">
            {count} unresolved compliance {count === 1 ? 'issue' : 'issues'}
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-ink-700">
            Required FDA-label elements are missing or malformed. If a
            professional designer prepared this artwork and you&apos;ve
            reviewed it offline, you can proceed at your own risk — otherwise
            return to the canvas and re-run the compliance scan.
          </p>
          <label className="mt-3 flex cursor-pointer items-start gap-2">
            <button
              type="button"
              onClick={onToggle}
              aria-pressed={acknowledged}
              className={
                'relative mt-0.5 h-4 w-4 flex-shrink-0 rounded border-[1.5px] transition-colors ' +
                (acknowledged
                  ? 'border-amber-500 bg-amber-500'
                  : 'border-pink-500 bg-white hover:border-pink-700')
              }
            >
              {acknowledged && (
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
                  ✓
                </span>
              )}
            </button>
            <span className="text-[11.5px] leading-snug text-ink-900">
              <span className="font-semibold">
                I&apos;ve reviewed the issues and accept responsibility for
                label compliance.
              </span>{' '}
              I understand that iLaunchify will not block production based on
              the compliance scanner&apos;s findings.
            </span>
          </label>
          <p className="mt-2 inline-flex items-center gap-1 text-[10.5px] text-ink-500">
            <ShieldCheck className="h-3 w-3" />
            Audit log will record this acknowledgement with the order.
          </p>
        </div>
      </div>
    </section>
  )
}
