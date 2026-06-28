import { LegalDocument } from '@/components/LegalDocument'

export const metadata = {
  title: 'Creator Agreement — iLaunchify',
  description: 'iLaunchify Creator Agreement. Draft pending legal review.',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <LegalDocument slug="creator-agreement" />
}
