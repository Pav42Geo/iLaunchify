'use client'

// FinishesDrawer — partner-conditional print finishes (DS-70b).
//
// Currently a placeholder. The actual finish picker (foil, spot UV,
// embossing, special inks, etc.) ships in Phase F3 once partners can
// describe their offerings via their Service Profile.
//
// This component is mounted only when the rail icon is visible, which
// only happens when CanvasLayoutShell receives partnerOffersFinishes =
// true. V1 always passes false, so this empty state is the only thing
// the user can possibly see — but the slot is reserved.
//
// See docs/PRINT_FINISHES_PLAN.md for the full architecture +
// catalog + UX + phased rollout.

import * as React from 'react'
import { Sparkles } from 'lucide-react'

export function FinishesDrawer() {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-dashed border-pink-300 bg-pink-50/40 p-4">
        <div className="flex items-start gap-2.5">
          <Sparkles className="h-4 w-4 text-pink-700 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-[12.5px] font-bold text-ink-900">
              Print finishes
            </div>
            <p className="mt-1 text-[11.5px] text-ink-700 leading-[1.5]">
              When your bound print partner offers premium finishes — foil
              stamping, spot UV gloss, embossing, special inks — they
              appear here for you to apply on specific text, images, or
              regions of your design.
            </p>
          </div>
        </div>
      </div>

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
          What you'll be able to do
        </div>
        <ul className="space-y-1.5 text-[11.5px] text-ink-700">
          <Bullet>Pick finishes from your printer's catalog</Bullet>
          <Bullet>Apply to all text, all images, or specific objects</Bullet>
          <Bullet>Mark regions on uploaded artwork via a mask layer</Bullet>
          <Bullet>See live cost + lead-time impact as you choose</Bullet>
          <Bullet>Leave notes for the printer per finish</Bullet>
        </ul>
      </div>

      <div className="rounded-md border border-ink-200 bg-ink-50/60 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
          Not seeing finishes?
        </div>
        <p className="mt-1 text-[11px] text-ink-600 leading-[1.45]">
          Finishes show up only when the printer bound to this product
          publishes them in their service profile. If you need a
          finish that isn't here, message your printer directly or
          reach out to iLaunchify support.
        </p>
      </div>
    </div>
  )
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-1.5">
      <span className="text-pink-700 font-bold">•</span>
      <span>{children}</span>
    </li>
  )
}
