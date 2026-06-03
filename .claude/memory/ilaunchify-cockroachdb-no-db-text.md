---
name: ilaunchify-cockroachdb-no-db-text
description: "CockroachDB rejects @db.Text on String fields — Prisma migrate fails with P1012. Use bare `String` for unbounded text."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

CockroachDB doesn't support the `Text` native type. Adding `@db.Text` to a Prisma String field will fail `prisma generate` with:

```
error: Native type Text is not supported for cockroachdb connector.
```

**Why:** Cockroach's `STRING` type is already unbounded — there's no separate `TEXT` type to map to. The annotation is both unnecessary and rejected.

**How to apply:** every time I'm modelling a long-form text field (description, notes, copy, JSON-as-string, printer specs, etc.), use bare `String` / `String?`. Never reach for `@db.Text` in this codebase. The pattern from prior schema authors is to leave a comment near long-form fields if the intent matters (e.g., `// long-form sales copy`).

If a future migration needs to enforce a length cap, use `@db.String(N)` instead — Cockroach maps that to `VARCHAR(N)`.

This bit me 2026-05-29 when shipping Phase F1 (FinishType + PartnerFinish + DesignFinishApplication) — four `@db.Text` annotations blocked Pavel's local migrate. Fix is mechanical: strip the annotation.
