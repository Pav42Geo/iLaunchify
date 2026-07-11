import { LegalDocument } from '@/components/LegalDocument'
import { COOKIE_POLICY } from '@/content/legal/cookie-policy'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Cookie Policy — iLaunchify',
  description: 'iLaunchify Cookie Policy. How we use cookies and similar technologies.',
  robots: { index: false, follow: false },
}

export default function Page() {
  // DB-first: renders the published version once one exists in the Legal CMS;
  // falls back to the hand-authored draft (with the draft banner) until then.
  return <LegalDocument slug="cookie-policy" doc={COOKIE_POLICY} />
}
