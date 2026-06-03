# Legal documents — redline recommendations after cert + KYB + GDPR framework

Specific changes to make to the four legal drafts at `docs/legal/`. Hand this to your lawyer alongside the drafts and `LEGAL_AUTHORITIES.md`. Counsel will translate into final contract language.

**Source-of-truth conversation history** that drove these recommendations:
- Cert module locked declare-only (`.claude/memory/ilaunchify-certificates-declare-only.md`)
- Mandatory PDF upload before any cert instance is created
- Verification scope: "apparent authenticity at upload" — not "current validity with issuing body"
- Consent-at-claim flow before any cert badge applied to a creator label
- KYB document collection extends the 5-layer partner onboarding (Articles of Incorporation, COI, FFR, etc.)
- GDPR document handling layer covering all sensitive uploads
- All citations in `LEGAL_AUTHORITIES.md`

---

## Terms of Service (`Terms_of_Service.docx`)

### ADD a section on Document Collection and Handling (after current §7 Third-party services)

> **Document Collection and Handling.** As part of platform participation we collect and store certain documents from users, including but not limited to: identification documents, business formation documents, certificates of insurance, food facility registration confirmations, certification documents (e.g., USDA Organic, Kosher, Halal), licenses, and permits. We process these documents subject to our Privacy Policy and any applicable Data Processing Addendum. We may retain such documents for the longer of: (a) the period a related account remains active, or (b) the retention period required by applicable law for the document category. We will provide notice of our retention policy at the point of collection.

### MODIFY §11 (Compliance scanning disclaimer) — strengthen language

Current intent: scan is assistance not certification. Add explicit reference to the platform's role across the entire compliance chain:

> **Tool, Not Certification.** The platform provides software tools that may include compliance scans, certificate libraries, label rendering, ingredient databases, and similar functionality. None of these tools constitute professional regulatory advice, legal advice, or independent certification. iLaunchify does not act as a certifying body, an FDA-regulated facility (subject to §[V2 reservation clause]), or a regulatory consultant. All compliance, labeling, and substantiation responsibility for products in commerce rests with the brand of record (the Creator) and the producing partner (the Partner), per the respective role-specific agreements.

### MODIFY §13 (Limitation of liability) — add product-liability carve-out

Counsel should add explicit language that the cap does NOT extend to:
- Indemnification obligations
- Each party's gross negligence or willful misconduct
- Liability that cannot be limited under applicable law

Without these carve-outs the trailing-12-month fee cap will get stripped by a court in any product-liability adjacent dispute, leaving the cap unenforceable across the board.

### ADD §[new] — Data subject rights and request processes

> Users with applicable rights under GDPR, CCPA, CPRA, or comparable laws may exercise those rights through our Data Rights portal at [URL] or by emailing [privacy contact]. Standard request types include right to access, right to deletion / erasure, right to portability, and right to opt-out of sale or sharing (where applicable). We will respond within the time period required by the applicable law, and in any case within 45 days unless a longer period is permitted.

### ADD §[new] — Sub-processor disclosure

> A current list of sub-processors that may receive your personal data in connection with the Service is published at [/legal/subprocessors] and updated when material changes occur. Material changes will be communicated in advance per our Data Processing Addendum.

### Counsel review items for ToS

- `[LAWYER REVIEW: arbitration vs court? class action waiver?]` — already flagged in original draft. The cert / claim chain raises the stakes — confirm arbitration clause survives mass-arbitration risk.
- `[LAWYER REVIEW: choice of law]` — confirm Delaware (or selected jurisdiction) law applies + venue clause is enforceable.
- Cookie consent — confirm the cookie consent banner implementation matches what the ToS promises.

---

## Privacy Policy (`Privacy_Policy.docx`)

### ADD specific data category — Compliance documents

> **Compliance documents.** Files you upload to substantiate cert claims, regulatory registrations, insurance coverage, business legitimacy, or facility operations (e.g., certificate PDFs, food facility registration confirmations, certificates of insurance, articles of incorporation, business licenses, food safety permits, recall plans).

### ADD retention specifics per category

| Data category | Retention default | Basis |
|---|---|---|
| Account profile data | While account active + 1 year after deletion (for fraud / dispute history) | Contract + legitimate interest |
| Payment data | Not stored by iLaunchify; handled by Stripe per Stripe's terms | N/A |
| Compliance documents (certs, FFR, COI, etc.) | 7 years after the document's expiration date OR until the partner requests deletion (whichever first), subject to legal hold | FDA records retention (21 C.F.R. §117.315) + tax records + product liability defense window |
| AuditLog rows | 7 years from creation | Audit + dispute resolution |
| Order + dispatch data | 7 years from order completion | Tax + product liability |
| Marketing / analytics data | 24 months from last activity | Legitimate interest |
| Cookies & tracking | Per session / per cookie banner choice | Consent |

