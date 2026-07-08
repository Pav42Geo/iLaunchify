# iLaunchify Partner Agreement — DRAFT v1 (for counsel)

**⚠️ DRAFT — NOT LEGAL ADVICE.** This is a structured starting draft assembled from standard marketplace/SaaS clause patterns and the D7 research (`NOMINATION_LIABILITY_D7_FRAMEWORK.md`). It must be reviewed, corrected, and finalized by a licensed attorney before use. Bracketed `[…]` items are decisions for you/counsel. This version is intended to become `PartnerAgreement.version = 'v1.0'` in the platform once blessed.

---

## Recitals

This Partner Agreement ("Agreement") is between **iLaunchify, Inc.** ("iLaunchify," "Platform," "we") and the entity accepting it ("Partner," "you"). iLaunchify operates a **software and production-orchestration platform**. iLaunchify does **not** manufacture, take title to, warehouse for sale, sell, or distribute Partner products to end consumers. **Creators** are the brands of record; **Partners** are the producers of record; **iLaunchify orchestrates** the workflow between them.

## 1. Definitions

- **Platform** — the iLaunchify software, marketplace, and orchestration services.
- **Creator** — a platform customer that designs products and owns the brand/channel; the brand of record.
- **Order / Production Leg** — a unit of production work (manufacturing, co-packing, printing, fulfillment) routed to a Partner.
- **Nomination** — a Creator's or manufacturer's election to direct a specific Partner for a Production Leg, overriding the Platform's automated allocation.
- **Nominating Party** — the party that makes a Nomination.
- **Activation Setup** — the Partner's post-approval capability/compliance profile the Platform relies on to route work.
- **Certifications** — the quality/compliance credentials a Partner attests to and maintains.

## 2. Relationship of the Parties (no agency; Platform role)

2.1 **Independent contractors.** The parties are independent contractors. Nothing in this Agreement creates a partnership, joint venture, agency, franchise, or employment relationship, and neither party has authority to bind or create any obligation on behalf of the other.

2.2 **Platform is not a seller or manufacturer.** iLaunchify provides software and orchestration only. It does not manufacture, take title to, or sell Partner products to end consumers; it is not a "seller," "distributor," or "manufacturer" of Partner products. Partner is the producer of record for the work it performs; the Creator is the brand of record for the finished product placed into commerce. *[Counsel: this clause supports the non-seller / Restatement §20 posture — align it with actual operations.]*

## 3. Services & Platform obligations

3.1 iLaunchify will make the Platform available to route Production Legs to Partner consistent with Partner's Activation Setup profile, and will process Platform-originated payments per the applicable fee schedule.

3.2 iLaunchify may modify Platform features and the automated allocation logic. iLaunchify does not guarantee any volume of Orders.

## 4. Partner obligations

4.1 **Performance.** Partner will perform each accepted Production Leg to the specifications, lead times, and quality standards in its Activation Setup profile and the Order.

4.2 **Data accuracy.** Partner is responsible for the accuracy and currency of the operational data it maintains (capabilities, materials, certifications, lead times, capacity). iLaunchify relies on this data to route work; material misrepresentation is a breach.

4.3 **Capacity & communication.** Partner will keep capacity/availability current and promptly flag delays, defects, or capacity constraints.

## 5. Compliance, certifications & quality

5.1 **Certifications.** Partner represents that it holds, and will maintain, every certification it attests to on the Platform, including any domain-specific requirements (food-contact, infant, cosmetics, OTC, pet). Partner will not accept work outside the domains for which it is certified.

5.2 **Auto-suspension.** An expired or withdrawn required certification automatically suspends Partner's eligibility for the affected category of work until cured.

5.3 **Regulatory responsibility.** Partner is responsible for its own regulatory compliance as a producer (e.g., facility registration, GMP where applicable). The **Creator** is responsible for label content, marketing claims, and product formulation decisions as the brand of record. *[Counsel: confirm the producer-vs-brand allocation, esp. for co-manufactured / private-label goods.]*

## 6. Orders, routing, pinning & nomination *(the D7 clause — counsel priority)*

6.1 **Routing.** iLaunchify allocates Production Legs via its automated engine unless a Leg is subject to owner-pinning or a Nomination.

