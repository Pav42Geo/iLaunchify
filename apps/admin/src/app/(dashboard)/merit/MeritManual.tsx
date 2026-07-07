'use client'

// "How it works" — in-context admin manual for the Manufacturer Merit engine.
// Modal for quick reference while tuning + a downloadable PDF. Mirrors the
// Routing & Rotation manual pattern. Keep in sync with
// apps/admin/public/merit-engine-manual.pdf.

import { useState } from 'react'
import { BookOpen, Download } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@ilaunchify/ui'

const PDF_HREF = '/merit-engine-manual.pdf'

export function MeritManualButton() {
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogTitle className="pr-10 font-display text-[18px] font-bold text-ink-900">
            Manufacturer Merit — how it works
          </DialogTitle>
          <p className="mt-1 text-[12.5px] text-ink-500">
            Read this alongside the console. Nothing here changes anything on its own — the engine only
            affects real badges and fees when you switch it to <strong>Live</strong>.
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
      <Section title="What the engine does">
        <p>
          It judges each manufacturer on more than one rating and turns that into a <strong>badge</strong>{' '}
          (Verified → Trusted → Premier). The badge sets the platform&rsquo;s production fee — a higher
          badge means a lower fee. Everyone starts at Verified and the standard fee, and earns up. The
          platform never publishes a &ldquo;bad&rdquo; label; compliance issues are handled elsewhere.
        </p>
      </Section>

      <Section title="The four pillars">
        <p>
          Standing is a weighted blend of <strong>Craft</strong> (quality — ratings + low defect rate),{' '}
          <strong>Reliability</strong> (on-time acceptance + delivery), <strong>Contribution</strong>{' '}
          (volume + live products), and <strong>Standing</strong> (tenure + clean recent record). You
          set the weights (they must sum to 100), the score gates for Trusted/Premier, and the evidence
          gates (minimum orders / months, max defect rate). Ratings are Bayesian-smoothed and ops signals
          are rate-based, so a small shop with two reviews isn&rsquo;t judged like one with two hundred,
          and volume never counts against anyone.
        </p>
      </Section>

      <Section title="Shadow vs. Live — the switch that matters">
        <p>
          The <strong>Merit engine</strong> card is the whole safety model. In <strong>Shadow</strong>{' '}
          (default) the nightly sweep computes every manufacturer&rsquo;s score, writes a snapshot, and
          shows you exactly what <em>would</em> happen — but never changes a tier or charges a badge fee.
          Switch to <strong>Live</strong> and, from the next sweep on, the recommended badge is written to
          the manufacturer and the badge fee applies at checkout. It is fully reversible — flip back to
          Shadow and pricing/tiers stop moving.
        </p>
      </Section>

      <Section title="Hysteresis — why standing moves slowly">
        <p>
          Promotions require the score to <em>hold</em> for the <strong>promote-sustain</strong> window;
          demotions only trigger after a longer <strong>demote-miss</strong> window; and new shops get a{' '}
          <strong>new-shop grace</strong> period where they can&rsquo;t be demoted. This is deliberate —
          it makes standing a stable signal, not a rollercoaster, and it protects a good shop from one bad
          week.
        </p>
      </Section>

      <Section title="Fees, and fee grace">
        <p>
          Each badge maps to a fee in basis points (locked default: Verified 4.5% · Trusted 2.5% ·
          Premier 0%). Separately, <strong>Fee grace &amp; promotions</strong> lets you skip the fee for a
          window: a global toggle (every new manufacturer, for N days/months from activation) or
          hand-picked grants. A grant <em>wins over</em> the badge fee, keeps the partner at Verified, and
          expires on its own. Manufacturers on an active grant are skipped by auto-assignment — they&rsquo;re
          sitting out the engine, by design.
        </p>
      </Section>

      <Section title="Appeals">
        <p>
          A manufacturer can contest a rating from their standing page. Those land in{' '}
          <strong>Rating appeals</strong>, where you <strong>uphold</strong> (rating stands),{' '}
          <strong>exclude</strong> (drops from their score), or <strong>re-attribute</strong> (moves it to
          the partner actually responsible). While an appeal is open the partner&rsquo;s standing is{' '}
          <strong>frozen against demotion</strong>, so filing is always safe for them.
        </p>
      </Section>

      <Section title="The simulator + a safe rollout">
        <ol className="ml-4 list-decimal space-y-1.5">
          <li>Leave the engine in <strong>Shadow</strong> and let a few nightly sweeps accumulate snapshots.</li>
          <li>Tune the weights/gates, hit <strong>Simulate</strong>, and read the projected badge distribution + how many would change from today&rsquo;s hand-set tiers.</li>
          <li>Confirm the fee incidence in Stripe and clear the legal re-consent for fee-by-standing.</li>
          <li>When you&rsquo;re comfortable, switch to <strong>Live</strong> and Save. Watch the first sweep&rsquo;s <em>assigned</em> count.</li>
          <li>Anything looks off — switch back to Shadow. It&rsquo;s reversible and audited.</li>
        </ol>
      </Section>
    </div>
  )
}
