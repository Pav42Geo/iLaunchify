# US Web Accessibility Law and the Design-Token Layer — Research Report for iLaunchify

*Prepared June 2026. Summarizes the US legal landscape for digital accessibility and maps it onto a design-token / theming layer. Informational, not legal advice; where the law is genuinely unsettled, that is flagged. Consult accessibility counsel before relying on any compliance posture.*

---

## Executive summary

There is no US statute or federal regulation that names a technical accessibility standard for *private* business websites. Despite that, **WCAG 2.1 Level AA has become the de facto legal benchmark** — through the volume of ADA settlements and case law that cite it, and through the U.S. Department of Justice's April 2024 adoption of WCAG 2.1 AA as the binding standard for *state and local governments*. For a B2B platform like iLaunchify, the structural ADA analysis cuts in the company's favor — purely business-facing, login-gated software does not map cleanly onto any of the twelve enumerated "public accommodation" categories — but **the uncertainty is real, not resolved, and the public, unauthenticated surfaces (marketing site, public marketplace, product detail, signup, pricing) are the genuine exposure.** California's Unruh Act (with its $4,000-per-offense statutory-damages floor) and New York's state/city human-rights laws make those two states the litigation epicenter, and roughly 4,000+ digital-accessibility lawsuits are filed each year.

A design-token / theming layer can *enforce* a meaningful subset of WCAG AA automatically — principally the contrast, minimum-font-size, focus-ring, and target-size criteria. It **cannot** cover semantic HTML, keyboard operability, ARIA, alt text, form labeling, or screen-reader behavior, which must be tracked and tested separately. The recommendation is to adopt WCAG 2.1 AA as the internal target, bake the token-governed criteria into "Theme Studio" as automated publish-gates with the exact thresholds set out in §7 below, and maintain a separate component/markup checklist for everything tokens cannot reach.

---

## 1. The core standard: why WCAG 2.1 AA, and what A/AA/AAA mean

