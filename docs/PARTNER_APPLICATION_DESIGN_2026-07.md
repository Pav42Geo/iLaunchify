# Partner application design — what to ask a manufacturer, and why

**Date:** 2026-07-08 · **Question (Pavel):** should certs be in the application? What information actually lets an admin judge a good potential partner? What does a professional application for white-label / private-label CPG manufacturers look like?

## The governing principle: qualify ≠ onboard

Industry practice splits supplier intake into two stages, and they ask for different things:

- **Qualification** — *"Do we admit them to the network at all?"* Pre-screen on business + regulatory + fit criteria. Light, decision-oriented.
- **Onboarding** — *"Now that they're in, capture the operational detail to go live."* Heavy, structured, verified (audits, cert PDFs, specs).

([Supplier qualification vs onboarding](https://simplerqms.com/supplier-qualification/), [vendor onboarding questionnaire](https://aavenir.com/resource/vendor-onboarding-qualification-questionnaire/))

**This is exactly iLaunchify's application → onboarding split.** So the rule for every application field is: *does an admin need this to make the admit/decline decision?* If yes, it's on the application. If it's operational detail only needed before go-live, it's onboarding. That single test resolves "what belongs where."

## What lets an admin judge a good manufacturer (the decision signals)

From CPG co-packer / contract-manufacturer selection practice, the criteria brands (and a curating platform) score on are consistent ([selection criteria](https://endlesscommerce.com/playbook/co-packing-and-contract-manufacturing-for-cpg-brands/), [evaluation checklist](https://copackconnect.com/resources/contract-manufacturer-evaluation-checklist/), [15-point plan](https://copackconnect.com/resources/15-point-action-plan-for-finding-and-selecting-your-contract-manufacturing-partner-example/)):

| Signal | What it tells the admin | Application? |
|---|---|---|
| Legal entity + country + **years in business** | Real, established operation vs a shell | ✅ (add years-in-business) |
| **What they make** — categories, processes, formats/fill | Do they even fit our demand? A powder blender is useless for beverages | ✅ (structured chips) |
| **Fit-to-model** — **minimum run size / smallest batch they'll take**, willingness to do **private-label / white-label**, sample runs | THE make-or-break for us — most CMs have high MOQs; we need ones who'll run small creator batches with no branding conflict | ✅ **most important, currently missing** |
| **Certifications held** (FDA reg, GMP/HACCP/SQF/BRC, allergen, Organic/Kosher…) | Compliance maturity + which categories they can *safely* serve (baby food needs infant-grade) | ✅ **as a declaration** (see below) |
| **Capacity** (rough monthly volume, can-you-scale) | Can they absorb demand | ✅ (rough is fine here) |
| **Track record** — brands/categories served, references | Credibility + proof they've shipped | ✅ (light: a "who have you produced for?" line) |
| Contact + how to reach | Follow-up | ✅ |
| Lead times, exact specs, pricing tiers, cert PDFs + expiry, insurance COI, address, Stripe | Operational / verification | ❌ onboarding |

Brands typically **score candidates 1–5 across these and set a threshold** (e.g., 70%) to advance ([scoring framework](https://endlesscommerce.com/playbook/co-packing-and-contract-manufacturing-for-cpg-brands/)). A lightweight admin rubric on `/admin/leads` is a natural future add.

## Should certs be in the application? — Yes, as a *declaration*, not documents

A manufacturer's cert set is **one of the strongest qualification signals** — it simultaneously tells the admin (a) their food-safety/quality maturity and (b) which categories they're eligible to serve. Dropping it would blind the admit decision. **But** the *verification* (PDF, issuing body, expiry, admin review) is onboarding work, not needed to decide admit/decline.

So the right shape is exactly what we just built: **the application uses the `CertificatePicker` to capture *which* certs they hold (a declaration from the library)**; the **PDF + expiry + verification become `PartnerCertificateInstance`s during onboarding.** Keep certs in the application — as the picker, not as uploads.

## iLaunchify's specific lens (this is the differentiator)

A generic "big CM" application optimizes for scale. **Ours should optimize for small-batch, private-label fit**, because that's the demand we route (CPG creators, not national brands). The single most valuable qualifying question we're *not* asking:

> **"What's the smallest production run you'll take, and will you produce unbranded / white-label for our creators?"**

A partner who says "50,000-unit minimum, our brand only" is a bad fit no matter how certified. A 500-unit private-label runner is gold. This question, plus categories + certs, is 80% of the admit decision.

## Recommended application field set (vs. what we have)

**Keep (have):** company + legal name, contact, email/phone, website, **services** (multi-select chips ✅), **certifications** (picker ✅), rough monthly capacity, "what does success look like" narrative.

**Add (qualification-critical, missing):**
1. **Years in business** (or "operating since") — legitimacy.
2. **Minimum run size** + **private-label / white-label willingness** (yes/no + notes) — the fit differentiator.
3. **Who have you produced for?** (brands/categories/references — short free-text, this one's legitimately narrative).
4. **Product categories** as structured chips (part of the capabilities purpose-map rebuild) so fit is machine-checkable, not just prose.

**Move to onboarding (don't ask at application):** exact per-service specs, cert PDFs/expiry, insurance COI, address, pricing tiers, Stripe.

## Net answer

- **Don't exclude certs** — they're a top-3 admit signal; keep them as the picker declaration.
- A professional application is **short and decision-oriented**: legitimacy + fit (esp. small-batch/private-label) + capability categories + cert declaration + a credibility narrative. Everything else waits for onboarding.
- The biggest gap today isn't too many fields — it's a **missing one**: minimum-run / private-label willingness, the question that most separates a good iLaunchify partner from a bad one.
