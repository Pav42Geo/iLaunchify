// Admin — Partner Profiles (RETIRED 2026-07-14). Absorbed into the Partner
// Access & Opportunity console; the PartnerProfileSetting gate was superseded by
// PartnerAccessPolicy (docs/PARTNER_ACCESS_ADMIN_CONTROLS_2026-07-14.md). This
// route now permanently redirects; the sidebar item was removed.

import { permanentRedirect } from 'next/navigation'

export default function PartnerProfilesRetiredPage(): never {
  permanentRedirect('/settings/partner-access')
}
