'use client'

// "How it works" — manufacturer-facing manual for the Rate / Feedback / Review &
// Merit engine. Modal for quick reference + a downloadable PDF. Keep in sync with
// apps/partner/public/manufacturer-standing-manual.pdf.

import { useState } from 'react'
import { BookOpen, Download } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@ilaunchify/ui'

const PDF_HREF = '/manufacturer-standing-manual.pdf'

export function StandingManualButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3.5 py-2 text-[13px] font-semibold text-ink-800 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
      >
        <BookOpen className="h-4 w-4" />
        How it works
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogTitle className="pr-10 font-display text-[18px] font-bold text-ink-900">
            How your standing works
          </DialogTitle>
          <p className="mt-1 text-[12.5px] text-ink-500">
            Everything that decides your badge — and how to move up. Nothing here is punitive; it&rsquo;s
            built so good work compounds and a bad day doesn&rsquo;t define you.
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
      <Section title="Everyone starts equal">
        <p>
          Every manufacturer joins at the <strong>Verified</strong> badge with the standard platform fee.
          Your badge is never assigned by hand and never starts low as a penalty — you earn your way up
          from the same line as everyone else.
        </p>
      </Section>

      <Section title="Four things decide your badge — not one rating">
        <p>
          A single unhappy review can&rsquo;t sink you. Your standing is a blend of four pillars:
        </p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li><strong>Craft</strong> — product quality: buyer ratings and a low defect / reprint rate.</li>
          <li><strong>Reliability</strong> — accepting orders and delivering on time, with few strikes.</li>
          <li><strong>Contribution</strong> — your footprint: completed orders and live products. A high-volume shop isn&rsquo;t punished for the occasional off-day.</li>
          <li><strong>Standing</strong> — tenure and a clean recent record; trust built over time.</li>
        </ul>
        <p>
          The page shows each pillar&rsquo;s weight, so you always know where your score comes from and
          exactly what to improve.
        </p>
      </Section>

      <Section title="Ratings are smoothed — two reviews aren't treated like two hundred">
        <p>
          Ratings use <strong>Bayesian smoothing</strong>: a new shop with a handful of reviews sits near
          the platform average until it builds a real track record. One early 1-star doesn&rsquo;t define
          you, and a shop with 200 happy orders isn&rsquo;t judged the same as one with two.
        </p>
      </Section>

      <Section title="Rate-based, so scale never counts against you">
        <p>
          Quality signals are measured as <strong>rates</strong> (per 100 orders), not raw counts. Ten
          issues across 5,000 orders reads as excellent; ten across fifty does not. The more you produce,
          the more a stray problem is absorbed — volume protects you, it doesn&rsquo;t expose you.
        </p>
      </Section>

      <Section title="The badges and what they unlock">
        <ul className="ml-4 list-disc space-y-1.5">
          <li><strong>Verified</strong> — the starting line. Standard platform fee.</li>
          <li><strong>Trusted</strong> — proven volume and quality over time. A reduced fee.</li>
          <li><strong>Premier</strong> — top standing. The lowest fee tier — orders at zero platform fee.</li>
        </ul>
        <p>
          Moving up lowers what the platform takes on your orders. Your &ldquo;path to the next badge&rdquo;
          on this page lists the specific, concrete steps between you and the next tier.
        </p>
      </Section>

      <Section title="Standing moves slowly and fairly — no whiplash">
        <p>
          Promotions require your standing to <em>hold</em> for a sustained window, not spike for a day.
          Drops are gradual — a single rough stretch won&rsquo;t knock you down a rung overnight, and new
          shops get a grace period while they find their feet. The goal is a fair, stable signal, not a
          rollercoaster.
        </p>
      </Section>

      <Section title="A rating you think is wrong? Contest it">
        <p>
          If a review is unfair, mistaken, or was really about another partner&rsquo;s part of the job
          (a printer, packer, or warehouse), open an <strong>appeal</strong> from the &ldquo;Recent
          ratings&rdquo; list. An admin reviews every appeal. Three outcomes are possible:
        </p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li><strong>Upheld</strong> — the rating stands (with a reason).</li>
          <li><strong>Removed</strong> — it&rsquo;s excluded from your score entirely.</li>
          <li><strong>Re-attributed</strong> — it&rsquo;s moved to the partner it was actually about.</li>
        </ul>
        <p>
          Crucially, <strong>while your appeal is open your standing is frozen against demotion</strong>,
          so filing is always safe — you&rsquo;re never worse off for raising a concern.
        </p>
      </Section>

      <Section title="Nothing here labels you 'bad'">
        <p>
          The system only ever recognizes positive standing — there is no negative stamp. Compliance and
          safety issues are handled separately and directly, never through your public badge.
        </p>
      </Section>
    </div>
  )
}
