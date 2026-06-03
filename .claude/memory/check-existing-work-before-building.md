---
name: check-existing-work-before-building
description: "Always audit the codebase, completed task list, and memory for prior implementations before building anything new. Pavel called this out 2026-05-28 after I built duplicate signup/login pages and a duplicate /start page that he had to spot and delete."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

Before starting any new feature, surface, or component, **explicitly check that it doesn't already exist**:

1. **Search the codebase first.** Run a Grep / Glob for keywords related to the work — route paths, component names, function names. If it might exist, confirm before building.
2. **Check the task list.** Tasks #1–#336 (and growing) document what has been built. Many features Pavel asks about have a completed task already.
3. **Check memory.** The memory index documents major architectural decisions and surface contracts. Many "should we build X?" questions are already answered.
4. **Check git log.** Recent commits show what's been touched and how it's wired.

**Why:** Pavel cost an entire app of wasted work on the consumer-storefront → B2B production marketplace pivot ([[clarify-audience-before-building-customer-facing-flows]]) and lost time again in this session on duplicate auth pages. Both came from skipping the audit step.

**How to apply:** When the user mentions a feature they think exists, treat the default assumption as "they're right." Confirm by searching before building anything from scratch. When they ask "is X connected?" — trace the actual code path through git/grep, don't guess.
