import Link from 'next/link'
import {
  ChefHat, Globe, Mic, Dumbbell, Sparkles, Dog, Leaf,
  Wand2, Package, Scissors, ArrowRight, ShieldCheck, Factory,
  MousePointer2, Type, Image as ImageIcon, Palette, Layers, Box as BoxIcon,
} from 'lucide-react'
import { Button } from '@ilaunchify/ui'
import { Reveal } from '@/components/Reveal'

/**
 * /proto — NON-DESTRUCTIVE repositioning prototype (white/private-label production
 * marketplace), Packify-inspired: stylish 3D product renders + a "behind the
 * curtain" Studio reveal. Not linked in nav. Copy source: docs/LANDING_MESSAGING.md.
 */

// ---- hue ramps for the vector "product photo" renders --------------------
const HUES: Record<string, [string, string, string, string]> = {
  // [shadow/dark edge, base, highlight, deep base]
  pink: ['#A8164474', '#FF2E63', '#FF9DB8', '#B81A4C'],
  neon: ['#7FB52A74', '#B5FF3D', '#E4FFB8', '#86C42B'],
  violet: ['#7E63C974', '#C9B6FF', '#F0E9FF', '#9A82E0'],
  cyan: ['#1B9AA874', '#2DE2E6', '#C4F8FA', '#1FB3B8'],
}

const ARCHETYPES = [
  { icon: ChefHat, name: 'Chefs & culinary', trust: 'recipes, flavor, technique', product: 'Signature hot sauce', domain: 'Gourmet & Culinary', hue: 'pink' },
  { icon: Globe, name: 'Food nomads', trust: 'global tastes & discovery', product: 'Single-origin coffee', domain: 'Functional drinks', hue: 'neon' },
  { icon: Mic, name: 'Food podcasters', trust: 'what to eat and buy', product: 'Daily greens + bars', domain: 'Healthy Lifestyle', hue: 'cyan' },
  { icon: Dumbbell, name: 'Fitness & wellness', trust: 'training & supplementation', product: 'Protein & electrolytes', domain: 'Energy & Performance', hue: 'violet' },
  { icon: Sparkles, name: 'Beauty & self-care', trust: 'routines & ingredients', product: 'Beauty-from-within', domain: 'Beauty & Self-Care', hue: 'pink' },
  { icon: Dog, name: 'Pet creators', trust: 'pet life & trusted picks', product: 'Functional pet treats', domain: 'Pet Wellness', hue: 'neon' },
  { icon: Leaf, name: 'Lifestyle & social', trust: 'taste & recommendations', product: 'Adaptogen blends', domain: 'Social & Lifestyle', hue: 'violet' },
] as const

