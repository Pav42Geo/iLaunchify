import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from '@ilaunchify/ui'
import Link from 'next/link'

export default function StripeStep() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Stripe Connect for payouts</CardTitle>
        <CardDescription>
          Stripe Connect Express. We never see your bank details — Stripe owns the form.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-zinc-600">
          The Connect onboarding flow lands in Week 8 alongside the order routing system. For V1
          partner activation, we&apos;ll trigger Connect onboarding manually after admin review.
        </p>
        <p className="text-sm text-zinc-600">
          You can submit your profile for review now — payout setup happens before your first paid order.
        </p>
        <div className="flex justify-end gap-2">
          <Button asChild variant="ghost">
            <Link href="/onboarding">Back to overview</Link>
          </Button>
          <Button asChild>
            <Link href="/onboarding/review">Continue to review</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
