# Legal Authorities — Reference for iLaunchify platform liability framework

**Not legal advice.** Reference document for Pavel + counsel. Citations to US federal statutes, CFR sections, and notable case law that support the recommendations in `FDA_REGULATORY_POSTURE.md`, the four legal drafts (`Terms_of_Service.docx`, `Privacy_Policy.docx`, `Creator_Agreement.docx`, `Partner_Agreement.docx`), and the certificate / consent-at-claim / KYB document-collection framework discussed in conversation. Counsel must validate jurisdiction, currency, and applicability before any of these citations are relied on contractually or operationally.

---

## 1. FDA labeling — who carries primary liability when a label claim is false or misleading

### Core misbranding statute

**Federal Food, Drug, and Cosmetic Act §403 — 21 U.S.C. §343.** Food is "misbranded" if its labeling is "false or misleading in any particular." False or misleading is the broadest possible standard — it captures both affirmatively wrong statements and material omissions. Misbranded food is prohibited from interstate commerce under 21 U.S.C. §331.

### Who carries it

**21 C.F.R. §101.5 — Name and place of business of the manufacturer, packer, or distributor.** The label must bear the "name and place of business of the manufacturer, packer, or distributor." Whoever's name appears as the responsible party is the brand of record and primary target of FDA enforcement. In an iLaunchify transaction the creator's brand name appears on the label, so the creator is the brand of record. This is the operative reason iLaunchify's Creator Agreement §3 allocates labeling liability to the creator.

### Criminal exposure

**21 U.S.C. §333.** Misbranding violations are misdemeanors (up to $1,000 / one year). Violations "with the intent to defraud or mislead" become felonies (up to three years). Knowledge of falsity → felony exposure for the responsible party.

### Strict liability for corporate officers

**United States v. Park, 421 U.S. 658 (1975)** — the Supreme Court's "responsible corporate officer" doctrine. A corporate officer with authority to prevent or correct a violation can be held personally liable under the FDCA even without proof of personal participation in the violation. Relevant to iLaunchify because: if the platform is read into the chain (e.g., V2 buffer inventory makes us a holder), officers can be personally liable. Hard reason to keep the platform out of the chain.

### Dietary supplements — DSHEA layer

**Dietary Supplement Health and Education Act of 1994 (DSHEA), Pub. L. No. 103-417.** Codified at 21 U.S.C. §321(ff). Supplements are regulated as a category of food but with their own labeling requirements (Supplement Facts panel) and structure/function claim regime. Brand of record carries primary liability per the same §343 misbranding standard.

**21 C.F.R. Part 101 Subpart F** — supplement labeling specifics.

**21 U.S.C. §379aa-1** — serious adverse event reporting requirement for supplement manufacturers, packers, distributors. Within 15 business days of receiving a serious adverse event report.

---

## 2. USDA National Organic Program — when an Organic claim is false

**Organic Foods Production Act of 1990, 7 U.S.C. §§6501-6524.**

**7 C.F.R. Part 205 — National Organic Program.** The NOP regs govern what can be labeled "organic" and require certification by USDA-accredited certifying agents.

**7 C.F.R. §205.100** — Persons subject to the Act. Anyone selling, labeling, or representing agricultural products as organic must be certified, with limited exemptions (under $5,000/year gross sales is exempt from certification but still subject to NOP standards).

**7 U.S.C. §6519** — penalties. Civil penalty up to $11,000 per violation (adjusted annually). Knowingly selling or labeling non-certified product as organic = misbranding under both NOP + FDCA.

### Who's targeted

NOP enforcement reaches the operation that places the product into commerce labeled "organic" — typically the brand of record. Creator carries primary exposure. Partner who falsely claimed an organic cert without holding one faces fraud + breach exposure to the creator + NOP penalties as the actual mfg.

---

## 3. FTC false advertising — separate but parallel claim risk

**Federal Trade Commission Act §5, 15 U.S.C. §45.** Prohibits "unfair or deceptive acts or practices in or affecting commerce." Cert-based claims on labels are advertising for FTC purposes.

**Lanham Act §43(a), 15 U.S.C. §1125(a).** Private right of action for false or misleading designations of origin / false advertising in commerce. Competitors can sue under this — broader and more available than FTC enforcement.