export default function ProtoPage() {
  return (
    <main className="bg-white text-ink-900">
      <div className="bg-ink-900 py-1.5 text-center text-[12px] font-semibold tracking-wide text-neon-500">
        PROTOTYPE · /proto · not linked in nav · copy per docs/LANDING_MESSAGING.md
      </div>

      {/* ===================== HERO ===================== */}
      <section className="relative overflow-hidden px-6 pt-16 pb-20 sm:px-8 sm:pt-20">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="mesh-blob" style={{ width: 520, height: 520, background: '#FF2E63', top: -160, left: -120 }} />
          <div className="mesh-blob" style={{ width: 440, height: 440, background: '#B5FF3D', top: 180, right: -140, animationDelay: '-6s' }} />
          <div className="mesh-blob" style={{ width: 380, height: 380, background: '#C9B6FF', bottom: -160, left: '36%', animationDelay: '-12s' }} />
        </div>

        <div className="relative z-[1] mx-auto grid max-w-[1400px] items-center gap-10 lg:grid-cols-[1fr_0.95fr]">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-pill border border-ink-200 bg-white/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-700 backdrop-blur">
              <ShieldCheck strokeWidth={2.5} className="h-3.5 w-3.5" />
              White &amp; private label · FDA-compliant · Made in the USA
            </div>
            <h1 className="mb-6 max-w-[15ch] font-display text-[clamp(40px,5.2vw,80px)] font-extrabold leading-[0.95] tracking-[-0.04em]">
              Your brand on{' '}
              <span className="font-serif italic font-medium text-pink-500 tracking-[-0.025em]">proven, shelf-ready products.</span>
            </h1>
            <p className="mb-9 max-w-[54ch] text-[clamp(16px,1.6vw,20px)] leading-[1.55] text-ink-900/[0.78]">
              Pick a production-ready product, make it yours in the Design Studio, and we orchestrate the
              manufacturer, printer, co-packer, and warehouse. A real CPG brand — without becoming a CPG operator.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" size="xl" asChild>
                <Link href="/marketplace">Browse white-label products <ArrowRight strokeWidth={2.5} className="h-4 w-4" /></Link>
              </Button>
              <Button variant="outline" size="xl" asChild className="border-ink-300 text-ink-900 hover:bg-ink-50">
                <Link href="/business">Sell as a manufacturer</Link>
              </Button>
            </div>
            <p className="mt-6 text-[13px] font-medium text-ink-500">You own the brand and the customer. We stay invisible in production.</p>
          </div>

          {/* hero product cluster */}
          <div className="relative hidden h-[460px] lg:block">
            <div className="absolute left-1/2 top-1/2 w-[230px] -translate-x-1/2 -translate-y-1/2 drop-shadow-2xl">
              <Can hue="pink" idKey="h1" label="GREENS" floatDur="6s" />
            </div>
            <div className="absolute left-[8%] top-[16%] w-[150px] -rotate-6 opacity-95">
              <Can hue="neon" idKey="h2" label="FOCUS" floatDur="7s" />
            </div>
            <div className="absolute right-[4%] bottom-[8%] w-[140px] rotate-6 opacity-95">
              <Can hue="violet" idKey="h3" label="CALM" floatDur="6.5s" />
            </div>
            <span className="absolute left-1/2 top-[20%] -translate-x-1/2 rounded-pill bg-ink-900 px-3 py-1.5 text-[11px] font-bold tracking-[0.4px] text-neon-500 shadow-lg">YOUR LABEL HERE</span>
          </div>
        </div>
      </section>

      {/* ============ ONE PLATFORM — Studio reveal (behind the curtain) ============ */}
      <Reveal>
        <section data-surface="dark" className="overflow-hidden bg-ink-900 px-6 py-24 text-white sm:px-8">
          <div className="mx-auto max-w-[1400px]">
            <div className="mb-12 max-w-2xl">
              <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-neon-500">One platform · infinite design</div>
              <h2 className="font-display text-4xl font-bold leading-[1.02] tracking-[-0.035em] sm:text-5xl">
                Design it in 3D.{' '}
                <span className="font-serif italic font-medium text-neon-500">We print and produce it.</span>
              </h2>
              <p className="mt-4 max-w-[60ch] text-[17px] leading-[1.6] text-ink-300">
                Drop your brand onto a real product, spin it in 3D, and watch the FDA panel render live — then we route
                the print-ready files to the factory floor. This is the studio behind your brand.
              </p>
            </div>
            <StudioMock />
          </div>
        </section>
      </Reveal>

      {/* ============ ARCHETYPES ============ */}
      <Reveal>
        <section className="border-b border-ink-200 bg-white px-6 py-24 sm:px-8">
          <div className="mx-auto max-w-[1400px]">
            <div className="mb-14 max-w-2xl">
              <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-pink-700">Built for creators like you</div>
              <h2 className="mb-4 font-display text-4xl font-bold leading-[1.02] tracking-[-0.035em] sm:text-5xl">
                You&apos;ve built the trust.{' '}
                <span className="font-serif italic font-medium text-pink-500">Put your name on the product.</span>
              </h2>
              <p className="text-[17px] leading-[1.6] text-ink-600">
                The wedge isn&apos;t follower count — it&apos;s community trust. Whatever your audience trusts you for,
                there&apos;s a product to brand and a domain to own.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {ARCHETYPES.map((a) => {
                const c = HUES[a.hue]!
                const dark = a.hue === 'neon'
                return (
                  <div key={a.name} className="group flex flex-col rounded-2xl border border-ink-200 bg-white p-6 transition-shadow hover:shadow-[0_16px_40px_rgba(13,7,23,0.08)]">
                    <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-pill" style={{ background: c[1] + '22', border: `1px solid ${c[1]}66` }}>
                      <a.icon strokeWidth={2} className="h-5 w-5" style={{ color: dark ? '#18181A' : c[3] }} />
                    </span>
                    <div className="font-display text-[18px] font-bold leading-tight tracking-[-0.01em] text-ink-900">{a.name}</div>
                    <div className="mt-1 text-[13px] text-ink-500">Trusted for {a.trust}</div>
                    <div className="mt-4 flex items-center gap-2 border-t border-ink-100 pt-4 text-[13.5px]">
                      <ArrowRight strokeWidth={2.5} className="h-3.5 w-3.5 text-pink-500" />
                      <span className="font-semibold text-ink-900">{a.product}</span>
                    </div>
                    <div className="mt-1 text-[12px] font-medium uppercase tracking-[0.05em] text-ink-400">{a.domain}</div>
                  </div>
                )
              })}
              <div className="flex flex-col justify-center rounded-2xl bg-ink-900 p-6 text-white">
                <div className="font-display text-[18px] font-bold tracking-[-0.01em]">Your niche, too.</div>
                <p className="mt-2 text-[13.5px] leading-[1.5] text-ink-300">8 locked niches · 13 product categories — all wired and curated.</p>
                <Link href="/marketplace" className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-neon-500 hover:text-neon-400">See the marketplace →</Link>
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ============ TOOLS SHOWCASE ============ */}
      <Reveal>
        <section className="bg-ink-50/50 px-6 py-24 sm:px-8">
          <div className="mx-auto max-w-[1400px]">
            <div className="mb-12 max-w-2xl">
              <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-pink-700">The toolkit</div>
              <h2 className="font-display text-4xl font-bold leading-[1.02] tracking-[-0.035em] sm:text-5xl">
                Everything from logo to{' '}
                <span className="font-serif italic font-medium text-pink-500">loading dock.</span>
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <ToolCard icon={Wand2} name="Design Studio" status={null}
                blurb="Drop your logo, colors, and copy onto a real product. FDA Nutrition & Supplement Facts panels render live as you design.">
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-ink-100 to-white p-6">
                  <div className="w-[150px]"><Can hue="pink" idKey="t1" label="GREENS" selected /></div>
                </div>
              </ToolCard>
              <ToolCard icon={Package} name="Packaging Studio" status={null}
                blurb="Wrap it in retail-ready packaging — cans, cartons, pouches, labels — spun in 3D and built to print.">
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-ink-900 to-ink-800 p-6">
                  <div className="w-[160px]"><Box /></div>
                </div>
              </ToolCard>
              <ToolCard icon={Scissors} name="Die-line Generator" status="Coming soon"
                blurb="Auto-generate print-perfect die-lines for any pack format — every fold, bleed, and safe-zone placed for you.">
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-white to-ink-50 p-6">
                  <Dieline />
                </div>
              </ToolCard>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ============ SELLER STRIP ============ */}
      <Reveal>
        <section className="bg-white px-6 py-20 sm:px-8">
          <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-6 rounded-3xl bg-ink-900 p-10 text-white sm:flex-row sm:items-center">
            <div className="max-w-[52ch]">
              <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-neon-500">
                <Factory strokeWidth={2.5} className="h-4 w-4" /> For manufacturers &amp; producers
              </div>
              <h2 className="font-display text-[28px] font-bold leading-[1.1] tracking-[-0.025em] sm:text-4xl">
                Fill your floor with{' '}
                <span className="font-serif italic font-medium text-neon-500">brands, not brokers.</span>
              </h2>
              <p className="mt-2 text-[15px] leading-[1.55] text-ink-300">
                List your white-label, FDA-ready catalog. Creators brand it; we route you pre-qualified production
                orders by capability, region, and capacity. Stripe payouts on a published schedule.
              </p>
            </div>
            <Button variant="neon" size="xl" asChild>
              <Link href="/business">Sell as a manufacturer <ArrowRight strokeWidth={2.5} className="h-4 w-4" /></Link>
            </Button>
          </div>
        </section>
      </Reveal>
    </main>
  )
}