6.2 **Nomination.** Where a Creator or manufacturer **nominates** Partner for a specific Production Leg, overriding automated allocation:
  (a) the **Nominating Party** represents it has an independent basis for the Nomination and **accepts responsibility for its directed choice** to the extent a resulting defect arises from that choice rather than from the Platform's orchestration;
  (b) the Nominating Party **indemnifies and holds harmless iLaunchify** against claims arising from the Nomination (see §10);
  (c) a Nominated Partner remains **independently bound by every obligation of this Agreement** — Nomination is a fast lane for onboarding, **not** a waiver of any compliance, certification, insurance, or quality requirement; and
  (d) iLaunchify retains a **governed right**, in its reasonable discretion, to **reject or temporarily reroute** a Nomination for capacity, certification/compliance, quality, risk, or legal reasons, on notice.

6.3 **Reasonable objection.** iLaunchify and the executing party may object to a nominee that lacks competence, capacity, required certifications or insurance, or will not accept this Agreement's terms, within [__] business days before the Nomination binds.

6.4 **No relief for the platform's own orchestration failures.** Nothing in §6 shifts to a Nominating Party liability for a defect caused by iLaunchify's own software/orchestration.

*[Counsel: this is the D7 core. Confirm the directed-choice allocation, the "traceable to the directed choice vs. platform orchestration" line, and that §6.2(d) does not create assumed-duty exposure under Restatement (Second) §324A.]*

## 6A. Participation Mode & Public Operator Terms

6A.1 **Participation Mode.** Partner elects a **Participation Mode** governing how Orders reach it:
  (a) **Invited-only (private operator)** — Partner receives Production Legs **solely through direct Nominations**. Partner is **excluded from automated rotation** and is **not listed in Platform discovery**. This is the default for a Partner that joined via a manufacturer's invitation.
  (b) **Public (open-market operator)** — Partner is discoverable on the Platform, is **eligible for automated rotation**, and may be nominated. Partner may change Mode at any time; a change to Public is effective only upon the acknowledgment in §6A.3.

6A.2 **Public Operator obligations.** While in Public Mode, Partner: (i) will receive Orders **automatically allocated** by the rotation engine without per-Order pre-selection; (ii) will **accept and fulfill** allocated Orders within the applicable acceptance windows, MOQ, lead times, and service levels; (iii) acknowledges that **declines, late acceptance, and missed or failed Orders affect Partner's merit standing and may carry the consequences** set out in the fee schedule and merit policy; and (iv) **represents that its stated capacity, MOQ, and lead times are accurate and current.**

6A.3 **Clickwrap acknowledgment (no separate document).** Switching to Public Mode requires Partner to **affirmatively acknowledge these Public Operator Terms and confirm current capacity** at the time of the switch. iLaunchify records the acknowledgment (terms version, timestamp, IP, and user agent) as an electronic record under §15. **No separate signed instrument is required** — these Terms are part of this Agreement, which Partner has already executed.

6A.4 **Reversibility.** Partner may return to Invited-only Mode at any time; **Orders already in progress are honored** through completion. Reverting removes Partner from future rotation and discovery.

*[Counsel: confirm the clickwrap-on-executed-agreement mechanism is sufficient to bind the Public Operator obligations under ESIGN/UETA (§15), and that the capacity representation in 6A.2(iv) is adequately evidenced by the recorded acknowledgment.]*

## 7. Fees, payment & anti-circumvention

7.1 **Fees & payout.** iLaunchify collects Platform-originated order payments and pays Partner per the applicable fee schedule and payout terms; Partner connects a payout account.

7.2 **On-platform transactions / anti-circumvention.** Partner will transact all Platform-originated Orders on the Platform and will not solicit, divert, or accept off-platform payment for Orders originated through the Platform — including with counterparties introduced or nominated via the Platform — for **[12–24] months** following introduction, limited to the specific production and relationship introduced by the Platform. *[Counsel: set an enforceable scope/duration for the governing-law state.]*

## 8. Insurance

8.1 Partner will maintain, at its expense, **Commercial General Liability insurance including product-liability and completed-operations coverage**, with limits no less than **$[1,000,000] per occurrence / $[2,000,000] aggregate** (higher where the Order or Creator requires; **for ingestibles, coverage without an ingredient/additive exclusion**), plus workers' compensation as required by law.

8.2 Partner will name **iLaunchify (and, where required by an Order, the Creator) as additional insured**, on a **primary and non-contributory** basis, with **waiver of subrogation**, and will provide a **Certificate of Insurance** on request and at renewal. *[Counsel: confirm minimums per partner role; consider product-recall coverage for CPG.]*

## 9. Warranties

Partner warrants that its work will (a) conform to the agreed specifications and Activation Setup profile; (b) be performed in a workmanlike manner by qualified personnel; (c) comply with applicable law and the certifications it attests to; and (d) not infringe third-party IP (excluding Creator-supplied artwork, marks, or specifications). iLaunchify provides the Platform "as is" except as expressly stated. *[Counsel: warranty scope + disclaimers.]*