**16 C.F.R. Part 260 — Green Guides.** FTC's environmental marketing claims guidance. Relevant if cert claims include sustainability / climate / carbon-neutral language. Substantiation standard: "competent and reliable scientific evidence."

---

## 4. Platform liability — when does iLaunchify get pulled in

### Section 230 — limited shield for FDA-regulated speech

**47 U.S.C. §230.** Communications Decency Act §230 immunizes "interactive computer service" providers from liability for third-party content. **But there are key carve-outs:**

- **Federal criminal liability** — §230(e)(1). Knowing/willful misbranding is criminal under 21 U.S.C. §333. Section 230 does NOT shield a platform from federal criminal exposure.
- **Intellectual property** — §230(e)(2). Trademark claims (false cert badges = trademark misuse) not shielded.
- **Material contribution doctrine** — see Roommates.com below.

### Material contribution = no §230 shield

**Fair Housing Council of San Fernando Valley v. Roommates.com, LLC, 521 F.3d 1157 (9th Cir. 2008) (en banc).** Section 230 immunity does NOT extend to a platform's own content or content the platform materially contributes to creating. If iLaunchify auto-stamps a cert badge on a label, the platform is no longer a neutral conduit for the partner's claim — it is materially contributing to the label content. Section 230 protection drops.

**This is the single most important case for the "do not auto-stamp" recommendation.**

### Failure-to-warn survives §230 in some cases

**Doe v. Internet Brands, Inc., 824 F.3d 846 (9th Cir. 2016).** Section 230 didn't shield Internet Brands from a failure-to-warn claim where the platform had information that could have prevented harm. Read with Roommates: platforms that know about a misrepresentation and don't act can face liability beyond §230.

### Marketplace strict-liability trend

**Bolger v. Amazon.com, LLC, 53 Cal. App. 5th 431 (2020).** California Court of Appeal held Amazon strictly liable for a defective product sold via Fulfilled by Amazon, reasoning Amazon was an integral part of the distribution chain. Several states have followed; others have rejected. **Trend:** marketplaces that materially participate in the transaction (custody, fulfillment, payment processing, claim curation) face increasing exposure as distribution chain participants.

**Loomis v. Amazon.com, LLC, 63 Cal. App. 5th 466 (2021).** Extended Bolger to third-party fulfillment scenarios. The more iLaunchify orchestrates (manifest, multi-partner workflow), the more marketplace-strict-liability arguments apply.

### Federal preemption arguments are weak for cert claims

Some platforms argue federal preemption (FDA exclusively regulates labeling). For state consumer protection / fraud / negligence claims based on false cert claims, preemption defenses generally fail because state law is enforcing fraud, not labeling content. **Cohen v. ConAgra Brands, 16 F.4th 1283 (9th Cir. 2021)** is one of several recent rulings refusing preemption defenses on similar facts.

### Practical platform posture

The defensible position is: **collect documentation + verify lightly + precisely disclose what we did and did not verify + require creator informed consent at the moment of claim use + carry insurance + index strong contractual indemnification.** This is the standard B2B marketplace defense package and reads well against current case law.

---

## 5. Partner fraud — when the partner lies about holding a cert

### Common law fraud (state-specific, generally aligned)

**Restatement (Second) of Torts §525.** Elements of fraudulent misrepresentation:
1. A false representation (the cert claim)
2. Knowledge of falsity or reckless disregard
3. Intent to induce reliance
4. Justifiable reliance by the plaintiff
5. Damages

A partner who uploads a fake cert or attests to a cert they don't hold satisfies all five elements when an iLaunchify creator relies on the claim and suffers regulatory action.

### Express warranty under the UCC

**UCC §2-313.** Affirmations of fact by the seller about the goods become express warranties. A partner's cert claim is an express warranty in commerce. Breach = damages flow.

### Magnuson-Moss Warranty Act

**15 U.S.C. §§2301-2312.** Federal warranty statute, primarily consumer-facing but creates additional remedies for breach-of-warranty claims.

---

## 6. KYC/KYB obligations — what platforms must collect

### Bank Secrecy Act / FinCEN

