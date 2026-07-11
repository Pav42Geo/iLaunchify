import { LegalDocument } from '@/components/LegalDocument'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Membership Subscription Terms — iLaunchify',
  description: 'iLaunchify Membership Subscription Terms. Draft pending legal review.',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <LegalDocument slug="membership-subscription-terms" />
}