### ADD GDPR rights section explicitly

> **Your data protection rights.**
>
> If you are located in the European Economic Area, the United Kingdom, or another jurisdiction with applicable data protection law, you have certain rights regarding your personal data:
>
> - **Right of access (GDPR Article 15)** — request a copy of personal data we hold about you.
> - **Right to rectification (Article 16)** — correct inaccurate or incomplete data.
> - **Right to erasure / "right to be forgotten" (Article 17)** — request deletion, subject to retention obligations.
> - **Right to data portability (Article 20)** — receive your data in a structured, machine-readable format.
> - **Right to object (Article 21)** — object to processing based on legitimate interest.
> - **Right to restriction of processing (Article 18)** — limit how we process your data in certain circumstances.
> - **Right to lodge a complaint with a supervisory authority (Article 77)**.
>
> Exercise these rights via the Data Rights portal at [URL] or by emailing [Privacy Contact]. Response within 30 days where reasonably possible, in any case not exceeding the legally required period.
>
> **California residents (CCPA / CPRA).** California residents have additional specific rights under California Civil Code §§1798.100-1798.199. See [our CCPA disclosure at URL].

### ADD breach notification commitment

> **Security incident notification.** In the event of a personal data breach that creates a likely risk to your rights and freedoms, we will notify you without undue delay where required by applicable law (within 72 hours where GDPR applies). We will also notify the applicable supervisory authority as required.

### ADD sub-processor list reference + current entries

| Sub-processor | Role | Data processed | Region | DPA |
|---|---|---|---|---|
| Cloudflare R2 | Object storage (documents, images, assets) | Cert PDFs, KYB docs, label files | US (default) | [Link] |
| Stripe | Payment processing + KYC/KYB | Identity, banking, tax info | US | [Link] |
| Resend | Transactional email | Email address, message content | US | [Link] |
| Anthropic | AI services (recipe parsing — V1.5+) | Recipe text, ingredient queries | US | [Link] |
| Vercel | Hosting | All platform data in transit | US | [Link] |
| Sentry | Error monitoring | PII-scrubbed error context | US | [Link] |

(Counsel should confirm + sign DPAs with each before live operation. Public list mirrored at `/legal/subprocessors`.)

### ADD international data transfer disclosure

> **International transfers.** Some sub-processors are located in the United States. For users in the European Economic Area or the United Kingdom, we rely on Standard Contractual Clauses (SCCs) approved by the European Commission, supplemented by transfer impact assessments where required, as our primary transfer mechanism.

### Counsel review items for Privacy

- `[LAWYER REVIEW: breach timing windows per applicable law]` — already in draft. Confirm 72h GDPR is correctly stated and that US state breach notification laws are summarized correctly.
- Confirm CCPA disclosure language meets §1798.130 notice-at-collection requirements.
- Confirm DPA addenda are executed with all listed sub-processors before going live.

---

## Creator Agreement (`Creator_Agreement.docx`)

### MODIFY §3 (Creator-as-brand-owner of record) — strengthen with cert claim language

> You are the brand of record on all products produced via the Service. You bear sole responsibility for the truth, accuracy, completeness, and substantiation of all claims appearing on labels of products produced for you, including but not limited to nutritional claims, health claims, structure/function claims, certifying body claims (e.g., USDA Organic, Kosher, Non-GMO Project Verified, Vegan, Fair Trade), allergen statements, country of origin, and ingredient disclosures.
>
> Where the Service surfaces certifying body marks ("Cert Badges") or related claims attributable to a producing Partner, you acknowledge that:
>
> (a) iLaunchify reviews Partner-provided cert documents for apparent authenticity at the time of upload, and does not independently verify or guarantee current validity with the issuing body;
>
> (b) you bear final responsibility for any cert claim included on your label and for satisfying any audit, inspection, or substantiation request from the relevant certifying body, USDA, FDA, FTC, or other regulator;
>
> (c) you must give affirmative informed consent through the Service's Design Studio at the moment any Cert Badge is added to your label, acknowledging the responsibility allocation in this Section;
>
> (d) iLaunchify will provide you reasonable cert-related metadata (issuing body, document date, iLaunchify verification date) at the moment of consent so that you can make an informed decision.

