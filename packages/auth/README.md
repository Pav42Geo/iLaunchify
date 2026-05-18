# @ilaunchify/auth

Auth.js v5 (NextAuth) configuration shared across all apps.

**Providers:** Google OAuth + Email magic links (via Resend).
**Session strategy:** database-backed (via Prisma adapter on the shared `@ilaunchify/db`).
**Roles:** `ADMIN | CREATOR | PARTNER` (per `docs/USER_ROLES.md`).

## Usage in an app

```ts
// apps/creator/middleware.ts
export { auth as middleware } from '@ilaunchify/auth'

// apps/creator/app/api/auth/[...nextauth]/route.ts
export { handlers as { GET, POST } } from '@ilaunchify/auth'

// apps/creator/app/dashboard/page.tsx (server component)
import { requireRole } from '@ilaunchify/auth'

export default async function DashboardPage() {
  const user = await requireRole('CREATOR')
  return <div>Welcome {user.email}</div>
}
```

## Required env vars

- `AUTH_SECRET` — `openssl rand -base64 32`
- `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` — from Google Cloud Console
- `AUTH_RESEND_KEY` — from Resend
- `AUTH_EMAIL_FROM` — verified sender on Resend domain

See `docs/WEEK_1_HANDOFF.md` for setup instructions.
