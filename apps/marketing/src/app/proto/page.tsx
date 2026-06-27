import Link from 'next/link'
import {
  ChefHat, Globe, Mic, Dumbbell, Sparkles, Dog, Leaf,
  ArrowRight, ShieldCheck, Factory, Search, Check, Upload, Type as TypeIcon,
  MousePointer2, Image as ImageIcon, Palette, Layers, Box as BoxIcon,
  ShoppingBag, Truck, Store, Printer, Boxes, Warehouse, CheckCircle2, Music2,
} from 'lucide-react'
import { Button } from '@ilaunchify/ui'
import { Reveal } from '@/components/Reveal'
import { Parallax } from '@/components/Parallax'
import { CountUp } from '@/components/CountUp'

/**
 * /proto — NON-DESTRUCTIVE repositioning prototype. The centerpiece is the
 * 8-step "how your brand gets made" walkthrough with believable platform-screen
 * mockups. Copy source: docs/LANDING_MESSAGING.md. Not linked in nav.
 */

const ARCHETYPES = [
  { icon: ChefHat, name: 'Chefs & culinary', trust: 'recipes, flavor, technique', product: 'Signature hot sauce', domain: 'Gourmet & Culinary', hue: '#FF2E63' },
  { icon: Globe, name: 'Food nomads', trust: 'global tastes & discovery', product: 'Single-origin coffee', domain: 'Functional drinks', hue: '#86C42B' },
  { icon: Mic, name: 'Food podcasters', trust: 'what to eat and buy', product: 'Daily greens + bars', domain: 'Healthy Lifestyle', hue: '#1FB3B8' },
  { icon: Dumbbell, name: 'Fitness & wellness', trust: 'training & supplementation', product: 'Protein & electrolytes', domain: 'Energy & Performance', hue: '#9A82E0' },
  { icon: Sparkles, name: 'Beauty & self-care', trust: 'routines & ingredients', product: 'Beauty-from-within', domain: 'Beauty & Self-Care', hue: '#FF2E63' },
  { icon: Dog, name: 'Pet creators', trust: 'pet life & trusted picks', product: 'Functional pet treats', domain: 'Pet Wellness', hue: '#86C42B' },
  { icon: Leaf, name: 'Lifestyle & social', trust: 'taste & recommendations', product: 'Adaptogen blends', domain: 'Social & Lifestyle', hue: '#9A82E0' },
] as const

const MARQUEE: [string, string][] = [
  ['PROTEIN POWDERS', '#FFFFFF'], ['FUNCTIONAL DRINKS', '#FF2E63'], ['ADAPTOGEN BLENDS', '#FFFFFF'],
  ['COLD-BREW COFFEE', '#B5FF3D'], ['ELECTROLYTE MIXES', '#FFFFFF'], ['HOT SAUCE', '#FF2E63'],
  ['PET WELLNESS', '#FFFFFF'], ['BEAUTY-FROM-WITHIN', '#B5FF3D'], ['SNACK BARS', '#FFFFFF'], ['COLLAGEN', '#FF2E63'],
]

const STATS = [
  { n: '8', l: 'creator niches — locked & curated' },
  { n: '13', l: 'product categories, all wired' },
  { n: '4', l: 'partner types orchestrated per order' },
  { n: 'FDA', l: 'labels rendered to 21 CFR spec' },
]

const GREEN = '#1FAE5A'