**31 U.S.C. §§5311 et seq. (Bank Secrecy Act).** Anti-money-laundering framework.

**31 C.F.R. §1010.230 — Customer Due Diligence Rule (CDD Rule).** Requires identification of beneficial owners (25%+ ownership) of legal entity customers. Applies to "covered financial institutions" — Stripe Connect handles this on iLaunchify's behalf for payment flow.

**Corporate Transparency Act, 31 U.S.C. §5336 (effective 2024).** Beneficial ownership reporting to FinCEN. iLaunchify doesn't file these reports for partners, but partners as separate legal entities have their own filing obligations.

### Tax reporting

**26 U.S.C. §6041 — General 1099 reporting.**

**26 U.S.C. §6050W — 1099-K for payment settlement entities.** Stripe handles 1099-K generation for partners receiving payouts. iLaunchify obligations are minimal as long as the payment flow stays in Stripe Connect.

### OFAC sanctions

**50 U.S.C. §1701 et seq. (IEEPA).** Cannot transact with sanctioned parties. Stripe Connect screens against OFAC SDN list.

---

## 7. FDA Food Facility Registration — what partners must register

**FDA Food Safety Modernization Act §415, 21 U.S.C. §350d.**

**21 C.F.R. Part 1 Subpart H.** Required registration for any facility that manufactures, processes, packs, or holds food for consumption in the United States. Biennial renewal (even-numbered years, Oct 1 — Dec 31). Public registration database — iLaunchify can verify partner FFR numbers.

**iLaunchify is NOT a "facility"** under this section in V1 (Mode 1 direct routing — we never take physical custody). **iLaunchify BECOMES a facility** under V2 if we hold pooled inventory. This is the regulatory flip flagged in `FDA_REGULATORY_POSTURE.md` §8.

### cGMP regs by category

- **21 C.F.R. Part 117** — Current Good Manufacturing Practice, Hazard Analysis, and Risk-Based Preventive Controls for Human Food. FSMA implementation.
- **21 C.F.R. Part 111** — cGMP for Dietary Supplements. Stricter than Part 117. Required for any supplement manufacturer.
- **21 C.F.R. Part 211** — cGMP for Finished Pharmaceuticals. OTC drugs.
- **21 C.F.R. Part 507** — cGMP for Animal Food. Pet food facilities.

### MoCRA — cosmetic facility registration

**Modernization of Cosmetics Regulation Act of 2022, Pub. L. No. 117-328.** New FDA-administered cosmetic regulation regime.

- Facility registration required (most exemptions for small businesses lapsed July 2024).
- Product listing required.
- Adverse event reporting required.
- Safety substantiation required.

iLaunchify cosmetic partners must register their facilities with FDA + list products. Collecting their MoCRA confirmation number is sensible verification.

---

## 8. Data protection — GDPR, CCPA, state laws

### GDPR (EU + EEA)

**Regulation (EU) 2016/679 — General Data Protection Regulation.**

Key articles:
- **Article 5** — Principles (lawful, fair, transparent; purpose limitation; data minimization).
- **Article 6** — Lawful basis for processing (consent, contract, legitimate interest, etc.).
- **Article 13/14** — Information to be provided at collection.
- **Article 15** — Right of access by data subject.
- **Article 17** — Right to erasure ("right to be forgotten").
- **Article 20** — Right to data portability.
- **Article 28** — Processor obligations + sub-processor disclosure.
- **Article 30** — Records of processing activities.
- **Article 32** — Security of processing.
- **Article 33** — Notification of personal data breach to supervisory authority (72 hours).
- **Article 34** — Communication of breach to data subjects.
- **Article 83** — Administrative fines up to €20M or 4% of global annual revenue, whichever higher.

GDPR applies to any processing of personal data of persons in the EU, regardless of the controller's location (Article 3 — extraterritorial scope). The moment iLaunchify processes EU resident data, GDPR applies.

### CCPA / CPRA (California)

**California Consumer Privacy Act, Cal. Civ. Code §§1798.100-1798.199.100.** Amended by the California Privacy Rights Act (Prop 24).

Thresholds (one or more triggers applicability):
- $25M annual revenue, OR
- Personal info of 100,000+ California consumers/households, OR
- 50% or more annual revenue from selling/sharing personal info.