The ADA was enacted in 1990, predates the consumer web, and its text speaks only of "places of public accommodation," a duty of "full and equal enjoyment," and "auxiliary aids and services." It names no website standard. DOJ draws the analogy itself: a technical standard "says specifically what is needed for something to be accessible," like the [2010 ADA Standards for Accessible Design](https://www.ada.gov/law-and-regs/design-standards/2010-stds/) that dictate ramp slopes and door widths — but no binding equivalent exists for the web for private business.

Into that vacuum, courts, regulators, and settlements converged on the **Web Content Accessibility Guidelines (WCAG)**, the consensus standard published by the World Wide Web Consortium (W3C). DOJ's March 2022 web-accessibility guidance names WCAG only as *"helpful guidance"* and says businesses "can currently choose how they will ensure" their online services are accessible — it has "no legally binding effect" ([ADA.gov web guidance](https://www.ada.gov/resources/web-guidance/); [DOJ press release](https://www.justice.gov/archives/opa/pr/justice-department-issues-web-accessibility-guidance-under-americans-disabilities-act)). WCAG's status as *the* benchmark rests on (a) the body of litigation and consent decrees that cite WCAG 2.1 AA, and (b) DOJ's 2024 decision to make WCAG 2.1 AA binding for governments (§3 below).

**Versions.** WCAG 2.0 (2008), WCAG 2.1 (2018), and WCAG 2.2 — which became a finished [W3C Recommendation on 5 October 2023](https://www.w3.org/WAI/news/2023-10-05/wcag22rec/) and was later approved as ISO/IEC 40500:2025 — adding nine new success criteria over 2.1. **WCAG 2.2 is not yet referenced in any binding US law**: the DOJ Title II rule points to 2.1 and Section 508 to 2.0. WCAG 3.0 remains an early Working Draft; per [W3C](https://www.w3.org/WAI/standards-guidelines/wcag/wcag3-intro/), it "is not expected to be a completed W3C standard for a few more years," "will not supersede WCAG 2," and 2.x "will not be deprecated for at least several years after WCAG 3 is finalized."

**Conformance levels.** WCAG defines three cumulative levels — **A** (minimum), **AA**, and **AAA** (highest) ([W3C Understanding Conformance](https://www.w3.org/WAI/WCAG22/Understanding/conformance)). Level AA requires satisfying all Level A *and* all Level AA criteria; Level AAA adds the AAA criteria on top. **AA is the legal target** because it is the level the laws actually cite, and because W3C itself discourages requiring AAA site-wide: *"It is not recommended that Level AAA conformance be required as a general policy for entire sites because it is not possible to satisfy all Level AAA Success Criteria for some content"* ([W3C Understanding Conformance](https://www.w3.org/WAI/WCAG22/Understanding/conformance)). AA is the highest universally achievable level, making it the natural regulatory floor.

---

## 2. ADA Title III: does it reach a B2B platform?

Title III prohibits disability discrimination by "places of public accommodation." Two questions matter for iLaunchify: does Title III reach websites at all, and does it reach a *business-only* platform.

**Does Title III reach websites?** DOJ says yes, via the ADA's general effective-communication duty — but there is a **genuine, unresolved circuit split** over whether a website must have a *nexus* to a physical "place." The narrower view requires a physical-place connection (the **9th, 3rd, and 6th Circuits**); the broader view holds that a website can itself be a public accommodation, no physical place required (the **1st, 2nd, and 7th Circuits**, the last via Judge Posner's *Doe v. Mutual of Omaha*). The 4th, 5th, 8th, and 10th Circuits are unsettled. The 11th Circuit's 2021 *Gil v. Winn-Dixie* opinion — holding websites are *not* themselves public accommodations — was **vacated on mootness grounds in December 2021**, leaving that circuit without binding precedent ([Congressional Research Service, LSB10844](https://www.congress.gov/crs-product/LSB10844); [Perkins Coie](https://perkinscoie.com/insights/blog/eleventh-circuit-vacates-ruling-websites-are-not-public-accommodations-under-ada)).

**The anchor case** is *Robles v. Domino's Pizza* (9th Cir. 2019). The court held the ADA covered Domino's website and app because *"the ADA applies to the services of a public accommodation, not services in a place of public accommodation,"* and the site "connected customers to the goods and services of Domino's physical restaurants" ([Justia](https://law.justia.com/cases/federal/appellate-courts/ca9/17-55504/17-55504-2019-01-15.html)). That is the *nexus* theory: the website was covered *because* it linked to physical pizza restaurants. The Supreme Court [denied certiorari on October 7, 2019](https://www.adatitleiii.com/2019/10/supreme-court-declines-to-review-ninth-circuit-decision-in-robles-v-dominos-exposing-businesses-to-more-website-accessibility-lawsuits/), leaving the framework intact.

**Is a B2B platform a "public accommodation"?** This is where the uncertainty is sharpest, and the structure of the statute cuts in iLaunchify's favor. Title III defines a public accommodation only as a private entity falling within one of **twelve enumerated categories** in [42 U.S.C. § 12181(7)](https://www.law.cornell.edu/uscode/text/42/12181) — lodging, restaurants, theaters, sales/rental establishments, service establishments (banks, law/accounting offices, pharmacies, healthcare), and so on. The categories are consumer- and public-facing, and **there is no "general commercial services" or "any business" catch-all**; the catch-all phrases ("or other sales or rental establishment") are read under *ejusdem generis* to mean similar consumer-facing establishments. Three further structural points reinforce the favorable read:

- **Title III's gating concept is "open to the public."** The ADA separately defines "commercial facilities" — privately owned nonresidential spaces (factories, warehouses, office buildings) that do *not* provide goods or services directly to the public — and subjects them only to new-construction/alteration design standards, *not* the broad effective-communication duty ([archived ADA.gov Title III](https://archive.ada.gov/ada_title_III.htm)). A closed, business-only operation is the closest analog, and Congress deliberately gave such facilities a *narrower* obligation.
- **Employee-facing tools fall under Title I (employment), not Title III.** An internal HR, training, or partner-operations portal is a Title I reasonable-accommodation question, not a public-accommodation question ([EEOC](https://www.eeoc.gov/publications/ada-your-responsibilities-employer)).
- **Business-facing (B2B) software is the genuinely uncertain middle.** No appellate court has squarely held that a login-gated B2B SaaS *is* a public accommodation — but none has squarely *immunized* one either. The question is litigated fact-specifically at the district-court level, and the broad-reading circuits' functional approach gives plaintiffs room to argue ([ABA Business Law Today, 2025](https://www.americanbar.org/groups/business_law/resources/business-law-today/2025-august/digital-accessibility-under-title-iii-ada/)).

**The practical upshot for iLaunchify.** B2B status *reduces but does not eliminate* exposure. The authenticated creator/partner/admin applications are the lower-risk zone. But a B2B marketplace still has a **public front door** — the marketing landing pages, /pricing, the public /marketplace listings, public product-detail pages, /launch/[niche], and signup — and these are open to the general public, look like a covered "sales establishment" front door, and are reachable by a tester *without an account*. They are the realistic exposure and should be made WCAG-conformant defensively even though no Title III technical standard binds them. Litigation volume reinforces the point: roughly **2,452 federal website-accessibility suits in 2024**, with a rising share now filed pro se ([Seyfarth/ADA Title III](https://www.adatitleiii.com/2025/04/federal-court-website-accessibility-lawsuit-filings-continue-to-decrease-in-2024/)).

---

## 3. ADA Title II and the DOJ April 2024 rule (governments, not B2B firms)

On **April 24, 2024**, DOJ published a final rule under ADA Title II making a specific WCAG version the binding standard for state and local government web content and mobile apps. The key requirement: *"The Web Content Accessibility Guidelines (WCAG) Version 2.1, Level AA is the technical standard for state and local governments' web content and mobile apps"* ([ADA.gov fact sheet](https://www.ada.gov/resources/2024-03-08-web-rule/); [Federal Register](https://www.federalregister.gov/documents/2024/04/24/2024-07758/nondiscrimination-on-the-basis-of-disability-accessibility-of-web-information-and-services-of-state)).

**Important update on deadlines.** The original rule set compliance dates of roughly April 2026 (large entities, 50,000+ population) and April 2027 (smaller entities). Those were **extended by one year** via a DOJ Interim Final Rule published [April 20, 2026](https://www.federalregister.gov/documents/2026/04/20/2026-07663/extension-of-compliance-dates-for-nondiscrimination-on-the-basis-of-disability-accessibility-of-web). The **current** deadlines are **April 26, 2027** (50,000+ persons) and **April 26, 2028** (smaller and special-district governments).

**This rule binds governments, not private B2B firms.** It reaches public entities — public schools, universities, courts, libraries, transit, public hospitals — and explicitly flows to their *vendors and contractors* (a county web page must meet WCAG 2.1 AA "even if a local web design company made the web page"). It does **not** directly regulate private commercial entities, which fall under Title III, for which DOJ has issued no web rule. But it matters for iLaunchify because it is the **first US federal regulation to name a specific WCAG version + level as *the* technical standard**, giving courts and litigants a concrete, government-blessed benchmark to apply by analogy in Title III cases, and feeding a procurement expectation that private buyers increasingly write into contracts. This is a "pull-along" effect on private expectations, not a direct mandate — a distinction worth stating plainly rather than overclaiming.

---

## 4. Section 508 (federal procurement)

Section 508 of the Rehabilitation Act requires *federal agencies'* information and communication technology (ICT) — websites, software, documents — to be accessible. It is fundamentally a federal-agency and procurement obligation, governed by the Revised 508 Standards at 36 CFR Part 1194 ([Section508.gov](https://www.section508.gov/develop/applicability-conformance/)).

It would bind iLaunchify only **through procurement** — if iLaunchify sold to, or delivered services through, a federal agency, the agency's obligation to buy conformant ICT flows into the contract, typically documented via a VPAT / Accessibility Conformance Report. The trigger is "selling ICT to or through a federal agency," not general commercial activity. The incorporated standard is older than Title II's: the 2017 "Refresh" incorporated **WCAG 2.0 Level A and AA** by reference — *"The Revised 508 Standards incorporate by reference the WCAG 2.0 Level AA Success Criteria"* ([Section508.gov](https://www.section508.gov/develop/applicability-conformance/)). For a CPG production marketplace, federal sales are unlikely in V1, so Section 508 is a low-probability trigger — but if any government-adjacent procurement appears, a WCAG 2.1 AA posture already exceeds the 2.0 AA floor it would require.

---

## 5. State laws: where the real private-sector risk lives

The federal Title III picture is ambiguous; **the concrete private-sector damages exposure comes from state law**, concentrated in California and New York.

**California — Unruh Civil Rights Act (the sharpest exposure).** Civil Code § 51(f) folds the entire federal ADA into California law, so *any ADA violation is automatically an Unruh violation*. Crucially, Unruh carries **statutory damages** where the ADA gives none: Civil Code § 52(a) provides liability "for each and every offense... in no case less than four thousand dollars ($4,000), and any attorney's fees" ([Cal. Civ. Code § 52, Justia](https://law.justia.com/codes/california/code-civ/division-1/part-2/section-52/)). The ADA itself allows only injunctive relief and fees; routing the claim through Unruh unlocks the $4,000-per-offense floor (trebled up to actual damages) plus fees. And no intent is required — *Munson v. Del Taco* (2009) held a plaintiff need not prove intentional discrimination to recover § 52(a) damages on an ADA-predicated claim ([CASp California](https://www.caspcalifornia.com/resources/unruh-civil-rights-act)). This per-offense statutory-damages mechanism is **why California is the single most dangerous jurisdiction** for a public-facing site.

**New York — the co-epicenter.** Plaintiffs use the New York State Human Rights Law, State Civil Rights Law, and New York City Human Rights Law, all of which define disability and public accommodation more broadly than the ADA and — critically — **allow monetary damages** ([Level Access](https://www.levelaccess.com/compliance-overview/new-york-human-rights-laws/)). New York led the country with roughly **1,108 web-accessibility lawsuits in 2025** and was the busiest federal venue in 2024 ([ADAQuickScan](https://adaquickscan.com/blog/new-york-ada-website-compliance-2026-lawsuits-guide); [Seyfarth](https://www.adatitleiii.com/2025/04/federal-court-website-accessibility-lawsuit-filings-continue-to-decrease-in-2024/)). A notable trend is plaintiff firms migrating from federal ADA claims into NY state/city courts to chase damages.

**California AB 434 and Colorado HB21-1110 — government-only.** AB 434 (Gov. Code § 11546.7) requires *California state agencies* to certify their websites meet WCAG 2.0 AA ([BOIA](https://www.boia.org/blog/what-is-californias-ab-434-accessibility-law-and-why-it-matters)). Colorado HB21-1110 requires *state and local government* digital platforms to conform to WCAG 2.1 AA, with enforcement now effective July 1, 2025 after a one-year grace period, and a $3,500-per-violation fine — but the obligation runs to government bodies ([Level Access](https://www.levelaccess.com/blog/hb-21-1110-colorado-accessibility-law/); [Colorado OIT](https://oit.colorado.gov/standards-policies-guides/guide-to-accessible-web-services/faq-hb21-1110-colorado-laws-for-persons)). **Neither directly binds a private B2B marketplace.** They matter only as standard-setters (both point at WCAG AA) and as flow-down obligations *if* iLaunchify ever sells to a covered government entity.

**The litigation explosion.** UsableNet tracks roughly **4,000+ digital-accessibility lawsuits per year** (federal + state) — about 4,600 in 2023 and ~4,000 in 2024, with the state-court share rising ([UsableNet 2024](https://blog.usablenet.com/2024-digital-accessibility-lawsuit-report-relased-insights-for-2025)). NY and CA state-court filings together accounted for roughly 40% of 2024 cases. Two trends bear directly on iLaunchify's strategy: **(a) accessibility overlays/widgets are now a litigation magnet, not a defense** — over 1,000 of 2024's suits (25%+) targeted sites that *already had* a widget, and in January 2025 the FTC ordered overlay vendor accessiBe to [pay $1 million for deceptive WCAG-compliance claims](https://www.ftc.gov/news-events/news/press-releases/2025/01/ftc-order-requires-online-marketer-pay-1-million-deceptive-claims-its-ai-product-could-make-websites); **(b)** repeat suits and pro se filers are rising. The defensible posture is native WCAG 2.1 AA conformance built into the product, not a bolt-on widget. *(Exact annual totals vary ±a few hundred between UsableNet cuts and Seyfarth's federal-only count; the directional picture is consistent.)*

---

## 6. Adjacent and forward-looking: the EU European Accessibility Act (not US law)

If iLaunchify expands to the EU (schema-ready, but not V1), the relevant instrument is the **European Accessibility Act (EAA)**, Directive (EU) 2019/882, whose requirements **apply from 28 June 2025** ([EUR-Lex](https://eur-lex.europa.eu/eli/dir/2019/882/oj/eng)). It covers private-sector products and services *provided to consumers* — e-commerce, consumer banking, e-books, transport ticketing, and certain hardware. The technical standard is the harmonized European standard **EN 301 549, whose web/mobile requirements are based on WCAG 2.1 Level AA** ([Deque](https://www.deque.com/accessibility-compliance/european-accessibility-act-eaa/)).

Two caveats. First, the EAA's trigger is provision "to consumers," so **pure B2B offerings are generally presumed out of scope** — but law-firm commentary stresses this is *not* a clean line, and "we're B2B" is not an automatic exemption ([Karl Groves](https://karlgroves.com/the-european-accessibility-act-and-b2b-software-what-internal-platforms-must-comply-with/)). A **microenterprise exemption** (fewer than 10 employees *and* ≤ €2M turnover) applies to *service* providers but not to manufacturers of covered products. Second, and most importantly: **the EAA is EU law, not US law.** It does not create any US obligation. It is relevant only as a future-expansion consideration, and the good news is that its standard (WCAG 2.1 AA via EN 301 549) is the *same* standard recommended below — so a WCAG 2.1 AA token layer is forward-compatible with an EU move.

---

## 7. The WCAG success criteria a design-token / theming layer governs

This is the section that converts the legal target into automated publish-gates. The criteria below are the ones a token layer can meaningfully enforce. Each is quoted from the official W3C Understanding documents with its exact threshold. The right-hand framing — *enforceable from tokens* vs. *helped but not guaranteed* — is what matters for "Theme Studio."

### 1.4.3 Contrast (Minimum) — Level AA — **fully enforceable from tokens**
*"The visual presentation of text and images of text has a contrast ratio of at least 4.5:1"*, except large text at *"at least 3:1"* ([W3C](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)). "Large" is defined as **at least 18 point (≈24px) or 14 point bold (≈18.5px)** — W3C states *"14pt and 18pt are equivalent to approximately 18.5px and 24px."* Treat ratios as hard thresholds — *"4.499:1 would not meet the 4.5:1 threshold."* **Enforceable purely from tokens:** every foreground/background token *pairing* used for text can be computed and gated. Build the contrast check against the actual token pairs a theme allows, not against colors in isolation.

### 1.4.11 Non-text Contrast — Level AA — **largely enforceable from tokens**
*"Visual information required to identify user interface components and states"* and *"parts of graphics required to understand the content"* must have **at least 3:1** against adjacent colors ([W3C](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html)). **Token-enforceable** for the parts a theme controls: form-field borders, button boundaries, the **focus-ring color** against its background, toggle/checkbox states, and icon colors. (Whether a *given component* actually has a visible boundary is a component-markup question — tokens enforce the ratio, not the existence of the boundary.)

### 1.4.1 Use of Color — Level A — **partially: tokens enable, components must comply**
*"Color is not used as the only visual means of conveying information"* ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)). Tokens can *provide* the non-color affordances (an underline token for links, an icon/weight token for error states) but cannot *guarantee* a component uses them. Track at the component level; tokens make compliance easier, not automatic.

### 1.4.4 Resize Text — Level AA — **enforceable from font tokens (mostly)**
*"Text can be resized without assistive technology up to 200 percent without loss of content or functionality"* ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)). Enforce by requiring **relative units (rem/em), never fixed px, in font-size tokens**, and a sane minimum base size. Layout breakage at 200% is partly a CSS/container concern, but token-level rules (relative type scale, no fixed-px line clamps) eliminate most failures. *Note for iLaunchify: our current `--fs-*` ramp is px-based for design parity — revisit toward rem for this criterion, or pair with the `--font-scale`/zoom support.*

### 1.4.10 Reflow — Level AA — **helped by tokens, not guaranteed**
*"Content can be presented without loss of information or functionality, and without requiring scrolling in two dimensions"* at a width equivalent to **320 CSS pixels** (≈400% zoom on a 1280px viewport) ([W3C](https://www.w3.org/WAI/WCAG21/Understanding/reflow.html)). Spacing/breakpoint tokens help, but reflow is fundamentally a layout/component concern — test it, don't assume the token gate covers it.

### 1.4.12 Text Spacing — Level AA — **enforceable as a token *constraint***
Content must survive user overrides of *line height to at least 1.5×*, *paragraph spacing to 2×*, *letter-spacing to 0.12×*, and *word-spacing to 0.16× the font size* ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)). The token-layer rule is **negative**: forbid fixed line-height/letter-spacing that would clip text when a user applies these multipliers (no fixed-height text containers, no `!important` spacing locks).

### 2.4.7 Focus Visible (AA) + 2.4.11 Focus Not Obscured / 2.4.13 Focus Appearance (WCAG 2.2)
*"Any keyboard operable user interface has a mode of operation where the keyboard focus indicator is visible"* (2.4.7, [W3C](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)). In WCAG 2.2, **2.4.11 Focus Not Obscured (Minimum) is Level AA**; **2.4.13 Focus Appearance is Level AAA** (it shipped at AAA despite an earlier draft proposing AA — note for anyone citing old material). 2.4.13's guidance: a focus indicator at least as large as a **2px-thick perimeter** of the component, with **≥3:1 contrast** between focused and unfocused states ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)). **Token-enforceable:** define a **mandatory, non-removable focus-ring token** (color + thickness + offset) that meets the 3:1 non-text-contrast bar, and forbid `outline: none` without a replacement. The "not obscured" part (sticky headers covering the focused element) is a layout concern to test. *iLaunchify already has a `--focus-ring` token and a `focus-visible:ring-pink-500` convention — good; make it non-removable.*

### 2.5.8 Target Size (Minimum) — Level AA (WCAG 2.2) — **enforceable from component tokens**
*"The size of the target for pointer inputs is at least 24 by 24 CSS pixels,"* with exceptions for spacing, equivalent controls, inline targets, user-agent controls, and essential presentation ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)). **Token-enforceable** via min-height/min-width and hit-area padding tokens on interactive components (buttons, icon buttons, chips, the RowActionsMenu 3-dot button). Gate component size tokens at ≥24px.

### 1.4.5 Images of Text — Level AA — **partially**
*"Text is used to convey information rather than images of text"* except where customizable or essential (logos are essential) ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/images-of-text.html)). A token layer that supplies real type (web fonts, the Inter/Bricolage/Fraunces stack) removes the *incentive* to bake text into images, but it cannot detect an image that contains text. Treat as a content/review rule.

**Summary of what Theme Studio can gate automatically:** contrast pairings (1.4.3), non-text/UI and focus-ring contrast (1.4.11), relative font-size tokens (1.4.4), text-spacing constraints (1.4.12), mandatory focus-ring tokens (2.4.7 / 2.4.11), and component target-size tokens (2.5.8). The rest (1.4.1, 1.4.10, 1.4.5) are *eased* by good tokens but still require component or content work.

---

## 8. What a token layer cannot cover (track and test separately)

A green token gate is necessary but **not sufficient** for WCAG 2.1 AA. The following are out of reach of any theming layer and must be owned by component engineering, QA, and manual/AT testing:

- **Semantic HTML** — correct landmarks, headings, lists, tables (vs. div soup).
- **Keyboard operability and focus order** — everything reachable/operable by keyboard, logical tab order, no traps, visible focus *moving correctly* (tokens supply the ring; markup supplies the order).
- **ARIA** — roles, states, properties; live regions; correct widget patterns.
- **Text alternatives** — alt text on images, accessible names for icon buttons, captions/transcripts for video (relevant to the Academy's Mux video).
- **Forms** — programmatic labels, error identification and suggestions, required-field indication beyond color.
- **Motion and `prefers-reduced-motion`** — honoring the OS reduce-motion setting; no seizure-risk flashing. *(iLaunchify's theme.css already has a reduced-motion baseline — good.)*
- **Reflow/responsive behavior** under real content (1.4.10), and resize/zoom layout integrity (1.4.4) — token rules reduce but don't eliminate failures.
- **Screen-reader testing** — actual NVDA/JAWS/VoiceOver passes on key flows. Automated tooling (axe, Lighthouse) catches only a minority of issues; manual AT testing is required.

These belong on a separate per-surface accessibility checklist tied to the publish workflow, not to the token gate.

---

## 9. Bottom line for iLaunchify

**Risk assessment.** B2B status genuinely *reduces* exposure — the authenticated creator, partner, and admin apps sit in the lower-risk zone, with no appellate ruling holding login-gated B2B SaaS to be a "public accommodation," and the §12181(7) categories offering no business-services catch-all. But the exposure is **not eliminated**, and three facts sharpen it: (1) the **public marketing/marketplace surfaces** (landing, /pricing, /marketplace, public product detail, /launch/[niche], signup) are open to the general public and are the most exposed part of the platform — a tester reaches them with no account; (2) **California (Unruh, $4,000/offense) and New York (state/city human-rights damages)** convert injunction-only federal claims into damages claims, and together drive ~40% of all filings; (3) roughly 4,000+ digital-accessibility suits are filed yearly, overlays are now a litigation *magnet*, and pro se/repeat filers are rising. The sharpest single risk is the **public marketplace and marketing pages, viewed through a California-plaintiff lens.**

**Recommendations, prioritized:**

1. **Adopt WCAG 2.1 Level AA as the internal target — platform-wide, public surfaces first.** It satisfies the de facto Title III benchmark, matches the only specific standard a US federal regulation names (Title II), exceeds Section 508's WCAG 2.0 AA, and is forward-compatible with the EU EAA's EN 301 549. Do not pursue Level AAA site-wide (W3C advises against it) and do not deploy an accessibility overlay/widget (litigation magnet + FTC false-advertising risk). Prioritize the public marketing/marketplace app, then the authenticated apps.

2. **Bake the token-governed criteria into "Theme Studio" as automated publish-gates,** using the exact thresholds from §7: contrast on every allowed token *pairing* (4.5:1 text, 3:1 large/UI/focus-ring, computed without rounding); relative-unit font tokens with a sane minimum; a mandatory, non-removable focus-ring token meeting 3:1 non-text contrast; a ≥24px target-size floor on interactive component tokens; and a text-spacing constraint that forbids fixed line-height/letter-spacing that would clip under user overrides. A theme that fails any gate cannot publish. Test the gates against the actual brand palette — pink `#FF2E63`, black, neon green `#B5FF3D` (dark surfaces only), pink-700 (light surfaces), cream `#F3EFE8`. **Neon green on light, or white text on cream, are the pairings most likely to fail 1.4.3 and should be validated, not assumed.**

3. **Track and test everything tokens cannot cover** on a separate per-surface checklist (§8): semantic HTML, keyboard/focus order, ARIA, alt text, form labels and errors, `prefers-reduced-motion`, reflow/zoom integrity, and manual screen-reader passes on the highest-traffic public flows (marketplace browse, product detail, signup) and the core authenticated flows (Design Studio, checkout). Automated scans (axe/Lighthouse) in CI are a floor, not a ceiling — budget for periodic manual AT audits, and consider a VPAT/ACR if any enterprise or government-adjacent procurement appears.

This posture is defensible, scales with the four-app monorepo, and turns the locked design system into an accessibility asset rather than a liability — without overclaiming a compliance guarantee that no token layer can honestly make.

---

## Sources

**The core standard / WCAG**
- [ADA.gov — Guidance on Web Accessibility and the ADA (Mar. 2022)](https://www.ada.gov/resources/web-guidance/)
- [DOJ — Web Accessibility Guidance press release](https://www.justice.gov/archives/opa/pr/justice-department-issues-web-accessibility-guidance-under-americans-disabilities-act)
- [W3C WAI — Understanding Conformance (A/AA/AAA)](https://www.w3.org/WAI/WCAG22/Understanding/conformance)
- [W3C — WCAG 2.1 (Recommendation)](https://www.w3.org/TR/WCAG21/)
- [W3C WAI — WCAG 2.2 is a W3C Recommendation (Oct 5, 2023)](https://www.w3.org/WAI/news/2023-10-05/wcag22rec/)
- [W3C WAI — WCAG 3 Introduction (draft status)](https://www.w3.org/WAI/standards-guidelines/wcag/wcag3-intro/)

**ADA Title III / case law / B2B**
- [Congressional Research Service — The ADA in Cyberspace (LSB10844)](https://www.congress.gov/crs-product/LSB10844)
- [Justia — Robles v. Domino's Pizza (9th Cir. 2019)](https://law.justia.com/cases/federal/appellate-courts/ca9/17-55504/17-55504-2019-01-15.html)
- [Seyfarth ADA Title III — SCOTUS declines to review Robles](https://www.adatitleiii.com/2019/10/supreme-court-declines-to-review-ninth-circuit-decision-in-robles-v-dominos-exposing-businesses-to-more-website-accessibility-lawsuits/)
- [Perkins Coie — 11th Circuit vacates Winn-Dixie](https://perkinscoie.com/insights/blog/eleventh-circuit-vacates-ruling-websites-are-not-public-accommodations-under-ada)
- [Cornell LII — 42 U.S.C. § 12181 (12 categories)](https://www.law.cornell.edu/uscode/text/42/12181)
- [ADA.gov — Title III: Businesses Open to the Public](https://www.ada.gov/topics/title-iii/)
- [Archived ADA.gov — Public Accommodations and Commercial Facilities](https://archive.ada.gov/ada_title_III.htm)
- [EEOC — ADA: Your Responsibilities as an Employer (Title I)](https://www.eeoc.gov/publications/ada-your-responsibilities-employer)
- [ABA Business Law Today — Digital Accessibility Under Title III (2025)](https://www.americanbar.org/groups/business_law/resources/business-law-today/2025-august/digital-accessibility-under-title-iii-ada/)
- [Seyfarth ADA Title III — Website filings continue to decrease in 2024](https://www.adatitleiii.com/2025/04/federal-court-website-accessibility-lawsuit-filings-continue-to-decrease-in-2024/)

**ADA Title II / Section 508**
- [ADA.gov — Fact Sheet: Title II Web/Mobile Rule](https://www.ada.gov/resources/2024-03-08-web-rule/)
- [Federal Register — DOJ Title II Final Rule (Apr. 24, 2024)](https://www.federalregister.gov/documents/2024/04/24/2024-07758/nondiscrimination-on-the-basis-of-disability-accessibility-of-web-information-and-services-of-state)
- [Federal Register — DOJ IFR extending compliance dates (Apr. 20, 2026)](https://www.federalregister.gov/documents/2026/04/20/2026-07663/extension-of-compliance-dates-for-nondiscrimination-on-the-basis-of-disability-accessibility-of-web)
- [Section508.gov — Applicability & Conformance Requirements](https://www.section508.gov/develop/applicability-conformance/)

**State law / litigation**
- [Cal. Civ. Code § 52 (Justia)](https://law.justia.com/codes/california/code-civ/division-1/part-2/section-52/)
- [CASp California — Unruh Civil Rights Act (Munson v. Del Taco)](https://www.caspcalifornia.com/resources/unruh-civil-rights-act)
- [Level Access — New York Human Rights Laws](https://www.levelaccess.com/compliance-overview/new-york-human-rights-laws/)
- [ADAQuickScan — New York 2026 lawsuits guide](https://adaquickscan.com/blog/new-york-ada-website-compliance-2026-lawsuits-guide)
- [BOIA — California AB 434](https://www.boia.org/blog/what-is-californias-ab-434-accessibility-law-and-why-it-matters)
- [Level Access — Colorado HB21-1110](https://www.levelaccess.com/blog/hb-21-1110-colorado-accessibility-law/)
- [Colorado OIT — HB21-1110 FAQ](https://oit.colorado.gov/standards-policies-guides/faq-hb21-1110-colorado-laws-for-persons)
- [UsableNet — 2024 Digital Accessibility Lawsuit Report](https://blog.usablenet.com/2024-digital-accessibility-lawsuit-report-relased-insights-for-2025)
- [FTC — Order requires accessiBe to pay $1 million (Jan. 2025)](https://www.ftc.gov/news-events/news/press-releases/2025/01/ftc-order-requires-online-marketer-pay-1-million-deceptive-claims-its-ai-product-could-make-websites)

**WCAG token-governed criteria**
- [W3C — Understanding 1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
- [W3C — Understanding 1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html)
- [W3C — Understanding 1.4.1 Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)
- [W3C — Understanding 1.4.4 Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)
- [W3C — Understanding 1.4.10 Reflow](https://www.w3.org/WAI/WCAG21/Understanding/reflow.html)
- [W3C — Understanding 1.4.12 Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)
- [W3C — Understanding 2.4.7 Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)
- [W3C — Understanding 2.4.13 Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)
- [W3C — Understanding 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [W3C — Understanding 1.4.5 Images of Text](https://www.w3.org/WAI/WCAG22/Understanding/images-of-text.html)

**EU European Accessibility Act**
- [EUR-Lex — Directive (EU) 2019/882](https://eur-lex.europa.eu/eli/dir/2019/882/oj/eng)
- [Deque — European Accessibility Act](https://www.deque.com/accessibility-compliance/european-accessibility-act-eaa/)
- [Karl Groves — EAA and B2B software](https://karlgroves.com/the-european-accessibility-act-and-b2b-software-what-internal-platforms-must-comply-with/)
