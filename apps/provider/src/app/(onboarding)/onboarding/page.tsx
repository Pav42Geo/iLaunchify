import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import Link from 'next/link'
import { CheckCircle2, Circle } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function OnboardingOverview() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    include: { services: true },
  })

  if (!partner) return null

  const steps = [
    {
      title: 'Company details',
      href: '/onboarding/company',
      complete: !!partner.city && !!partner.state,
    },
    {
      title: 'Service profile',
      href: '/onboarding/service',
      complete: partner.services.every((s) => {
        const caps = s.capabilities as Record<string, unknown>
        return Object.keys(caps).length > 1   // beyond the "type" stub
      }),
    },
    {
      title: 'Documents',
      href: '/onboarding/documents',
      complete: false,                          // V1.5+
    },
    {
      title: 'Stripe payouts',
      href: '/onboarding/stripe',
      complete: !!user.stripeAccountId,
    },
  ]
  const allComplete = steps.every((s) => s.complete)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Get set up</CardTitle>
          <CardDescription>Finish each step, then submit for review.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {steps.map((step) => (
              <li key={step.href}>
                <Link href={step.href} className="flex items-center gap-3 rounded-md p-2 hover:bg-zinc-50">
                  {step.complete ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <Circle className="h-5 w-5 text-zinc-300" />
                  )}
                  <span className={step.complete ? 'text-zinc-500 line-through' : ''}>
                    {step.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button asChild disabled={!allComplete}>
          <Link href="/onboarding/review">Submit for review</Link>
        </Button>
      </div>
    </div>
  )
}