Key rights:
- **§1798.100** — Right to know.
- **§1798.105** — Right to delete.
- **§1798.110** — Right to access.
- **§1798.120** — Right to opt out of sale/sharing.
- **§1798.155** — Penalties. $2,500 per violation, $7,500 per intentional violation or violation involving minors.

iLaunchify likely BELOW CCPA thresholds in V1 beta but should architect for compliance — adding CCPA later is migration-hostile.

### Other US state privacy laws

Virginia (VCDPA), Colorado (CPA), Connecticut (CTDPA), Utah (UCPA), Texas (TDPSA), and ~10 more states have enacted comprehensive privacy laws. Mostly aligned with CCPA + GDPR principles. Counsel should review state-by-state thresholds.

### PIPEDA (Canada, V1.1 forward-pointer)

**Personal Information Protection and Electronic Documents Act.** Required if iLaunchify processes Canadian resident data when V1.1 Canada ships.

### Health Insurance Portability and Accountability Act — N/A

**HIPAA, 42 U.S.C. §§1320d-1320d-9 + regs at 45 C.F.R. Parts 160, 162, 164.** Applies to "covered entities" (healthcare providers, health plans, healthcare clearinghouses) and their business associates. **iLaunchify is NOT a covered entity** under HIPAA. Supplement / nutrition products are not healthcare. No HIPAA obligations triggered.

---

## 9. Document retention — how long to keep cert PDFs + KYB documents

There is no single statutory answer; counsel synthesizes from multiple regimes:

- **FDA records (general)** — 21 C.F.R. §117.315 requires food safety records retained "at least 2 years after the date they were prepared" for facilities subject to Part 117. Records that document the supplier's compliance: 3 years. Hazard-analysis records: as long as analysis is in effect plus 2 years.
- **FDA records (FSMA Foreign Supplier Verification)** — 21 C.F.R. §1.510(b) — 2 years.
- **USDA NOP records** — 7 C.F.R. §205.103 — 5 years from date of creation.
- **Tax records (general)** — IRS recommends 7 years for income/expense documentation; 1099 records 4 years per 26 C.F.R. §31.6001-1.
- **Stripe Connect / payment records** — Stripe retains; PCI DSS adjacent obligations.
- **Recall reconstructive purposes** — practical norm is 5-7 years.
- **GDPR / CCPA** — data minimization principle requires deletion when no longer needed for purpose. Retention beyond purpose-need requires legal basis.

