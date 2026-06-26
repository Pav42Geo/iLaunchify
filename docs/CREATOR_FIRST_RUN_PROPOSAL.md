# Creator first-run & empty-state proposal

Pavel asked (2026-06-26): turn the empty creator **Orders** and **Products** pages into
engaging first-run "landings" that pull a new creator toward their first product and first
order (Printful's dashboard was the spark), and resolve whether **Products / Brands / Brand
Identity** should combine. Decision from kickoff: **research → proposal → build**, centered on a
**unified "Get started" hub** (don't rip up the nav).

This doc is the proposal for your sign-off. It's grounded in deep research (sources at the end)
AND in iLaunchify's locked model.

---

## 0. The one thing that shapes everything

On iLaunchify a creator does **not** design a product from a blank canvas. The activation chain is:

> **Marketplace** (pick a proven base product) → **Product** (customize recipe + packaging + label in the Design Studio) → **Order** (place a production batch). Brand is optional (a default is auto-created lazily); **Brand Identity = the asset library** — logos/colors/fonts — that *feeds* the Studio.

So the empty-state job is **not** "here's a blank builder." It's: *orient the creator across brand → product → order, and push them into the marketplace funnel with one obvious next step.*

The research backs a single **aha moment** to build everything backward from (Reforge/Lenny):
**"customize your first product in the Design Studio."** That's the moment a creator sees their
brand on a real product — the iLaunchify magic. Setup moment = *pick a base product*; habit
moment = *repeat orders*.

---

## 1. What the research says (the rules we'll follow)

Distilled from NN/g, Shopify Polaris, IBM Carbon, UserOnboard, Appcues, Reforge/Lenny, and
teardowns of Shopify, Printify, Printful, Canva, Notion, Linear (full citations §7):

1. **An empty state is an onboarding surface, not a placeholder.** Never ship a blank container;
   end onboarding *on* the activation CTA rather than burying it in a busy dashboard. (NN/g, UserOnboard)
2. **Anatomy:** optional image → *positive, action-oriented* title → short body (next step + its
   benefit) → **exactly one** primary CTA → at most one secondary "Learn more." (Carbon + Polaris agree)
3. **One action. Hick's Law.** Don't cram multiple options, jargon, or references to other app
   areas; never a dead end. (Carbon, Laws of UX)
4. **Preview the outcome / pre-seed a sample.** "Success visualization" — show what a finished
   product looks like — converts curiosity into action. Demo data is a *removable scaffold*. (Appcues, Growth.Design, Linear)
5. **Intent-first → branch to a matched starting point.** Canva quantified **+10% activation** from
   intent-branched, template-first onboarding; Notion preloads a template from "what will you use
   it for?" → kills blank-page paralysis.
6. **A getting-started checklist is the proven spine** — 3–5 items, foundational-first, completes
   on *real events*, each item *does* the task. Cap at 5 (a long list reads as homework). (Appcues, NN/g)
7. **Engineer momentum:** pre-complete step 1 and start the progress bar at ~20% (Endowed Progress —
   a field study near-doubled completion, 34% vs 19%). The Zeigarnik pull only fires *after* the user
   starts, so step 1 must be effortless.
8. **Time-to-first-value < 5 min** is the north star; every step must shorten it.
9. **IA = progressive disclosure, max 2 levels, hub-and-spoke** for loosely-coupled concepts;
   reserve a linear wizard for the *one* tightly-sequenced task (create-first-product). (NN/g)
10. **Same URL, time-aware:** first-run shows the hub/checklist; once active it recedes to the
    normal page — never re-onboard a returning user.
11. **Tone:** calm and encouraging for routine empty states (never guilt: "Design your first
    product," not "You have no products"); reserve celebration (confetti, neon) for real wins like
    the first sale. (Shopify, Polaris)
12. **A sample order is a proven first-order on-ramp** ("order one yourself first" — Printful), and
    it already maps to iLaunchify's existing sample-order policy.

---

## 2. Naming & IA recommendation (your open question)

**Keep the three concepts — don't merge the nav — but fix the hierarchy and unify the first run.**

| Concept | Verdict | Why |
|---|---|---|
| **Products** | Keep. Drop "My" → just **"Products."** | Accurate: they ARE the creator's customized products. "My products" is warm but inconsistent with Orders/Brands. Research favors plain, scannable labels. |
| **Brands** | Keep as the umbrella (multi-brand from V1). | A Brand is the *container*; products belong to a brand; orders produce them. |
| **Brand Identity** | **Demote — it is NOT a top-level peer.** Rename to **"Brand kit"** and nest it inside a Brand (and surface it from the Studio). | It's the asset library (logos/colors/fonts) that feeds the canvas — a property *of* a brand, not a sibling of Products/Orders. Elevating it to a 4th peer is exactly the choice-overload trap (Hick's Law). Canva-modeled "Brand kit" naming is clearer than "Brand Identity." |

So the mental model the hub teaches: **Brand (who you are) → Product (what you make) → Order
(produce it)**, with the Brand kit feeding the design step. We unify the *journey*, not the nav.

---

## 3. The design — three surfaces, one language

We build **one shared visual language** and apply it to three places. Not three different designs.

### 3a. The "Get started" hub (new-creator home)

Lives on the creator **Dashboard** when the account is empty; **recedes** to the normal dashboard
once the creator has a product/order (a small dismissible "2 of 3 steps left" banner remains).

Top → bottom:
- **Hero:** `Launch your first product` + one line: *"Pick a proven base product, make it yours in
  the Studio, and we handle manufacturing, printing & fulfillment."* + **one** black-pill CTA
  **"Browse the marketplace →"**. (One action — Hick's Law.)
- **"How it works" mental-model strip** (teaches the model contextually, not an info-dump):
  **① Design** (pick & customize) → **② Produce** (vetted partners make it) → **③ Fulfill** (ships
  to you or your sales channels). Three quiet cards, icon + 4-word label.
- **Getting-started checklist** (the spine, 3 steps, progress bar pre-filled at step 1):
  1. **✓ Account created** (pre-completed — endowed progress).
  2. **● Design your first product** — the hero step (the aha). CTA **"Start designing."**
  3. **○ Place your first order** — quieter / disclosed; unlocks once a product exists.
  Optional quick-win chip: *"Add your logo & colors"* → Brand kit (optional, never a blocker).
- **Outcome preview + reassurance:** a faint "what a finished product looks like" sample card
  (success visualization) and a calm reassurance line (*you approve everything before production;
  typical MOQ 250; ~10-day lead*). No invented stats pre-launch.

### 3b. Empty **Products** page

Replaces today's small dashed box. First-run panel:
- Title **"Design your first product"** · body *"Start from a proven base — supplements, snacks,
  drinks, pet, and more. Customize the recipe, packaging, and label for your brand. We handle
  production."*
- **One** primary CTA **"Browse the marketplace →."**
- **Intent tiles** (the Canva/Notion lever): 4 category starters — *Coffee · Supplement · Snack ·
  Pet* — each deep-links into the marketplace pre-filtered. Beats a blank "create" wall.
- Secondary: a quiet **"See a sample product"** link (outcome preview).
- The per-tab empties (In production / Live / Archived) stay as light *contextual* messages — they're
  "no results in this filter," not first-run, and get calmer copy.

### 3c. Empty **Orders** page

An order can't exist before a product, so this state is **conditional** (and never a dead end):
- **No product yet** → "Your orders will appear here" + the 3-step how-it-works + primary CTA
  **"Design your first product →"** (sends them to the *actual* first step, not a limp "go to products").
- **Has a product, no order** → "Ready to produce?" + surface the specific product (pre-seeded,
  contextual) + CTA **"Set up your order"** + a lower-commitment **"Order a sample first"** option
  (Printful's proven on-ramp; maps to our sample policy).
- Either way: a short **reassurance rail** (you approve before production · MOQ · lead time) to cut
  the anxiety of a big first B2B order.

---

## 4. Build plan (after you approve the direction)

Shared, reusable — consistent with the design-system discipline we just locked:
1. **`FirstRunHub`** + **`GettingStartedChecklist`** (with endowed-progress prefill + progress bar)
   + **`HowItWorksStrip`** + **`StarterTiles`** + **`OutcomePreview`** components in `@ilaunchify/ui`
   (server-safe, token-only colors — they'll pass `check:colors`).
2. Wire the **creator Dashboard** to render the hub when empty, recede when active (time-aware, one URL).
3. Rebuild **`FirstRunEmpty`** on `/products` and the empty branch on `/orders` using the shared pieces.
4. Naming: rename "Brand Identity" → "Brand kit" and re-nest under a Brand; tidy "My products" → "Products."
5. Verify: typecheck, `check:colors`, and a visual pass (like we did yesterday).

Instrumentation hooks (so we can later prove activation, per Reforge): fire events on
`marketplace_opened`, `product_customized` (aha), `first_order_placed`.

---

## 5. What I'd explicitly NOT do
- Not a blank product builder, not fake social-proof counts, not a 4th "Brand Identity" nav peer,
  not a forced linear wizard across brand+product+order, not three unrelated empty-state designs,
  not celebratory tone on routine empties.

---

## 6. Open decisions for you (in the mockup review)
1. Hub location: the **Dashboard** (recommended) vs. a dedicated `/start` route.
2. Brand step in the checklist: **optional quick-win** (recommended) vs. a required step 1.
3. Naming: approve **"Brand kit"** + plain **"Products"**?

---

## 7. Sources
- NN/g — Designing Empty States in Complex Applications · https://www.nngroup.com/articles/empty-state-interface-design/
- NN/g — Progressive Disclosure · https://www.nngroup.com/articles/progressive-disclosure/
- IBM Carbon — Empty states pattern · https://carbondesignsystem.com/patterns/empty-states-pattern/
- Shopify Polaris — Empty state · https://polaris-react.shopify.com/components/layout-and-structure/empty-state
- Shopify UX — designing 26+ empty states · https://ux.shopify.com/empty-states-more-like-you-have-no-idea-how-much-work-goes-into-those-states-amirite-e0102f58b64e
- Shopify dev — Setup guide composition · https://shopify.dev/docs/api/app-home/patterns/compositions/setup-guide
- UserOnboard — Empty States pattern · https://www.useronboard.com/onboarding-ux-patterns/empty-states/
- Appcues — SaaS onboarding screens / checklist best practices · https://www.appcues.com/blog/saas-onboarding-screens · https://docs.appcues.com/checklists/checklist-best-practices
- Printify +10% activation (Appcues case) · https://www.appcues.com/customer-stories/how-printify-harnessed-data-to-deliver-a-10-uplift-in-flow-conversion
- Canva +10% activation (Appcues) · https://www.appcues.com/blog/canva-growth-process
- Notion blank-page strategy · https://onboardme.substack.com/p/how-notion-solved-the-blank-page-product-strategy-deepdive
- Linear onboarding teardown · https://www.candu.ai/blog/linear-onboarding-teardown
- Endowed Progress Effect — Kivetz, Urminsky & Zheng 2006 (JMR) · https://home.uchicago.edu/ourminsky/Goal-Gradient_Illusionary_Goal_Progress.pdf
- Lenny / Reforge — activation metric & aha moment · https://www.lennysnewsletter.com/p/how-to-determine-your-activation · https://www.reforge.com/guides/define-your-aha-moment
- Printful — first product / manual + sample orders · https://help.printful.com/hc/en-us/articles/360014007240
