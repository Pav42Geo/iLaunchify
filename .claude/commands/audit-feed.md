---
description: Build a new admin audit-feed surface (v2 chrome + KPIs + chip filters + sortable timeline) for any AuditLog or domain-specific audit table.
argument-hint: <entity-name> [— audit table name]
---

Use the `v2-admin-surface-builder` subagent to build an audit-feed surface for **$ARGUMENTS**.

Pattern: the existing `/admin/audit` page (all AuditLog rows) and `/admin/niches/audit` (NicheAssignmentAudit rows) are canonical examples — read them first.

Audit-feed pages differ from regular list pages in a few ways:
1. KPIs are time-windowed (`range=7d|30d|90d|all`, default 7d) + bucketed by source/actor/action
2. Filter chips include `source` / `actor` / `applied` columns where the audit table has them
3. Table columns are: Time · Subject · Action · Source · Actor · Reason
4. No mutations — pure read surface
5. Sort defaults to `createdAt desc` (freshest first)

Deliverables:
1. `apps/admin/src/app/(dashboard)/<route>/page.tsx`
2. `<entity>-audit-data.ts` loader
3. Sidebar entry under the appropriate group (`hiddenUntilBuilt: false`)
4. Verify with `pnpm --filter @ilaunchify/admin typecheck`

Match the `/admin/niches/audit` page chrome pixel-for-pixel.
