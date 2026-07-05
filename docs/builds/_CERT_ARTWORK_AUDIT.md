# Certificate artwork audit — all 89 CertificateTypes

Date: 2026-07-05 · Scope: `docs/builds/_certificates-master-catalog.json` (89 certs) vs local/uploaded PNG+SVG badge assets.
Every claim below verified against the issuing body's own domain (or gov domain). No logo-scraper sites were used.

## 1. Current asset state

Each `CertificateType` has two image slots: `thumbnailFileId` (PNG, web badge) and `badgeSvgFileId` (SVG, print). Both are admin-uploaded via `/admin/certificate-types` and **NULL for all 89 types** (public detail pages hide badges until uploaded — intentional).

| State | Certs |
|---|---|
| ✅ Local PNG+SVG staged (`docs/builds/_public-cert-seals/`, untracked, NOT yet uploaded) | `usda-organic` (4 variants), `eu-organic` (6 variants) |
| ❌ No artwork anywhere | the other 87 |

## 2. Research verdict — the headline

**Only 9 of 89 marks have any official public artwork download, and even those remain trademark-licensed for on-product use. ~66 are licensee-gated (artwork issued only after a certification contract). 11 have NO official mark at all — rendering a badge for them would be misbranding. 3 are dead ends.**

Consequence: iLaunchify **cannot ship bundled logo assets** for the gated marks — bundling would itself be trademark infringement. The compliant platform pattern (consistent with your existing consent-at-claim gating):

1. **Free/public government + published marks** → admin uploads canonical PNG+SVG (the pipeline you already built for USDA/EU).
2. **Gated marks** → partner/creator uploads the artwork issued by *their* certifier + certificate number; platform renders it only for that verified entity.
3. **No-mark certs** (cGMP, HACCP, MoCRA, AAFCO, FEDIAF, WSAVA, ISO 22000, SBTi…) → text-only compliance chips, never a badge.
4. **Facility-scheme logos** (BRCGS, IFS, FSSC 22000, ISO, SQF food-safety codes) → **hard-block in the die-line validator**: prohibited on consumer packaging by their own rules.

## 3. FREE public official downloads (9)

Use restrictions still apply — "downloadable" ≠ "placeable on any label."

| Cert | Download page | Formats | Legal requirement |
|---|---|---|---|
| USDA Organic | https://www.ams.usda.gov/rules-regulations/organic/organic-seal | JPG, GIF, AI, EPS | 7 CFR 205.311 — NOP-certified products only (≥95% organic); mandated colors |
| EU Organic (Euroleaf) | https://agriculture.ec.europa.eu/farming/organic-farming/organic-logo_en | JPEG, PDF, GIF, EPS, AI + user manual | Reg. (EU) 2018/848 — mandatory on EU organic prepack; min 13.5×9 mm; control-body code required |
| Oregon Tilth (OTCO) | https://tilth.org/help-center/oregon-tilth-logos/ | JPEG, PNG, TIFF, EPS | OTCO-certified clients only; labels pre-approved by OTCO |
| PA Certified Organic | https://paorganic.org/certification/already-certified/logo-download/ | PNG, JPG (EPS links partly broken) | PCO-certified ops only; label pre-approval required |
| Regenerative Organic | https://regenorganic.org/certification-resource-library/ | EPS + SVG zips (®/™, EN+FR) | ROA license; every use pre-approved via label@regenorganic.org ≥30 days pre-print; level colors (Bronze/Silver/Gold) |
| V-Label | https://www.v-label.com/press-materials/ | PNG, PDF, EPS | Press use only; on-product use = paid annual license via V-Label licensor |
| Fair Trade USA | https://design.fairtradecertified.org/brand/fair-trade-marks/ | Public Box packages (vector + raster) | Label Use Guide; certified products / approved partners only |
| B Corp | https://usca.bcorporation.net/brand-guidelines-for-b-corps/ | ImageRelay pack (PNG + vector) | Certified B Corps only; brand.bcorp.com guidelines |
| 1% for the Planet | https://www.onepercentfortheplanet.org/press-kit | ImageRelay hi-res | Active business members only; no alterations |

## 4. GATED — artwork only from the certifier after contract (~66)

Best official page per mark (licensee/brand-asset entry point):

**Organic:** CCOF https://www.ccof.org/resources/labeling-logos/ (member form) · QAI (now NSF) https://www.nsf.org/food-beverage/organic-specialty-foods · Canada Organic — via CFIA-accredited cert body (SFCR Part 13) https://inspection.canada.ca/en/food-labels/labelling/industry/organic-claims · Demeter https://www.demeter-usa.org/about-demeter/biodynamic-certification-marks.asp

**Non-GMO:** Non-GMO Project https://www.nongmoproject.org/product_resources/trademark-use-guide/ (license via Technical Administrator) · NSF Non-GMO https://www.nsf.org/food-beverage/organic-specialty-foods

