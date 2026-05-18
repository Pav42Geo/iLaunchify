## What & why

<!-- One-paragraph summary of the change and the motivation. Link related issues. -->

## Checklist

- [ ] Tests added or updated for behavioral changes
- [ ] Type-check + lint pass locally (`pnpm lint && pnpm type-check`)
- [ ] If schema changes: migration generated; expand-then-contract pattern respected
- [ ] If rule-pack changes: schema validates; test corpus updated
- [ ] If destructive migration: `--confirm-destructive` noted in the title or description
- [ ] If new env vars: documented in `.env.example` and `docs/DEPLOYMENT.md`
- [ ] Preview deploy reviewed (Vercel comment will appear below)

## Risk

<!-- Brief: what could break? How would we notice? -->
