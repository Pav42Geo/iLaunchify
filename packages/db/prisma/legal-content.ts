// Professional draft bodies for the Legal CMS, authored to reflect the CURRENT
// iLaunchify build (docs/LEGAL_DOCUMENT_MANAGEMENT_SPEC_2026-07-11.md + CLAUDE.md
// + docs/legal/*). Consumed by seed-legal.ts as version body overrides.
//
// IMPORTANT: These are working professional DRAFTS written to be accurate to how
// the platform actually operates — they are NOT legal advice and have not been
// reviewed by counsel. They render with the "Draft — pending legal review" banner
// until an admin publishes them in Settings → Legal. Keep them updated as the
// build changes; the DB version history preserves each published revision.
//
// Model facts these drafts encode (keep true to the build):
//   • iLaunchify is a B2B production + orchestration marketplace for CPG creators.
//   • Creators design products; Partners (manufacturers, printers, co-packers,
//     warehouses/FCs) produce + fulfill; end buyers are the creator's OWN channels
//     (Shopify, TikTok Shop, etc.) — end buyers never transact with iLaunchify.
//   • Creators pay a subscription tier (Maker/Builder/Agency) + a production fee
//     charged as the Stripe application fee at checkout (15% / 12% / 8%).
//   • Manufacturer merit fee (Verified 4.5% / Trusted 2.5% / Premier 0%) is
//     withheld from the manufacturer's payout; it is earned, never sold.
//   • Payments run on Stripe Connect; subscriptions on Stripe Billing.
//   • V1 is US-only. FDA/label regulatory responsibility is shared per the
//     compliance tooling; creators own their brand claims.

interface LegalBody {
  html: string
  text: string
}

const P = (parts: string[]) => parts.join('\n')
const DRAFT_NOTE =
  '<p><em>This is a working draft written to reflect how iLaunchify currently operates. It is not legal advice and has not been reviewed by counsel. Effective date and final terms will be set on publication.</em></p>'

