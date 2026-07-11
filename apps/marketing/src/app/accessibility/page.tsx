import { LegalDocument } from '@/components/LegalDocument'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Accessibility Statement — iLaunchify',
  description: 'iLaunchify Accessibility Statement. Our commitment to WCAG 2.1 AA accessibility.',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <LegalDocument slug="accessibility" />
}