### ADD §[new] — Consent-at-Claim records + audit trail

> You agree that the affirmative consent you give in the Design Studio when applying a cert claim to a label constitutes binding acknowledgment of the responsibility allocation in this Agreement. iLaunchify maintains audit-log records of these consent events (timestamp, your user identifier, IP address, label version, cert metadata at consent time) for the duration of our records retention period.

### MODIFY indemnification section — make broader

Current indemnification flows are partial. Counsel should expand to specifically address cert claim disputes:

> You will defend, indemnify, and hold harmless iLaunchify, its affiliates, and their respective officers, directors, employees, agents, and representatives (the "Indemnified Parties") from and against any third-party claim, action, demand, suit, or proceeding (a "Claim") and any related damages, judgments, costs, and reasonable attorneys' fees arising out of or relating to: (a) any product you place into commerce bearing a brand for which you are the brand of record; (b) any label content, claim, or representation appearing on such product; (c) any allegation that a cert claim made on your label is false, misleading, expired, or otherwise invalid; (d) any regulatory action, inspection, recall, civil penalty, or consumer claim related to your products. iLaunchify will defend you against Claims arising from iLaunchify's gross negligence or willful misconduct in performing the Service.

### ADD §[new] — Right of refusal for high-risk claim combinations

> iLaunchify reserves the right, in its sole discretion, to refuse to render label files that combine certain cert claims with product categories or formulations that present material misrepresentation risk. Such refusals will be communicated with a clear explanation and an opportunity to remediate.

### Counsel review items for Creator Agreement

- `[LAWYER REVIEW: brand-owner-of-record liability allocation]` — already flagged.
- Confirm that the Park doctrine (`United States v. Park`, 421 U.S. 658) implications are addressed — creator's corporate officers may have personal exposure.
- Confirm warranty disclaimer is enforceable in selected jurisdictions for B2B context.
- Tax / VAT pass-through language if going international.

---

## Partner Agreement (`Partner_Agreement.docx`)

### MODIFY §[verification] — collected document obligations + types by partner type

Add an explicit schedule of documents the Partner must provide and keep current, differentiated by Partner type:

> **Schedule X — Documentation Requirements.**
>
> By Partner type, the following documents must be uploaded during onboarding and maintained current. iLaunchify may suspend access for any Partner whose documentation is missing or expired beyond the applicable grace window (typically 30 days).
>
> **All Partner Types.**
> - Legal entity formation document (Articles of Incorporation, LLC Operating Agreement, partnership agreement, or sole proprietor DBA filing)
> - Government-issued ID of the authorized signer
> - Stripe Connect onboarding completion (covers KYC, beneficial ownership, tax forms)
> - Certificate of Insurance (General Liability minimum $1M/occurrence + $2M aggregate, with iLaunchify named as additional insured)
>
> **Manufacturer (Food / Beverage / Pet / Baby).** Additionally:
> - FDA Food Facility Registration confirmation (FSMA §415 / 21 C.F.R. Part 1 Subpart H)
> - Current cGMP certification (21 C.F.R. Part 117 for food, Part 507 for animal food)
> - Sanitation rating from local health authority (most recent score)
> - Written Recall Plan (FSMA §103)
> - Product Liability insurance $2M/occurrence minimum
>
> **Manufacturer (Supplement).** Additionally:
> - All Manufacturer requirements above
> - cGMP for Dietary Supplements certification (21 C.F.R. Part 111)
> - Adverse event reporting protocol attestation (21 U.S.C. §379aa-1)
>
> **Manufacturer (Cosmetic).** Additionally:
> - All Manufacturer requirements above
> - MoCRA facility registration confirmation (Pub. L. No. 117-328)
> - Cosmetic product listing confirmation
> - Safety substantiation policy attestation
>
> **Printer.**
> - All Partner Types requirements
> - Print quality / color management certifications if claimed (G7 Master, Idealliance, etc.)
> - PCI DSS if storing creator payment-card data (we expect not)
>
> **Co-Packer.**
> - All Manufacturer (Food) requirements above as applicable
> - Allergen management plan
>
> **Warehouse / Fulfillment.**
> - All Partner Types requirements
> - Storage facility license + temperature/humidity logs if storing cold-chain items
> - Insurance with goods-in-storage rider
>
> **Packaging Supplier.**
> - All Partner Types requirements
> - Substrate / material safety certifications where relevant (e.g., FDA food-contact compliance per 21 C.F.R. Part 174-178, BPA disclosures)

### ADD §[new] — Cert Misrepresentation