// ── Terms of Service ────────────────────────────────────────────────────────
const TERMS: LegalBody = {
  html: P([
    DRAFT_NOTE,
    '<p>These Terms of Service ("Terms") are a binding agreement between you and iLaunchify, Inc. ("iLaunchify", "we", "us", or "our") that govern your access to and use of the iLaunchify platform, websites, applications, and services (collectively, the "Platform"). By creating an account, clicking to accept, or otherwise accessing or using the Platform, you agree to these Terms and to our Privacy Policy. If you are using the Platform on behalf of a business, you represent that you are authorized to bind that business, and "you" refers to that business.</p>',
    '<h2>1. Definitions</h2>',
    '<p><strong>Creator</strong> — a business or individual that designs and orders products through the Platform. <strong>Partner</strong> — a production or fulfillment provider (manufacturer, printer, co-packer, or warehouse/fulfillment center) that produces or handles orders. <strong>Order</strong> — a request you submit through the Platform to produce and/or fulfill products. <strong>End Customer</strong> — a buyer who purchases your finished products through your own sales channels. <strong>Your Content</strong> — the brand assets, artwork, formulas, specifications, and other materials you provide. <strong>Platform Transaction</strong> — any transaction or relationship that originates from, is introduced by, or is facilitated through the Platform.</p>',
    '<h2>2. Eligibility and accounts</h2>',
    '<p>You must be at least 18 years old and able to form a binding contract. You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account. You agree to provide accurate, current, and complete information and to keep it up to date. Notify us promptly of any unauthorized use. We may refuse, suspend, or terminate accounts that violate these Terms or that create risk for the Platform, Partners, or other users.</p>',
    '<h2>3. What the Platform is — and is not</h2>',
    '<p>iLaunchify is a business-to-business production and orchestration marketplace for consumer packaged goods ("CPG"). Creators design products in our Design Studio; Partners produce and fulfill those products; and iLaunchify decomposes each Order into a workflow across one or more Partners and coordinates it on your behalf. The Platform is not a consumer storefront. Your End Customers are the sales channels you already own (for example, Shopify or TikTok Shop) and do not transact with iLaunchify. You are solely responsible for your relationship with, and obligations to, your End Customers, including storefront terms, consumer disclosures, returns, and post-sale support.</p>',
    '<h2>4. Subscriptions, fees, and taxes</h2>',
    '<p>Access to creator features requires a paid subscription tier (for example, Maker, Builder, or Agency), each with its own features and production-fee rate. Orders are charged a production fee at checkout, calculated from your subscription tier and disclosed before you place the Order. We may change fees, tiers, and rates; changes are shown in-product and, where they materially affect you, communicated in advance and applied prospectively. You are responsible for all applicable taxes, duties, and similar charges, except taxes based on our net income. Subscriptions, cancellations, and refunds are further described in the Membership &amp; Subscription Terms and the Cancellation, Refund &amp; Dispute Policy.</p>',
    '<h2>5. Payments and payment processors</h2>',
    '<p>Payments and payouts are processed by third-party processors, including Stripe, and are subject to their terms. You authorize us and our processors to charge your designated payment method for subscriptions and Orders you place, and you are responsible for keeping your payment information current. We do not store full payment card numbers. You are responsible for chargebacks and payment obligations arising from your account and Orders.</p>',
    '<h2>6. Orders, production, and approvals</h2>',
    '<p>When you place an Order, you approve your design, specifications, and applicable terms for production, and your acceptance is recorded. Because production may begin promptly, Orders generally cannot be changed or canceled once production has started. Minimums, timelines, and yields depend on the selected product and Partners and are estimates unless expressly stated otherwise in the Order.</p>',
    '<h2>7. Your Content and license</h2>',
    '<p>You retain all ownership of Your Content. You grant iLaunchify and the Partners to whom we route your Orders a limited, non-exclusive, worldwide license to host, reproduce, adapt (for format/production purposes), and use Your Content solely to operate the Platform and to produce and fulfill your Orders. You represent and warrant that you own or have the necessary rights to Your Content and that it, and the products you create, do not infringe or violate the rights of any third party.</p>',
    '<h2>8. Product responsibility and regulatory compliance</h2>',
    '<p>You are solely responsible for your products, brand and marketing claims, ingredient and nutrition declarations, and labeling, and for their compliance with all applicable laws and regulations (including, where relevant, U.S. Food and Drug Administration requirements). Our Design Studio, nutrition engine, and compliance tooling assist you, but you approve and remain the responsible party for what you bring to market. You must not use the Platform for prohibited, unsafe, misbranded, or unlawful products. See the Acceptable Use Policy.</p>',
    '<h2>9. Orchestration and Partners; no guarantee</h2>',
    '<p>iLaunchify selects and coordinates Partners to produce and fulfill your Orders and may route or split an Order across multiple Partners. We aim for reliable outcomes but do not guarantee any particular Partner, capacity, timeline, quantity, or yield except as expressly stated in an Order. Partner roles, responsibilities, and quality standards are governed by the Partner Agreement.</p>',
    '<h2>10. On-platform transactions and anti-circumvention</h2>',
    '<p>Relationships and introductions that originate through the Platform are Platform Transactions. You agree not to use the Platform to circumvent iLaunchify’s fees by taking an introduced relationship off-platform, and not to solicit Partners (or Creators) to transact outside the Platform, except as expressly permitted in writing.</p>',
    '<h2>11. Intellectual property</h2>',
    '<p>The Platform, including its software, design system, trademarks, and content (excluding Your Content), is owned by iLaunchify and its licensors and is protected by intellectual-property laws. Subject to these Terms, we grant you a limited, non-exclusive, non-transferable, revocable right to access and use the Platform for your internal business purposes. You may not copy, modify, reverse engineer, resell, or create derivative works of the Platform except as permitted by law. Feedback you provide may be used by us without obligation to you.</p>',
    '<h2>12. Third-party services</h2>',
    '<p>The Platform may integrate with or link to third-party services (for example, sales channels, payment processors, and carriers). Your use of those services is governed by their terms, and we are not responsible for them. You are responsible for maintaining any third-party accounts you connect.</p>',
    '<h2>13. Confidentiality</h2>',
    '<p>Each party may receive non-public information of the other. The receiving party will use such information only to exercise its rights and perform its obligations under these Terms and will protect it with reasonable care. Partners’ obligations regarding Creator Content are further set out in the Partner Agreement.</p>',
    '<h2>14. Disclaimer of warranties</h2>',
    '<p>Except as expressly stated, the Platform is provided "as is" and "as available" without warranties of any kind, whether express, implied, or statutory, including implied warranties of merchantability, fitness for a particular purpose, title, and non-infringement, to the fullest extent permitted by law. We do not warrant that the Platform will be uninterrupted, error-free, or secure, or that any product will meet regulatory requirements for your intended market — that responsibility is yours.</p>',
    '<h2>15. Limitation of liability</h2>',
    '<p>To the maximum extent permitted by law, iLaunchify and its affiliates will not be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, revenue, data, or goodwill, arising out of or related to the Platform, even if advised of the possibility. To the maximum extent permitted by law, our aggregate liability arising out of or related to these Terms will not exceed the greater of the amounts you paid to iLaunchify in the three (3) months before the event giving rise to the claim, or one hundred U.S. dollars (US$100). Nothing in these Terms limits liability that cannot be limited under applicable law. The final published Terms may set out the definitive cap.</p>',
    '<h2>16. Indemnification</h2>',
    '<p>You will defend, indemnify, and hold harmless iLaunchify, its affiliates, and their personnel from and against any claims, damages, liabilities, and expenses (including reasonable legal fees) arising out of or related to: your products, brand or marketing claims, or labeling; Your Content; your violation of these Terms or applicable law; or your relationship with your End Customers. We will provide reasonable notice of any claim subject to indemnification.</p>',
    '<h2>17. Suspension and termination</h2>',
    '<p>You may stop using the Platform at any time. We may suspend or terminate your access, in whole or in part, for breach of these Terms, risk to the Platform or others, non-payment, or as required by law. On termination, your right to use the Platform ceases; fees accrued remain payable; and provisions that by their nature should survive (including Sections 7, 8, 10, 11, 13–16, and 18) survive.</p>',
    '<h2>18. Dispute resolution and governing law</h2>',
    '<p>These Terms are governed by the laws of the State of Delaware, without regard to its conflict-of-laws rules, and V1 of the Platform is offered in the United States. Before filing a claim, you agree to first contact us at legal@ilaunchify.com and attempt to resolve the dispute informally for at least thirty (30) days. The final published Terms may specify binding arbitration and a class-action waiver; those provisions will be presented clearly and, where required, separately acknowledged. Nothing here prevents either party from seeking injunctive relief for intellectual-property or confidentiality matters.</p>',
    '<h2>19. Changes to these Terms</h2>',
    '<p>We may update these Terms. When we make material changes, we will notify you and, where required, ask you to accept the updated Terms before continuing to use the Platform. The current version and its effective date are always available on this page, and prior versions are retained.</p>',
    '<h2>20. General</h2>',
    '<p>These Terms, together with the policies referenced in them, are the entire agreement between you and iLaunchify regarding the Platform. If any provision is held unenforceable, the remaining provisions remain in effect. Our failure to enforce a provision is not a waiver. You may not assign these Terms without our consent; we may assign them in connection with a merger, acquisition, or sale of assets. Neither party is liable for delays or failures caused by events beyond its reasonable control (force majeure). Notices to you may be provided in-product or by email; notices to us should be sent to legal@ilaunchify.com.</p>',
    '<h2>21. Contact</h2>',
    '<p>Questions about these Terms: legal@ilaunchify.com.</p>',
  ]),
  text: 'iLaunchify Terms of Service (draft, expanded). Binding agreement covering: definitions; eligibility + accounts; B2B CPG production/orchestration model (not a consumer storefront; creator owns end-customer relationship); subscriptions + production fee at checkout + taxes; Stripe payments + chargebacks; order approval + no cancel after production; Your Content ownership + limited production license; creator product/claims/FDA responsibility; partner orchestration with no yield guarantee; on-platform/anti-circumvention; IP; third-party services; confidentiality; "as is" warranty disclaimer; limitation of liability (cap = greater of 3 months fees or $100); indemnification; suspension/termination + survival; Delaware law + 30-day informal resolution + arbitration placeholder; changes with re-acceptance; entire agreement/severability/assignment/force majeure/notices. Not legal advice; pending counsel.',
}

