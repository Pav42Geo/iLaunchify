import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { LeadForm } from './LeadForm'

export const metadata = { title: 'Apply — iLaunchify Partners' }

const TYPE_LABELS: Record<string, { title: string; description: string }> = {
  MANUFACTURING: {
    title: 'Manufacturing partner application',
    description: 'Tell us about your facility. We review every application and reach out within 3 business days.',
  },
  LABEL_PRINTING: {
    title: 'Print partner application',
    description: 'Tell us about your shop. We review every application and reach out within 3 business days.',
  },
  COPACKING: {
    title: 'Co-packing partner application',
    description: 'Tell us about your services. We review every application and reach out within 3 business days.',
  },
}

export default function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const type = ((await searchParams).type ?? 'MANUFACTURING') as keyof typeof TYPE_LABELS
  const meta = TYPE_LABELS[type] ?? TYPE_LABELS.MANUFACTURING

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>{meta.title}</CardTitle>
          <CardDescription>{meta.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <LeadForm defaultServiceType={type} />
        </CardContent>
      </Card>
    </main>
  )
}