export default function ProtoPage() {
  return (
    <main className="bg-white text-ink-900">
      <div className="bg-ink-900 py-1.5 text-center text-[12px] font-semibold tracking-wide text-neon-500">
        PROTOTYPE · /proto · not linked in nav · copy per docs/LANDING_MESSAGING.md
      </div>

      {/* ===================== HERO (spatial) ===================== */}
      <section className="relative overflow-hidden bg-white px-6 pt-20 pb-24 sm:px-8">
        <style>{`
          .sp-stage{position:relative;overflow:hidden;border-radius:28px;
            background:
              radial-gradient(620px 460px at 22% 6%, rgba(255,46,99,0.30), transparent 60%),
              radial-gradient(560px 440px at 92% 22%, rgba(110,139,255,0.26), transparent 62%),
              radial-gradient(640px 520px at 54% 116%, rgba(154,130,224,0.42), transparent 60%),
              #07070C;}
          .sp-grid{position:absolute;left:50%;bottom:-14%;width:200%;height:58%;
            transform:translateX(-50%) perspective(420px) rotateX(70deg);transform-origin:50% 100%;
            background-image:linear-gradient(to right,rgba(154,130,224,0.24) 1px,transparent 1px),
              linear-gradient(to top,rgba(255,46,99,0.18) 1px,transparent 1px);
            background-size:54px 54px;
            -webkit-mask-image:linear-gradient(to top,#000 0%,transparent 80%);
            mask-image:linear-gradient(to top,#000 0%,transparent 80%);
            animation:sp-grid 5s linear infinite;}
          @keyframes sp-grid{from{background-position:0 0}to{background-position:0 54px}}
          .sp-star{animation:sp-twinkle 3.2s ease-in-out infinite}
          @keyframes sp-twinkle{0%,100%{opacity:.18}50%{opacity:.95}}
          .sp-float{animation:sp-float 9s ease-in-out infinite}
          @keyframes sp-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-16px)}}
          .sp-node{transform-box:fill-box;transform-origin:center;animation:sp-pulse 3.4s ease-in-out infinite}
          @keyframes sp-pulse{0%,100%{opacity:.8}50%{opacity:1}}
          .sp-flow{stroke-dasharray:4 11;animation:sp-dash 1.5s linear infinite}
          @keyframes sp-dash{to{stroke-dashoffset:-30}}
          @media (prefers-reduced-motion:reduce){.sp-grid,.sp-star,.sp-float,.sp-node,.sp-flow{animation:none!important}}
        `}</style>

        <div className="relative z-[1] mx-auto grid max-w-[1400px] items-center gap-12 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-pill border border-ink-200 bg-white/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-700 backdrop-blur">
              <ShieldCheck strokeWidth={2.5} className="h-3.5 w-3.5" />
              White &amp; private label · FDA-compliant · Made in the USA
            </div>
            <h1 className="mb-6 max-w-[15ch] font-display text-[clamp(40px,5.2vw,80px)] font-extrabold leading-[0.95] tracking-[-0.04em] text-ink-900">
              Your brand on{' '}
              <span className="font-serif italic font-medium tracking-[-0.025em]" style={{ backgroundImage: 'linear-gradient(100deg, #FF2E63 0%, #C081FF 60%, #6E8BFF 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>proven, shelf-ready products.</span>
            </h1>
            <p className="mb-9 max-w-[52ch] text-[clamp(16px,1.6vw,20px)] leading-[1.55] text-ink-900/[0.78]">
              Pick a production-ready product, brand it, design the packaging, pass FDA compliance, and order a real
              run — all in one place. Launch a CPG brand without becoming a CPG operator.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" size="xl" asChild>
                <Link href="/marketplace">Browse white-label products <ArrowRight strokeWidth={2.5} className="h-4 w-4" /></Link>
              </Button>
              <Button variant="outline" size="xl" asChild className="border-ink-300 text-ink-900 hover:bg-ink-50">
                <Link href="#how">See how it works</Link>
              </Button>
            </div>
            <p className="mt-6 text-[13px] font-medium text-ink-500">You own the brand and the customer. We stay invisible in production.</p>
          </div>

          <div className="relative hidden lg:block">
            <div className="sp-stage aspect-[5/4] w-full shadow-[0_40px_90px_-55px_rgba(0,0,0,0.6)]">
              <div aria-hidden className="sp-grid pointer-events-none" />
              <svg aria-hidden viewBox="0 0 600 480" preserveAspectRatio="xMidYMid slice" className="pointer-events-none absolute inset-0 h-full w-full">
                {[[40, 60], [140, 120], [260, 50], [360, 100], [470, 70], [560, 130], [90, 210], [300, 180], [520, 230], [70, 340], [230, 320], [430, 360], [560, 330], [150, 430], [400, 440], [540, 420]].map(([x, y], i) => (
                  <circle key={i} className="sp-star" cx={x} cy={y} r={i % 4 === 0 ? 1.8 : 1} fill="#ffffff" style={{ animationDelay: `${(i % 7) * 0.4}s` }} />
                ))}
              </svg>
              <div className="absolute inset-0 flex items-center justify-center px-6">
                <Parallax speed={0.05}>
                  <div className="sp-float">
                    <OrchestrationConstellation />
                  </div>
                </Parallax>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== MARQUEE ===================== */}
      <section className="relative overflow-hidden border-y border-white/10 bg-ink-900 py-5">
        <div className="marquee-track flex items-center gap-7 whitespace-nowrap font-display text-[clamp(20px,2.4vw,38px)] font-extrabold tracking-[-0.02em]">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex flex-shrink-0 items-center gap-7" aria-hidden={copy === 1}>
              {MARQUEE.map(([t, c], i) => (
                <span key={`${copy}-${i}`} className="inline-flex items-center gap-7">
                  <span style={{ color: c }}>{t}</span>
                  <span className="text-ink-700">•</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ===================== STATS ===================== */}
      <Reveal>
        <section className="bg-white px-6 py-16 sm:px-8">
          <div className="mx-auto grid max-w-[1200px] grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.l} className="border-l-2 border-pink-500 pl-5">
                <CountUp value={s.n} className="block font-display text-[clamp(40px,4.5vw,60px)] font-extrabold leading-none tracking-[-0.03em] text-ink-900" />
                <div className="mt-1.5 text-[14px] leading-snug text-ink-500">{s.l}</div>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ===================== HOW IT WORKS (banded process) ===================== */}
      <section id="how" className="bg-white px-6 pt-24 pb-6 sm:px-8">
        <div className="mx-auto max-w-[1400px]">
          <Reveal>
            <div className="max-w-2xl">
              <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-pink-700">How it works · from idea to on-shelf</div>
              <h2 className="font-display text-[clamp(34px,4.4vw,60px)] font-bold leading-[1.0] tracking-[-0.035em]">
                Eight steps you do.{' '}
                <span className="font-serif italic font-medium text-pink-500">The factory floor we run.</span>
              </h2>
              <p className="mt-4 text-[17px] leading-[1.6] text-ink-600">
                Every step lives on one platform — and your card isn&apos;t charged until every partner confirms they can deliver.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      <StepFX />

      <StepBand bg="bg-white">
        <Step n="01" kicker="Pick the product" title="Start from a proven product." reverse={false}
          desc="Browse a curated catalog of production-ready, FDA-compliant products across 8 niches — each one already validated by a real manufacturer. No sourcing, no cold emails.">
          <PickScreen />
        </Step>
      </StepBand>

      <StepBand bg="bg-ink-100">
        <Step n="02" kicker="Add your brand identity" title="Make it unmistakably yours." reverse
          desc="Drop in your logo, brand colors, and fonts once. Your brand kit auto-applies across every product, label, and pack you design.">
          <BrandScreen />
        </Step>
      </StepBand>

      <StepBand bg="bg-white">
        <Step n="03" kicker="Design your packaging" title="Design it like a pro — no designer needed." reverse={false}
          desc="A real canvas with your brand pre-loaded. Place artwork on the actual product surfaces and preview it print-accurate.">
          <StudioScreen compact />
        </Step>
      </StepBand>

      <StepBand bg="bg-ink-900">
        <Step n="04" kicker="Add your Nutrition Facts label" title="Your label, rendered to FDA spec." reverse dark
          desc="Nutrition Facts and Supplement Facts panels render automatically to 21 CFR — right serving sizes, % daily values, allergen and bioengineered disclosures.">
          <LabelScreen />
        </Step>
      </StepBand>

      <StepBand bg="bg-ink-100">
        <Step n="05" kicker="Check your compliance" title="Pass compliance before you print." reverse={false}
          desc="A live scan flags below-spec font sizes, missing allergens, and net-quantity formatting — so nothing ships mislabeled.">
          <ComplianceScreen />
        </Step>
      </StepBand>

      <StepBand bg="bg-ink-900">
        <Step n="06" kicker="Order a sample" title="Hold it before you commit." reverse dark
          desc="Order a real sample — your first one is 50% off. Taste it, shoot it, show your audience. Then green-light the run.">
          <SampleScreen />
        </Step>
      </StepBand>

      <StepBand bg="bg-white">
        <Step n="07" kicker="Place the production order" title="One order. We orchestrate the rest." reverse={false}
          desc="We decompose your order into a workflow graph across manufacturer, printer, co-packer, and warehouse — and surface one timeline. Card captured only when every partner approves.">
          <OrchestrationScreen />
        </Step>
      </StepBand>

      <StepBand bg="bg-ink-100">
        <Step n="08" kicker="Add it to your channel" title="Sell it where your audience already is." reverse
          desc="Connect Shopify or TikTok Shop and your product goes live on your store. End buyers buy from you — we never appear in the consumer flow.">
          <ChannelScreen />
        </Step>
      </StepBand>

      {/* ===================== ARCHETYPES ===================== */}
      <Reveal>
        <section className="border-y border-ink-200 bg-ink-50/50 px-6 py-24 sm:px-8">
          <div className="mx-auto max-w-[1400px]">
            <div className="mb-14 max-w-2xl">
              <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-pink-700">Built for creators like you</div>
              <h2 className="mb-4 font-display text-4xl font-bold leading-[1.02] tracking-[-0.035em] sm:text-5xl">
                You&apos;ve built the trust.{' '}
                <span className="font-serif italic font-medium text-pink-500">Put your name on the product.</span>
              </h2>
              <p className="text-[17px] leading-[1.6] text-ink-600">
                The wedge isn&apos;t follower count — it&apos;s community trust. Whatever your audience trusts you for, there&apos;s a product to brand and a domain to own.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {ARCHETYPES.map((a) => (
                <div key={a.name} className="flex flex-col rounded-2xl border border-ink-200 bg-white p-6 transition-shadow hover:shadow-[0_16px_40px_rgba(13,7,23,0.08)]">
                  <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-pill" style={{ background: a.hue + '22', border: `1px solid ${a.hue}55` }}>
                    <a.icon strokeWidth={2} className="h-5 w-5" style={{ color: a.hue }} />
                  </span>
                  <div className="font-display text-[18px] font-bold leading-tight tracking-[-0.01em] text-ink-900">{a.name}</div>
                  <div className="mt-1 text-[13px] text-ink-500">Trusted for {a.trust}</div>
                  <div className="mt-4 flex items-center gap-2 border-t border-ink-100 pt-4 text-[13.5px]">
                    <ArrowRight strokeWidth={2.5} className="h-3.5 w-3.5 text-pink-500" />
                    <span className="font-semibold text-ink-900">{a.product}</span>
                  </div>
                  <div className="mt-1 text-[12px] font-medium uppercase tracking-[0.05em] text-ink-400">{a.domain}</div>
                </div>
              ))}
              <div className="flex flex-col justify-center rounded-2xl bg-ink-900 p-6 text-white">
                <div className="font-display text-[18px] font-bold tracking-[-0.01em]">Your niche, too.</div>
                <p className="mt-2 text-[13.5px] leading-[1.5] text-ink-300">8 locked niches · 13 product categories — all wired and curated.</p>
                <Link href="/marketplace" className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-neon-500 hover:text-neon-400">See the marketplace →</Link>
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ===================== SELLER STRIP ===================== */}
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
                List your white-label, FDA-ready catalog. Creators brand it; we route you pre-qualified production orders by capability, region, and capacity. Stripe payouts on a published schedule.
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

/* ============================ layout ============================ */

function StepBand({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <section className={`px-6 py-16 sm:px-8 lg:py-20 ${bg}`}>
      <div className="mx-auto max-w-[1400px]">{children}</div>
    </section>
  )
}

function Step({ n, kicker, title, desc, reverse, dark = false, children }: { n: string; kicker: string; title: string; desc: string; reverse: boolean; dark?: boolean; children: React.ReactNode }) {
  return (
    <Reveal>
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className={reverse ? 'lg:order-2' : ''}>
          <div className="mb-4 flex items-center gap-3">
            <span className={`flex h-11 w-11 items-center justify-center rounded-pill font-display text-[17px] font-extrabold ${dark ? 'bg-neon-500 text-ink-900' : 'bg-ink-900 text-neon-500'}`}>{n}</span>
            <span className={`text-[12px] font-semibold uppercase tracking-[0.08em] ${dark ? 'text-neon-500' : 'text-pink-700'}`}>{kicker}</span>
          </div>
          <h3 className={`font-display text-[28px] font-bold leading-[1.05] tracking-[-0.025em] sm:text-[34px] ${dark ? 'text-white' : 'text-ink-900'}`}>{title}</h3>
          <p className={`mt-3 max-w-[46ch] text-[16px] leading-[1.6] ${dark ? 'text-ink-300' : 'text-ink-600'}`}>{desc}</p>
        </div>
        <div className={reverse ? 'lg:order-1' : ''}>{children}</div>
      </div>
    </Reveal>
  )
}

/** Reveal-triggered step animations. Children animate in when their <Reveal> adds `is-revealed`. */
function StepFX() {
  return (
    <style>{`
      .fx-up,.fx-pop,.fx-down,.fx-fade,.fx-left,.fx-right{opacity:0}
      .is-revealed .fx-up{animation:fxUp .62s cubic-bezier(.16,1,.3,1) both}
      .is-revealed .fx-pop{animation:fxPop .55s cubic-bezier(.16,1,.3,1) both}
      .is-revealed .fx-down{animation:fxDown .6s cubic-bezier(.16,1,.3,1) both}
      .is-revealed .fx-fade{animation:fxFade .7s ease both}
      .is-revealed .fx-left{animation:fxLeft .6s cubic-bezier(.16,1,.3,1) both}
      .is-revealed .fx-right{animation:fxRight .6s cubic-bezier(.16,1,.3,1) both}
      @keyframes fxUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
      @keyframes fxPop{0%{opacity:0;transform:scale(.55)}65%{opacity:1;transform:scale(1.12)}100%{opacity:1;transform:scale(1)}}
      @keyframes fxDown{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:translateY(0)}}
      @keyframes fxFade{from{opacity:0}to{opacity:1}}
      @keyframes fxLeft{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:translateX(0)}}
      @keyframes fxRight{from{opacity:0;transform:translateX(-16px)}to{opacity:1;transform:translateX(0)}}
      .fx-grow{transform:scaleX(0);transform-origin:left center}
      .is-revealed .fx-grow{animation:fxGrow .55s ease both}
      @keyframes fxGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
      .fx-dot{animation:fxDot 1.8s ease-in-out infinite}
      @keyframes fxDot{0%,100%{opacity:.35}50%{opacity:1}}
      .fx-cursor{position:absolute;z-index:30;opacity:0;pointer-events:none;filter:drop-shadow(0 2px 4px rgba(0,0,0,.3))}
      .is-revealed .fx-cursor{animation:fxCur 3s cubic-bezier(.5,0,.2,1) both}
      @keyframes fxCur{0%{left:74%;top:86%;opacity:0;transform:scale(1)}10%{opacity:1}46%{left:28%;top:44%;transform:scale(1)}53%{transform:scale(.78)}60%{transform:scale(1)}100%{left:28%;top:44%;opacity:1;transform:scale(1)}}
      .fx-ripple{position:absolute;z-index:29;width:30px;height:30px;border-radius:50%;background:rgba(255,46,99,.4);opacity:0;pointer-events:none}
      .is-revealed .fx-ripple{animation:fxRip 3s ease-out both}
      @keyframes fxRip{0%,50%{opacity:0;transform:scale(.2)}55%{opacity:.55;transform:scale(.5)}74%{opacity:0;transform:scale(2.3)}100%{opacity:0}}
      .fx-scan{position:absolute;left:0;right:0;height:34px;background:linear-gradient(to bottom,rgba(31,174,90,0) 0%,rgba(31,174,90,.22) 50%,rgba(31,174,90,0) 100%);opacity:0;pointer-events:none}
      .is-revealed .fx-scan{animation:fxScan 2.4s ease-in-out .4s both}
      @keyframes fxScan{0%{transform:translateY(-130%);opacity:0}14%{opacity:1}86%{opacity:1}100%{transform:translateY(150%);opacity:0}}
      .fx-cur2{position:absolute;z-index:30;opacity:0;pointer-events:none;filter:drop-shadow(0 2px 4px rgba(0,0,0,.45))}
      .is-revealed .fx-cur2{animation:fxCur2 3s cubic-bezier(.5,0,.2,1) both}
      @keyframes fxCur2{0%{left:72%;top:84%;opacity:0;transform:scale(1)}10%{opacity:1}48%{left:46%;top:47%;transform:scale(1)}55%{transform:scale(.78)}62%{transform:scale(1)}100%{left:46%;top:47%;opacity:1;transform:scale(1)}}
      .fx-open{opacity:0;transform:scale(.86)}
      .is-revealed .fx-open{animation:fxOpen .6s cubic-bezier(.16,1,.3,1) both}
      @keyframes fxOpen{from{opacity:0;transform:scale(.86)}to{opacity:1;transform:scale(1)}}
      @media (prefers-reduced-motion:reduce){
        .fx-up,.fx-pop,.fx-down,.fx-fade,.fx-left,.fx-right,.fx-grow,.fx-open{opacity:1!important;transform:none!important;animation:none!important}
        .fx-cursor,.fx-cur2,.fx-ripple,.fx-scan{display:none!important}
        .fx-dot{animation:none!important;opacity:1!important}
      }
    `}</style>
  )
}

function Win({ title, tone = 'light', children }: { title: string; tone?: 'light' | 'dark'; children: React.ReactNode }) {
  const dark = tone === 'dark'
  return (
    <div className={`overflow-hidden rounded-2xl border shadow-[0_30px_80px_rgba(13,7,23,0.14)] ${dark ? 'border-ink-700 bg-ink-900' : 'border-ink-200 bg-white'}`}>
      <div className={`flex items-center gap-2.5 border-b px-4 py-2.5 ${dark ? 'border-ink-700 bg-ink-800' : 'border-ink-100 bg-ink-50/70'}`}>
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-ink-300" /><span className="h-2.5 w-2.5 rounded-full bg-ink-300" /><span className="h-2.5 w-2.5 rounded-full bg-ink-300" />
        </div>
        <span className={`text-[12px] font-semibold ${dark ? 'text-white' : 'text-ink-700'}`}>{title}</span>
      </div>
      {children}
    </div>
  )
}

/* ============================ shared visuals ============================ */

/** Flat, front-facing stand-up pouch (clean — no off 3D). */
function Pouch({ hue = '#FF2E63', dark = false, label = 'GREENS', sub = 'Super Greens', className = 'w-[120px]' }: { hue?: string; dark?: boolean; label?: string; sub?: string; className?: string }) {
  const id = hue.replace('#', '')
  const accent = dark ? '#86C42B' : hue
  const subFill = dark ? '#5f8f22' : '#9a9aa3'
  const body = 'M22 26 Q22 18 30 18 L130 18 Q138 18 138 26 L132 198 Q132 206 124 206 L36 206 Q28 206 28 198 Z'
  return (
    <svg viewBox="0 0 160 222" className={`h-auto ${className}`} aria-hidden>
      <defs>
        {/* form shading — light on the left, falls into shadow on the right edge */}
        <linearGradient id={`pb-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={hue} stopOpacity="0.78" />
          <stop offset="0.2" stopColor={hue} />
          <stop offset="0.62" stopColor={hue} />
          <stop offset="1" stopColor="#000000" stopOpacity="0.22" />
        </linearGradient>
        {/* top sheen → bottom settle, gives the film a glossy curve */}
        <linearGradient id={`ps-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="0.22" stopColor="#ffffff" stopOpacity="0.07" />
          <stop offset="0.8" stopColor="#000000" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.14" />
        </linearGradient>
        <filter id={`pf-${id}`} x="-40%" y="-20%" width="180%" height="140%"><feGaussianBlur stdDeviation="3" /></filter>
        <filter id={`pl-${id}`} x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="2.4" floodColor="#000000" floodOpacity="0.2" /></filter>
        <clipPath id={`pc-${id}`}><path d={body} /></clipPath>
      </defs>

      {/* contact shadow on the surface */}
      <ellipse cx="80" cy="211" rx="50" ry="7.5" fill="#0B0B0F" opacity="0.16" />

      {/* crimped top seam */}
      <rect x="26" y="5" width="108" height="15" rx="3" fill={hue} opacity="0.5" />
      {Array.from({ length: 19 }).map((_, i) => (
        <line key={i} x1={29 + i * 5.5} y1="7" x2={29 + i * 5.5} y2="19" stroke="#000000" strokeOpacity="0.11" strokeWidth="1" />
      ))}

      {/* body + glossy overlays */}
      <path d={body} fill={`url(#pb-${id})`} />
      <path d={body} fill={`url(#ps-${id})`} />
      <g clipPath={`url(#pc-${id})`}>
        <rect x="34" y="22" width="12" height="180" rx="6" fill="#ffffff" opacity="0.5" filter={`url(#pf-${id})`} />
      </g>

      {/* label panel with soft shadow */}
      <rect x="44" y="64" width="72" height="98" rx="9" fill={dark ? '#0E1A0E' : '#ffffff'} opacity="0.97" filter={`url(#pl-${id})`} />
      <g transform="translate(80,96)">
        <g stroke={accent} strokeWidth="4.5" fill="none" strokeLinejoin="round" strokeLinecap="round">
          <path d="M0 -16 L18 -6 L0 4 L-18 -6 Z" /><path d="M-18 2 L0 12 L18 2" />
        </g>
        <text x="0" y="36" textAnchor="middle" fontSize="14" fontWeight="800" letterSpacing="1.5" fill={accent}>{label}</text>
        <text x="0" y="52" textAnchor="middle" fontSize="8" fontWeight="600" letterSpacing="0.5" fill={subFill}>{sub}</text>
      </g>

      {/* bottom seal */}
      <rect x="46" y="190" width="68" height="9" rx="2" fill="#000000" opacity="0.12" />
    </svg>
  )
}

/** Realistic FDA Supplement Facts panel (HTML/CSS). */
function SuppFacts() {
  const Row = ({ l, v, indent, top = 'thin' }: { l: string; v: string; indent?: boolean; top?: 'thin' | 'thick' }) => (
    <div className={`flex items-baseline justify-between ${top === 'thick' ? 'border-t-[5px]' : 'border-t'} border-black py-[1px] text-[7.5px] leading-tight`}>
      <span className={indent ? 'pl-2' : 'font-bold'}>{l}</span><span className="font-bold">{v}</span>
    </div>
  )
  return (
    <div className="w-[150px] shrink-0 border-2 border-black bg-white px-1.5 py-1 text-black" style={{ fontFamily: 'Helvetica Neue, Arial, sans-serif' }}>
      <div className="text-[17px] font-extrabold leading-none tracking-tight">Supplement Facts</div>
      <div className="text-[7.5px] leading-tight">Serving Size 1 Scoop (8 g)</div>
      <div className="text-[7.5px] leading-tight">Servings Per Container 30</div>
      <div className="mt-0.5 flex justify-end border-t-[5px] border-black pt-[1px] text-[7.5px] font-bold">% Daily Value*</div>
      <Row l="Calories 30" v="" top="thick" />
      <Row l="Total Carbohydrate 6 g" v="2%" />
      <Row l="Dietary Fiber 3 g" v="11%" indent />
      <Row l="Vitamin C 80 mg" v="89%" />
      <Row l="Iron 4 mg" v="22%" />
      <Row l="Spirulina 1.5 g" v="†" />
      <Row l="Organic Greens Blend 4 g" v="†" />
      <div className="border-t-[5px] border-black" />
      <div className="mt-0.5 text-[6.5px] leading-tight">* % Daily Value based on a 2,000 calorie diet.</div>
      <div className="text-[6.5px] leading-tight">† Daily Value not established.</div>
    </div>
  )
}

/** Spatial orchestration constellation — glowing node network for the hero. */
function OrchestrationConstellation() {
  const core = { x: 280, y: 242 }
  const nodes = [
    { x: 280, y: 64, c: '#FF2E63', label: 'Your channel' },
    { x: 92, y: 150, c: '#6E8BFF', label: 'Manufacturer' },
    { x: 470, y: 150, c: '#9A82E0', label: 'Printer' },
    { x: 120, y: 392, c: '#2DE2E6', label: 'Co-packer' },
    { x: 452, y: 392, c: '#B5FF3D', label: 'Warehouse' },
  ]
  return (
    <svg viewBox="0 0 560 480" className="h-auto w-full max-w-[620px]" aria-hidden>
      <defs>
        <radialGradient id="oc-core" cx="50%" cy="42%" r="60%">
          <stop offset="0" stopColor="#FFE3ED" /><stop offset="0.45" stopColor="#FF2E63" /><stop offset="1" stopColor="#6E1330" />
        </radialGradient>
        <filter id="oc-glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="6" /></filter>
        <filter id="oc-soft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.4" /></filter>
      </defs>
      <g fill="none" stroke="#9A82E0" strokeOpacity="0.34">
        <ellipse cx="280" cy="250" rx="232" ry="96" />
        <ellipse cx="280" cy="250" rx="168" ry="168" strokeOpacity="0.16" />
      </g>
      {nodes.map((n, i) => (
        <g key={`l${i}`}>
          <line x1={core.x} y1={core.y} x2={n.x} y2={n.y} stroke={n.c} strokeOpacity="0.16" strokeWidth="6" filter="url(#oc-soft)" />
          <line className="sp-flow" x1={core.x} y1={core.y} x2={n.x} y2={n.y} stroke={n.c} strokeOpacity="0.9" strokeWidth="1.6" />
        </g>
      ))}
      {nodes.map((n, i) => (
        <g key={`n${i}`} className="sp-node" style={{ animationDelay: `${i * 0.5}s` }}>
          <circle cx={n.x} cy={n.y} r="22" fill={n.c} opacity="0.24" filter="url(#oc-glow)" />
          <circle cx={n.x} cy={n.y} r="9" fill={n.c} />
          <circle cx={n.x} cy={n.y} r="9" fill="none" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="1.4" />
          <text x={n.x} y={n.y < 100 ? n.y - 18 : n.y + 26} textAnchor="middle" fontSize="11" fontWeight="700" letterSpacing="0.5" fill="#ffffff" fillOpacity="0.85">{n.label}</text>
        </g>
      ))}
      <circle cx={core.x} cy={core.y} r="70" fill="#FF2E63" opacity="0.22" filter="url(#oc-glow)" />
      <g className="sp-node">
        <circle cx={core.x} cy={core.y} r="38" fill="url(#oc-core)" />
        <circle cx={core.x} cy={core.y} r="38" fill="none" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="1.4" />
        <g transform={`translate(${core.x},${core.y})`} stroke="#ffffff" strokeWidth="3.4" fill="none" strokeLinejoin="round" strokeLinecap="round" opacity="0.95">
          <path d="M0 -15 L17 -5 L0 5 L-17 -5 Z" /><path d="M-17 3 L0 13 L17 3" />
        </g>
      </g>
      <text x={core.x} y={core.y + 64} textAnchor="middle" fontSize="11.5" fontWeight="800" letterSpacing="1" fill="#ffffff">YOUR PRODUCT</text>
    </svg>
  )
}

/** Flat unfolded die-line net for a stand-up pouch (the 2D surface view). */
function DielineNet() {
  return (
    <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid meet" className="h-full w-full" aria-hidden>
      <defs>
        <pattern id="dl-grid" width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M16 0 H0 V16" fill="none" stroke="#000000" strokeOpacity="0.05" strokeWidth="1" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="320" height="200" fill="url(#dl-grid)" />
      <rect x="48" y="34" width="104" height="120" fill="#ffffff" />
      <rect x="152" y="34" width="104" height="120" fill="#ffffff" />
      <path d="M152 154 L256 154 L232 182 L176 182 Z" fill="#ffffff" />
      <path d="M48 34 L256 34 L256 154 L232 182 L176 182 L152 154 L48 154 Z" fill="none" stroke="#FF2E63" strokeWidth="1.5" strokeDasharray="5 4" />
      <line x1="152" y1="34" x2="152" y2="154" stroke="#6E8BFF" strokeWidth="1.3" strokeDasharray="1.5 4" strokeLinecap="round" />
      <line x1="152" y1="154" x2="256" y2="154" stroke="#6E8BFF" strokeWidth="1.3" strokeDasharray="1.5 4" strokeLinecap="round" />
      <g stroke="#18181A" strokeWidth="1">
        <path d="M40 34 H46 M48 26 V32" /><path d="M264 34 H258 M256 26 V32" />
        <path d="M40 154 H46 M48 162 V156" /><path d="M264 154 H258 M256 162 V156" />
      </g>
      <rect x="66" y="58" width="68" height="78" rx="2" fill="none" stroke="#C9C9CE" strokeWidth="1" strokeDasharray="3 3" />
      <text x="100" y="50" textAnchor="middle" fontSize="7" fontWeight="700" letterSpacing="0.5" fill="#A0A0A6">NUTRITION PANEL</text>
      <g transform="translate(204,82)">
        <g stroke="#86C42B" strokeWidth="3" fill="none" strokeLinejoin="round" strokeLinecap="round">
          <path d="M0 -14 L15 -5 L0 4 L-15 -5 Z" /><path d="M-15 2 L0 11 L15 2" />
        </g>
        <text x="0" y="28" textAnchor="middle" fontSize="12" fontWeight="800" letterSpacing="1.2" fill="#3a5a14">GREENS</text>
        <text x="0" y="41" textAnchor="middle" fontSize="7" fontWeight="600" fill="#9a9aa3">Super Greens</text>
      </g>
      <text x="100" y="148" textAnchor="middle" fontSize="7.5" fontWeight="700" letterSpacing="1" fill="#B0B0B6">BACK</text>
      <text x="204" y="148" textAnchor="middle" fontSize="7.5" fontWeight="700" letterSpacing="1" fill="#B0B0B6">FRONT</text>
      <text x="204" y="176" textAnchor="middle" fontSize="7" fontWeight="700" letterSpacing="1" fill="#B0B0B6">GUSSET</text>
    </svg>
  )
}

/** Studio app window — design the packaging. */
function StudioScreen({ compact = false }: { compact?: boolean }) {
  const tools = [MousePointer2, TypeIcon, ImageIcon, Palette, BoxIcon, Layers]
  const swatches = ['#FF2E63', '#B5FF3D', '#C9B6FF', '#FFD23F', '#2DE2E6']
  return (
    <Win title="Design Studio · Acme Greens" tone="dark">
      <div className={`grid ${compact ? 'grid-cols-[44px_1fr]' : 'grid-cols-[44px_1fr_150px]'}`}>
        <div className="flex flex-col items-center gap-1.5 border-r border-ink-700 bg-ink-800 py-3">
          {tools.map((T, i) => (
            <span key={i} className={`fx-up flex h-8 w-8 items-center justify-center rounded-lg ${i === 4 ? 'bg-neon-500/15 text-neon-500' : 'text-ink-400'}`} style={{ animationDelay: `${0.3 + i * 0.08}s` }}>
              <T strokeWidth={2} className="h-4 w-4" />
            </span>
          ))}
        </div>
        <div className="relative flex min-h-[230px] items-center justify-center overflow-hidden" style={{ background: 'radial-gradient(120% 90% at 50% 30%, #1A1A20 0%, #0C0C10 82%)' }}>
          <div aria-hidden className="absolute inset-0 opacity-50" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
          <div className="fx-pop relative" style={{ animationDelay: '0.5s' }}>
            <Pouch hue="#B5FF3D" dark label="GREENS" className="w-[120px]" />
            <span className="fx-dot absolute -left-1 -top-1 h-2 w-2 -translate-x-1/2 -translate-y-1/2" style={{ background: '#2DE2E6', outline: '1px dashed #2DE2E6', outlineOffset: 6 }} />
          </div>
          <span className="fx-pop absolute left-3 top-3 rounded-pill border border-neon-500/40 bg-ink-900/70 px-2.5 py-1 text-[10px] font-bold text-neon-500" style={{ animationDelay: '1.2s' }}>● FDA panel valid</span>
          <span className="absolute bottom-3 left-3 rounded bg-ink-900/70 px-2 py-1 text-[10px] font-medium text-ink-400">100%</span>
          <span className="pointer-events-none absolute" style={{ left: '46%', top: '47%' }}><span className="fx-ripple" style={{ marginLeft: -15, marginTop: -15 }} /></span>
          <svg className="fx-cur2" width="20" height="20" viewBox="0 0 20 20" aria-hidden><path d="M3 2 L3 16 L7 12 L10 18 L12 17 L9 11 L15 11 Z" fill="#ffffff" stroke="#18181A" strokeWidth="1.2" strokeLinejoin="round" /></svg>
          <div className="fx-open absolute inset-3 z-20 overflow-hidden rounded-xl border border-ink-300 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.6)]" style={{ background: '#F7F6F2', animationDelay: '1.75s' }}>
            <div className="flex items-center justify-between border-b border-ink-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-ink-600">
              <span className="inline-flex items-center gap-1.5"><BoxIcon strokeWidth={2} className="h-3 w-3" /> Die-line · Stand-up pouch · layflat</span>
              <span className="rounded-pill bg-pink-500/10 px-2 py-0.5 text-[9px] font-bold text-pink-700">2D surface</span>
            </div>
            <div className="relative h-[calc(100%-25px)] w-full">
              <DielineNet />
            </div>
          </div>
        </div>
        {!compact && (
          <div className="border-l border-ink-700 bg-ink-800 p-3 text-white">
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-400">Brand colors</div>
            <div className="mb-3 flex gap-1.5">{swatches.map((s) => <span key={s} className="h-5 w-5 rounded-md ring-1 ring-white/15" style={{ background: s }} />)}</div>
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-400">Layers</div>
            <div className="space-y-1">
              {['Logo', 'Product name', 'Nutrition panel', 'Background'].map((l, i) => (
                <div key={l} className={`flex items-center justify-between rounded-md px-2 py-1.5 text-[11px] ${i === 0 ? 'bg-neon-500/15 text-white' : 'bg-ink-900/40 text-ink-300'}`}>
                  <span>{l}</span><Layers strokeWidth={2} className="h-3 w-3 opacity-50" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Win>
  )
}

/* ---- step screens ---- */

function PickScreen() {
  const products = [
    { n: 'Powdered Greens', m: 'MOQ 500 · $3.10/unit', hue: '#86C42B', sel: true },
    { n: 'Electrolyte Mix', m: 'MOQ 1,000 · $1.85/unit', hue: '#2DE2E6', sel: false },
    { n: 'Collagen Peptides', m: 'MOQ 500 · $4.40/unit', hue: '#C9B6FF', sel: false },
    { n: 'Cold-Brew Concentrate', m: 'MOQ 750 · $2.60/unit', hue: '#FF2E63', sel: false },
  ]
  return (
    <Win title="Marketplace · Functional drinks">
      <div className="relative overflow-hidden p-5">
        <div className="mb-4 flex items-center gap-2 rounded-pill border border-ink-200 px-3 py-2 text-[12px] text-ink-400">
          <Search strokeWidth={2} className="h-3.5 w-3.5" /> Search products, recipes, niches…
        </div>
        <div className="grid grid-cols-2 gap-3">
          {products.map((p, idx) => (
            <div key={p.n} className="relative rounded-xl border border-ink-200 p-3">
              {idx === 0 && (
                <>
                  <span className="fx-fade pointer-events-none absolute inset-0 rounded-xl" style={{ boxShadow: '0 0 0 2px #FF2E63', animationDelay: '1.5s' }} />
                  <span className="fx-pop absolute right-2.5 top-2.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-pink-500 text-white" style={{ animationDelay: '1.55s' }}><Check strokeWidth={3} className="h-3 w-3" /></span>
                </>
              )}
              <div className="mb-2 flex h-20 items-center justify-center rounded-lg" style={{ background: p.hue + '1f' }}>
                <Pouch hue={p.hue} label="" className="w-[42px]" />
              </div>
              <div className="text-[13px] font-bold text-ink-900">{p.n}</div>
              <div className="text-[11px] text-ink-500">{p.m}</div>
            </div>
          ))}
        </div>
        <span className="pointer-events-none absolute" style={{ left: '28%', top: '46%' }}><span className="fx-ripple" style={{ marginLeft: -15, marginTop: -15 }} /></span>
        <svg className="fx-cursor" width="20" height="20" viewBox="0 0 20 20" aria-hidden><path d="M3 2 L3 16 L7 12 L10 18 L12 17 L9 11 L15 11 Z" fill="#18181A" stroke="#ffffff" strokeWidth="1.2" strokeLinejoin="round" /></svg>
        <div className="fx-up absolute inset-x-3 bottom-3 z-20 flex items-center gap-3 rounded-xl border border-ink-200 bg-white p-3 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.35)]" style={{ animationDelay: '1.95s' }}>
          <div className="flex h-14 w-14 items-center justify-center rounded-lg" style={{ background: '#86C42B1f' }}><Pouch hue="#86C42B" label="" className="w-[30px]" /></div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-ink-900">Powdered Greens</div>
            <div className="text-[11px] text-ink-500">Gourmet &amp; Culinary · 500 MOQ · from $2.80/unit</div>
          </div>
          <span className="flex h-8 items-center rounded-pill bg-ink-900 px-3 text-[11px] font-semibold text-white">Customize →</span>
        </div>
      </div>
    </Win>
  )
}

function BrandScreen() {
  const swatches = ['#0E1A0E', '#86C42B', '#F4F1E8', '#1FB3B8']
  return (
    <Win title="Brand kit · Acme Greens">
      <div className="space-y-4 p-5">
        <div className="fx-up flex items-center gap-4 rounded-xl border border-dashed border-ink-300 bg-ink-50/50 p-4" style={{ animationDelay: '0.3s' }}>
          <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-ink-900">
            <svg viewBox="0 0 96 96" className="h-8 w-8"><path d="M48 22 L74 36 L48 50 L22 36 Z M22 50 L48 64 L74 50 M22 62 L48 76 L74 62" fill="none" stroke="#B5FF3D" strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" /></svg>
          </span>
          <div>
            <div className="font-display text-[18px] font-extrabold tracking-[-0.02em] text-ink-900">Acme Greens</div>
            <div className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-medium text-pink-600"><Upload strokeWidth={2} className="h-3.5 w-3.5" /> Logo uploaded · SVG</div>
          </div>
        </div>
        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.07em] text-ink-400">Brand colors</div>
          <div className="flex gap-2">{swatches.map((s, i) => <span key={s} className="fx-pop h-9 w-9 rounded-lg ring-1 ring-ink-200" style={{ background: s, animationDelay: `${0.45 + i * 0.12}s` }} />)}<span className="fx-pop flex h-9 w-9 items-center justify-center rounded-lg border border-dashed border-ink-300 text-ink-400" style={{ animationDelay: '0.95s' }}>+</span></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="fx-up rounded-lg border border-ink-200 p-3" style={{ animationDelay: '1.05s' }}><div className="text-[10px] uppercase tracking-[0.06em] text-ink-400">Display</div><div className="font-display text-[20px] font-extrabold tracking-[-0.02em]">Bricolage</div></div>
          <div className="fx-up rounded-lg border border-ink-200 p-3" style={{ animationDelay: '1.2s' }}><div className="text-[10px] uppercase tracking-[0.06em] text-ink-400">Body</div><div className="text-[20px] font-semibold">Inter</div></div>
        </div>
      </div>
    </Win>
  )
}

function LabelScreen() {
  return (
    <Win title="Label · Supplement Facts">
      <div className="flex items-center gap-5 p-5">
        <div className="fx-pop shrink-0" style={{ animationDelay: '0.3s' }}><Pouch hue="#86C42B" dark={false} label="GREENS" className="w-[104px]" /></div>
        <div className="fx-fade relative shrink-0 overflow-hidden rounded" style={{ animationDelay: '0.5s' }}>
          <SuppFacts />
          <span className="fx-scan" />
        </div>
        <div className="hidden flex-1 sm:block">
          <div className="fx-pop mb-2 inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-bold" style={{ background: GREEN + '1f', color: GREEN, animationDelay: '2.6s' }}>
            <CheckCircle2 strokeWidth={2.5} className="h-3.5 w-3.5" /> Auto-rendered to 21 CFR
          </div>
          <ul className="space-y-1.5 text-[12px] text-ink-600">
            <li className="fx-up" style={{ animationDelay: '1s' }}>· Serving size + servings per container</li>
            <li className="fx-up" style={{ animationDelay: '1.2s' }}>· % Daily Value calculated for you</li>
            <li className="fx-up" style={{ animationDelay: '1.4s' }}>· Min font sizes enforced on every edit</li>
          </ul>
        </div>
      </div>
    </Win>
  )
}

function ComplianceScreen() {
  const checks = ['Min font size on Supplement Facts', 'Allergen Big-9 declared', 'Net quantity format (oz + g)', 'Bioengineered disclosure present', 'Serving size within reference amount']
  return (
    <Win title="Compliance scan · 21 CFR">
      <div className="p-5">
        <div className="fx-up mb-4 flex items-center justify-between rounded-xl p-4" style={{ background: GREEN + '14', border: `1px solid ${GREEN}40`, animationDelay: '1.5s' }}>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-pill" style={{ background: GREEN }}><Check strokeWidth={3} className="h-5 w-5 text-white" /></span>
            <div><div className="font-display text-[16px] font-bold text-ink-900">Compliant</div><div className="text-[12px] text-ink-500">5 of 5 checks passed</div></div>
          </div>
          <span className="rounded-pill px-3 py-1 text-[11px] font-bold text-white" style={{ background: GREEN }}>Ready to print</span>
        </div>
        <div className="space-y-2">
          {checks.map((c, i) => (
            <div key={c} className="fx-up flex items-center gap-2.5 rounded-lg bg-ink-50/60 px-3 py-2 text-[13px] text-ink-700" style={{ animationDelay: `${0.3 + i * 0.2}s` }}>
              <span className="fx-pop flex h-4.5 w-4.5 items-center justify-center rounded-full" style={{ background: GREEN, animationDelay: `${0.42 + i * 0.2}s` }}><Check strokeWidth={3} className="h-3 w-3 text-white" /></span>
              {c}
            </div>
          ))}
        </div>
      </div>
    </Win>
  )
}

function SampleScreen() {
  return (
    <Win title="Order a sample">
      <div className="p-5">
        <div className="mb-4 flex items-end justify-center gap-3 rounded-xl bg-ink-50/60 py-5">
          <span className="fx-up" style={{ animationDelay: '0.3s' }}><Pouch hue="#86C42B" label="GREENS" className="w-[62px]" /></span>
          <span className="fx-up" style={{ animationDelay: '0.5s' }}><Pouch hue="#86C42B" label="GREENS" className="w-[72px]" /></span>
          <span className="fx-up" style={{ animationDelay: '0.7s' }}><Pouch hue="#86C42B" label="GREENS" className="w-[62px]" /></span>
        </div>
        <div className="fx-up flex items-center justify-between" style={{ animationDelay: '0.95s' }}>
          <div>
            <div className="text-[14px] font-bold text-ink-900">Sample · 3 units</div>
            <div className="text-[12px] text-ink-500">Production quality · ships in ~5 days</div>
          </div>
          <div className="text-right">
            <span className="text-[12px] text-ink-400 line-through">$24</span>{' '}
            <span className="text-[18px] font-extrabold text-pink-600">$12</span>
            <div className="text-[11px] font-semibold" style={{ color: GREEN }}>First sample 50% off</div>
          </div>
        </div>
        <div className="fx-up mt-4 flex h-11 items-center justify-center rounded-pill bg-ink-900 text-[13px] font-semibold text-white" style={{ animationDelay: '1.15s' }}>Order sample</div>
      </div>
    </Win>
  )
}

function OrchestrationScreen() {
  const nodes = [{ i: Factory, l: 'Manufacturer' }, { i: Printer, l: 'Printer' }, { i: Boxes, l: 'Co-packer' }, { i: Warehouse, l: 'Warehouse' }]
  return (
    <Win title="Production order · #AG-1042" tone="dark">
      <div className="p-5 text-white">
        <div className="mb-4 flex items-center justify-between rounded-xl border border-ink-700 bg-ink-800 px-4 py-3">
          <div><div className="text-[13px] font-bold">1,000 units · Powdered Greens</div><div className="text-[11px] text-ink-400">Acme Greens · pouch + carton</div></div>
          <div className="text-right"><div className="text-[16px] font-extrabold">$3,420</div><div className="fx-dot text-[10px] text-neon-500">● Card authorized</div></div>
        </div>
        <div className="mb-2 flex items-center justify-between">
          {nodes.map((n, i) => (
            <div key={n.l} className="flex flex-1 items-center">
              <div className="fx-pop flex flex-col items-center gap-1.5" style={{ animationDelay: `${0.4 + i * 0.45}s` }}>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-neon-500/40 bg-neon-500/10"><n.i strokeWidth={2} className="h-5 w-5 text-neon-500" /></span>
                <span className="text-[10px] font-medium text-ink-300">{n.l}</span>
              </div>
              {i < nodes.length - 1 && <div className="fx-grow mx-1 mb-5 h-[2px] flex-1 rounded bg-gradient-to-r from-neon-500/60 to-neon-500/20" style={{ animationDelay: `${0.62 + i * 0.45}s` }} />}
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-[11px] text-ink-300">
          <span className="font-semibold text-white">One timeline.</span> Captured only when every partner approves the manifest.
        </div>
      </div>
    </Win>
  )
}

function ChannelScreen() {
  return (
    <Win title="Channels">
      <div className="space-y-3 p-5">
        {[{ i: Store, l: 'Shopify', s: 'yourbrand.myshopify.com' }, { i: Music2, l: 'TikTok Shop', s: '@acme.greens' }].map((c, i) => (
          <div key={c.l} className="fx-up flex items-center justify-between rounded-xl border border-ink-200 px-4 py-3" style={{ animationDelay: `${0.3 + i * 0.25}s` }}>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-900 text-white"><c.i strokeWidth={2} className="h-5 w-5" /></span>
              <div><div className="text-[13px] font-bold text-ink-900">{c.l}</div><div className="text-[11px] text-ink-500">{c.s}</div></div>
            </div>
            <span className="fx-pop inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[11px] font-bold" style={{ background: GREEN + '1f', color: GREEN, animationDelay: `${0.75 + i * 0.25}s` }}><Check strokeWidth={3} className="h-3 w-3" /> Connected</span>
          </div>
        ))}
        <div className="fx-up flex items-center justify-between rounded-xl bg-ink-900 px-4 py-3 text-white" style={{ animationDelay: '1.45s' }}>
          <div className="flex items-center gap-3">
            <Pouch hue="#86C42B" dark label="" className="w-[34px]" />
            <div><div className="text-[13px] font-bold">Acme Greens · Super Greens</div><div className="text-[11px] text-neon-500"><span className="fx-dot">●</span> Live on your store</div></div>
          </div>
          <div className="text-[16px] font-extrabold">$39</div>
        </div>
        <p className="px-1 text-[12px] text-ink-500"><ShoppingBag strokeWidth={2} className="mr-1 inline h-3.5 w-3.5" /> End buyers buy from you. We never appear in the consumer flow.</p>
      </div>
    </Win>
  )
}
