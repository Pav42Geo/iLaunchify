# INDEX.md additions — paste into `.claude/memory/INDEX.md`

Three new lines to add to the appropriate sections of `.claude/memory/INDEX.md`.

## Under `### Business model + scope` (append at end)

```markdown
- `ilaunchify-accessories-are-partner-bundled-only.md` — listing partner = fulfillment partner; no platform-routed accessories
```

## Under `### Partner system` (append at end)

```markdown
- `ilaunchify-partner-spec-source-of-truth.md` — PartnerPrintOutputSpec drives all export specs; no hardcoded platform defaults
```

## Under `### Engineering gotchas` (append at end)

```markdown
- `ilaunchify-prepress-terminology.md` — dieline (not die-cut), substrate (not material), PMS C/U/M designation; speak prepress operators' language
```

## Under `### Creator system` (append at end) — NEW 2026-06-03

```markdown
- `ilaunchify-velocity-tiers-on-top-of-subscription.md` — V1.5 on-demand pricing combines subscription tier + per-SKU 30-day velocity discount. Cross-pollination + lower-of + samples-at-Tier-1. Supliful-inspired.
```

## Under `### Business model + scope` (append at end) — NEW 2026-06-04

```markdown
- `ilaunchify-bulk-tier-philosophy.md` — V1.5 bulk has full Maker access at higher base fee rate; differentiation is fee % not feature lock. Subscription gates features we pay fixed cost for, NEVER sales mechanisms.
- `ilaunchify-bulk-vs-velocity-dual-system.md` — V1.5 has TWO tier systems: bulk = per-order quantity, on-demand = per-SKU 30-day velocity. Cross-pollination preserved. Lower-of pricing at quote time.
- `ilaunchify-partner-tier-progression.md` — Partner tier LOCKED: Verified (free, arrival) → Trusted (paid subscription, commitment) → Anchor (admin-promoted, earned, no subscription). Anchor replaces "Premier" name. Single-dimension narrative-arc model.
```

---

## One-command install

After splitting the three drops into separate files (already done in this folder), copy them into `.claude/memory/` and edit `INDEX.md`:

```bash
cd /Users/soundstation/Documents/CLAUDE/iLaunchify

# Copy the three new memory files into .claude/memory/
cp docs/builds/_memory-drops/ilaunchify-prepress-terminology.md .claude/memory/
cp docs/builds/_memory-drops/ilaunchify-partner-spec-source-of-truth.md .claude/memory/
cp docs/builds/_memory-drops/ilaunchify-accessories-are-partner-bundled-only.md .claude/memory/

# Verify
ls -la .claude/memory/ilaunchify-prepress-terminology.md
ls -la .claude/memory/ilaunchify-partner-spec-source-of-truth.md
ls -la .claude/memory/ilaunchify-accessories-are-partner-bundled-only.md

# Then manually open .claude/memory/INDEX.md and add the three lines
# from above into their respective sections.
```

## Optional: backfill the older Cowork-side memories

If `.claude/memory/` is missing the older memory files that INDEX references (the ones that today live only in the Cowork session memory), run the backfill script from INDEX.md once:

```bash
cd /Users/soundstation/Documents/CLAUDE/iLaunchify
SRC="$HOME/Library/Application Support/Claude/local-agent-mode-sessions"
LATEST=$(ls -td "$SRC"/*/spaces/*/memory 2>/dev/null | head -1)
cp "$LATEST"/*.md .claude/memory/
```

Then verify with `ls .claude/memory/ | wc -l` — should be ~30+ files.
