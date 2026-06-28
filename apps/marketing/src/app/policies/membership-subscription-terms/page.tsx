import { LegalDocument } from '@/components/LegalDocument'
import { MEMBERSHIP_TERMS } from '@/content/legal/membership-terms'

export const metadata = {
  title: 'Membership Subscription Terms — iLaunchify',
  description: 'iLaunchify Membership Subscription Terms. Draft pending legal review.',
  // V1: keep search engines off the draft legal text.
  robots: { index: false, follow: false },
}

export default function Page() {
  return <LegalDocument doc={MEMBERSHIP_TERMS} />
}
