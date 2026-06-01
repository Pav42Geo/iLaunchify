# FDA Regulatory Counsel — Meeting Agenda

**Companion to:** `FDA_REGULATORY_POSTURE.md` (the pre-counsel briefing).
**Goal of meeting:** walk out with a decision on the co-manufacturer question, a registration posture for V1 + V2, and a punch list of pre-beta legal asks.
**Length:** 60 minutes.
**NOT LEGAL ADVICE** — this is iLaunchify's working document for the conversation.

---

## Pre-meeting checklist (send 48 hours before)

Pavel sends to counsel by email, 48 hours before the call:

- [ ] `FDA_REGULATORY_POSTURE.md` (this document's companion) — the briefing.
- [ ] `FDA_COUNSEL_MEETING_AGENDA.md` (this document) — the agenda.
- [ ] `docs/legal/Creator_Agreement.docx` — current draft.
- [ ] `docs/legal/Partner_Agreement.docx` — current draft.
- [ ] `docs/legal/Terms_of_Service.docx` and `docs/legal/Privacy_Policy.docx`.
- [ ] Screenshots: (1) the marketplace product detail page; (2) the Design Studio canvas with the compliance scan panel open; (3) the ExportModal with the at-your-own-risk acknowledgement; (4) the admin Partner verification queue; (5) the admin AuditLog feed.
- [ ] A one-paragraph "what is iLaunchify in 60 seconds" for the partner-of-counsel who isn't the regulatory specialist (use §1 of the briefing).
- [ ] The list of product categories the platform supports at V1 (foods/beverages, dietary supplements, pet products) and the list of categories the platform proposes to decline (cosmetics until counsel approves, OTC, infant formula).
- [ ] Note on the V2 thesis (pooling + buffer inventory) and flag that this changes the regulatory analysis.

---

## 60-minute agenda

### 0:00 – 0:10 — Business model walkthrough

Pavel reads from §1 of the briefing. Pause for counsel to ask clarifying questions about the platform's role, the orchestration boundary, and the fact that end buyers never touch iLaunchify. Anchor: iLaunchify is a software platform plus marketplace; Creator is the brand owner of record; Partners are the producing facilities; iLaunchify never takes physical custody at V1.

### 0:10 – 0:25 — The co-manufacturer question (the keystone)

Walk counsel through §2 of the briefing. Specifically:

- The "arguments that iLaunchify is not a co-manufacturer" list.
- The "arguments that iLaunchify might be characterised as a co-manufacturer" list — counsel's pressure test.
- The V2 buffer-inventory flip (§8 of the briefing).

**Decision counsel must answer in this slot:** does iLaunchify's current operational + contractual posture insulate it from co-manufacturer / co-packer / holder characterisation under current FDA enforcement practice? Yes / Yes with adjustments / No.

### 0:25 – 0:35 — Per-category regulatory hooks (quick walk)

Walk counsel through §3 of the briefing. 2 minutes per category:

- Foods / beverages (21 CFR 101 + 117 + FALCPA + USDA NBFDS) — scope confirmed.
- Dietary supplements (DSHEA + 21 CFR 101.36 + 111 + 101.93 + 101.17(e)) — confirm the platform-level scope (claim moderation gap; adverse-event reporting).
- Pet products (21 CFR 501 + AAFCO) — confirm rule-pack scope for V1.
- Cosmetics (MoCRA) — confirm whether to enable cosmetic Partner activation at V1.
- OTC + Infant formula — confirm decline.

### 0:35 – 0:45 — Risk register top 5 (§6 of the briefing)

Discuss the five highest-severity rows of §6 with counsel. Specifically:

1. Mislabelled product reaches end consumer.
2. Drug-claim violation on a supplement product.
3. Partner ships from an unregistered facility.
4. Recall triggered with no platform protocol.
5. V2 buffer-inventory regulatory flip.

For each, counsel either blesses the current mitigation, asks for an addition, or escalates to a contractual change.

### 0:45 – 0:55 — Pre-beta minimums (§10 of the briefing)

Walk through the seven pre-beta minimums. Counsel either confirms each as pre-beta-required or moves it to pre-GA. The output of this slot is a punch list with owners and dates.

### 0:55 – 1:00 — Next-step commitments

Confirm:

- Counsel's deliverables (redline of Creator Agreement §3; redline of Partner Agreement §18; written opinion on co-manufacturer question or memo describing what additional facts counsel needs).
- Pavel's deliverables (any documents counsel asked for; the list of platform features to add or modify; the schedule for V2 buffer inventory).
- A follow-up cadence (one written memo from counsel; one weekly 30-minute check-in until pre-beta minimums clear; one open channel for ad-hoc questions).
- Engagement letter + retainer scope.

---

## Printable question sheet (the 15 questions from §9)

Pavel prints this page separately so counsel can mark it up live.

1. Does iLaunchify's orchestration role qualify as **co-manufacturer**, **co-packer**, or **holder** under current FDA enforcement practice? Different per product category?

2. Is the at-your-own-risk acknowledgement at Export + Creator Agreement §3 brand-owner-of-record framing **sufficient** to allocate FDA labeling liability to the Creator?

3. What's the right **registration posture** for iLaunchify at V1? At V2?

4. For supplements (DSHEA), is the platform obligated to operationalize a serious adverse event intake workflow? Is the platform itself a reporter, or only a facilitator?

5. Is the **banned-ingredient hard block** at the right scope? What substances need adding before V1 beta?

6. Should iLaunchify maintain a **banned product category list** (CBD, kratom, infant formula, OTC)?

7. Should **bioengineered disclosure** be promoted from INFO to BLOCKING when the product is BE-flagged?

8. Is the platform's operational record consistent with the Partner Agreement §18 "No Co-Manufacturer" declaration?

9. For **MoCRA cosmetic** category, what Partner verification is required before activating cosmetic Partners? Responsible Person designation language for the Creator?

10. For **pet products**, what's the platform's recommended posture if a Creator misclassifies the LabelingType (e.g., picks FOOD when the product should be PET_PRODUCT)?

11. Should a written **recall coordination playbook** be in place before V1 beta? Minimum contents?

12. For **V1.1 Canada** and **V2 EU** expansion, is an FSVP (21 CFR Part 1 Subpart L) within scope?

13. What minimum **records-retention period** should iLaunchify commit to in the Creator Agreement for label artwork + manifest snapshots + AuditLog rows?

14. Should iLaunchify carry **platform liability insurance** separate from the Partner-required additional-insured limits in Partner Agreement §11?

15. For **FTC truth-in-advertising**, is the platform safer policing nothing (current) or policing minimally (banned-claim list applied to product descriptions stored on the platform)?

---

## Decision tracker

To be filled in during the call. Pavel writes the answer in column 2 verbatim from counsel's response. "Action" is what iLaunchify will do as a result. "Owner" is who is responsible for the action. "Date" is the commit-by date.

| # | Question | Counsel's Answer | Action | Owner | Date |
|---|---|---|---|---|---|
| 1 | Co-manufacturer characterisation? |   |   |   |   |
| 2 | At-your-own-risk ack sufficiency? |   |   |   |   |
| 3 | V1 + V2 registration posture? |   |   |   |   |
| 4 | DSHEA AE workflow? |   |   |   |   |
| 5 | Banned-ingredient scope? |   |   |   |   |
| 6 | Banned-product-category list? |   |   |   |   |
| 7 | Bioengineered severity? |   |   |   |   |
| 8 | §18 declaration consistency? |   |   |   |   |
| 9 | MoCRA cosmetic V1 enablement? |   |   |   |   |
| 10 | Pet product mis-classification? |   |   |   |   |
| 11 | Recall playbook minimum? |   |   |   |   |
| 12 | V1.1 Canada + V2 EU FSVP? |   |   |   |   |
| 13 | Records retention floor? |   |   |   |   |
| 14 | Platform liability insurance? |   |   |   |   |
| 15 | FTC posture? |   |   |   |   |

Cross-cutting decisions (filled in during the call):

| Item | Decision | Owner | Date |
|---|---|---|---|
| Creator Agreement §3 — counsel's redline cadence |   | Counsel |   |
| Partner Agreement §18 — counsel's redline cadence |   | Counsel |   |
| Engagement letter + retainer |   | Counsel |   |
| Counsel's written memo on co-manufacturer question |   | Counsel |   |
| Weekly cadence check-in time |   | Pavel + Counsel |   |
| Pre-beta minimums punch list — final wording |   | Pavel |   |

---

## Follow-up email template

Pavel sends within 24 hours of the meeting.

> Subject: iLaunchify regulatory scoping — recap and next steps
>
> Hi [counsel],
>
> Thank you for the time today. Recap of what we agreed:
>
> 1. **Co-manufacturer characterisation.** [Counsel's verdict — yes / yes-with-adjustments / no.] Specifically: [counsel's reasoning, ~3 sentences].
>
> 2. **Pre-beta minimums.** We agreed the following must be in place before iLaunchify opens the V1 closed beta:
>    - [Item 1]
>    - [Item 2]
>    - [etc.]
>
> 3. **Your deliverables.**
>    - Redline of Creator Agreement §3 — by [date].
>    - Redline of Partner Agreement §18 — by [date].
>    - Written memo on the co-manufacturer question — by [date].
>    - [Anything else counsel committed to.]
>
> 4. **My deliverables.**
>    - [Anything Pavel committed to.]
>    - Updated `FDA_REGULATORY_POSTURE.md` reflecting today's decisions — by [date].
>
> 5. **Cadence.** Weekly 30-minute check-in on [day/time] until pre-beta minimums clear. Ad-hoc questions via [channel].
>
> 6. **V2 forward-pointer.** When iLaunchify is ready to scope the pooling + buffer-inventory phase (target ~6 months out), we will schedule a separate session to review the registration + holder posture flip. You flagged [whatever counsel flagged].
>
> If I've mis-stated anything above, please redline and reply.
>
> Engagement letter + retainer terms: please send when ready.
>
> — Pavel
>
> P.S. The updated briefing document and decision tracker are at `docs/legal/FDA_REGULATORY_POSTURE.md` and `docs/legal/FDA_COUNSEL_MEETING_AGENDA.md` in the iLaunchify repo.

---

**End of agenda. See `FDA_REGULATORY_POSTURE.md` for the full briefing.**
