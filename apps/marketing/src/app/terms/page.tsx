import { LegalDocument } from '@/components/LegalDocument'

export const metadata = {
  title: 'Terms of Service — iLaunchify',
  description: 'iLaunchify Terms of Service. Draft pending legal review.',
  // V1: keep search engines off the draft legal text.
  robots: { index: false, follow: false },
}

export default function Page() {
  return <LegalDocument slug="terms" />
}
