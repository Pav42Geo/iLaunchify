import { LegalDocument } from '@/components/LegalDocument'
import { ACCESSIBILITY_STATEMENT } from '@/content/legal/accessibility'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Accessibility Statement — iLaunchify',
  description: 'iLaunchify Accessibility Statement. Our commitment to WCAG 2.1 AA accessibility.',
  // Draft until published in Settings → Legal; keep search engines off for now.
  robots: { index: false, follow: false },
}

export default function Page() {
  // DB-first: renders the published version once one exists in the Legal CMS;
  // falls back to the hand-authored draft (with the draft banner) until then.
  return <LegalDocument slug="accessibility" doc={ACCESSIBILITY_STATEMENT} />
}
