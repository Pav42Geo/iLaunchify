'use client'

// Express Interest modal — fit & terms only, NEVER a formula (spec §4).
// UX contract: prototype screen ② modal. Free to send; formulation work is a
// paid milestone after selection.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Button,
  Input,
  Textarea,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@ilaunchify/ui'
import { expressInterest } from './actions'

export function ExpressInterestDialog({
  briefId,
  briefTitle,
  creatorName,
  claims,
}: {
  briefId: string
  briefTitle: string
  creatorName: string
  claims: string[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [priceLow, setPriceLow] = useState('')
  const [priceHigh, setPriceHigh] = useState('')
  const [moq, setMoq] = useState('')
  const [leadTimeWeeks, setLeadTimeWeeks] = useState('')
  const [claimFit, setClaimFit] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(claims.map((c) => [c, true])),
  )
  const [offersSample, setOffersSample] = useState(true)
  const [pitch, setPitch] = useState('')

  const firstName = creatorName.split(' ')[0] ?? creatorName

  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await expressInterest({
        briefId,
        priceLow: priceLow ? Number(priceLow) : null,
        priceHigh: priceHigh ? Number(priceHigh) : null,
        moq: moq ? Number(moq) : null,
        leadTimeWeeks: leadTimeWeeks ? Number(leadTimeWeeks) : null,
        claimFit,
        offersSample,
        pitch: pitch.trim(),
      })
      if (res.ok) {
        setOpen(false)
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        ✋ Express interest
      </Button>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Express interest</DialogTitle>
          <DialogDescription>
            {briefTitle} · {creatorName}
          </DialogDescription>
        </DialogHeader>

        <p className="rounded-xl bg-ink-50 px-3 py-2 text-ui-caption text-ink-700">
          🔒 <b>Keep your formula to yourself.</b> This is just your fit &amp; terms so {firstName}{' '}
          can shortlist you. Recipe work happens later, in a paid, NDA-protected room.
        </p>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="pi-price-low">Price / unit ($)</Label>
            <Input
              id="pi-price-low"
              type="number"
              min={0}
              step="0.01"
              value={priceLow}
              onChange={(e) => setPriceLow(e.target.value)}
              placeholder="1.35"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="pi-moq">Your MOQ</Label>
            <Input
              id="pi-moq"
              type="number"
              min={1}
              value={moq}
              onChange={(e) => setMoq(e.target.value)}
              placeholder="3000"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="pi-lead">Lead time (wk)</Label>
            <Input
              id="pi-lead"
              type="number"
              min={1}
              value={leadTimeWeeks}
              onChange={(e) => setLeadTimeWeeks(e.target.value)}
              placeholder="7"
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="pi-price-high">
            Price high end ($) <span className="font-normal text-ink-500">— optional</span>
          </Label>
          <Input
            id="pi-price-high"
            type="number"
            min={0}
            step="0.01"
            value={priceHigh}
            onChange={(e) => setPriceHigh(e.target.value)}
            placeholder="1.60"
            className="mt-1"
          />
        </div>

        {claims.length > 0 ? (
          <div>
            <Label>Claims you can meet</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {claims.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={claimFit[c] ?? false}
                  onClick={() => setClaimFit((prev) => ({ ...prev, [c]: !prev[c] }))}
                  className={`rounded-full border px-3 py-1.5 text-ui-caption font-medium transition ${
                    claimFit[c]
                      ? 'border-pink-500 bg-pink-50 text-pink-700'
                      : 'border-ink-200 bg-white text-ink-500 hover:text-ink-900'
                  }`}
                >
                  {claimFit[c] ? '✓' : '＋'} {c}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <Label>Offer a paid sample?</Label>
          <div className="mt-2 flex gap-2">
            {(
              [
                [true, 'Yes'],
                [false, 'Not yet'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={offersSample === v}
                onClick={() => setOffersSample(v)}
                className={`rounded-full border px-4 py-1.5 text-ui-caption font-medium transition ${
                  offersSample === v
                    ? 'border-ink-900 bg-ink-900 text-white'
                    : 'border-ink-200 bg-white text-ink-500 hover:text-ink-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="pi-pitch">Why you — one short pitch</Label>
          <Textarea
            id="pi-pitch"
            value={pitch}
            onChange={(e) => setPitch(e.target.value)}
            maxLength={240}
            placeholder="What makes your line the right fit for this product?"
            className="mt-1"
          />
          <div className="mt-1 text-right text-ui-caption text-ink-500">{pitch.length}/240</div>
        </div>

        {error ? (
          <p className="rounded-xl bg-danger-50 px-3 py-2 text-ui-caption text-danger-700" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <span className="mr-auto text-ui-caption text-ink-500">
            Free to send · {firstName} reviews all interests, then picks one
          </span>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={isPending || !pitch.trim()}>
            {isPending ? 'Sending…' : 'Send interest ✋'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
