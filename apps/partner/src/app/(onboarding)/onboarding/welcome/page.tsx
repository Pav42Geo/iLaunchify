// Welcome screen — first thing a new partner sees after signup/login.
// Per docs/PARTNER_ONBOARDING.md §7.2.
//
// Shown ONCE: this route is the first stop for a partner with no onboarding
// progress yet. After they click "Continue setup", subsequent visits to
// /dashboard land on Application Status (read-only summary) instead of here.
//
// Auth + role check happens in the parent (onboarding) layout.

import { Button } from '@ilaunchify/ui'
import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { CalendarClock, ClipboardList, FileText } from 'lucide-react'
import Link from 'next/link'
import { ContinueSetupButton } from './ContinueButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Welcome — iLaunchify Partners' }

export default async function WelcomePage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { companyName: true },
  })

  const companyName = partner?.companyName ?? 'partner'

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900">
          Welcome, {companyName} <span aria-hidden>👋</span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-zinc-600">
          You&apos;re a few steps away from being an active iLaunchify partner.
        </p>
      </div>

      <div className="mt-12 space-y-8">
        <section className="rounded-lg border border-zinc-200 bg-white p-6">
          <div className="flex items-start gap-4">
            <CalendarClock className="mt-1 h-6 w-6 flex-shrink-0 text-emerald-600" />
            <div>
              <h2 className="font-semibold text-zinc-900">Here&apos;s what to expect</h2>
              <p className="mt-2 text-sm text-zinc-600">
                The form takes about <strong>10–15 minutes</strong> if you have everything ready.
                Our verification team typically reviews within{' '}
                <strong>3–5 business days</strong>. You can save your progress and return any
                time.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-6">
          <div className="flex items-start gap-4">
            <ClipboardList className="mt-1 h-6 w-6 flex-shrink-0 text-emerald-600" />
            <div className="flex-1">
              <h2 className="font-semibold text-zinc-900">Have these ready before you start</h2>
              <ul className="mt-3 space-y-2 text-sm text-zinc-600">
                <PackingItem>Business license / certificate of incorporation</PackingItem>
                <PackingItem>EIN or other tax ID</PackingItem>
                <PackingItem>Certificate of liability insurance</PackingItem>
                <PackingItem>W‑9 or W‑8 form</PackingItem>
                <PackingItem>Facility address + production capacity</PackingItem>
                <PackingItem>
                  Industry certifications you carry (NSF, USDA Organic, cGMP, Kosher, …) —{' '}
                  <em>optional but recommended</em>
                </PackingItem>
                <PackingItem>Bank account for production payouts</PackingItem>
              </ul>
              <p className="mt-4 flex items-start gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                <FileText className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>
                  We review your documents <strong>privately</strong>. Only iLaunchify admins
                  see the PDFs — buyers and other partners only see a verified badge on your
                  products.
                </span>
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        <ContinueSetupButton />
        <Button asChild variant="outline" size="lg">
          <Link href="/api/auth/signout">I&apos;ll come back later</Link>
        </Button>
      </div>

      <p className="mt-6 text-center text-xs text-zinc-500">
        <Link href="/help/verification" className="underline">
          How does verification work?
        </Link>{' '}
        ·{' '}
        <a
          href="mailto:partners@ilaunchify.com"
          className="underline"
        >
          Talk to our team
        </a>
      </p>
    </main>
  )
}

function PackingItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-zinc-400" />
      <span>{children}</span>
    </li>
  )
}