**Kosher (all gated, artwork from agency post-contract):** OU https://oukosher.org/blog/industrial-kosher/ou-labeling-requirements-guide/ · OK https://www.ok.org/companies/certification-process/the-ok-kosher-symbol-rights/ (usage-guide PDF public) · Star-K, Kof-K, CRC — contact agency directly (no download pages exist)

**Halal:** IFANCA (Crescent-M, USPTO reg. 4107238) https://ifanca.org/ · HFA UK https://halalfoodauthority.com/provisions-for-the-use-of-hfa-logo/ · JAKIM — statutory offence to misuse; SPHM cert holders only https://www.halal.gov.my/

**Vegan:** Vegan Action https://vegan.org/certification (annual license) · Vegan Society https://www.vegansociety.com/the-vegan-trademark

**Fair trade / eco-social:** Fairtrade Int'l https://www.fairtrade.net/en/for-business/how-to-get-involved/licensee-resources/mark-use-guidelines-.html (Connect system approval per use) · Fair for Life https://www.fairforlife.org/en/our-labels/fair-for-life/ · Rainforest Alliance https://www.rainforest-alliance.org/business/marketing-sustainability/using-our-logo-and-seal/ (per-use approval in Claims Platform) · Bird Friendly (Smithsonian, per-lb royalty) https://nationalzoo.si.edu/migratory-birds/for-importers-roasters-and-distributors

**Gluten-free / diet:** GFCO https://gfco.org/wp-content/uploads/2024/05/2003-P-GFCO-Branding-Standard-11.pdf (standard public, artwork to licensees) · NSF Gluten-Free https://www.nsf.org/food-beverage/gluten-free-certification · Whole30 https://whole30.com/partners/ (revenue+SKU-based fee) · Certified Paleo + Keto Certified https://paleofoundation.com/get-certified/ · AHA Heart-Check https://www.heart.org/en/healthy-living/company-collaboration/heart-check-certification ($250–$6,000/yr + $5M insurance naming AHA) · Clean Label Project https://cleanlabelproject.org/purity-award/ · Upcycled Certified https://static1.squarespace.com/static/606ce580b6b9b6777f470253/t/620eb4dcf78b3248facf5e75/1645130972707/UFA-UpcycledCertified-MarkUsageGuide-V2-210713.pdf

**Food safety (facility schemes — see §6 packaging ban):** SQF https://www.sqfi.com/the-sqf-code/comply-with-the-code/sqf-logo-rules-of-use-ed-10 (note: "Levels 1–3" retired → Fundamentals / Food Safety / Quality codes) · BRCGS https://www.brcgs.com/media/1495823/brcgs-brand-guidelines-for-certificated-sites.pdf · IFS https://www.ifs-certification.com/index.php/en/terms-and-conditions-for-using-the-ifs-logos · FSSC 22000 https://www.fssc.com/ · PrimusGFS https://primusgfs.com/wp-content/uploads/2025/08/PGFS-ND-030-R0-PrimusGFS-v4.0-General-Regulations.pdf

**Supplement testing (on-pack eligible, per-product/lot):** USP Verified https://www.usp.org/verification-services/verified-mark · NSF Certified for Sport https://www.nsfsport.com/our-mark.php · NSF/ANSI 173 https://www.nsf.org/about-nsf/nsf-mark · Informed Sport https://sport.wetestyoutrust.com/about/certification-process · Informed Choice https://choice.wetestyoutrust.com/ · BSCG https://www.bscg.org/assets/images/bscg-certified-drug-free-marketing-seal-guidelines.pdf · ConsumerLab https://www.consumerlab.com/seal/ (PAID seal license; auto-terminates on failed retest)

**Cosmetics:** COSMOS Organic/Natural https://media.cosmos-standard.org/filer_public/fe/64/fe64bd35-9357-4e24-a891-ba79dd6789be/cosmos-standard_labelling_guide_v40.pdf (signature must appear with certifier's mark) · NATRUE https://natrue.org/our-standard/documents/ · Soil Association https://www.soilassociation.org/certification/marketing-organic/using-the-organic-symbol/ (.eps/.jpeg/.png ZIP emailed to licensees) · NPA https://www.npanational.org/certifications/natural-seal/natural-personal-care/ · Made Safe https://madesafe.org/pages/why-made-safe · EWG Verified (+Kids) https://www.ewg.org/ewgverified/get-the-mark.php · Leaping Bunny https://www.leapingbunny.org/leaping-bunny-logo ($500–$4,500 one-time) · PETA https://www.peta.org/about-peta/learn-about-peta/info-businesses/join-petas-ultimate-cruelty-free-list/ ($350 one-time) · AllergyCertified https://allergycertified.com/get-certified/ (0.45% of certified turnover/yr)

**Pet:** NASC https://www.nasc.cc/nasc-seal/ · G.A.P. https://globalanimalpartnership.org/brand-book/

