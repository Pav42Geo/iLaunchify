'use client'

// "How it works" — in-context admin manual for the Routing & Rotation engine.
// Opens as a modal (quick reference while adjusting) and links to the same
// content as a downloadable PDF (open in a new tab to keep alongside the form).
// Keep this in sync with apps/admin/public/routing-rotation-manual.pdf.

import { useState } from 'react'
import { BookOpen, Download } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@ilaunchify/ui'

const PDF_HREF = '/routing-rotation-manual.pdf'

export function RoutingManualButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3.5 py-2 text-[13px] font-semibold text-ink-800 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
      >
        <BookOpen className="h-4 w-4" />
        How it works
      </button>
      <a
        href={PDF_HREF}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3.5 py-2 text-[13px] font-semibold text-ink-800 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
      >
        <Download className="h-4 w-4" />
        PDF
      </a>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          {/* pr-10 keeps the title clear of the built-in close (X) at top-right. */}
          <DialogTitle className="pr-10 font-display text-[18px] font-bold text-ink-900">
            Routing &amp; Rotation — how it works
          </DialogTitle>
          <p className="mt-1 text-[12.5px] text-ink-500">
            Read this alongside the tabs — nothing here changes anything on its own. Tip: open the
            PDF in a second window to keep it visible while you adjust.
          </p>
          <div className="mt-3">
            <a
              href={PDF_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            >
              <Download className="h-3.5 w-3.5" />
              Download PDF
            </a>
          </div>

          <ManualBody />
        </DialogContent>
      </Dialog>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 border-t border-ink-100 pt-4 first:mt-4 first:border-t-0 first:pt-0">
      <h3 className="font-display text-[14.5px] font-semibold text-ink-900">{title}</h3>
      <div className="mt-2 space-y-2 text-[13px] leading-relaxed text-ink-700">{children}</div>
    </section>
  )
}