// ── Privacy Policy ──────────────────────────────────────────────────────────
const PRIVACY: LegalBody = {
  html: P([
    DRAFT_NOTE,
    '<p>This Privacy Policy explains how iLaunchify, Inc. ("iLaunchify", "we", "us") collects, uses, discloses, and protects personal information in connection with the iLaunchify platform, websites, and services (the "Platform"). It applies to creators, partners, and visitors. It should be read together with our Terms of Service and Cookie Policy. Where we process personal data on behalf of a partner or business customer, our Data Processing Addendum also applies.</p>',
    '<h2>1. Information we collect</h2>',
    '<p><strong>Information you provide.</strong> Account and profile details (name, email, business/company information, role), the brand assets, artwork, formulas, and specifications you upload, support requests, and communications with us. For partners, we also collect onboarding, identity/business verification, facility, certification, insurance, and payout information.</p>',
    '<p><strong>Information generated through use.</strong> Products and designs, orders and their production/fulfillment workflow, approvals and legal acceptances (including timestamp, version, and IP address for recordkeeping), notifications, and activity logs.</p>',
    '<p><strong>Technical information.</strong> Device, browser, and usage data, IP address, and information collected through cookies and similar technologies (see our Cookie Policy).</p>',
    '<p><strong>Payment information.</strong> Limited transaction details from our payment processors. We do not store full payment card numbers.</p>',
    '<p>We do not intend to collect personal information about your End Customers through the Platform; your handling of End Customer data is your responsibility.</p>',
    '<h2>2. Sources of information</h2>',
    '<p>We collect information directly from you, automatically as you use the Platform, and from service providers such as payment processors, verification providers, and analytics tools.</p>',
    '<h2>3. How we use information</h2>',
    '<p>We use personal information to: operate, maintain, and secure the Platform; create, orchestrate, and coordinate production and fulfillment across partners; process subscriptions, orders, fees, and partner payouts; verify partners and manage standing; provide customer support; maintain records of agreements and acceptances for legal reproducibility; detect, prevent, and respond to fraud, abuse, and security incidents; comply with legal, tax, and regulatory obligations; and improve and develop our services. We use it to send transactional and legal notices (which are mandatory) and, where permitted, product and marketing communications you can opt out of.</p>',
    '<h2>4. Legal bases (where applicable)</h2>',
    '<p>Where required by law, we rely on the following bases: performance of a contract with you; our legitimate interests in operating and improving the Platform and preventing abuse; compliance with legal obligations; and your consent where we ask for it (which you may withdraw).</p>',
    '<h2>5. How we disclose information</h2>',
    '<p><strong>Production and fulfillment partners.</strong> We share the information needed to make and ship your orders (for example, artwork, specifications, quantities, and shipping details) with the partners we route your orders to.</p>',
    '<p><strong>Service providers (sub-processors).</strong> We share information with providers who help us run the Platform — for example payment processing (Stripe), cloud hosting and database, transactional email, shipping/logistics (such as EasyPost), and analytics and monitoring. A current list is on our Sub-processors page; they are bound to appropriate confidentiality and data-protection obligations.</p>',
    '<p><strong>Legal, safety, and business transfers.</strong> We may disclose information to comply with law or valid legal process, to protect the rights, safety, and integrity of iLaunchify, our users, and others, and in connection with a merger, acquisition, financing, or sale of assets.</p>',
    '<p><strong>No sale.</strong> We do not sell your personal information, and we do not "share" it for cross-context behavioral advertising as those terms are defined under applicable U.S. state privacy laws.</p>',
    '<h2>6. Cookies and tracking</h2>',
    '<p>We use strictly necessary cookies to operate and secure the Platform, and, where applicable, preference and analytics cookies. See our Cookie Policy for details and choices.</p>',
    '<h2>7. Data retention</h2>',
    '<p>We keep personal information for as long as needed to provide the Platform and for legitimate business purposes, including meeting legal, tax, and accounting obligations, resolving disputes, and preserving order and acceptance records for legal reproducibility. When no longer needed, we delete or de-identify it.</p>',
    '<h2>8. Security</h2>',
    '<p>We maintain technical and organizational measures designed to protect personal information, including tenant isolation, role-based access controls, encryption in transit, and audit logging. No method of transmission or storage is perfectly secure; we work to protect your information and to respond appropriately to incidents.</p>',
    '<h2>9. Your rights and choices</h2>',
    '<p>You can access and update your account information and manage notification preferences in-product. Depending on where you live, you may have the right to access, correct, delete, or port your personal information, to opt out of certain processing, and to be free from discrimination for exercising these rights. To make a request, contact privacy@ilaunchify.com; we will verify and respond as required by law, and you may appeal a decision by replying to our response. Mandatory legal and transactional notices may be sent regardless of your marketing preferences.</p>',
    '<h2>10. Children</h2>',
    '<p>The Platform is intended for businesses and is not directed to children. We do not knowingly collect personal information from children under 13 (or the applicable age in your jurisdiction).</p>',
    '<h2>11. International and regional notes</h2>',
    '<p>V1 of the Platform is offered in the United States, and information is processed in the United States. Certain U.S. state privacy laws provide the rights described above. As we expand, region-specific terms and transfer mechanisms may apply, and this page will reflect those changes.</p>',
    '<h2>12. Third-party links and services</h2>',
    '<p>The Platform may link to or integrate with third-party services (for example, your sales channels). Their privacy practices are governed by their own policies, and we are not responsible for them.</p>',
    '<h2>13. Changes and contact</h2>',
    '<p>We may update this Policy; when changes are material, we will notify you and, where required, ask you to re-acknowledge it. The current version and its effective date are always shown here, and prior versions are retained. Contact us at privacy@ilaunchify.com.</p>',
  ]),
  text: 'iLaunchify Privacy Policy (draft, expanded). Collects: account/business info, uploaded designs, orders + approvals/acceptances (timestamp/version/IP for records), technical/cookie data, partner onboarding/verification/payout, limited payment details (no full card numbers). Uses: operate + orchestrate production, payments/payouts, partner verification, support, legal recordkeeping, fraud/security, compliance, transactional + mandatory legal notices + opt-out marketing. Legal bases. Discloses to production partners + service providers/sub-processors (Stripe, hosting, email, EasyPost, analytics — see Sub-processors), legal/safety/business transfer; NO sale or cross-context sharing. Cookies, retention, security (tenant isolation, access controls, encryption, audit), rights (access/correct/delete/port/opt-out/appeal via privacy@ilaunchify.com), children, US-only V1 + state privacy notes, third-party links, changes with re-acknowledgement. Not legal advice; pending counsel.',
}

