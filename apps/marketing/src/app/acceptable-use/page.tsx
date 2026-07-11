import { LegalDocument } from '@/components/LegalDocument'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Acceptable Use Policy — iLaunchify',
  description: 'iLaunchify Acceptable Use Policy. Draft pending legal review.',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <LegalDocument slug="acceptable-use" />
}
