# Compliance Feedback UX Principles

Design pattern reference for any iLaunchify surface that communicates rules, regulations, or compliance status to a user (creator, partner, or admin). Locked 2026-06-01 after the cert + claim chain conversation. Applies to label compliance, brand compliance, ingredient compliance, KYB document compliance, packaging symbol compliance, and any future compliance domain.

## The core principle

**Quiet by default, loud when wrong, comprehensive only at commit, never legalese in the primary flow.**

A user who designs / configures correctly should never see a regulation citation, a warning, or a long rule explanation. A user who makes a mistake should see ONE plain-English sentence at the moment of mistake with an auto-fix option. A user who is about to commit (export, submit, publish) should see ONE comprehensive summary with one-click resolution for anything missing.

Trust is built through silence when things are right + helpful prompts when they're not + transparency when explicitly asked.

## The hierarchy of surfacing

Frequency from invisible to prominent:

| Surface | When seen | What it shows | Tone |
|---|---|---|---|
| Status HUD pill | Always present | Green ✓ / amber ⚠ / red 🛑 + count | Ambient, glanceable |
| Compliance score | Always present | 0-100 with traffic-light color | One number, instant comprehension |
| Inline contextual warnings | Only at moment of violation | One-sentence fix in plain English | Helpful, never scolding |
| Comprehensive panel | When user clicks | Full categorized issue list | Detailed, organized |
| Pre-flight checklist | Once, at commit moment | Summary of clean + missing | Confidence-building |
| Consent / decision modals | Once per binding choice | Full legal disclosure | Formal, slow, deliberate |
| "Why this rule?" tooltips | Only when explicitly clicked | Citation + one-line explanation | Reference, not flow |

A user who never violates a rule sees: HUD (green) + score (green) + pre-flight (green) + consent modals at decisions. They never see citations. They never see warnings. The system protected them silently.

A user who violates one rule sees: one inline warning at the moment of violation, with an auto-fix button. They fix it. HUD returns to green. Done.

## The rules of compliance copy

### 1. Outcome-framed, not regulation-framed

**Don't:** "21 CFR §101.4(b)(2) requires the ingredient statement to be in descending order of predominance by weight."

**Do:** "Ingredients should be listed in order from most to least. [Auto-sort] [I'll do it]"

The user doesn't care which regulation. They care what to do. The CFR citation belongs in a tooltip, not the message.

### 2. Always actionable

Every warning includes an action. Either:
- Auto-fix button (when the system can resolve it)
- "I'll handle it" dismiss (when only the user can)
- Deep-link to the right surface

A warning without an action is a complaint. Complaints train users to ignore the system.

### 3. One sentence, plain English

Cap warnings at one sentence. If you need more, you're explaining instead of warning. Move the explanation to the tooltip.

### 4. Never scold

Don't write "You forgot the allergen statement." Write "Allergen statement is missing for this product. [Add now]"

Passive voice is fine for warnings. The user already feels bad about getting something wrong; no need to amplify.

### 5. Citations are reference, not requirement reading

When a CFR citation appears in a "Why this rule?" tooltip, format as:

> **Why this rule?**
> FDA requires the ingredient statement in descending weight order so consumers can identify the most prominent ingredients first.
>
> *Citation: 21 C.F.R. §101.4(b)(2)*

Explanation first, citation as italic footer. The user reads the explanation; the citation is there for credibility, not as required reading.

## The compliance score formula

A single 0-100 number visible at all times. Computed from scan results:

- **60% — Required items.** Per-product list of required elements (FDA labeling minimums, regulatory disclosures, mandatory marks). All present = 60 points; missing items = proportional deduction with each missing-required item costing more than each missing-recommended item.
- **25% — Recommended items.** Items the system suggests but doesn't require (commonly-paired certs, best-practice attributions).
- **15% — Best practice items.** Soft items (cert size at optimal range vs minimum, recommended placement on PDP, clear space exceeding minimum).

Color thresholds:
- **Green 95-100:** Ready to print. All required present, most recommended present.
- **Amber 80-94:** Will pass commit but improvements possible. Required items present; some recommended missing.
- **Red < 80:** Cannot commit. Required items missing. Export blocked until resolved.

Score is computed per design version + cached + invalidated on canvas change.

## The HUD pill states

Always visible in the top bar of the surface (Design Studio, Brand Identity Studio, any compliance-tracking interface):

- **Green ✓ Compliant** — no required items missing, no warnings active. Click expands to score + clean checklist.
- **Amber ⚠ 2 warnings** — recommended items missing or best-practice violations. Score still committable. Click expands to warnings list with inline auto-fix.
- **Red 🛑 1 blocker** — required items missing or hard violations. Score not committable. Click expands to blockers list with auto-fix.

The HUD is the single source of truth for "am I in good shape." The user learns to trust it. Glance up; green = freely design; amber = consider; red = stop and fix.

## The pre-flight checklist

The one moment of full disclosure. Surfaced at Export, Submit-for-review, Publish, or any other commit action. Visual structure:

```
Ready to ship? Here's what we checked.

[All-clean section]
✓ All FDA-required elements present (8 of 8)
✓ Min font sizes met
✓ Cert claims have your consent records
✓ Allergen statement matches your recipe
✓ Net quantity formatted correctly

[Warnings section, if any]
⚠ 1 recommended item missing — Resin Code 1 (PET) for plastic bottle
   [Add Resin Code]    [Skip — I'll add later]

[Blockers section, if any]
🛑 Required co-text missing for USDA Organic
   [Add "Certified by [agent name]"]

[Action buttons]
[Cancel]    [Continue to Export →]  (disabled if blockers present)
```

Green ticks visually dominate when all is well — gives the user confidence that the system is on their side. Yellow warnings get one-click resolution. Red blockers prevent commit until resolved (with same one-click resolution where possible).

## Inline canvas warnings

When a user violates a rule, a small contextual warning appears NEXT to the offending element. Style: small pill with amber/red color, single-sentence message, action button:

```
🛑 USDA seal too small (0.3" — needs 0.5" min)
[Auto-resize]    [Dismiss]
```

The warning floats next to the selected object. Disappears when fixed or dismissed. Re-fires only if the violation recurs.

Tooltips on the warning expose the "Why this rule?" detail for the curious. Default state: not shown.

## The "Why this rule?" tooltip pattern

For every rule the system enforces, add a small (?) icon. On click / hover, surface:

- One-line plain-English explanation of why the rule exists
- Citation in italic at the bottom (CFR / USC / state / industry standard)
- Link to the cert body or regulatory body documentation for deep-dive (opens in new tab, not modal)

This is the ONLY surface where regulation text appears. Hidden by default. Only the user who genuinely wants to know reads it.

## The consent / decision modal pattern

For binding decisions (applying a cert claim to a label, accepting Terms, granting data permission), full disclosure is appropriate. The modal pattern:

- Clear title in plain English: "You're adding a USDA Organic claim to your label"
- Context block showing what's about to happen + metadata
- Responsibility allocation in plain English (not citations)
- Required confirmation checkbox
- Cancel + Confirm buttons (Confirm disabled until checkbox checked)

The consent modal is slow on purpose. It's the legally-meaningful moment. Pressure to "just click through" must not exist — the friction IS the protection.

## When to escalate severity

A warning should escalate to a blocker only when:

1. The rule is legally required (not just recommended)
2. Shipping without it creates direct platform liability (vs creator-only liability)
3. The user cannot self-remediate after commit (vs can fix in next version)

If any of those three is false, keep it as a warning. Over-blocking trains users to bypass.

## Anti-patterns — never do these

- **Modal walls of text** when a popup with one sentence + action would do
- **Multi-step compliance wizards** when inline warnings would do
- **Warnings without actions** — complaints train users to ignore
- **Regulation-framed copy in primary flow** — kills trust + comprehension
- **"Submit anyway" buttons on blockers without context** — bypasses the protection
- **Required reading consent text** that no human will actually read — sign-of-handwave
- **Auto-fix that changes user's design without confirmation** — surprise mutations break trust
- **Compliance score that swings wildly with small changes** — not stable enough to anchor on
- **HUD that goes from green to red on a benign action** — confidence-destroying

## Applies across all compliance domains

| Domain | Surface |
|---|---|
| Label compliance | Design Studio (this is the primary surface today) |
| Brand compliance | Brand Identity Studio (banned words, color contrast, font legibility) |
| Ingredient compliance | Partner Product Builder Ingredients card (banned ingredients, BE flag, high-percentage) |
| KYB document compliance | Partner onboarding accordion |
| Marketplace listing compliance | Admin product review queue |
| Order manifest compliance | Production checkout |

Every one of these uses the same five-surface architecture: HUD + score + inline + comprehensive + pre-flight + tooltips. Consistency across domains lets users learn the pattern once and trust it everywhere.

## Implementation infrastructure

Today's `packages/ui/src/canvas/compliance.ts` `scanLabelCompliance()` is the core engine. Each scan rule returns:

```ts
interface ComplianceRule {
  id: string
  severity: 'BLOCKER' | 'WARNING' | 'INFO'
  category: 'REQUIRED' | 'RECOMMENDED' | 'BEST_PRACTICE'
  outcomeText: string         // for primary surfaces — one sentence, plain English
  regulationText?: string     // for "Why this rule?" tooltip — citation + one-line explanation
  actions?: Array<{           // every warning has an action
    label: string
    kind: 'AUTO_FIX' | 'NAVIGATE' | 'DISMISS'
    payload?: unknown
  }>
  affectedObjectIds?: string[]  // for inline canvas surfacing
}
```

The compliance score sums weighted scores from these results. The HUD reads them aggregated. The pre-flight checklist groups them by severity. The inline warnings filter to the selected object's `affectedObjectIds`. One scan, six surfaces.

This is intentionally a small interface. Adding new compliance domains (brand banned-words, ingredient flags, KYB doc status) just adds new rules to the registry — the surfaces consume any rule that conforms to this shape.

## See also

- `docs/legal/LEGAL_AUTHORITIES.md` — citation reference for `regulationText` fields
- `docs/legal/FDA_REGULATORY_POSTURE.md` — why "outcome-framed" matters for liability allocation
- `docs/builds/certificates-c8-design-studio-asset-rules.md` — first surface to implement this pattern in full
- `.claude/memory/ilaunchify-compliance-ux-pattern.md` — locked design pattern
- `.claude/memory/ilaunchify-cert-liability-pattern.md` — consent-at-claim flow (the "decision modal" surface)