function ManualBody() {
  return (
    <div className="mt-4">
      <Section title="The golden rule — filters first, always">
        <p>
          Every routing decision runs <strong>hard eligibility filters before anything else</strong>:
          capability match, active service + partner, Stripe live, storage/hazmat class, capacity,
          and blackout dates. Rotation, ratings, and weights only ever <em>reorder the survivors</em> —
          they can never rescue a partner that failed a filter. And a <strong>manual pick</strong>{' '}
          (a creator&rsquo;s pinned printer, or an offering bound at configuration time) always wins
          outright: it is never rotated away.
        </p>
      </Section>

      <Section title="The four tabs">
        <p>
          <strong>Print providers</strong> — who prints a creator&rsquo;s labels/packaging.{' '}
          <strong>Fulfillment centers</strong> — which warehouse ships the finished goods.{' '}
          <strong>Manufacturers</strong> — which factory produces the product (usually fixed by
          ownership; the weights only break ties when a template has more than one).{' '}
          <strong>Dispatch lifecycle</strong> — what happens <em>after</em> a partner is assigned
          (accept window, reroute budget, auto-cancel).
        </p>
      </Section>

      <Section title="Rotation policy — the core controls (Print & FC)">
        <p>
          A rotation policy decides how auto-routed work is spread across eligible partners. It is{' '}
          <strong>off by default</strong> — off means the legacy behavior (printers: first eligible;
          FCs: the weighted-score band). Turn it on per tab and, for printers, per{' '}
          <strong>context</strong>.
        </p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <strong>Enable</strong> — the master switch for that tab/context. Nothing rotates until
            this is on.
          </li>
          <li>
            <strong>Pool size (top-N)</strong> — only the best N candidates are eligible to win.
            Printers rank by rating; FCs rank by score (distance/cost/capacity).
          </li>
          <li>
            <strong>Split mode</strong> — how the pool shares the work:{' '}
            <em>Equal</em> (round-robin, least-recently-awarded wins), <em>Random</em> (uniform),{' '}
            <em>Exact percentages</em> (you set the share per rank, must sum to 100), or{' '}
            <em>Best only</em> (the top candidate always wins — winner-take-all).
          </li>
          <li>
            <strong>New-provider / new-node share</strong> — a slice of work reserved for partners
            with too few ratings/awards yet, so newcomers can earn a track record (cold-start).
            The cap limits how many open awards a newcomer can hold at once.
          </li>
          <li>
            <strong>Rating floor</strong> (printers) — partners below this Bayesian rating drop out
            of the auto-pool (manual picks still allowed).
          </li>
          <li>
            <strong>Location bias</strong> (printers) — nudge toward printers near the producer to
            cut label-hop freight (0 = rating only).
          </li>
          <li>
            <strong>Sticky reorders</strong> (printers) — a repeat order keeps the same printer for
            color consistency. Follows approved chains only.
          </li>
        </ul>
      </Section>

      <Section title="Contexts (Print providers)">
        <p>
          Print rotation is tuned separately for three moments:{' '}
          <strong>Production</strong> (bulk — the money runs, consistency matters),{' '}
          <strong>Samples</strong> (the cheapest place to give newcomers a shot — usually a higher
          new-provider share), and <strong>Replenishment</strong> (repeat small runs — sticky +
          best-only keeps quality consistent). A context with no row falls back to Production.
        </p>
      </Section>

      <Section title="Dry-run preview — see before you ship">
        <p>
          Both the Print and FC tabs have a preview: pick a product (and quantity), and it runs the{' '}
          <strong>exact production engine</strong> over 100 simulated orders — no awards are written.
          It shows the eligible pool, ratings/scores, and the projected win share per partner. Use it
          to sanity-check a policy <em>before</em> enabling it. If a product is pinned or
          config-bound, the preview says so honestly (rotation never runs for it).
        </p>
      </Section>

      <Section title="Weights (FC & Manufacturer tabs)">
        <p>
          <strong>FC scorer weights</strong> rank warehouses by cost, distance, SLA, capacity,
          rotation fairness, and storage-class match, plus an indifference band (candidates within
          that % of the best score rotate). <strong>Manufacturer match weights</strong> (capability
          / proximity / certification) only arbitrate templates with more than one possible
          manufacturer — most products are fixed to their owner. Weights are <em>relative</em> and
          renormalize over whatever dimensions have data for a given order.
        </p>
      </Section>

      <Section title="Awards tables + kill switch">
        <p>
          Each tab&rsquo;s awards table shows the last 90 days of auto-awards per partner and their
          actual share — this is how you see where work is really going vs. what you configured. The{' '}
          <strong>kill switch</strong> (&ldquo;In pool — exclude&rdquo;) removes a partner from{' '}
          <em>auto</em>-rotation without deactivating them: manual and pinned picks still work. Use
          it as an ops pressure valve, then reinstate.
        </p>
      </Section>

      <Section title="Dispatch lifecycle">
        <p>
          <strong>Accept window</strong> — how long a partner has to accept before it times out.{' '}
          <strong>Max auto-reroutes</strong> — the reroute budget per dispatch (settings-driven;
          live enforcement lands with the dispatch-transition work). <strong>Auto-cancel</strong> —
          unpaid orders cancel past this age. <strong>Changeover days</strong> — extra lead time per
          additional flavor in a variety pack. These are post-assignment timers, not selection.
        </p>
      </Section>

      <Section title="A safe rollout recipe">
        <ol className="ml-4 list-decimal space-y-1.5">
          <li>Leave rotation <strong>off</strong> and confirm the awards tables look sane.</li>
          <li>Set the weights/pool/mode you want, then run the <strong>preview</strong> and read the projected split.</li>
          <li>Enable for <strong>Samples</strong> first (cheapest place for mistakes), watch a week of awards.</li>
          <li>Then enable <strong>Production</strong>. Use the kill switch if a partner needs to pause.</li>
          <li>Adjust and re-preview anytime — changes are audited and take effect on the next order.</li>
        </ol>
      </Section>

      <Section title="Glossary">
        <p>
          <strong>Pool</strong> — the top-N candidates eligible to win. <strong>Band</strong> — a
          score window within which FCs rotate as near-ties. <strong>Bayesian rating</strong> — a
          rating smoothed toward a prior so a partner with 2 reviews isn&rsquo;t treated like one
          with 200. <strong>Cold-start</strong> — giving new partners seeded exposure so they can
          earn ratings/awards. <strong>Pinned</strong> — a creator&rsquo;s explicit choice; bypasses
          rotation entirely.
        </p>
      </Section>
    </div>
  )
}
