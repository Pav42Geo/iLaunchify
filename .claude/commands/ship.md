---
description: End-of-slice workflow — workspace-wide typecheck, then git add + commit + push.
argument-hint: <commit message>
---

Wrap up the current slice and push it.

Run in order; stop on first failure:

```bash
pnpm typecheck
```

If clean, commit and push:

```bash
git add -A
git status --short
git commit -m "$ARGUMENTS"
git push
```

If `pnpm typecheck` fails:
- Surface the errors
- Fix them, then re-run
- Do not commit broken code

If `git status --short` shows nothing, surface that and stop — nothing to ship.

If the commit touches `packages/db/prisma/schema.prisma`, remind Pavel to:
1. `pnpm --filter @ilaunchify/db prisma migrate dev`
2. `pnpm --filter @ilaunchify/db prisma generate`
3. Restart `next dev`

If the commit touches `packages/db/prisma/seed-*.ts`, also remind him to:
- `pnpm --filter @ilaunchify/db prisma db seed`

If the commit adds a new workspace dep, also remind him to:
- `pnpm install`
