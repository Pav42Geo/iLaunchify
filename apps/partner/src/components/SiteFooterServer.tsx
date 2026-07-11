// Server wrapper that feeds the client SiteFooter its Terms/Privacy content from
// the admin-managed Legal CMS (docs/LEGAL_DOCUMENT_MANAGEMENT_SPEC_2026-07-11.md).
//
// Reads the PUBLISHED version via @ilaunchify/legal; when nothing is published
// yet, passes null and SiteFooter falls back to the hardcoded draft paras. This
// removes the partner app's second divergent copy of Terms/Privacy as the source
// of truth — the modals now render the same DB text the public pages do.

import { prisma } from '@ilaunchify/db'
import { getLegalDocumentForDisplay } from '@ilaunchify/legal'
import { SiteFooter } from './SiteFooter'

export async function SiteFooterServer() {
  // DB is the single source of truth: render the published version if any, else
  // the latest draft. The hardcoded legal-docs.ts paras remain only as a last
  // resort if the CMS has no version at all (e.g. unseeded environment).
  const [terms, privacy] = await Promise.all([
    getLegalDocumentForDisplay(prisma, 'terms'),
    getLegalDocumentForDisplay(prisma, 'privacy'),
  ])

  return (
    <SiteFooter
      termsHtml={terms?.currentVersion.bodyHtml ?? null}
      privacyHtml={privacy?.currentVersion.bodyHtml ?? null}
    />
  )
}