// ── Creator Agreement ───────────────────────────────────────────────────────
const CREATOR_AGREEMENT: LegalBody = {
  html: P([
    DRAFT_NOTE,
    '<p>This Creator Agreement ("Agreement") supplements and incorporates the Terms of Service and governs your use of iLaunchify as a creator to design, order, and sell consumer packaged goods ("CPG"). Capitalized terms have the meanings given in the Terms of Service. If there is a conflict on creator-specific matters, this Agreement controls.</p>',
    '<h2>1. Your role and responsibilities</h2>',
    '<p>As a Creator, you design products in the Design Studio, configure recipes, packaging, and labeling, place production Orders, and sell the finished products to your own End Customers through your own sales channels. You own and operate your brand and channels; iLaunchify and its Partners produce and fulfill what you Order. You are responsible for the accuracy and legality of everything you submit and approve.</p>',
    '<h2>2. Subscription and production fees</h2>',
    '<p>You subscribe to a creator tier (for example, Maker, Builder, or Agency), each with its own features and production-fee rate. The production fee is calculated on the production subtotal (plus fulfillment-center labeling where applicable, excluding shipping) and charged at checkout as part of your Order; the applicable rate is shown before you place the Order. Current tiers, rates, and billing terms are described in the Membership &amp; Subscription Terms, which apply to your subscription. We may change tiers, features, and rates prospectively with notice for material changes.</p>',
    '<h2>3. Brand, claims, intellectual property, and compliance</h2>',
    '<p>You are solely responsible for your brand, product and marketing claims, ingredient and nutrition declarations, and label content, and for their compliance with all applicable laws (including, where relevant, U.S. Food and Drug Administration requirements and, for supplements, applicable dietary-supplement rules). Our Design Studio, nutrition engine, and compliance tooling assist you, but you review, approve, and remain the responsible party for what you bring to market. You represent and warrant that you own or have all rights necessary to the artwork, trademarks, brand assets, and formulas you use, and that your products and Content do not infringe or violate any third-party rights.</p>',
    '<h2>4. Design Studio and product configuration</h2>',
    '<p>The Design Studio lets you configure products, variants/flavors, packaging, and labels. You are responsible for reviewing generated artifacts (including die-lines, nutrition/label panels, and mockups) before approving them for production. Assistive and automated features are provided to help you, not to replace your review or professional/regulatory advice.</p>',
    '<h2>5. Orders, approvals, and production</h2>',
    '<p>When you place an Order, you approve your design, specifications, and applicable terms for production, and your acceptance is recorded (including time and version). Because production may begin promptly, Orders generally cannot be changed or canceled once production has started. Minimums, lead times, and yields depend on the selected product and Partners and are estimates unless expressly stated in the Order. Cancellations, remakes, and refunds are governed by the Cancellation, Refund &amp; Dispute Policy.</p>',
    '<h2>6. Selling to your End Customers</h2>',
    '<p>You sell finished products to your own End Customers through your own channels. You are solely responsible for your customer relationships, storefront and sale terms, pricing, consumer disclosures, warranties, returns, recalls, and post-sale support. iLaunchify is not a party to, and has no responsibility for, your sales to End Customers.</p>',
    '<h2>7. Payments, taxes, and chargebacks</h2>',
    '<p>You pay subscription and Order charges through our payment processor and authorize recurring and Order-based charges to your payment method. You are responsible for applicable taxes and for chargebacks and payment obligations arising from your account, Orders, and End-Customer sales.</p>',
    '<h2>8. On-platform transactions and anti-circumvention</h2>',
    '<p>You agree to keep production relationships introduced through the Platform on the Platform, and not to solicit or arrange to transact with a Partner off-platform to circumvent iLaunchify’s fees, except as expressly permitted in writing.</p>',
    '<h2>9. Confidentiality</h2>',
    '<p>You will treat non-public information you receive about Partners, pricing, and the Platform as confidential and use it only to use the Platform. Partners are likewise obligated to protect your Content, as set out in the Partner Agreement.</p>',
    '<h2>10. Warranties, liability, and indemnification</h2>',
    '<p>The Platform is provided as described in, and subject to the disclaimers and limitations of liability in, the Terms of Service. You will defend, indemnify, and hold harmless iLaunchify and its affiliates from claims arising out of your products, brand or marketing claims, labeling, Your Content, your End-Customer relationships, or your breach of this Agreement or applicable law.</p>',
    '<h2>11. Term, suspension, and termination</h2>',
    '<p>This Agreement continues while you use the Platform. You may stop at any time (subscription cancellation is governed by the Membership &amp; Subscription Terms). We may suspend or terminate access for breach, risk, non-payment, or as required by law. Accrued fees remain payable, and provisions that by their nature should survive will survive.</p>',
    '<h2>12. Changes and contact</h2>',
    '<p>We may update this Agreement; material changes are notified and re-accepted where required. The current version and effective date are shown here. Questions: legal@ilaunchify.com.</p>',
  ]),
  text: 'iLaunchify Creator Agreement (draft, expanded). Supplements the Terms. Creator role + responsibilities (design/order/sell via own channels); subscription tier + production fee (production subtotal + FC labeling, excl. shipping) at checkout, per Membership Terms; creator owns brand/claims/nutrition/label + FDA/supplement compliance + IP rights, with Studio/nutrition/compliance assistance; Design Studio review responsibility (die-lines/panels/mockups); order approval recorded (time+version), no cancel after production, refunds per Refund Policy; creator owns end-customer relationship (returns/recalls/support); payments/taxes/chargebacks; on-platform/anti-circumvention; confidentiality; warranties/liability/indemnification per Terms; term/suspension/termination + survival; changes with re-acceptance. Not legal advice; pending counsel.',
}

// ── Partner Agreement (CMS summary; the e-signed STANDARD_V1.0 is separate) ──
const PARTNER_AGREEMENT: LegalBody = {
  html: P([
    DRAFT_NOTE,
    '<p>This Partner Agreement ("Agreement") governs participation in the iLaunchify production network as a manufacturer, printer, co-packer, or warehouse/fulfillment partner ("Partner", "you"). It supplements the Terms of Service. The binding Standard Partner Agreement you accept and electronically sign during onboarding (for example, STANDARD_V1.0) is the controlling contract and prevails over this summary where they differ.</p>',
    '<h2>1. Eligibility, onboarding, and verification</h2>',
    '<p>You represent that you are a validly organized business, in good standing, and authorized to perform your services in the United States. You will complete onboarding truthfully, including legal entity, facility location(s), ownership/control, insurance, and certification information, and keep it current. Where applicable to your domain, you will hold and maintain required registrations and certifications (for example, FDA facility registration, cGMP, or GFSI-recognized certification). iLaunchify may verify your identity, registrations, certifications, and insurance, and may approve, decline, suspend, or remove a Partner at its discretion. Approval is not a guarantee of any volume of Orders.</p>',
    '<h2>2. Services, facilities, and standards</h2>',
    '<p>You will perform only the services, at the facilities, and in the domains for which you are qualified, certified, and configured on the Platform. You will meet applicable quality, food-safety, and workmanship standards; produce to the approved specifications; maintain safe and compliant facilities; and keep your capabilities, capacity, and certifications accurate and current. You will not substitute materials, ingredients, or processes except as permitted by the Order.</p>',
    '<h2>3. Orders, orchestration, and documentation</h2>',
    '<p>iLaunchify routes Orders and may decompose an Order into a workflow across multiple Partners. You are responsible for your portion of each accepted Order, for timely and accurate status updates, and for receiving, production, and dispatch documentation. You will handle inbound materials and finished goods with appropriate care and comply with the logistics and labeling requirements for each Order.</p>',
    '<h2>4. Standing tiers, fees, and payouts</h2>',
    '<p>Partner standing tiers (Verified, Trusted, Premier) are earned through the Merit Engine based on your performance; they are not purchased and may not be bought. A merit fee (currently Verified 4.5%, Trusted 2.5%, Premier 0%, and admin-adjustable) is withheld from your payout on applicable Orders — it is netted at payout and is not added to the Creator’s charge. Payouts are made through our payment processor (for example, Stripe Connect) after the applicable Order milestones, subject to reserves, adjustments, refunds, and chargebacks. You are responsible for your taxes.</p>',
    '<h2>5. Confidentiality, Creator Content, and intellectual property</h2>',
    '<p>You will keep Creator designs, formulas, specifications, and business information strictly confidential, use them only to perform accepted Orders, and protect them with appropriate safeguards. You obtain no rights in Creator Content or brands, and you will not reproduce, sell, distribute, or use Creator products, designs, or formulas outside the Platform or for any purpose other than fulfilling the Order.</p>',
    '<h2>6. Anti-circumvention</h2>',
    '<p>You will not use Platform-originated relationships to transact off-platform, solicit Creators to transact off-platform, or otherwise circumvent iLaunchify’s fees, except as expressly permitted in writing.</p>',
    '<h2>7. Nominated co-partners</h2>',
    '<p>Where you direct or nominate a print or packaging co-partner for an Order, you do so subject to the nomination terms and the associated responsibilities and liability allocations set out in the Standard Partner Agreement. You remain responsible for your own portion of the Order.</p>',
    '<h2>8. Compliance, insurance, and records</h2>',
    '<p>You will comply with applicable laws and regulations for your services and facilities, maintain the insurance you represented during onboarding, and retain production and quality records as required. You will cooperate with reasonable verification, quality, and audit requests and promptly notify iLaunchify of lapses in certification, insurance, or capability, and of recalls or safety issues affecting Orders.</p>',
    '<h2>9. Warranties, indemnification, and liability</h2>',
    '<p>You warrant that your services will be performed in a professional and workmanlike manner, in conformance with the approved specifications and applicable standards. You will defend, indemnify, and hold harmless iLaunchify, its affiliates, and affected Creators from claims arising out of your services, your facilities, your breach of this Agreement or applicable law, or your handling of Creator Content. Liability is otherwise subject to the limitations in the Terms of Service and the Standard Partner Agreement.</p>',
    '<h2>10. Suspension, termination, and survival</h2>',
    '<p>iLaunchify may suspend or remove a Partner, or halt Orders, for breach, quality or safety concerns, loss of required certification or insurance, risk, or as required by law. Obligations accrued before termination remain, and provisions that by their nature should survive (including confidentiality, anti-circumvention, and indemnification) survive.</p>',
    '<h2>11. Changes and contact</h2>',
    '<p>This Agreement continues while you participate. Material changes are notified and re-accepted where required; the controlling Standard Partner Agreement is versioned and re-signed as needed. Questions: partners@ilaunchify.com.</p>',
  ]),
  text: 'iLaunchify Partner Agreement (draft, expanded; binding e-signed STANDARD_V1.0 controls). Eligibility/onboarding/verification (entity, facility, ownership, insurance, certs — FDA/cGMP/GFSI); services + facilities + standards (approved specs, food safety, no unpermitted substitution); orders + orchestration + receiving/dispatch documentation + logistics/labeling; EARNED merit tiers (Verified/Trusted/Premier, not purchasable) with merit fee withheld from payout (4.5/2.5/0, admin-adjustable) via Stripe Connect after milestones, reserves/adjustments, partner taxes; confidentiality of Creator Content + no rights + no off-platform reproduction; anti-circumvention; nominated co-partners (D7 liability); compliance/insurance/records + audit cooperation + recall notice; workmanlike warranty + indemnification + liability per Terms; suspension/termination + survival; changes with re-acceptance. Not legal advice; pending counsel.',
}

