import Link from 'next/link'
import {
  ArrowRight,
  Wallet,
  CreditCard,
  Bell,
  ShieldCheck,
  FileText,
  SlidersHorizontal,
} from 'lucide-react'
import { prisma, getBillingProfile } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'

export const dynamic = 'force-dynamic'

type PillTone = 'good' | 'warn' | 'neutral' | 'brand'

const PILL_TONE: Record<PillTone, string> = {
  good: 'border-success-200 bg-success-50 text-success-800',
  warn: 'border-warning-200 bg-warning-50 text-warning-800',
  neutral: 'border-ink-200 bg-ink-100 text-ink-700',
  brand: 'border-pink-200 bg-pink-50 text-pink-700',
}

export default async function SettingsPage() {
  const user = await requireUser()
  const [partner, dbUser, billing] = await Promise.all([
    prisma.partner.findUnique({ where: { userId: user.id }, select: { companyName: true } }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, stripeAccountId: true, stripeAccountStatus: true },
    }),
    getBillingProfile(user.id),
  ])
  if (!partner) return null

  const payoutActive = dbUser?.stripeAccountStatus === 'ACTIVE'
  const payoutConnected = Boolean(dbUser?.stripeAccountId)
  const billingSet = Boolean(billing.billingContactName || billing.billingAddress || billing.taxId)

  const companyName = partner.companyName || 'Your company'
  const initial = companyName.trim().charAt(0).toUpperCase() || 'P'

  return (
    <div className="space-y-8">
      {/* Hero + account summary */}
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          Manufacturing · Settings
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Settings
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Your account, payout connection, billing details, and notification preferences in one place.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-4 rounded-2xl border border-ink-200 bg-white/70 px-4 py-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-900 text-[15px] font-bold text-white">
            {initial}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-ink-900">{companyName}</div>
            <div className="truncate text-[12px] text-ink-500">{dbUser?.email}</div>
          </div>
          <span
            className={`ml-auto inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
              payoutActive ? PILL_TONE.good : PILL_TONE.neutral
            }`}
          >
            {payoutActive ? 'Payouts active' : payoutConnected ? 'Payouts pending' : 'Payouts off'}
          </span>
        </div>
      </div>

      {/* Account */}
      <Section title="Account">
        <div className="rounded-2xl border border-ink-200 bg-white p-5 sm:col-span-2">
          <h3 className="font-display text-[16px] font-semibold tracking-tight text-ink-900">
            Identity
          </h3>
          <div className="mt-3 divide-y divide-ink-100 text-[13px]">
            <Row label="Email" value={dbUser?.email} />
            <Row label="Company" value={partner.companyName} />
            <Row
              label="Stripe Connect"
              value={
                payoutConnected ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider ${
                        payoutActive ? PILL_TONE.good : PILL_TONE.neutral
                      }`}
                    >
                      {payoutActive ? 'Connected' : 'Pending'}
                    </span>
                    <span className="font-mono text-[12px] text-ink-500">{dbUser?.stripeAccountId}</span>
                  </span>
                ) : (
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider ${PILL_TONE.neutral}`}
                  >
                    Not connected
                  </span>
                )
              }
            />
          </div>
        </div>
      </Section>

      {/* Payments & plans */}
      <Section title="Payments & plans">
        <SettingCard
          icon={<Wallet className="h-[18px] w-[18px]" aria-hidden="true" />}
          title="Payouts"
          href="/payments"
          cta="View earnings & payouts"
          description="Your earnings, payout history, and Stripe Connect status. Bank details live securely in Stripe — never stored here."
          pill={
            payoutActive
              ? { label: 'Connected', tone: 'good' }
              : payoutConnected
                ? { label: 'Pending', tone: 'warn' }
                : { label: 'Not connected', tone: 'neutral' }
          }
        />
        <SettingCard
          icon={<CreditCard className="h-[18px] w-[18px]" aria-hidden="true" />}
          title="Billing"
          href="/settings/billing"
          cta="Manage billing details"
          description="Contact and tax details that appear on your invoices. Card and bank numbers are never stored here."
          pill={billingSet ? { label: 'Set up', tone: 'good' } : { label: 'Not set', tone: 'neutral' }}
        />
        <SettingCard
          icon={<FileText className="h-[18px] w-[18px]" aria-hidden="true" />}
          title="Tax documents"
          href="/settings/tax-documents"
          cta="View earnings & 1099s"
          description="Your annual earnings and 1099 tax forms. Forms are issued and filed through Stripe — view them in your Stripe dashboard."
        />
      </Section>

      {/* Products */}
      <Section title="Products">
        <SettingCard
          icon={<SlidersHorizontal className="h-[18px] w-[18px]" aria-hidden="true" />}
          title="Product defaults"
          href="/settings/product-defaults"
          cta="Set product defaults"
          description="Facility, lead times, MOQ, fulfillment and storage applied to every new product — so a teammate only fills what changes per product."
        />
      </Section>

      {/* Preferences */}
      <Section title="Preferences">
        <SettingCard
          icon={<Bell className="h-[18px] w-[18px]" aria-hidden="true" />}
          title="Notifications"
          href="/settings/notifications"
          cta="Manage notifications"
          description="Email when a new dispatch arrives. Tune per-event and per-channel preferences and set quiet hours."
        />
        <SettingCard
          icon={<ShieldCheck className="h-[18px] w-[18px]" aria-hidden="true" />}
          title="Certifications"
          href="/certifications"
          cta="Manage certifications"
          description="Keep your facility and product certifications current — they gate marketplace eligibility and partner trust."
        />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[12px] font-bold uppercase tracking-[0.16em] text-ink-700">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function SettingCard({
  icon,
  title,
  description,
  href,
  cta,
  pill,
}: {
  icon: React.ReactNode
  title: string
  description: string
  href: string
  cta: string
  pill?: { label: string; tone: PillTone }
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-ink-200 bg-white p-5 transition-colors hover:border-ink-300 hover:bg-ink-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-900 text-white">
          {icon}
        </span>
        <h3 className="font-display text-[16px] font-semibold tracking-tight text-ink-900">
          {title}
        </h3>
        {pill && (
          <span
            className={`ml-auto inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider ${PILL_TONE[pill.tone]}`}
          >
            {pill.label}
          </span>
        )}
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-600">{description}</p>
      <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-pink-700 group-hover:text-pink-800">
        {cta}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </Link>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px,1fr] items-baseline gap-2 py-2.5 first:pt-0 last:pb-0">
      <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">{label}</span>
      <span className="text-ink-900">{value || '—'}</span>
    </div>
  )
}