**Recommended platform-wide default: 7 years.** Aligns with the longest tax retention horizon, covers most FDA records, and matches what insurers typically expect for product liability defense. Specific document types can have shorter retention if the use case allows (e.g., a partner's expired cert PDF could be reduced to 3 years).

---

## 10. Insurance — what platforms in this space carry

Not strictly legally required for SaaS, but operationally and contractually mandatory:

- **General Liability** ($1M-$2M per occurrence) — bodily injury / property damage from platform operations.
- **Errors & Omissions (E&O) / Tech Professional Liability** ($1M-$2M) — defective service, missed verification, etc.
- **Cyber Liability** ($1M-$5M) — data breach, ransomware, regulatory fines coverage. Often includes breach notification cost.
- **Directors & Officers (D&O)** — for the corporate officers; relevant given the FDC Act Park doctrine.
- **Product Liability — only if iLaunchify takes inventory (V2)** — wouldn't be carrying product liability in V1 because we don't touch goods.

Partner-side: iLaunchify's Partner Agreement should require partners to maintain General Liability + Product Liability + name iLaunchify as additional insured. Standard COI delivery before activation.

---

## 11. Selected case law for the doc collection / verification posture

### Reasonable care defense

**Restatement (Second) of Torts §324A — Liability to Third Person for Negligent Performance of Undertaking.** Platform that undertakes a verification function and performs it negligently can be liable to third parties relying on the verification. The corollary: if we ONLY undertake "apparent authenticity at upload" and document it precisely, our duty is narrow. If we represent "we verify currency with the issuing body" and don't, we expand our exposure under §324A.

This is the legal mechanism that makes precise verification-scope language so important.

### Common-law fraud exposure for failure to disclose

**Restatement (Second) of Torts §551 — Liability for Nondisclosure.** A party with superior knowledge of a material fact has a duty to disclose in certain relationships. iLaunchify learning a cert is fraudulent and not informing the creator → potential §551 exposure. The corollary: when we discover a fraud, we must act + disclose to affected creators (audit trail of notice).

---

## 12. The summary table — what backs each recommendation

| Recommendation | Primary authority |
|---|---|
| Creator carries primary FDA labeling liability | 21 U.S.C. §343 + 21 C.F.R. §101.5 |
| Cert PDFs must be collected (not just attested) | Roommates.com material contribution + §324A reasonable care |
| Verification scope must be precisely worded | §324A — duty is what you undertake |
| Auto-stamping cert badges is high risk | Roommates.com — material contribution defeats §230 |
| Creator must give informed consent at claim moment | §324A + reliance element of fraud |
| Stripe Connect handles KYC/KYB | 31 C.F.R. §1010.230 (CDD Rule) |
| Collect FFR numbers from food/supp partners | 21 U.S.C. §350d, 21 C.F.R. Part 1 Subpart H |
| Collect cGMP cert from food/supp/cosmetic partners | 21 C.F.R. Parts 117 / 111 / 211 / 507 |
| Collect COI naming iLaunchify as additional insured | Common law / insurer standard practice |
| Right to deletion + 7-year retention default | GDPR Art. 17 + Cal. Civ. Code §1798.105 + 21 C.F.R. §117.315 |
| Breach notification within 72h | GDPR Art. 33-34 + state breach notification laws |
| Sub-processor disclosure | GDPR Art. 28 |
| MoCRA registration for cosmetic mfrs | Pub. L. No. 117-328 |
| iLaunchify becomes a "facility" if V2 takes inventory | 21 U.S.C. §350d (FSMA §415) |
| Park doctrine puts officers personally on hook if platform becomes responsible party | United States v. Park, 421 U.S. 658 (1975) |
| Marketplace strict liability is increasingly available against platforms that materially participate | Bolger v. Amazon (Cal. 2020) + Loomis (Cal. 2021) |

---

## 13. Trademark + license-fee considerations for cert + symbol asset library

When iLaunchify hosts a curated library of cert badges (USDA Organic seal, Non-GMO Project butterfly, Kosher OU mark, etc.) and packaging symbols, the platform takes on trademark + licensing exposure that needs to be addressed before the library goes live.

### Trademark status of cert marks

Most cert body marks are federally registered trademarks. The certifying body owns the mark; partner certification grants the partner a license to use the mark in commerce per the cert body's brand standards. Examples:

- **USDA Organic seal** — registered trademark of USDA (Reg. No. 2,914,029 + several variants). 7 C.F.R. §205.311 governs use.
- **Non-GMO Project Verified butterfly** — registered trademark of The Non-GMO Project, Inc.
- **Kosher OU symbol** — registered certification mark of Orthodox Union (Reg. No. 654,872).
- **Fair Trade Certified seal** — registered trademark of Fair Trade USA.
- **B Corp logo** — registered trademark of B Lab.

Unauthorized reproduction = trademark infringement under the Lanham Act (15 U.S.C. §§1114, 1125). Liability flows even if iLaunchify never charges for the mark — fair use defenses are narrow for cert marks.

### Three legal-posture options for the asset library

**Option A — Partner uploads their own cert-body-issued artwork.** No platform library. Partner uses their existing license. Lowest platform exposure. But partner-on-partner artwork quality varies, complicates the Design Studio asset drawer, and creates inconsistent presentation.

**Option B — Platform library, partners use under their existing license.** iLaunchify hosts curated SVGs; partners who have the cert have an existing license from the cert body that extends to use of approved artwork. The platform is providing tooling, not granting independent license. **Most common B2B marketplace pattern.** Acceptable for many cert bodies, particularly those whose brand standards explicitly permit "any approved digital reproduction of the mark by a licensed user." But counsel must confirm per cert body — some require platform-level licensing OR per-mark fees.

**Option C — iLaunchify negotiates platform-level licensing with each cert body.** Most legally robust. Often free for non-commercial-uplift uses, sometimes a nominal fee, occasionally meaningful per-mark licensing (Non-GMO Project notably). Required when the cert body explicitly does not permit third-party tooling to render their mark.

**Recommended hybrid:** Option B as the default with explicit per-cert confirmation. Where confirmation fails or licensing is unclear, fall back to Option A (partner uploads their own approved artwork at the `PartnerCertificateInstance` level) for that specific cert.

### Specific cert bodies known to require attention

Counsel should specifically contact / research:

- **Non-GMO Project** — licensing model published at [their site]; software-rendered use of the butterfly mark typically requires explicit permission. Likely Option C or fallback to Option A.
- **Kosher OU** — symbol use policy at oukosher.org/use-of-the-ou-symbol-policy/; generally requires written authorization for any reproduction outside the labeled product.
- **Fair Trade USA** — partner pays per-product licensing; iLaunchify's role in rendering vs the partner's licensed use needs clarification.
- **USDA Organic seal** — 7 C.F.R. §205.311 governs reproduction; arguably permits any rendering that complies with brand standards by a licensed user (the partner).
- **B Corp** — marketing guidance published; software rendering with proper attribution generally permitted.
- **MoCRA-related cosmetic marks** — newly-implemented FDA regime; reproduction policy still evolving.

### Brand-standards compliance — separate liability surface

Even with proper licensing, the rendered mark must comply with cert body brand standards (size, color, clear space, co-text). Non-conforming reproduction = brand-misuse claim by the cert body even if iLaunchify is licensed. The C7 Asset Library schema captures these standards per `CertificateAssetVariant` (minWidthMm, approvedColorSpec, requiredCoText, clearSpaceFactor); C8 Design Studio enforces them via canvas object rules. This is the operational reason the asset library schema is rich rather than simple "name + SVG."

### License fees — operational cost

Most cert bodies do NOT charge platform licensing fees when partner-licensed use is the underlying basis. Notable exceptions (subject to current confirmation by counsel):

- **Non-GMO Project** — annual licensing model possible
- **NSF Certified Sport** — per-product or annual fees common
- **B Corp** — typically free for legitimate users
- **USDA Organic** — no license fee, just compliance with brand standards
- **Fair Trade USA** — per-product licensing tied to certification, no separate platform fee
- **Most other certs** — typically no platform fee

Budget assumption: $0-$5,000/year in platform-level mark licensing for the first 20 priority certs, assuming Option B works for most.

### Indemnification posture

Partner Agreement should warrant that the partner is properly licensed by the cert body to use the marks they upload + claim. iLaunchify gets indemnified against any cert body claim arising from partner-cert mismatch. This is the contractual backstop when license confirmation fails downstream.

### Trademark registration considerations for iLaunchify itself

While unrelated to cert library, worth noting: iLaunchify's own marks (logo, wordmark, slogans) should be federally trademark-registered if not already. ~$350/class USPTO filing + ~$1,500-2,500 counsel fees. Defensive registration prevents partner-side or competitor-side trademark issues later.

### Action items for counsel

1. **Per-cert license confirmation pass** — for the ~85 certs in `docs/builds/_certificates-master-catalog.json`, confirm Option B is permissible. Where unclear, fallback to Option A for that cert.
2. **Partner Agreement warranty + indemnification language** — confirm the Agreement properly shifts cert-license risk to the partner.
3. **Brand standards enforcement** — confirm C8's canvas rules are sufficient to defeat brand-misuse claims.
4. **Cert body negotiations** — if Option C is required for any high-priority cert (Non-GMO Project most likely), counsel leads the conversation with the cert body's licensing contact.

---

## 14. What to do with this document

1. **Hand to counsel** along with the four legal drafts at `docs/legal/*.docx`. Use as the citation backbone for the contractual language they'll redline.
2. **Treat as living** — update when new state privacy laws pass (Maryland, New Jersey, others have bills pending) or when MoCRA implementation guidance materially changes.
3. **Internal training reference** — anyone on the iLaunchify team thinking about a new feature that touches certs, claims, or partner data should read §4, §5, §6, §8, §13 before designing.
4. **Never cite this document AS LEGAL ADVICE.** It is a structured reference for counsel-led decisions.
