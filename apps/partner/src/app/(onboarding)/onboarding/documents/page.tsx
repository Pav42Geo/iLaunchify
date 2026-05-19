import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from '@ilaunchify/ui'
import Link from 'next/link'

export default function DocumentsStep() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
        <CardDescription>FDA registration, cGMP certificate, insurance — V1.5+ upload UI.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-zinc-600">
          For V1, please email PDFs of your FDA establishment registration and cGMP certificate to{' '}
          <a href="mailto:partners@ilaunchify.com" className="underline">partners@ilaunchify.com</a> referencing your
          company name. We&apos;ll attach them to your partner record manually.
        </p>
        <p className="text-sm text-zinc-600">
          File-upload UI lands in V1.5 with R2 storage and KMS-encrypted document references.
        </p>
        <div className="flex justify-end">
          <Button asChild>
            <Link href="/onboarding/stripe">Continue</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