> You represent and warrant that any certification, license, registration, or permit you upload, declare, or otherwise represent through the Service is genuine, currently valid as of the date of upload, and held by the legal entity identified in your account. Knowingly false representations constitute material breach. Beyond contractual remedies, you acknowledge that misrepresentation of certifications may give rise to claims by affected Creators under common-law fraud (Restatement (Second) of Torts §525) and under the Uniform Commercial Code's express warranty provisions (UCC §2-313), and may expose your facility to direct regulatory action by FDA, USDA, FTC, or state authorities. iLaunchify will fully cooperate with affected Creators, regulators, and law enforcement in any such proceeding.

### ADD §[new] — Annual Re-Attestation

> You agree to re-attest the currency and accuracy of all uploaded documentation at least annually, or earlier if any document expires, is revoked, or you become aware of a material change. iLaunchify will notify you at least 30 days before known expirations and may suspend platform access until re-attestation is complete.

### ADD §[new] — Notification of Adverse Regulatory Events

> You will notify iLaunchify within 5 business days of: (a) any FDA, USDA, FTC, state, or local regulatory action against your facility or any product produced through the Service; (b) any recall, market withdrawal, or stop-sale of any product you have produced for an iLaunchify Creator; (c) any revocation, suspension, or non-renewal of any certification, license, or registration on file with iLaunchify; (d) any change in beneficial ownership of 25% or more; (e) any change in physical facility address or operating jurisdiction.

### MODIFY §18 (No Co-Manufacturer) — confirm + add reciprocal acknowledgment

> The parties acknowledge that:
> (a) iLaunchify does not own, operate, supervise, or control your facilities, equipment, personnel, formulations, or quality systems;
> (b) iLaunchify is not a co-manufacturer, co-packer, distributor, or holder of any product produced through the Service under 21 C.F.R. §101.5 or comparable regulatory provisions;
> (c) iLaunchify's role is limited to providing software, marketplace facilitation, document review for apparent authenticity, and payment intermediation through Stripe Connect;
> (d) Should the parties' relationship materially change (for example, if iLaunchify takes possession of inventory under a future "pooled production" arrangement), this Section will be revisited and amended in writing prior to such change.

### Counsel review items for Partner Agreement

- Confirm cGMP requirement language is enforceable as a representation/warranty.
- Confirm insurance limits + COI requirements are commercially reasonable.
- Confirm the "no co-manufacturer" framing survives current FDA enforcement reading.
- Confirm 5-business-day notification timing for adverse events is realistic operationally.

---

## Cross-document changes

### New referenced document: `subprocessors.md` published at `/legal/subprocessors`

Just the table from Privacy §sub-processor with last-updated date. Publish + maintain.

### New referenced document: `BREACH_RUNBOOK.md` (internal)

Per the C5 GDPR slice — runbook for 72h notification + admin incident response. Not partner-facing; internal ops.

### New referenced document: `LEGAL_AUTHORITIES.md` (this conversation)

Counsel reference, not partner-facing.

### Existing referenced document: `FDA_REGULATORY_POSTURE.md` + `FDA_COUNSEL_MEETING_AGENDA.md`

Already produced — the foundational analysis for the cert + label + claim chain framework.

---

## Versioning + re-consent

When any of the four docs receive material updates:
1. Increment the version number on each affected document (e.g., ToS v1.0 → v1.1).
2. The platform's `ConsentRecord` system flags all existing users for re-consent.
3. Users see a re-consent banner on next login. They cannot proceed with key actions until re-consenting.
4. The old version is archived with effective dates so historical audits can reconstruct which version applied at any past time.

This pattern is required by GDPR Article 7 (conditions for consent) and best practice for CCPA / state-law disclosure currency.

---

## Recommended counsel review timeline

| Document | Counsel review priority | Estimated review time |
|---|---|---|
| Privacy Policy + Sub-processor list | **High — V1-blocking** | 4-8 hours |
| Partner Agreement (with new Schedule X) | **High — V1-blocking before partner onboarding** | 8-12 hours |
| Creator Agreement | **High — V1-blocking** | 6-10 hours |
| ToS | **Medium — V1-blocking** | 6-10 hours |
| Breach runbook | **Medium — pre-launch** | 4 hours |
| LEGAL_AUTHORITIES.md | **Low — reference only** | optional review |

Total counsel budget: ~30-45 hours for the first full pass. Use a CPG / FDA-experienced lawyer + a privacy / GDPR specialist (often the same firm if mid-sized). Expect $10K-$25K depending on counsel's rates and complexity of revisions.
