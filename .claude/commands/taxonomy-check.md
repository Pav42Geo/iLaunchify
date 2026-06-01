---
description: Validate a proposed marketplace taxonomy change (new niche, category, subcategory, lifestyle tag, or rule) against the LOCKED spec before writing seed code.
argument-hint: <plain-english description of what you want to add>
---

Use the `marketplace-taxonomy-guardian` subagent to validate this proposed taxonomy change: $ARGUMENTS.

The agent will compare against:
- `docs/MARKETPLACE_DESIGN.md` §2 — the 4-layer spec
- `packages/db/prisma/seed-niches.ts` — 8 locked Creator Niches
- `packages/db/prisma/seed-categories-locked.ts` — 13 categories + 121 subcategories
- `packages/db/prisma/seed-lifestyle-tags.ts` — 30 lifestyle tags
- `packages/db/prisma/seed-niche-rules.ts` — 12 deterministic rules (2 locked)
- `.claude/memory/ilaunchify-marketplace-decisions-2026-06-01.md`

Return a structured VERDICT:
- `PERMITTED` — write the diff and proceed
- `NEEDS_PAVEL_DECISION` — formulate the question to ask Pavel verbatim
- `REJECTED` — drop the proposed change; the locked spec governs

The agent edits no files. It is a reviewer.
