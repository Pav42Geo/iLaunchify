import { LegalDocument } from '@/components/LegalDocument'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Cancellation, Refund & Dispute Policy — iLaunchify',
  description: 'iLaunchify Cancellation, Refund & Dispute Policy. Draft pending legal review.',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <LegalDocument slug="refund-dispute-policy" />
}