## 10. Indemnification (layered)

10.1 **Partner → iLaunchify (and Creator).** Partner will defend, indemnify, and hold harmless iLaunchify and, where applicable, the Creator, from third-party claims arising from (a) Partner's defective work, workmanship, or products; (b) Partner's breach of law or of the certifications it attests to; and (c) infringement by Partner's own processes/materials — excluding claims arising from Creator-supplied artwork, marks, formulation, or specifications.

10.2 **Creator → iLaunchify (as brand of record).** *[Reflected in the Creator Agreement:]* the Creator indemnifies for label content, marketing claims, formulation, and specifications it supplies.

10.3 **Nominating Party → iLaunchify.** Per §6.2(b), the Nominating Party indemnifies iLaunchify for claims arising from a Nomination it made.

10.4 **Procedure.** Indemnity is conditioned on prompt written notice, the indemnitor's control of the defense (with the indemnitee's reasonable cooperation), and no settlement admitting the indemnitee's fault without consent.

## 11. Limitation of liability (cap + carve-outs)

11.1 **Cap.** Except for the carve-outs in §11.3, each party's aggregate liability under this Agreement is limited to the **fees paid or payable in the trailing 12 months**.

11.2 **Exclusion.** Except for the carve-outs, neither party is liable for indirect, incidental, special, consequential, or punitive damages, or lost profits.

11.3 **Carve-outs (survive the cap and the exclusion):** (a) a party's **indemnification** obligations; (b) **death, bodily injury, or product liability**; (c) **gross negligence or willful misconduct**; (d) breach of **confidentiality**; (e) **IP infringement**; and (f) Partner's **anti-circumvention** breach and unpaid fees. *[Counsel: confirm the product-liability/bodily-injury carve-out and whether the governing-law state voids personal-injury caps regardless.]*

## 12. Intellectual property

12.1 Each party retains its pre-existing IP. Creator-supplied artwork, trademarks, formulations, and specifications remain the Creator's; Partner receives only a limited license to use them to perform the Order.

12.2 Partner retains its own processes and know-how. *[Counsel: work-product ownership for dielines/tooling.]*

## 13. Confidentiality & data

Standard mutual confidentiality; Order and Creator data are confidential; data handling per the Privacy Policy / DPA. *[Counsel: align with the GDPR/document-handling layer in `LEGAL_DOCS_REDLINE_RECOMMENDATIONS.md`.]*

## 14. Term & termination

14.1 This Agreement is effective on acceptance and continues until terminated per its notice provisions.

14.2 **Survival.** Sections 5.3, 6.2(a)–(b), 7.2, 8, 9, 10, 11, 12, 13, and this §14.2 survive termination, along with obligations for open Orders.

## 15. Electronic signature & consent

Partner may execute this Agreement by electronic signature and consents to transact electronically. Such signature has the same legal effect as a handwritten signature under the **U.S. ESIGN Act (15 U.S.C. §7001 et seq.)** and applicable **UETA**. iLaunchify retains a tamper-evident record of execution — signer identity, timestamps, IP/device, consent, and a document-version hash — and makes an executed copy available. *[Reflects the built `PartnerAgreementSignature` record; counsel confirms DIY sufficiency vs. certified provider.]*

## 16. General

Governing law: **[state]**; dispute resolution: **[venue / arbitration]**; assignment (iLaunchify may assign to an affiliate/successor; Partner may not without consent); force majeure; notices; entire agreement; amendment (a new version supersedes on acceptance; material changes require re-acceptance); severability; no waiver. *[Counsel to complete.]*

---

**Signature.** Accepted by the Partner's authorized signatory via the Platform's e-signature flow (typed/drawn signature + "I have read and agree" consent), producing a `PartnerAgreementSignature` record.

---

### How to use this
Hand this draft + `NOMINATION_LIABILITY_D7_FRAMEWORK.md` + `LEGAL_DOCS_REDLINE_RECOMMENDATIONS.md` (Addendum) to counsel. Ask them to (1) resolve the D7 allocation (§6), (2) finalize the LoL carve-outs (§11.3) and insurance minimums (§8), (3) set the anti-circumvention scope (§7.2) and governing law (§16), and (4) confirm the e-signature approach (§15). Once returned, the finalized text becomes `PartnerAgreement v1.0` (seeded via `seed:partner-agreement`, hashed, and signed through the built flow).
