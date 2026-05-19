import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'

export const metadata = { title: 'Help — Partner' }

export default function HelpPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Help</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Common questions and how to reach us.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What happens during review?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-600">
          Admins review your application in four sections — Business identity, Facility &
          capabilities, Compliance documents, and Public profile. Each section is reviewed
          independently, and you&apos;ll see status + notes on the My Application page as
          decisions are made.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How long does review take?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-600">
          We aim to make a first decision within 2 business days of submission. If we ask
          for changes, the response time on resubmissions is typically faster (same day).
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reach a human</CardTitle>
          <CardDescription>
            Email{' '}
            <a className="underline" href="mailto:partners@ilaunchify.com">
              partners@ilaunchify.com
            </a>{' '}
            and reference your company name. We typically respond within a business day.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