**Sustainability:** Climate Neutral https://www.changeclimate.org/labeling · CarbonFree https://carbonfund.org/carbonfree-product-certification/ (now with ClimeCo) · rePurpose Plastic Negative https://www.repurpose.global/plastic-recovery-claims · BPI https://bpiworld.org/using-the-bpi-mark · Cradle to Cradle https://cdn.c2ccertified.org/resources/certification/guidance/POL_Trademark_Use_Guidelines_2021-04.pdf · FSC https://trademarkportal.fsc.org/ (label generator, 70+ languages; license code mandatory on every use) · MSC https://www.msc.org/for-business/use-the-blue-msc-label (AI/EPS/JPEG/TIFF/PDF after MSCI license; **annual fee + royalties**) · ASC https://asc-aqua.org/business/our-label/ (also via MSCI) · USDA BioPreferred https://www.biopreferred.gov/BioPreferred/faces/pages/CompanyTools.xhtml (**confirmed behind eAuthentication**) · Carbon Trust https://www.carbontrust.com/what-we-do/carbon-footprint-labelling ("Carbon Trust Standard" superseded by current label suite) · Plastic Free https://www.plasticfreecertification.org/ (administered by Control Union)

## 5. NO OFFICIAL MARK — render as text chips, never badges (11)

| Cert | Why | Source |
|---|---|---|
| cgmp-food / cgmp-supplement | No FDA/cGMP logo exists; implying FDA endorsement violates federal law. Text claim only. | https://www.fda.gov/about-fda/website-policies/fda-name-and-logo-policy |
| haccp | Methodology, not a certification — no official seal | https://www.fda.gov/food/hazard-analysis-critical-control-point-haccp |
| mocra-compliant | Registration confers no seal; FDA prohibits implying endorsement | same FDA policy |
| iso-22000 | ISO permits NO ONE to use the ISO logo re: certification; CB marks must not appear on products | https://www.iso.org/iso-name-and-logo.html |
| aafco | AAFCO does not approve/certify pet food — nutritional-adequacy STATEMENT text only. A rendered "AAFCO seal" = misbranding | https://www.aafco.org/consumers/understanding-pet-food/frequently-asked-questions/ |
| fediaf | Guidelines body; "formulated to FEDIAF guidelines" text only | https://europeanpetfood.org/self-regulation/nutritional-guidelines/ |
| wsava-compliant | WSAVA does not certify/endorse any pet food; unofficial self-claim — never a seal | https://wsava.org/global-guidelines/global-nutrition-guidelines/ |
| pet-food-institute | Trade-association membership, no on-pack seal | https://www.petfoodinstitute.org/membership/ |
| sbti | Corporate target validation, not an on-pack ecolabel; logo gated + full target language required | https://sciencebasedtargets.org/resources/files/SBTi-communications-guide-for-organizations-taking-action.pdf |
| gluten-free-society | No product-certification mark found on official site | https://www.glutenfreesociety.org/ |

## 6. HARD packaging bans (die-line validator rules)

Per their own published rules, these must **never appear on consumer product packaging** (facility schemes):
- **BRCGS** — allowed B2B, prohibited on consumer packaging (brand guidelines for certificated sites)
- **IFS** — "shall NOT appear on the product, primary packaging, or material reaching end consumers"
- **FSSC 22000** — not on product/labelling/packaging (their most common audit nonconformity)
- **ISO 22000 / ISO logo** — never on products
- **SQF food-safety codes** — packaging absent from permitted-use list (separate gated Quality Shield exists)

## 7. Dead ends / catalog fixes needed

- `halal-supplements` (Halal Council America) — site serves no content; **unverifiable**, flag or remove.
- `nut-free-certified` — nutfreecertified.com empty; no verifiable program.
- `allergen-control-group` — allergenfreecertification.com defunct; GFCP program now owned by **BRCGS** → https://glutenfreecert.com — update `issuingBodyUrl`.
- `sqf-level-1/2/3` — SQF retired "Levels"; rename to Fundamentals / Food Safety Code / Quality Code.
- `qai-organic` — qai-inc.com redirects to nsf.org; update `issuingBodyUrl`.
- `heart-check`, `carbon-trust-standard` — program/label names updated at source; refresh copy.

## 8. Recommended next actions

1. Upload the staged USDA + EU pairs via /admin/certificate-types (canonical: `usda-organic-seal-color`, `EU_Organic_Logo_Colour_54x36mm`; alternates as C7 variants).
2. Download + convert (same gs→inkscape pipeline) the 3 newly found free ones worth having: **Oregon Tilth, PCO, Regenerative Organic** (ROC ships SVG natively — no conversion needed). Optionally V-Label/FTUSA/B Corp/1%FTP for *display-only* chips with a "license required" flag.
3. For the ~66 gated marks: build the partner-uploaded-artwork path (artwork + cert number + license evidence: FSC license code, MSC royalty agreement, RA claims approval).
4. Add the §5 no-mark list as `TEXT_ONLY` cert types (no badge slot) and §6 facility schemes as `NO_CONSUMER_PACKAGING` in the badge placement gate.
5. Apply §7 catalog fixes to `_certificates-master-catalog.json`.
