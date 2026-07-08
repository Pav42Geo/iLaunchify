# D7 — Nomination Liability: Decision Framework

**Status:** DRAFT for Pavel · 2026-07-08 · hand to counsel with `PARTNER_AGREEMENT_DRAFT_v1.md` + `LEGAL_DOCS_REDLINE_RECOMMENDATIONS.md`.
**⚠️ Not legal advice.** This is a researched framework to structure the decision and speed up counsel — not a substitute for a licensed attorney finalizing the language. Every clause referenced here is a *pattern*, not final legal text.

---

## 1. What D7 actually is (plain English)

iLaunchify normally decides *which* partner produces each leg of an order (the rotation/matching engine picks). **Nomination** lets a creator or manufacturer **override** that and say "use *this* printer / co-packer." The question D7 asks: **when a party directs the choice and that partner's work is defective, who is liable — the platform, or the party who insisted?**

The instinct that this is risky is correct, but the risk is *narrow and manageable* — because of who iLaunchify already is.

## 2. The legal landscape (why your position is strong)

US law splits on whether a marketplace is a "seller" liable for a third party's defective product:

- **Liability line — but it doesn't fit you.** *Bolger v. Amazon* (Cal. 2020) and *Oberdorf v. Amazon* (3d Cir. 2019) held Amazon can be strictly liable — but **because Amazon took possession of the goods (FBA), controlled the transaction, set terms, and sold to the consumer.** ([Bolger](https://calawyers.org/business-law/bolger-v-amazon-com-llc-ca-appellate-court-holds-amazon-is-subject-to-strict-products-liability-for-damages-arising-from-a-defective-product-sold-on-its-website-by-a-third-party-seller/))
- **Defense line — this *is* you.** *Amazon.com v. McMillan* (Tex. 2021) held **"title, not process, possession, or control, is dispositive"** — hosting, marketing, warehousing, payments, and shipping do **not** make you a seller. The **Restatement (Third) of Torts §20** limits strict liability to those "engaged in the business of selling or … distributing" a product. ([McMillan](https://www.haynesboone.com/news/alerts/texas-supreme-court-rejects-strict-product-liability))

**iLaunchify never takes title, never possesses the finished goods sold to consumers, never sets the consumer price, and never sells to end buyers — the creator's own channels do.** That is a *materially stronger* posture than Amazon's. You are a software/orchestration layer, not a link in the consumer distribution chain.

**Nomination does not change who you are.** You're still the neutral orchestrator. What changes is that a *party directed a choice you'd otherwise have made neutrally* — so the clean move is to **allocate that specific choice to the party who made it**, while keeping every other protection identical.

## 3. The decision — my recommendation

**Accept the nomination model — as a *governed override*, never an abdication.** Yes, offer it (Option A, already confirmed: nominated partners are onboarded officially). The value is real (continuity, color/quality consistency, proximity). The risk is contained by the ten conditions in §4. Do **not** ship it until counsel blesses the specific liability allocation (§6 of the Partner Agreement) — that's the one hard gate.

Framed as a one-liner for your own clarity: **"A creator/manufacturer may direct a specific partner; in exchange, they accept responsibility for that directed choice, the partner still passes every compliance and insurance gate, and iLaunchify keeps a governed right to refuse or reroute. Nomination is a fast lane, not a back channel."**

## 4. The conditions that keep the platform clean (the "under what conditions")

These are the levers. The first is the most important by far.

1. **Preserve the neutral-intermediary FACTS — not just recitals.** This is your #1 shield (§2). Never take title to goods. Never hold yourself out to end buyers as the seller. Never set the consumer price. Keep pricing in the creator's hands. Document the "neutral router / software tool" role. *A recital that says "we're not a seller" is worthless if the facts say otherwise* — so the product must behave like a neutral orchestrator.
2. **Same compliance gates on nominated partners — fast lane, not skip.** A nominated partner runs the *full* onboarding + Activation Setup + per-domain certification gates. The pin cannot activate until they're `OPERATIONALLY_CONFIGURED` and cert-cleared for the relevant domains. (Already designed — §5B + §5.2 of the onboarding strategy.)
3. **The directing party owns its directed choice.** The nominator (creator/manufacturer) contractually accepts responsibility for defects *traceable to the partner it insisted upon* — where the defect arises from the directed choice rather than the platform's orchestration — and indemnifies the platform accordingly. (FIDIC nominated-subcontractor logic, translated. ([FIDIC](https://www.fidic.org/sites/default/files/Nominated%20Subcontractors%20on%20International%20Projects_Approaches%20to%20Risk%20Allocation.pdf)))
4. **Governed reject/reroute right.** iLaunchify may refuse or temporarily reroute a nomination on **enumerated** grounds — capacity, certification/compliance failure, risk flags, quality — with notice. This is what keeps a bad "my guy" pick from becoming an unaccountable single point of failure.
5. **Reasonable-objection window.** The executing party (and the platform) can object to a nominee that lacks competence, capacity, insurance, or won't accept the platform's terms — within a defined window before the pin binds.
6. **Layered indemnity** (each risk to the party that controls it): **partner → platform** for manufacturing defects, its own IP, and compliance; **creator → platform** for label content, marketing claims, and formulation (they're the *brand of record*, which owns label/claim liability); **nominator → platform** for the directed choice.
7. **Product-liability & bodily-injury carved OUT of the liability cap.** The general SaaS cap (fees paid) applies to ordinary breaches, but death/bodily-injury/product-liability sit *outside* the cap — because (a) many states void caps on personal injury, and (b) a capped indemnity would gut the whole risk transfer.
8. **Mandatory additional-insured product-liability insurance** from *every* partner, nominated included — CGL with product-liability/completed-operations, iLaunchify (and where appropriate the creator) named additional insured, COI on file with minimums (industry floor ~$1M/occ / $2M aggregate; ingestibles: no "ingredient/additive" exclusion, consider recall coverage).
9. **Capture nomination consent at the point of nomination.** A `NominationConsent` record (who nominated whom, when, agreement version, acknowledgement text) — the evidentiary trail that the nominator accepted the allocation. This is the technical hook the contract relies on.
10. **Narrow, time-boxed anti-circumvention.** Keep platform-introduced/nominated relationships transacting on-platform — 12–24 months, scoped to the specific production, not a blanket restraint (California is hostile to broad non-solicits).

## 5. What works FOR the platform vs. what erodes the shield

**In your favor (lean into these):**
- No title, no consumer sale, no consumer pricing = strong non-seller argument (§2).
- Independent-contractor / no-agency framing (partners are producers of record; creators are brand of record; iLaunchify is software).
- Uniform compliance gates + audited quality (shows reasonable care).
- The directing party's *documented* acceptance of its directed choice.

**Erodes the shield (avoid these):**
- Taking title to, or possessing, finished goods bound for consumers.
- Holding yourself out to end buyers as the seller/manufacturer.
- Setting the consumer price.
- **Auto-stamping** anything onto a product/label (echoes the *Roommates.com* "material contribution" trap that defeats intermediary protection — you already avoid this in the cert flow; keep avoiding it).
- Claiming verification you didn't perform ("we verify X with the issuing body" when you only checked a PDF looks authentic).
- Letting a nominated pair transact off-platform unvetted.

## 6. The decision to make — and the exact questions for counsel

**Your decision:** approve nomination as a governed override under the ten conditions (§4), with the liability allocation drafted into the Partner Agreement (§6 of the draft). Ship only after counsel signs off on the allocation.

**Precise questions to put to counsel** (put these in front of them with the draft):
1. Does the **nominator-accepts-its-directed-choice + indemnity** allocation hold up, and is our "defect traceable to the directed choice vs. platform orchestration" line workable?
2. Does the platform's **governed reject/reroute right** create any *assumed-duty* exposure (Restatement (Second) of Torts §324A — undertaking a duty you then perform negligently)? How do we word it to avoid that?
3. Is our **never-take-title / never-sell-to-consumers** posture sufficient to keep us out of "seller" strict-liability across our target states — and what operational facts must we never change?
4. Confirm the **product-liability / bodily-injury carve-out** from the LoL cap, and whether our states void personal-injury caps regardless.
5. Confirm **insurance minimums** + additional-insured + primary-and-noncontributory + waiver-of-subrogation for each partner role (and higher for ingestibles).
6. **Anti-circumvention** scope/duration that's enforceable in our governing-law state.
7. Confirm the **DIY e-signature** (clickwrap + typed name + audit trail) is enough for this document class, or advise a certified provider.
8. The **brand-of-record** split — is our creator-owns-label-claims / partner-owns-defect allocation the right line, and does it need explicit language for co-manufactured / private-label goods?

## 7. How this connects to what's already built

The technical hooks for this framework already exist or are specced: the `ProductPrintSelection` pin + owner-pinned routing (the nomination mechanism), the reroute-approval gate (the governed reject/reroute), the per-domain cert gate (uniform compliance), `PartnerAgreementSignature` (the signed contract + audit trail), and the proposed `NominationConsent` record (§4.9). So once counsel blesses the allocation, wiring it is small — the decision, not the code, is the gate.

### Sources
Bolger v. Amazon; Oberdorf v. Amazon; Amazon.com v. McMillan (Tex. 2021); Restatement (Third) of Torts §20 / (Second) §324A; FIDIC nominated-subcontractor guidance; ESIGN/UETA — full URLs in the research brief that produced this doc (2026-07-08). Related repo: `docs/legal/LEGAL_AUTHORITIES.md`, `LEGAL_DOCS_REDLINE_RECOMMENDATIONS.md`, `.claude/memory/ilaunchify-cert-liability-pattern.md`.
