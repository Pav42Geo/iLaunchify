import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'

export const metadata = { title: 'Thanks — iLaunchify Partners' }

export default function ThanksPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Application received</CardTitle>
          <CardDescription>
            We review every application personally. You&apos;ll hear from us within 3 business days.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-zinc-600">
          <p>
            If we&apos;re a fit, we&apos;ll send an invitation link to complete your partner profile and connect
            payouts. Until then, no further action needed.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