// ── Membership & Subscription Terms ─────────────────────────────────────────
const MEMBERSHIP: LegalBody = {
  html: P([
    DRAFT_NOTE,
    '<p>These Membership &amp; Subscription Terms govern paid iLaunchify creator subscriptions and supplement the Terms of Service. They are designed to align with applicable automatic-renewal and "click-to-cancel" requirements. Production Orders and their fees are addressed separately in the Terms of Service and the Cancellation, Refund &amp; Dispute Policy.</p>',
    '<h2>1. Plans and billing</h2>',
    '<p>Creator subscriptions (for example, Maker, Builder, and Agency) are billed on a recurring basis — monthly unless another interval is shown — at the price and interval presented at signup. Each tier includes its own features and its own production-fee rate that applies to Orders you place. Applicable taxes may be added.</p>',
    '<h2>2. Authorization for recurring charges</h2>',
    '<p>By subscribing, you authorize iLaunchify and our payment processor to charge your designated payment method the recurring subscription fee (plus taxes) at the start of each billing period, and to charge Order-based fees when you place Orders, until you cancel. You are responsible for keeping your payment information current.</p>',
    '<h2>3. Automatic renewal</h2>',
    '<p>Your subscription automatically renews at the end of each billing period for another period of the same length at the then-current price, until you cancel. We will provide any renewal or price-change reminders required by applicable law.</p>',
    '<h2>4. Cancellation</h2>',
    '<p>You may cancel at any time from your account settings, without contacting support and without retention hurdles. Cancellation stops future renewals and takes effect at the end of the current billing period; you retain access to paid features until then. Cancelling your subscription does not cancel Orders already placed.</p>',
    '<h2>5. Price and plan changes</h2>',
    '<p>We may change subscription prices, tiers, features, or production-fee rates. We will provide advance notice of material changes, and changes apply from your next renewal (or, for fee-rate changes, to Orders placed after the effective date). If you continue after the effective date, you accept the change; if you disagree, you may cancel before it takes effect.</p>',
    '<h2>6. Failed payments</h2>',
    '<p>If a charge fails, we may retry and may suspend or downgrade paid features until payment succeeds. Repeated failure may result in cancellation. You remain responsible for amounts owed.</p>',
    '<h2>7. Refunds</h2>',
    '<p>Subscription fees are generally non-refundable, and cancellation stops future renewals rather than refunding the current period, except where required by law or expressly stated in the Cancellation, Refund &amp; Dispute Policy. Production Orders are governed by that Policy, not by this Section.</p>',
    '<h2>8. Free trials and promotions</h2>',
    '<p>If we offer a free trial, it automatically converts to a paid subscription at the standard price unless you cancel before the trial ends; we will disclose the trial length and post-trial price at signup. Promotional or introductory pricing applies only for the stated period and reverts to standard pricing at renewal.</p>',
    '<h2>9. Taxes</h2>',
    '<p>Prices are exclusive of taxes unless stated. You are responsible for applicable sales, use, VAT/GST, and similar taxes, except taxes based on our net income.</p>',
    '<h2>10. Changes and contact</h2>',
    '<p>We may update these Terms; material changes are notified and re-acknowledged where required, and the current version and effective date are shown here. Billing questions: billing@ilaunchify.com.</p>',
  ]),
  text: 'iLaunchify Membership & Subscription Terms (draft, expanded). Recurring creator subscriptions (Maker/Builder/Agency) with per-tier production-fee rate + taxes; explicit recurring-charge authorization; automatic renewal with required reminders; self-serve click-to-cancel (no retention hurdles) effective end of period, doesn’t cancel placed Orders; advance notice of price/fee changes applied prospectively; failed-payment retries + suspension; subscription fees generally non-refundable (Orders per Refund Policy); trials auto-convert with disclosure + promos revert; taxes; changes with re-acknowledgement. FTC auto-renewal aligned. Not legal advice; pending counsel.',
}

