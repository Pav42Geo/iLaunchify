import { LegalDocument } from '@/components/LegalDocument'

export const metadata = {
  title: 'Privacy Policy — iLaunchify',
  description: 'iLaunchify Privacy Policy. Draft pending legal review.',
  // V1: keep search engines off the draft legal text.
  robots: { index: false, follow: false },
}

export default function Page() {
  return <LegalDocument slug="privacy" />
}
