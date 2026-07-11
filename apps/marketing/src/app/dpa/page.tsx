import { LegalDocument } from '@/components/LegalDocument'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Data Processing Addendum — iLaunchify',
  description: 'iLaunchify Data Processing Addendum. Draft pending legal review.',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <LegalDocument slug="dpa" />
}