// ── Acceptable Use Policy ───────────────────────────────────────────────────
const ACCEPTABLE_USE: LegalBody = {
  html: P([
    DRAFT_NOTE,
    '<p>This Acceptable Use Policy ("AUP") describes conduct, content, and products that are not allowed on the iLaunchify Platform. It supplements and is part of the Terms of Service. Violations may result in enforcement action described below.</p>',
    '<h2>1. Prohibited products</h2>',
    '<p>You may not use the Platform to design, order, or produce products that are: unlawful, unsafe, adulterated, or misbranded; in violation of applicable regulatory requirements (including, where relevant, U.S. Food and Drug Administration rules for foods, dietary supplements, cosmetics, or other regulated categories); controlled substances, or products that make disease, drug, or other prohibited health claims; counterfeit, or infringing of trademarks, copyrights, patents, trade dress, or other rights; or products that are unsafe for their intended use or that you are not authorized or qualified to bring to market.</p>',
    '<h2>2. Prohibited content and claims</h2>',
    '<p>You may not upload content, or make label, packaging, or marketing claims, that are false, misleading, deceptive, unsubstantiated, infringing, defamatory, obscene, or that you are not authorized to use. You are responsible for the accuracy, substantiation, and legality of your brand and product claims and for required disclosures.</p>',
    '<h2>3. Prohibited conduct</h2>',
    '<p>You may not: attempt to breach security or access data, accounts, or areas you are not authorized to; probe, scan, or test the vulnerability of the Platform without authorization; interfere with or disrupt the Platform or other users; scrape, harvest, or overload the service or use it via unauthorized automated means; circumvent fees, routing, or access controls, or take introduced relationships off-platform to avoid fees; impersonate others or misrepresent your identity or affiliation; or use the Platform to harm Partners, Creators, or End Customers, or for any unlawful or fraudulent purpose.</p>',
    '<h2>4. Partner obligations</h2>',
    '<p>Partners must perform only services for which they are qualified and certified, produce to approved specifications, maintain safe and compliant facilities, handle Creator Content confidentially, and not reproduce or divert Creator products outside the Platform.</p>',
    '<h2>5. Compliance with law</h2>',
    '<p>You are responsible for complying with all laws and regulations applicable to your use of the Platform, your products, and your sales to End Customers, including consumer-protection, advertising, labeling, and data-protection laws.</p>',
    '<h2>6. Enforcement</h2>',
    '<p>We may investigate suspected violations and may remove or disable content, halt or cancel Orders, restrict features, and suspend or terminate accounts. Where appropriate, we may preserve information and report unlawful activity to authorities and cooperate with investigations. We may take action to protect the safety, security, and integrity of the Platform, its users, and End Customers. Enforcement decisions are made in our reasonable discretion and do not limit our other rights.</p>',
    '<h2>7. Reporting and changes</h2>',
    '<p>Report suspected violations, safety concerns, or infringement to trust@ilaunchify.com with enough detail for us to investigate. We may update this AUP; the current version and its effective date are always shown here.</p>',
  ]),
  text: 'iLaunchify Acceptable Use Policy (draft, expanded). Prohibited products (unlawful/unsafe/adulterated/misbranded, FDA-regulated violations, prohibited health/drug claims, counterfeit/infringing); prohibited content + unsubstantiated/false/infringing claims; prohibited conduct (security breach, vuln scanning, disruption, scraping, fee/access circumvention, impersonation, harm/fraud); partner qualification + confidentiality + no diversion; compliance with law; enforcement (investigate, remove, halt/cancel orders, suspend, preserve + report, protect integrity); report to trust@ilaunchify.com. Not legal advice; pending counsel.',
}

// ── Cancellation, Refund & Dispute Policy ───────────────────────────────────
const REFUND_DISPUTE: LegalBody = {
  html: P([
    DRAFT_NOTE,
    '<p>This Cancellation, Refund &amp; Dispute Policy explains how cancellations, refunds, and disputes work for iLaunchify production Orders and subscriptions. It supplements the Terms of Service and the Membership &amp; Subscription Terms. Because iLaunchify produces custom, made-to-order goods, some outcomes differ from off-the-shelf retail.</p>',
    '<h2>1. Order cancellation</h2>',
    '<p>Production is custom and typically begins soon after you place an Order. You may cancel an Order only before production has started; once a Partner has begun sourcing, producing, or printing, an Order generally cannot be canceled or changed. The current status of each Order is shown in-product, and your approval to begin production is recorded.</p>',
    '<h2>2. Production issues and remedies</h2>',
    '<p>If a completed Order is defective, materially non-conforming to the approved specification, damaged in transit, or not delivered, you may be eligible for a remedy — typically a remake, replacement, or a refund of the affected portion — determined after review. We generally address issues in that order (remake or replace first, refund where a remake is not practical). To be eligible, report the issue promptly (see Section 6) with supporting detail and photos where relevant.</p>',
    '<h2>3. What is not covered</h2>',
    '<p>Refunds and remakes generally do not cover: issues arising from your approved design, artwork, claims, specifications, or supplied assets; your errors in configuration; normal manufacturing variances disclosed for the product; delays or failures caused by you or by events beyond our or the Partner’s reasonable control; or problems with your sales to, or returns from, your End Customers.</p>',
    '<h2>4. Samples and pre-production</h2>',
    '<p>Sample and pre-production Orders help you validate a product before a full run and may be non-refundable once produced; where offered, sample credits and their terms are described at purchase.</p>',
    '<h2>5. Subscriptions</h2>',
    '<p>Subscription fees are generally non-refundable; cancellation stops future renewals as described in the Membership &amp; Subscription Terms.</p>',
    '<h2>6. How to raise an issue or dispute</h2>',
    '<p>If something is wrong with an Order, contact us first at support@ilaunchify.com so we can investigate with the relevant Partner. Please raise issues promptly after delivery (or expected delivery), and keep the goods and packaging available for inspection where relevant. We resolve disputes using Order records, approvals, production and dispatch documentation, and acceptance history, and we aim to reach a fair outcome efficiently.</p>',
    '<h2>7. Refund handling and fees</h2>',
    '<p>Approved refunds are issued to your original payment method. Where a refund is issued, applicable platform and production fees are handled consistently with the refunded amounts. Certain third-party payment-processor fees may be non-refundable.</p>',
    '<h2>8. Chargebacks</h2>',
    '<p>Please contact us before initiating a chargeback; doing so first helps us resolve the issue faster. Filing a chargeback without contacting us may delay resolution. You are responsible for chargebacks arising from your Orders and from your own End-Customer sales.</p>',
    '<h2>9. Changes and contact</h2>',
    '<p>We may update this Policy; the current version and effective date are always shown here. Contact: support@ilaunchify.com.</p>',
  ]),
  text: 'iLaunchify Cancellation, Refund & Dispute Policy (draft, expanded). Custom made-to-order goods; cancel only before production starts (approval recorded); remedy ladder (remake/replace/refund of affected portion) for defective/non-conforming/damaged/undelivered orders reported promptly with evidence; NOT covered: approved-design/spec/asset issues, config errors, disclosed manufacturing variance, force majeure, end-customer returns; samples/pre-production non-refundable once produced; subscriptions non-refundable; raise via support@ilaunchify.com using order/approval/dispatch/acceptance records; refunds to original method + consistent fee handling (processor fees may be non-refundable); contact-before-chargeback + chargeback responsibility. Not legal advice; pending counsel.',
}

