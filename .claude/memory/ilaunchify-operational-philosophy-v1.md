---
name: ilaunchify-operational-philosophy-v1
description: "Pavel's V1 operating principle for the print/manufacturing platform — optimize for operational trust, legal defensibility, partner adoption, predictable margins, and avoiding human bottlenecks too early. NOT for margin compression, maximum automation, or premature cost optimization. Locked 2026-05-25."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

When designing or recommending architecture for iLaunchify's print/production / partner-touching systems, default to the **operational-trust-first** posture Pavel locked 2026-05-25 in the print workflow §13 review:

**The core principle (Pavel's words):**
> "V1 goal: operational trust, not margin optimization. V2 goal: selectively replace expensive pieces after you understand your actual failure patterns."

**Concrete defaults this principle implies (locked decisions):**

- **Buy proven tools over DIY** for trust-critical pieces. PitStop Server (~$2-5K/yr) over Ghostscript+custom preflight, because "if a large print provider discovers your DIY preflight missed [overprint / spot color / trapping / etc.], they will stop trusting the platform immediately. Trust in print workflows is everything."
- **Abstract the implementation** so V2 can replace pieces selectively (`interface PreflightEngine`, etc.) — buying proven tools doesn't mean lock-in.
- **Conservative automation defaults at launch.** Auto-release risk threshold starts at `≤3` (not `≤5`), expand after low dispute/revision/override rates prove safety. Per-partner overrides allowed.
- **Hard caps over open-ended back-and-forth.** 3-revision-round hard cap. Escalating friction at Round 2 and 3 (warning banner / "Final round before escalation"). Track per-partner abuse metrics.
- **Schema preserves distinctions even when small providers collapse roles.** Keep `PARTNER_ADMIN` / `PARTNER_PREPRESS` / `PARTNER_PRODUCTION` as separate roles even though a 2-person shop will assign all three to the same person — "do not simplify the schema just because small providers are small today." The distinction unlocks future operational intelligence.
- **Snapshot immutable artifacts at decision time.** Preflight profiles freeze at SUBMITTED + persist full snapshot (not just FK). Approval gates persist file hash + terms version. Legal defensibility depends on reproducibility.
- **Specialized counsel for legally load-bearing language.** Gate A/B approval text needs print/manufacturing/UCC counsel, not generic startup counsel. "Treat Gate A/B language as core infrastructure, not UI copy."
- **JSON config over UI builders V1.** Don't build sophisticated authoring UIs before knowing real-world variance. Invest in validation / versioning / diff / rollback / test mode FIRST.

**How to apply:**

- When choosing a tool for a trust-sensitive job (print preflight, payment processing, signature verification, compliance evaluation): prefer the established industry tool, abstract behind an interface, and revisit only after you have failure data.
- When setting a numerical default (revision cap, auto-release threshold, SLA window): start conservative and expand with data.
- When the user asks "should we simplify the schema since most providers are small?": no — preserve the distinctions.
- When designing approval / liability / dispute flows: assume every claim will be litigated; design for audit reproducibility.
- This principle applies to **all** partner-touching V1 work: print production, packaging, compliance, ingredient governance, market certifications. NOT only the preflight pipeline.
- Related: [[ilaunchify-partner-onboarding]] (5-layer model + 10-state FSM that Pavel locked under the same philosophy), [[ilaunchify-ingredient-governance]] (sliding verification, "admin is informed, not blocking").

**Provider Confidence Modes (new concept introduced 2026-05-25):**

Pavel added a concept the spec was missing: each provider declares an operational mode — `AUTOMATION_FIRST` / `BALANCED` / `WHITE_GLOVE` — that affects their auto-release threshold, proof requirements, revision strictness, and SLA expectations. The platform must accommodate enterprise print houses and small digital shops within the same architecture without forcing them into a single operational model. Detail in `docs/PRINT_PRODUCTION_WORKFLOW.md` §10.
