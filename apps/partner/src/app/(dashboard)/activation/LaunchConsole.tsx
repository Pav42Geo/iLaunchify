'use client'

// Activation Launch Console — the redesigned /activation surface.
// 1:1 port of the approved prototype design/activation-launch-console-tokens.html
// onto the real activation engine (activation-tracks.ts + activation-status.ts).
//
// Layout: dark launch hero (progress ring + per-service launchpads) → light body
// with the "next best step" focus banner, one track card (selected service's
// steps + the shared tail), and the right rail (unlocks / already earning /
// helpbox) — plus the go-live celebration overlay.
//
// All data is real: steps come from the pure track engine, completion from
// PartnerActivationStep ∪ auto-detection, go-live from the D8 hybrid gate.
// Marking a step done calls the existing audited server action; the page
// revalidates and a newly-live service triggers the celebration.

import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@ilaunchify/ui'
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleCheck,
  Clock,
  Factory,
  Globe,
  HelpCircle,
  Package,
  Printer,
  Rocket,
  Star,
  Warehouse,
  Zap,
} from 'lucide-react'
import { setActivationStepComplete } from './actions'

// ---------------------------------------------------------------------------
// View model (built server-side in page.tsx — plain serializable data only)
// ---------------------------------------------------------------------------

export interface StepVM {
  key: string
  title: string
  description: string
  routesTo: string[]
  href?: string
  done: boolean
  auto: boolean
}

export interface TrackVM {
  svc: string // PartnerServiceType
  label: string
  steps: StepVM[]
  done: number
  total: number
  live: boolean
}

export interface ConsoleVM {
  tracks: TrackVM[]
  shared: StepVM[]
  stepsDone: number
  stepsTotal: number
  liveCount: number
}

// ---------------------------------------------------------------------------
// Per-service presentation (icons imported HERE, inside the client component —
// never passed across the RSC boundary; see CLAUDE.md gotcha #5)
// ---------------------------------------------------------------------------

type Visual = {
  Icon: typeof Factory
  /** pad icon tint (on dark) */
  padIcon: string
  /** track-head icon chip (on light) */
  headChip: string
  sub: string
  liveLine: string
  earnLine: string
  unlocks: { title: string; sub: string }[]
}

const VISUAL: Record<string, Visual> = {
  MANUFACTURING: {
    Icon: Factory,
    padIcon: 'text-pink-400',
    headChip: 'bg-pink-50 text-pink-500',
    sub: 'Product types, specs & MOQ — the owner-pin track.',
    liveLine: 'Live · routing orders',
    earnLine: 'Owner-pin eligible · taking orders',
    unlocks: [
      { title: 'Owner-pin eligibility', sub: 'Creators can pin you on their products' },
      { title: 'Appear in matching', sub: 'Your categories & formats become facets' },
      { title: 'Take production orders', sub: 'Orders route straight to your line' },
    ],
  },
  COPACKING: {
    Icon: Package,
    padIcon: 'text-info-500',
    headChip: 'bg-info-50 text-info-500',
    sub: 'Packaging formats, fill types & supply model.',
    liveLine: 'Live · routing orders',
    earnLine: 'Taking fill jobs',
    unlocks: [
      { title: 'Enter co-pack routing', sub: 'Fill jobs route to your line' },
      { title: 'Show in marketplace facets', sub: 'Filtered by formats & fill types' },
      { title: 'Packaging-leg orchestration', sub: 'Supply model wired into the routing graph' },
    ],
  },
  LABEL_PRINTING: {
    Icon: Printer,
    padIcon: 'text-warning-500',
    headChip: 'bg-warning-50 text-warning-500',
    sub: "Materials, specs, die-lines & run sizes — then you're cleared to print for creators.",
    liveLine: 'Live · routing orders',
    earnLine: 'In print rotation',
    unlocks: [
      { title: 'Appear in print rotation', sub: 'Creators can route label jobs to you' },
      { title: 'Show in marketplace facets', sub: 'Filtered by your substrates & specs' },
      { title: 'Die-lines in Design Studio', sub: 'Creators design onto your templates' },
    ],
  },
  WAREHOUSE: {
    Icon: Warehouse,
    padIcon: 'text-neon-500',
    headChip: 'bg-success-50 text-success-600',
    sub: 'Storage classes, capacity & value-added services.',
    liveLine: 'Live · in FC network',
    earnLine: 'In the FC selector network',
    unlocks: [
      { title: 'Join the FC network', sub: 'The FC selector can pick your warehouse' },
      { title: 'Storage-class matching', sub: 'Jobs matched to what you can hold' },
      { title: 'Dispatch manifests', sub: 'Receiving & pick-pack flow through you' },
    ],
  },
}