// ── Sub-processors ──────────────────────────────────────────────────────────
const SUBPROCESSORS: LegalBody = {
  html: P([
    DRAFT_NOTE,
    '<p>iLaunchify engages trusted third-party service providers ("sub-processors") to help operate and deliver the Platform. This page describes the categories of sub-processors we use and is referenced by our Privacy Policy and Data Processing Addendum. We keep it updated as our sub-processors change.</p>',
    '<h2>How we choose and manage sub-processors</h2>',
    '<p>We select sub-processors that we consider capable of providing an appropriate level of security and reliability, and we require them, by contract, to protect information consistent with our commitments, to use it only to provide their services to us, and to maintain appropriate safeguards.</p>',
    '<h2>Categories of sub-processors</h2>',
    '<p><strong>Payments &amp; payouts</strong> — payment processing and Connect payouts (for example, Stripe).</p>',
    '<p><strong>Cloud hosting &amp; database</strong> — application hosting and managed database services (including our distributed database provider).</p>',
    '<p><strong>Email &amp; notifications</strong> — transactional and notification email delivery.</p>',
    '<p><strong>Shipping &amp; logistics</strong> — carrier rating, label generation, and tracking (for example, EasyPost) and fulfillment integrations.</p>',
    '<p><strong>Identity &amp; verification</strong> — where used, business/identity verification for partner onboarding.</p>',
    '<p><strong>Analytics &amp; monitoring</strong> — product analytics and error/performance monitoring.</p>',
    '<p><strong>Production &amp; fulfillment partners</strong> — the manufacturers, printers, co-packers, and warehouses/fulfillment centers that produce and ship your Orders receive the information necessary to perform them.</p>',
    '<h2>Changes and notice</h2>',
    '<p>We may add, remove, or replace sub-processors as the Platform evolves. Where required (including for customers under our Data Processing Addendum), we will provide a mechanism to be notified of new sub-processors and a reasonable opportunity to object on legitimate data-protection grounds. The current list and its effective date are shown here.</p>',
    '<h2>Contact</h2>',
    '<p>Questions about our sub-processors: privacy@ilaunchify.com.</p>',
  ]),
  text: 'iLaunchify Sub-processors (draft, expanded). Referenced by Privacy Policy + DPA. Selection/management (contractual safeguards, use only to serve us). Categories: payments/payouts (Stripe), cloud hosting + distributed database, transactional email, shipping/logistics (EasyPost) + fulfillment, identity/verification, analytics + monitoring, and production/fulfillment partners that make + ship orders. Change notice + objection right for DPA customers; privacy@ilaunchify.com. Not legal advice; pending counsel.',
}

// ── Data Processing Addendum ────────────────────────────────────────────────
const DPA: LegalBody = {
  html: P([
    DRAFT_NOTE,
    '<p>This Data Processing Addendum ("DPA") forms part of the Terms of Service and/or Partner Agreement (the "Agreement") between iLaunchify, Inc. ("iLaunchify") and the customer or partner ("Customer") and applies where iLaunchify processes Personal Data on Customer’s behalf in connection with the Platform. If there is a conflict between this DPA and the Agreement on data-protection matters, this DPA controls.</p>',
    '<h2>1. Definitions</h2>',
    '<p>"Personal Data", "Controller", "Processor", "Sub-processor", "Data Subject", and "Processing" have the meanings given under applicable data-protection law. "Customer Personal Data" means Personal Data that iLaunchify Processes on behalf of Customer under the Agreement.</p>',
    '<h2>2. Roles and instructions</h2>',
    '<p>As between the parties, Customer is the Controller (or a processor acting on behalf of a controller) of Customer Personal Data, and iLaunchify is the Processor. iLaunchify will Process Customer Personal Data only on Customer’s documented instructions — including the instructions in this DPA and as necessary to provide, orchestrate, and support production and fulfillment — unless required by law, in which case iLaunchify will inform Customer unless legally prohibited.</p>',
    '<h2>3. Details of Processing</h2>',
    '<p><strong>Subject matter and duration:</strong> the provision of the Platform for the term of the Agreement and as needed thereafter for the purposes below. <strong>Nature and purpose:</strong> operating the Platform; coordinating partners; processing subscriptions, orders, and payouts; support; security; and legal compliance. <strong>Categories of Data Subjects:</strong> Customer’s personnel and authorized users, and individuals whose data Customer submits. <strong>Categories of Personal Data:</strong> contact and account details, business and role information, order and fulfillment details, and technical/usage data. Customer will not provide special-category data except as expressly agreed.</p>',
    '<h2>4. Confidentiality</h2>',
    '<p>iLaunchify will ensure that personnel authorized to Process Customer Personal Data are bound by appropriate confidentiality obligations and Process the data only as instructed.</p>',
    '<h2>5. Security measures</h2>',
    '<p>iLaunchify will implement and maintain appropriate technical and organizational measures to protect Customer Personal Data, taking into account the state of the art, the costs of implementation, and the nature, scope, and purposes of Processing. These include tenant isolation, role-based access controls and least-privilege administration, encryption of data in transit, audit logging of security-relevant events, and secure development and change-management practices.</p>',
    '<h2>6. Sub-processors</h2>',
    '<p>Customer provides general authorization for iLaunchify to engage the Sub-processors listed on our Sub-processors page to support the Platform. iLaunchify will impose data-protection obligations on each Sub-processor that are no less protective than those in this DPA and remains responsible for their performance. iLaunchify will provide a mechanism to be notified of new Sub-processors and will give Customer a reasonable opportunity to object on reasonable data-protection grounds.</p>',
    '<h2>7. Data Subject requests</h2>',
    '<p>Taking into account the nature of the Processing, iLaunchify will assist Customer by appropriate technical and organizational measures, insofar as possible, to respond to Data Subject requests to exercise their rights. If iLaunchify receives such a request directly, it will, where permitted, direct the Data Subject to Customer.</p>',
    '<h2>8. Assistance</h2>',
    '<p>iLaunchify will provide reasonable assistance to Customer with security, breach notification, data-protection impact assessments, and prior consultation obligations, taking into account the nature of Processing and the information available to iLaunchify.</p>',
    '<h2>9. Personal Data breach</h2>',
    '<p>iLaunchify will notify Customer without undue delay after becoming aware of a Personal Data breach affecting Customer Personal Data, and will provide information reasonably available to help Customer meet its notification obligations. Notification is not an acknowledgment of fault.</p>',
    '<h2>10. International transfers</h2>',
    '<p>V1 of the Platform Processes Customer Personal Data in the United States. Where Customer Personal Data is transferred across borders in a manner requiring a transfer mechanism, the parties will implement an appropriate mechanism as required by applicable law.</p>',
    '<h2>11. Return or deletion</h2>',
    '<p>On expiry or termination of the Agreement, iLaunchify will, at Customer’s choice, delete or return Customer Personal Data, and delete existing copies, except to the extent retention is required by law or reasonably necessary for legal-reproducibility records (for example, records of agreements and acceptances), which remain protected under this DPA.</p>',
    '<h2>12. Audits</h2>',
    '<p>iLaunchify will make available information reasonably necessary to demonstrate compliance with this DPA and will allow for and contribute to audits, including inspections, conducted by Customer or an auditor mandated by Customer, subject to reasonable confidentiality, security, scheduling, and frequency limitations. iLaunchify may satisfy audit requests by providing third-party reports or documentation where available.</p>',
    '<h2>13. Liability and changes</h2>',
    '<p>Each party’s liability under this DPA is subject to the limitations of liability in the Agreement. We may update this DPA to reflect changes in law or our Processing; material changes are notified. Contact: privacy@ilaunchify.com.</p>',
  ]),
  text: 'iLaunchify Data Processing Addendum (draft, expanded). Controls over the Agreement on data-protection matters. Definitions; roles (Customer=Controller, iLaunchify=Processor) + documented instructions; details of Processing (subject/duration/nature/purpose, data-subject + data categories, no special-category data); personnel confidentiality; security measures (tenant isolation, least-privilege access, encryption in transit, audit logging, secure SDLC); sub-processors (general authorization to Sub-processors page + notice/objection + flow-down + responsibility); data-subject-request assistance; assistance with breach/DPIA/consultation; breach notice without undue delay; US processing + transfer mechanism where required; return/deletion on termination (except legal-reproducibility records); audit rights via info/reports/inspection; liability per Agreement; changes notified. Not legal advice; pending counsel.',
}