/* ====================== components ====================== */

function ToolCard({ icon: Icon, name, blurb, status, children }: { icon: typeof Wand2; name: string; blurb: string; status: string | null; children: React.ReactNode }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <div className="relative h-56 border-b border-ink-200">
        {children}
        {status && (
          <span className="absolute right-4 top-4 rounded-pill bg-neon-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.06em] text-ink-900">{status}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-6">
        <div className="mb-2 flex items-center gap-2">
          <Icon strokeWidth={2} className="h-5 w-5 text-pink-600" />
          <div className="font-display text-[19px] font-bold tracking-[-0.01em] text-ink-900">{name}</div>
        </div>
        <p className="text-[14px] leading-[1.6] text-ink-600">{blurb}</p>
      </div>
    </div>
  )
}

/** Glossy 3D can render — vector but reads like a product shot. */
function Can({ hue, idKey, label, selected = false, floatDur }: { hue: keyof typeof HUES; idKey: string; label: string; selected?: boolean; floatDur?: string }) {
  const c = HUES[hue]
  const b = `body-${idKey}`
  const m = `metal-${idKey}`
  const g = `gloss-${idKey}`
  const dark = hue === 'neon' || hue === 'cyan'
  return (
    <svg viewBox="0 0 200 360" className="h-auto w-full" role="img" aria-label={`${label} product`}>
      <defs>
        <linearGradient id={b} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={c![3]} /><stop offset="0.16" stopColor={c![1]} /><stop offset="0.42" stopColor={c![2]} />
          <stop offset="0.52" stopColor={c![2]} /><stop offset="0.66" stopColor={c![1]} /><stop offset="1" stopColor={c![3]} />
        </linearGradient>
        <linearGradient id={m} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8d93a0" /><stop offset="0.3" stopColor="#e8ecf2" /><stop offset="0.5" stopColor="#ffffff" /><stop offset="0.7" stopColor="#c9cfd8" /><stop offset="1" stopColor="#7e8492" />
        </linearGradient>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" /><stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g>
        {floatDur && <animateTransform attributeName="transform" type="translate" values="0 0;0 -10;0 0" dur={floatDur} repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" />}
        {/* shadow */}
        <ellipse cx="100" cy="338" rx="62" ry="11" fill="#0B0B0F" opacity="0.18" />
        {/* body */}
        <ellipse cx="100" cy="312" rx="60" ry="15" fill={c![3]} />
        <rect x="40" y="56" width="120" height="256" fill={`url(#${b})`} />
        {/* gloss highlight stripe */}
        <rect x="62" y="56" width="16" height="256" fill={`url(#${g})`} />
        <rect x="120" y="56" width="6" height="256" fill="#ffffff" opacity="0.12" />
        {/* accent bands */}
        <rect x="40" y="120" width="120" height="3" fill="#ffffff" opacity="0.55" />
        <rect x="40" y="246" width="120" height="3" fill="#ffffff" opacity="0.4" />
        {/* brand glyph + name */}
        <g transform="translate(100,186)">
          <g stroke={dark ? '#101013' : '#ffffff'} strokeWidth="5" fill="none" strokeLinejoin="round" strokeLinecap="round">
            <path d="M0 -22 L26 -8 L0 6 L-26 -8 Z" /><path d="M-26 2 L0 16 L26 2" /><path d="M-26 12 L0 26 L26 12" />
          </g>
          <text x="0" y="58" textAnchor="middle" fontSize="17" fontWeight="800" letterSpacing="2" fill={dark ? '#101013' : '#ffffff'}>{label}</text>
        </g>
        {/* top rim */}
        <ellipse cx="100" cy="56" rx="60" ry="15" fill={`url(#${m})`} />
        <ellipse cx="100" cy="54" rx="50" ry="11" fill="#aeb4bf" />
        <ellipse cx="100" cy="52" rx="50" ry="10" fill={`url(#${m})`} />
        {selected && (
          <g>
            <rect x="34" y="40" width="132" height="288" fill="none" stroke="#2DE2E6" strokeWidth="1.5" strokeDasharray="5 4" />
            <g fill="#2DE2E6">{[[34, 40], [166, 40], [34, 328], [166, 328]].map(([x, y]) => <rect key={`${x}-${y}`} x={x! - 3} y={y! - 3} width="6" height="6" />)}</g>
          </g>
        )}
      </g>
    </svg>
  )
}

/** Isometric box render with a branded front panel. */
function Box() {
  return (
    <svg viewBox="0 0 220 200" className="h-auto w-full" aria-hidden>
      <g>
        <animateTransform attributeName="transform" type="translate" values="0 0;0 -6;0 0" dur="4.5s" repeatCount="indefinite" />
        <ellipse cx="110" cy="186" rx="78" ry="12" fill="#000" opacity="0.22" />
        <polygon points="110,28 188,64 188,134 110,170 32,134 32,64" fill="#0E0E12" />
        <polygon points="110,28 188,64 110,100 32,64" fill="#FF9DB8" />
        <polygon points="110,100 188,64 188,134 110,170" fill="#B81A4C" />
        <polygon points="110,100 32,64 32,134 110,170" fill="#FF2E63" />
        {/* branded label on front-left face */}
        <polygon points="52,82 110,109 110,150 52,123" fill="#FFFFFF" opacity="0.94" />
        <g stroke="#FF2E63" strokeWidth="2.4" fill="none" strokeLinejoin="round" transform="translate(80,116) scale(0.46)"><path d="M0 -14 L16 -5 L0 4 L-16 -5 Z" /><path d="M-16 0 L0 9 L16 0" /></g>
        <text x="81" y="138" textAnchor="middle" fontSize="9" fontWeight="800" fill="#FF2E63" transform="skewY(20) translate(0,-9)">ACME</text>
      </g>
    </svg>
  )
}

/** Die-line net + cut/fold lines. */
function Dieline() {
  return (
    <svg viewBox="0 0 240 160" className="h-auto w-[86%]" aria-hidden>
      <g stroke="#18181A" strokeWidth="1.6" fill="none">
        <rect x="78" y="22" width="52" height="36" /><rect x="78" y="58" width="52" height="52" /><rect x="78" y="110" width="52" height="28" />
        <rect x="38" y="58" width="40" height="52" /><rect x="130" y="58" width="40" height="52" /><rect x="170" y="58" width="32" height="52" />
      </g>
      <g stroke="#FF2E63" strokeWidth="1.4" strokeDasharray="5 4" opacity="0.85">
        <line x1="78" y1="58" x2="202" y2="58" /><line x1="78" y1="110" x2="202" y2="110" /><line x1="78" y1="22" x2="78" y2="138" /><line x1="130" y1="22" x2="130" y2="138" />
      </g>
      <g stroke="#2DE2E6" strokeWidth="1" strokeDasharray="2 3" opacity="0.55" fill="none"><rect x="32" y="16" width="176" height="128" /></g>
      <circle cx="104" cy="84" r="3" fill="#B5FF3D" />
    </svg>
  )
}

/** "Behind the curtain" Studio app-window mockup (HTML chrome + a 3D product). */
function StudioMock() {
  const tools = [MousePointer2, Type, ImageIcon, Palette, BoxIcon, Layers]
  const swatches = ['#FF2E63', '#B5FF3D', '#C9B6FF', '#FFD23F', '#2DE2E6']
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 shadow-[0_40px_120px_rgba(0,0,0,0.5)]">
      {/* top bar */}
      <div className="flex items-center justify-between border-b border-ink-700 bg-ink-800 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-ink-600" /><span className="h-2.5 w-2.5 rounded-full bg-ink-600" /><span className="h-2.5 w-2.5 rounded-full bg-ink-600" /></div>
          <span className="text-[12px] font-semibold text-white">Design Studio</span>
          <span className="text-[11px] text-ink-400">· Acme Greens · v3</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-pill border border-ink-600 p-0.5 text-[10px] font-bold">
            <span className="rounded-pill bg-neon-500 px-2.5 py-1 text-ink-900">3D</span>
            <span className="px-2.5 py-1 text-ink-300">Die-line</span>
          </div>
          <span className="rounded-pill bg-ink-700 px-2.5 py-1 text-[10px] font-semibold text-ink-200">Saved</span>
          <span className="rounded-pill bg-white px-3 py-1 text-[10px] font-bold text-ink-900">Export print PDF</span>
        </div>
      </div>
      <div className="grid grid-cols-[52px_1fr_172px]">
        {/* left tool rail */}
        <div className="flex flex-col items-center gap-1.5 border-r border-ink-700 bg-ink-800 py-4">
          {tools.map((T, i) => (
            <span key={i} className={`flex h-9 w-9 items-center justify-center rounded-xl ${i === 4 ? 'bg-neon-500/15 text-neon-500' : 'text-ink-400'}`}>
              <T strokeWidth={2} className="h-[18px] w-[18px]" />
            </span>
          ))}
        </div>
        {/* canvas */}
        <div className="relative flex min-h-[320px] items-center justify-center overflow-hidden" style={{ background: 'radial-gradient(120% 90% at 50% 35%, #1A1A20 0%, #0C0C10 80%)' }}>
          <div aria-hidden className="absolute inset-0 opacity-[0.5]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
          <div className="relative w-[150px]"><Can hue="neon" idKey="studio" label="GREENS" selected /></div>
          <span className="absolute left-4 top-4 rounded-pill border border-neon-500/40 bg-ink-900/70 px-2.5 py-1 text-[10px] font-bold text-neon-500">● FDA panel valid</span>
          <span className="absolute bottom-4 left-4 rounded-md bg-ink-900/70 px-2 py-1 text-[10px] font-medium text-ink-400">100%</span>
        </div>
        {/* right panel */}
        <div className="border-l border-ink-700 bg-ink-800 p-3.5 text-white">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-400">Brand colors</div>
          <div className="mb-4 flex gap-1.5">{swatches.map((s) => <span key={s} className="h-6 w-6 rounded-md ring-1 ring-white/15" style={{ background: s }} />)}</div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-400">Layers</div>
          <div className="space-y-1.5">
            {['Logo', 'Product name', 'Nutrition panel', 'Background'].map((l, i) => (
              <div key={l} className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[12px] ${i === 0 ? 'bg-neon-500/15 text-white' : 'bg-ink-900/40 text-ink-300'}`}>
                <span>{l}</span><Layers strokeWidth={2} className="h-3.5 w-3.5 opacity-50" />
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-neon-500/30 bg-neon-500/10 px-3 py-2 text-[11px] font-semibold text-neon-500">✓ Print-ready · 300dpi · CMYK</div>
        </div>
      </div>
    </div>
  )
}