const FALLBACK_VISUAL: Visual = {
  Icon: Package,
  padIcon: 'text-pink-400',
  headChip: 'bg-ink-100 text-ink-600',
  sub: 'Service setup.',
  liveLine: 'Live · routing orders',
  earnLine: 'Live',
  unlocks: [],
}

const visual = (svc: string): Visual => VISUAL[svc] ?? FALLBACK_VISUAL

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function Pill({
  tone,
  children,
}: {
  tone: 'live' | 'prog' | 'muted'
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold',
        tone === 'live' && 'border-success-100 bg-success-50 text-success-800',
        tone === 'prog' && 'border-warning-100 bg-warning-50 text-warning-800',
        tone === 'muted' && 'border-ink-200 bg-ink-100 text-ink-600',
      )}
    >
      {children}
    </span>
  )
}

function RouteTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-ink-50 px-2 py-[2px] text-[10.5px] font-semibold text-ink-600">
      <ArrowRight className="h-2.5 w-2.5 text-pink-500" />
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// The console
// ---------------------------------------------------------------------------

export function LaunchConsole({ vm }: { vm: ConsoleVM }) {
  const firstPending = vm.tracks.find((t) => !t.live) ?? vm.tracks[0]
  const [selected, setSelected] = useState<string | null>(firstPending?.svc ?? null)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [celebrate, setCelebrate] = useState<string | null>(null)
  const trackCardRef = useRef<HTMLDivElement>(null)

  const track = vm.tracks.find((t) => t.svc === selected) ?? vm.tracks[0]

  // Celebration: fire when a service flips live across a revalidation.
  const prevLive = useRef<Set<string> | null>(null)
  useEffect(() => {
    const now = new Set(vm.tracks.filter((t) => t.live).map((t) => t.svc))
    if (prevLive.current) {
      for (const svc of now) {
        if (!prevLive.current.has(svc)) {
          setCelebrate(vm.tracks.find((t) => t.svc === svc)?.label ?? svc)
          break
        }
      }
    }
    prevLive.current = now
  }, [vm.tracks])

  const pct = vm.stepsTotal > 0 ? Math.round((vm.stepsDone / vm.stepsTotal) * 100) : 0
  const pendingTracks = vm.tracks.filter((t) => !t.live)
  const etaMin = (vm.stepsTotal - vm.stepsDone) * 2
  const etaText =
    pendingTracks.length > 0
      ? `~${etaMin} min to finish ${pendingTracks.map((t) => t.label).join(' & ')}`
      : 'All services live — you’re fully operational'

  // Next best step: first pending step in the selected track, else shared tail.
  const focusStep =
    track?.steps.find((s) => !s.done) ?? vm.shared.find((s) => !s.done) ?? null

  const sharedDone = vm.shared.filter((s) => s.done).length
  const liveTracks = vm.tracks.filter((t) => t.live)

  const openFocus = () => {
    if (!focusStep) return
    setOpenKey(focusStep.key)
    document
      .getElementById(`step-${focusStep.key}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const selectSvc = (svc: string) => {
    setSelected(svc)
    setOpenKey(null)
    trackCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const tv = track ? visual(track.svc) : FALLBACK_VISUAL

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-lg">
      {/* ================= LAUNCH HERO (dark) ================= */}
      <div data-surface="dark" className="relative overflow-hidden bg-ink-900 px-6 pb-6 pt-7 text-white sm:px-8">
        {/* signature glows */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(130% 120% at 88% -20%, rgba(181,255,61,.18), transparent 55%), radial-gradient(120% 130% at 5% 120%, rgba(255,46,99,.28), transparent 58%)',
          }}
        />
        {/* grid overlay */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-35"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px)',
            backgroundSize: '30px 30px',
            maskImage: 'radial-gradient(circle at 70% 0, #000, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(circle at 70% 0, #000, transparent 75%)',
          }}
        />

        <div className="relative z-[2] flex flex-wrap items-start gap-6">
          <div className="min-w-[280px] flex-1">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-neon-500/30 bg-neon-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.05em] text-neon-500">
              <Rocket className="h-3 w-3" />
              Approved · Activation Setup
            </span>
            <h1 className="mb-1.5 mt-3 font-display text-[30px] font-extrabold leading-[1.08] tracking-[-0.02em]">
              You&rsquo;re approved. Now let&rsquo;s get you{' '}
              <span className="font-serif font-medium italic text-neon-500">routing orders.</span>
            </h1>
            <p className="max-w-[520px] text-[14.5px] text-ink-300">
              Each service goes live on its own the moment its setup is done — you don&rsquo;t have
              to finish everything at once. Everything you enter here{' '}
              <b className="text-white">flows straight to the systems that route work to you.</b>
            </p>
          </div>

          {/* hero meter */}
          <div className="w-full flex-none rounded-xl border border-white/10 bg-white/5 p-[18px] sm:w-[250px]">
            <div className="flex items-center gap-3.5">
              <div
                className="relative grid h-16 w-16 flex-none place-items-center rounded-full"
                style={{ background: `conic-gradient(var(--neon-500) ${pct}%, rgba(255,255,255,.12) 0)` }}
              >
                <div className="absolute h-12 w-12 rounded-full bg-ink-900" />
                <b className="relative font-display text-[16px] font-extrabold">{pct}%</b>
              </div>
              <div>
                <div className="text-[12px] text-ink-400">Services live</div>
                <div className="font-display text-[16px] font-bold">
                  {vm.liveCount} of {vm.tracks.length}
                </div>
                <div className="mt-1.5 text-[12px] text-ink-400">Steps done</div>
                <div className="font-display text-[16px] font-bold">
                  {vm.stepsDone} of {vm.stepsTotal}
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5 border-t border-white/10 pt-3 text-[12px] text-ink-400">
              <Clock className="h-3.5 w-3.5 flex-none text-neon-500" />
              <span>{etaText}</span>
            </div>
          </div>
        </div>

        {/* launchpads */}
        <div className="relative z-[2] mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {vm.tracks.map((t) => {
            const v = visual(t.svc)
            const p = t.total > 0 ? Math.round((t.done / t.total) * 100) : 0
            const left = t.total - t.done
            const sel = t.svc === selected
            return (
              <button
                key={t.svc}
                type="button"
                onClick={() => selectSvc(t.svc)}
                className={cn(
                  'relative overflow-hidden rounded-lg border p-3.5 text-left transition-all hover:-translate-y-0.5 hover:bg-white/10',
                  'border-white/10 bg-white/5',
                  t.live && 'border-neon-500/40',
                  sel && 'border-pink-400 ring-1 ring-pink-400',
                )}
              >
                {t.live && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        'radial-gradient(80% 60% at 50% 120%, rgba(181,255,61,.18), transparent 70%)',
                    }}
                  />
                )}
                <div className="mb-2.5 flex items-center gap-2">
                  <span className={cn('grid h-8 w-8 flex-none place-items-center rounded-[9px] bg-white/10', v.padIcon)}>
                    <v.Icon className="h-[17px] w-[17px]" />
                  </span>
                  <div>
                    <div className="text-[13px] font-bold">{t.label}</div>
                    <div className="text-[11px] text-ink-400">
                      {t.done} / {t.total} steps
                    </div>
                  </div>
                </div>
                <div className="mb-2 mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={cn('h-full rounded-full transition-all', t.live ? 'bg-neon-500' : 'bg-pink-500')}
                    style={{ width: `${p}%` }}
                  />
                </div>
                {t.live ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-neon-500">
                    <Check className="h-3 w-3" strokeWidth={3} />
                    {v.liveLine}
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-ink-300">
                    {left} step{left === 1 ? '' : 's'} left to launch
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ================= BODY ================= */}
      <div className="grid items-start gap-6 bg-ink-50 px-6 py-6 sm:px-8 lg:grid-cols-[1fr_310px]">
        <div>
          {/* next best step */}
          {focusStep && (
            <div className="mb-[18px] flex items-center gap-3.5 rounded-xl border border-pink-100 bg-gradient-to-r from-white to-pink-50 px-[18px] py-4">
              <span className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl bg-pink-500 text-white">
                <ArrowRight className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-pink-700">
                  Next best step
                </div>
                <div className="mt-px truncate text-[15px] font-bold text-ink-900">{focusStep.title}</div>
                <div className="truncate text-[12.5px] text-ink-500">
                  ~2 minutes · routes to {focusStep.routesTo.join(' + ')}
                </div>
              </div>
              <button
                type="button"
                onClick={openFocus}
                className="flex-none rounded-full bg-pink-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-pink-600"
              >
                Continue →
              </button>
            </div>
          )}

          {/* track card */}
          <div ref={trackCardRef} className="rounded-xl border border-ink-200 bg-white shadow-sm">
            {track && (
              <div className="flex items-center gap-3 border-b border-ink-100 px-[18px] py-4">
                <span className={cn('grid h-[38px] w-[38px] flex-none place-items-center rounded-[10px]', tv.headChip)}>
                  <tv.Icon className="h-[19px] w-[19px]" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-display text-[17px] font-bold text-ink-900">{track.label}</h3>
                  <div className="truncate text-[12px] text-ink-500">{tv.sub}</div>
                </div>
                <span className="ml-auto flex-none">
                  {track.live ? (
                    <Pill tone="live">
                      <Check className="h-3 w-3" strokeWidth={3} />
                      Live · routing orders
                    </Pill>
                  ) : (
                    <Pill tone="prog">
                      <Clock className="h-3 w-3" />
                      {track.done} of {track.total} · not live yet
                    </Pill>
                  )}
                </span>
              </div>
            )}

            {/* selected track's steps */}
            {track?.steps.map((s, i) => (
              <StepRow key={s.key} step={s} index={i} open={openKey === s.key} onToggle={setOpenKey} />
            ))}

            {/* shared tail */}
            <div className="flex items-center gap-2.5 border-b border-ink-100 border-t border-t-ink-200 bg-ink-50 px-[18px] py-3">
              <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-ink-200 text-ink-600">
                <Globe className="h-[15px] w-[15px]" />
              </span>
              <div>
                <div className="text-[13px] font-bold text-ink-900">Shared setup — applies to every service</div>
                <div className="text-[11px] text-ink-500">Completed once · gates routing across all your tracks</div>
              </div>
              <span className="ml-auto">
                {sharedDone === vm.shared.length ? (
                  <Pill tone="live">
                    <Check className="h-3 w-3" strokeWidth={3} />
                    {sharedDone} of {vm.shared.length} complete
                  </Pill>
                ) : (
                  <Pill tone="prog">
                    <Clock className="h-3 w-3" />
                    {sharedDone} of {vm.shared.length} complete
                  </Pill>
                )}
              </span>
            </div>
            {vm.shared.map((s, i) => (
              <StepRow key={s.key} step={s} index={i} open={openKey === s.key} onToggle={setOpenKey} />
            ))}
          </div>

          <p className="mt-3.5 text-[12px] leading-[1.7] text-ink-400">
            Each service card = one track (own steps) + the shared tail once. A service goes{' '}
            <b className="text-ink-600">LIVE</b> when its own steps <i>and</i> the shared tail are
            complete — services that finish first start routing while the rest wrap up.
          </p>
        </div>

        {/* ================= RIGHT RAIL ================= */}
        <aside className="space-y-4">
          {track && !track.live && tv.unlocks.length > 0 && (
            <div className="rounded-xl border border-ink-200 bg-white p-[18px] shadow-sm">
              <div className="mb-2.5 flex items-center gap-2 font-display text-[15px] font-bold text-ink-900">
                <Zap className="h-4 w-4 text-pink-600" />
                What launching {track.label} unlocks
              </div>
              {tv.unlocks.map((u) => (
                <div key={u.title} className="flex gap-2.5 border-b border-ink-100 py-2.5 text-[12.5px] last:border-b-0">
                  <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-ink-100 text-ink-400">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  <div>
                    <b className="block font-semibold text-ink-900">{u.title}</b>
                    <span className="text-[11.5px] text-ink-500">{u.sub}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {liveTracks.length > 0 && (
            <div className="rounded-xl border border-ink-200 bg-white p-[18px] shadow-sm">
              <div className="mb-2.5 flex items-center gap-2 font-display text-[15px] font-bold text-ink-900">
                <Star className="h-4 w-4 text-pink-600" />
                Already earning
              </div>
              {liveTracks.map((t) => (
                <div key={t.svc} className="flex gap-2.5 border-b border-ink-100 py-2.5 text-[12.5px] last:border-b-0">
                  <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-success-50 text-success-600">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  <div>
                    <b className="block font-semibold text-ink-900">{t.label} — live</b>
                    <span className="text-[11.5px] text-ink-500">{visual(t.svc).earnLine}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div data-surface="dark" className="rounded-xl bg-ink-900 p-[18px] text-white">
            <div className="flex items-center gap-2 font-display text-[15px] font-bold">
              <HelpCircle className="h-4 w-4 text-neon-500" />
              Stuck on a step?
            </div>
            <p className="mb-3 mt-2 text-[12.5px] text-ink-300">
              Your onboarding manager can pre-fill any track with you on a 15-min call. Your data
              still routes automatically — no admin re-keying.
            </p>
            <a
              href="/my-application"
              className="block w-full rounded-full bg-neon-500 px-4 py-2 text-center text-[13px] font-semibold text-ink-900 transition-colors hover:bg-neon-400"
            >
              Book a setup call
            </a>
          </div>
        </aside>
      </div>

      {/* ================= CELEBRATION ================= */}
      {celebrate && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-ink-900/70 p-5 backdrop-blur-sm">
          <div className="relative max-w-[440px] overflow-hidden rounded-2xl border border-neon-500/30 bg-ink-900 p-8 text-center text-white">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(80% 80% at 50% -10%, rgba(181,255,61,.22), transparent 60%)',
              }}
            />
            <div className="relative z-[2] mx-auto mb-4 grid h-[76px] w-[76px] place-items-center rounded-[20px] bg-neon-500 text-ink-900">
              <Rocket className="h-9 w-9" />
            </div>
            <h2 className="relative z-[2] font-display text-[24px] font-extrabold">
              {celebrate} is <span className="font-serif font-medium italic text-neon-500">live.</span>
            </h2>
            <p className="relative z-[2] mb-5 mt-2 text-[13.5px] text-ink-300">
              Creators can now route work to you. You&rsquo;re operational on{' '}
              <b className="text-white">
                {vm.liveCount} of {vm.tracks.length} services
              </b>
              {vm.liveCount < vm.tracks.length ? ' — keep going to finish the rest.' : '.'}
            </p>
            <div className="relative z-[2] flex justify-center gap-2.5">
              <button
                type="button"
                onClick={() => setCelebrate(null)}
                className="rounded-full border border-ink-300 bg-white px-4 py-2 text-[13px] font-semibold text-ink-900 hover:bg-ink-50"
              >
                Keep setting up
              </button>
              <a
                href="/orders"
                className="rounded-full bg-neon-500 px-4 py-2 text-[13px] font-semibold text-ink-900 hover:bg-neon-400"
              >
                See my orders →
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// One step row + its inline drawer
// ---------------------------------------------------------------------------

function StepRow({
  step,
  index,
  open,
  onToggle,
}: {
  step: StepVM
  index: number
  open: boolean
  onToggle: (key: string | null) => void
}) {
  return (
    <div id={`step-${step.key}`} className="border-b border-ink-100 last:border-b-0">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onToggle(open ? null : step.key)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle(open ? null : step.key)
          }
        }}
        className="flex cursor-pointer items-center gap-3 px-[18px] py-3.5 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
      >
        <span
          className={cn(
            'grid h-[26px] w-[26px] flex-none place-items-center rounded-full border-[1.5px] text-[12px] font-bold',
            step.done
              ? 'border-success-500 bg-success-500 text-white'
              : step.auto
                ? 'border-info-100 bg-info-50 text-info-500'
                : 'border-ink-200 bg-ink-100 text-ink-500',
          )}
        >
          {step.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-ink-900">{step.title}</div>
          <div className="text-[12px] text-ink-500">{step.description}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {step.routesTo.map((r) => (
              <RouteTag key={r}>{r}</RouteTag>
            ))}
          </div>
        </div>
        <div className="flex flex-none items-center gap-2.5">
          {step.auto ? (
            <span
              title="Detected automatically from your setup"
              className="inline-flex items-center gap-1 rounded-full border border-info-100 bg-info-50 px-2 py-[3px] text-[10.5px] font-bold text-info-800"
            >
              <CircleCheck className="h-[11px] w-[11px]" />
              Auto-detected
            </span>
          ) : step.done ? (
            <Pill tone="live">
              <Check className="h-3 w-3" strokeWidth={3} />
              Done
            </Pill>
          ) : (
            <span className="rounded-full bg-pink-500 px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-pink-600">
              Set up
            </span>
          )}
          <ChevronRight
            className={cn('h-[18px] w-[18px] text-ink-400 transition-transform', open && 'rotate-90')}
          />
        </div>
      </div>

      {/* inline drawer */}
      {open && (
        <div className="border-t border-ink-100 bg-ink-50 p-[18px]">
          {/* where this lands */}
          <div className="mb-3.5 flex items-center gap-2.5 rounded-lg border border-info-100 bg-white px-3 py-2.5">
            <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-lg bg-info-50 text-info-500">
              <Globe className="h-4 w-4" />
            </span>
            <div className="text-[12.5px] text-ink-600">
              <b className="text-ink-900">Where this lands:</b> everything you enter here routes
              itself automatically.
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {step.routesTo.map((r, i) => (
                  <span key={r} className="inline-flex items-center gap-1.5">
                    {i > 0 && <span className="text-info-500">·</span>}
                    <span className="rounded-full border border-info-100 bg-info-50 px-2 py-[2px] text-[10.5px] font-semibold text-info-800">
                      {r}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {step.auto ? (
              <span className="text-[11.5px] text-ink-500">
                ✓ We detected this from data you&rsquo;ve already set up — nothing to do here.
              </span>
            ) : (
              <span className="text-[11.5px] text-ink-500">
                {step.href
                  ? 'Enter the real data on its surface, then mark this step done.'
                  : 'Mark this step done once you’ve confirmed it.'}
              </span>
            )}
            <div className="ml-auto flex gap-2">
              {step.href && (
                <a
                  href={step.href}
                  className="rounded-full border border-ink-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-900 hover:bg-ink-50"
                >
                  {step.auto || step.done ? 'Open →' : 'Set up →'}
                </a>
              )}
              {!step.auto && !step.done && (
                <form action={setActivationStepComplete.bind(null, step.key, true)}>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-black"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Save &amp; mark done
                  </button>
                </form>
              )}
              {!step.auto && step.done && (
                <form action={setActivationStepComplete.bind(null, step.key, false)}>
                  <button
                    type="submit"
                    className="rounded-full border border-ink-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-600 hover:bg-ink-50"
                  >
                    Reopen
                  </button>
                </form>
              )}
              <button
                type="button"
                onClick={() => onToggle(null)}
                className="rounded-full border border-ink-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-900 hover:bg-ink-50"
              >
                {step.done || step.auto ? 'Done' : 'Later'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