// ── Accessibility Statement ─────────────────────────────────────────────────
const ACCESSIBILITY: LegalBody = {
  html: P([
    '<p>iLaunchify is committed to making our platform accessible to everyone, including people with disabilities. We are working to conform to the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA, and we treat WCAG 2.2 Level AA as our best-practice benchmark.</p>',
    '<h2>Conformance status</h2>',
    '<p>We are actively working toward WCAG 2.1 AA conformance across our creator, partner, and marketing surfaces. Accessibility is an ongoing effort and some areas may not yet fully conform; where we are aware of gaps, we prioritize fixes and note known limitations below.</p>',
    '<h2>Measures we take</h2>',
    '<p>We include accessibility in our design and engineering process — semantic markup, keyboard operability, visible focus states, sufficient color contrast, descriptive labels and alternative text, and compatibility with common assistive technologies. Accessibility considerations are part of our design-system tokens and component reviews.</p>',
    '<h2>Scope</h2>',
    '<p>This statement applies to the iLaunchify web applications and marketing site. It does not cover third-party content or services that we link to but do not control.</p>',
    '<h2>Known limitations</h2>',
    '<p>Some complex, interactive areas — for example the design studio canvas and certain data-dense tables — may have partial assistive-technology support while we continue improvements. We welcome reports so we can prioritize them.</p>',
    '<h2>Technologies we rely upon</h2>',
    '<p>Accessibility of the Platform relies on HTML, WAI-ARIA, CSS, and JavaScript working with your browser and any assistive technologies installed on your device. Where interactive features require JavaScript, we aim to provide accessible names, roles, states, and keyboard operability.</p>',
    '<h2>Compatibility</h2>',
    '<p>We aim for compatibility with recent versions of major browsers and common assistive technologies (such as screen readers and speech-recognition and magnification tools). Compatibility may vary with older software.</p>',
    '<h2>Feedback</h2>',
    '<p>If you encounter an accessibility barrier, or need content in an alternative format, contact us at accessibility@ilaunchify.com. Please describe the issue, the page or feature, and the assistive technology and browser you were using. We aim to acknowledge feedback promptly and to resolve issues as quickly as we reasonably can.</p>',
    '<h2>Assessment</h2>',
    '<p>We evaluate accessibility through a combination of automated testing and manual review, including keyboard-only and screen-reader checks, and we consider accessibility in design and component reviews. We update this statement as our conformance and processes evolve.</p>',
    '<h2>Escalation</h2>',
    '<p>If you are not satisfied with our response to an accessibility concern, let us know and we will escalate it internally for further review. This statement will be updated with any additional formal contact or complaint options as they become available.</p>',
  ]),
  text: 'iLaunchify Accessibility Statement (draft, expanded). Committed to WCAG 2.1 AA (2.2 AA best practice) across creator, partner, and marketing surfaces; measures built into design + engineering; scope + known limitations (studio canvas, dense tables); technologies relied upon (HTML/ARIA/CSS/JS); compatibility with major browsers + assistive tech; feedback at accessibility@ilaunchify.com; automated + manual assessment; escalation path. Pending review.',
}

// ── Cookie Policy ───────────────────────────────────────────────────────────
const COOKIE: LegalBody = {
  html: P([
    DRAFT_NOTE,
    '<p>This Cookie Policy explains how iLaunchify uses cookies and similar technologies (such as local storage and pixels) on our websites and applications. It should be read together with our Privacy Policy.</p>',
    '<h2>What cookies are</h2>',
    '<p>Cookies are small text files stored on your device when you visit a website. Similar technologies (such as local storage and pixels) work in comparable ways. They help a site function, keep you signed in, remember your preferences, and understand how the site is used.</p>',
    '<h2>Types of cookies we use</h2>',
    '<p><strong>Strictly necessary</strong> — required to operate and secure the Platform, including keeping you signed in, maintaining your session, and protecting against fraud and abuse. These cannot be switched off in our systems.</p>',
    '<p><strong>Preferences</strong> — where used, remember choices you make (such as settings and dismissals) to improve your experience.</p>',
    '<p><strong>Analytics</strong> — where used, help us understand how the Platform is used so we can measure and improve it, on an aggregated basis.</p>',
    '<p>We do not sell your personal information or use cookies for cross-context behavioral advertising.</p>',
    '<h2>Third-party technologies</h2>',
    '<p>Some cookies or similar technologies may be set by our service providers (for example, analytics or security providers) to perform services on our behalf. Their use is subject to appropriate obligations and, where applicable, our Sub-processors page.</p>',
    '<h2>Managing cookies</h2>',
    '<p>You can control and delete cookies through your browser settings, and most browsers let you block or be notified of cookies. Blocking strictly necessary cookies may prevent parts of the Platform from working. Where required by law, we present a cookie choice and record your preference, and you can change it later.</p>',
    '<h2>Do Not Track</h2>',
    '<p>Because there is no consistent industry standard for "Do Not Track" signals, we currently respond to legally required opt-out mechanisms rather than all browser DNT signals; this may change as standards evolve.</p>',
    '<h2>Changes</h2>',
    '<p>We may update this Cookie Policy from time to time; the current version and its effective date are always shown here.</p>',
  ]),
  text: 'iLaunchify Cookie Policy (draft, expanded). Covers cookies + similar tech (local storage, pixels). Types: strictly necessary (session/security, can’t be disabled), preferences, analytics (aggregated); no sale or cross-context ad use; third-party/service-provider technologies (see Sub-processors); manage via browser + recorded cookie choice where required; Do Not Track note; changes shown here. Read with Privacy Policy. Not legal advice; pending counsel.',
}

/** Slug → authored draft body. Consumed by seed-legal.ts. */
export const LEGAL_BODIES: Record<string, LegalBody> = {
  terms: TERMS,
  privacy: PRIVACY,
  'cookie-policy': COOKIE,
  'creator-agreement': CREATOR_AGREEMENT,
  'partner-agreement': PARTNER_AGREEMENT,
  'membership-subscription-terms': MEMBERSHIP,
  accessibility: ACCESSIBILITY,
  'acceptable-use': ACCEPTABLE_USE,
  'refund-dispute-policy': REFUND_DISPUTE,
  subprocessors: SUBPROCESSORS,
  dpa: DPA,
}
