import { LegalDocument } from '@/components/LegalDocument'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Partner Agreement — iLaunchify',
  description: 'iLaunchify Partner Agreement. Draft pending legal review.',
  // V1: keep search engines off the draft legal text.
  robots: { index: false, follow: false },
}

export default function Page() {
  return <LegalDocument slug="partner-agreement" />
}
