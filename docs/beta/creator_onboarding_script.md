# Creator Onboarding Script — White-Glove Kickoff Call

**Audience:** Pavel (founder, host)
**Duration:** 30 minutes
**Context:** First call with each accepted creator after their application clears screening. Goal is to move them from "I applied" to "agreement signed + first product target chosen" in a single sitting.

This is a guide, not a script. Read the room. The conversation is more important than the agenda. But these are the load-bearing beats.

---

## Pre-call prep checklist (Pavel — 15 min before call)

- [ ] Pull up creator's application form. Note their declared product, niche, audience size, channel, target launch date, budget
- [ ] Pull up their channel — Shopify or TikTok Shop. Skim their existing product line if any. Notice their brand voice
- [ ] Pull up their social: TikTok / Instagram / YouTube. Watch their last 3 videos. Note tone, audience interaction style, what they actually care about
- [ ] Skim any prior products they've launched (mentioned in question 4 of application form)
- [ ] Map their declared product to:
  - 1 of the 13 locked product categories
  - 1 primary + 0-2 secondary of the 8 locked niches
  - Best-fit ProductTemplate in the marketplace (run a quick search)
  - Likely partner pool (which of our 4-6 partners match their format)
- [ ] Open the Creator Agreement DocuSign template in a separate tab — ready to send post-call
- [ ] Open the admin `/admin/creators/[id]` page (after their account is created or use draft URL)
- [ ] **Open and re-read their application's #8 answer** ("what's the biggest unknown for you in launching this?"). This is the most important sentence for the call. Plan to start the agenda from this answer.

---

## Call agenda (30 minutes)

| Block | Duration | Goal |
| --- | --- | --- |
| Intros + their brand | 10 min | Understand their context; build trust |
| Platform walk-through | 10 min | Show, don't tell; tie features to their goal |
| Commitments + agreement signing | 10 min | Move from interest to commit. Sign agreement. Schedule next touch |

The rhythm matters: 10 / 10 / 10. If the first block runs over, the call still works. If the third block gets cut, you've lost the call. Watch the clock.

---

## Block 1 — Intros + their brand (0-10 min)

### Talking points (script-style — not verbatim)

**Pavel opens:**

> "Thanks for jumping on. Before we dive in, I want to spend the first 10 minutes just understanding what you're trying to do and why. The platform stuff comes after that — I find it lands better when I know what specifically you're trying to solve. Sound good?"

**Question 1:** *"Walk me through what you're trying to launch and why now."*

Listen for:
- Is this their first CPG product or have they launched before?
- What's the motivation — audience demand they've validated? A personal product they want? Strategic line extension?
- How confident do they sound about the product spec vs the marketing?
- Any red flags around claims (weight loss, disease, performance)

**Question 2:** *"Tell me about your audience — what do they buy from you today, and what would they actually pay for?"*

Listen for:
- Channel reality (do they have an actual sales motion or just an audience?)
- Price point comfort
- Whether they understand CPG margins

**Question 3:** *"You said in your application that [their #8 answer] is the biggest unknown. Talk to me about that — where specifically are you stuck?"*

This is the single most important question. It tells you:
- What template / partner / feature they actually need
- How much hand-holding to plan for
- What week-1-blocker is most likely
- Whether they're ready

If the answer is "I don't know what to make" or "I haven't decided on a niche yet" — **gently push them back to the waitlist.** Cohort 1 is for people with a defined product in mind, not for product-discovery work.

**Question 4 (transition):** *"Cool — I want to show you how we handle that specifically. Mind if I share my screen for a few minutes?"*

---

## Block 2 — Platform walk-through (10-20 min)

### Pre-screen-share setup

- Marketing site `apps/marketing` open in one tab — the `/marketplace` page
- Creator app `apps/creator` open in another tab — pre-logged in as a demo creator account
- The specific ProductTemplate that maps to their declared product, queued up in a third tab

### Walk-through arc (8 minutes of content + 2 min Q&A)

**Step 1 — The marketplace (2 min).**

> "This is where you start. We have [N] templates in your category right now. Filtering by [their niche] gives you these options. Each card shows the partner producing it, the MOQ, the lead time, and a price ladder by volume. Notice we don't show prices unless you're logged in — partners specifically asked for that. So no consumer or competitor can scrape us."

Click into the template that best matches their declared product.

**Step 2 — Product detail page (1.5 min).**

> "Here's what a template looks like. Five tabs — Description, Recipe & Nutrition, Ingredients, Compliance, Packing. The Recipe tab is where you'd customize — swap ingredients, add or remove optionals. We auto-recalculate nutrition facts in real time, and the compliance scan runs every save. We codified the FDA Food Labeling Guide and Supplement Labeling Guide into rule packs that run server-side. We'll talk about your specific compliance flags in the studio."

> "The Customize button starts your design flow."

**Step 3 — Design Studio (3 min).**

> "This is where most of the magic is. Canvas-based, you can upload your own label design or start from a template. Brand-aware — once you've set up your brand colors and fonts in your account, everything pre-fills. Compliance scan runs continuously and the at-your-own-risk acknowledgment fires at export."

Demonstrate dragging a logo + dropping a Nutrition Facts panel. Don't dwell. The Studio sells itself once they see it.

**Step 4 — Checkout (2 min).**

> "Three-step checkout. Review your design. Production options — quantity, substrate, packaging material, finish, with live pricing. And payment + fulfillment. Stripe handles the payment. We orchestrate the rest — your dispatch goes to the manufacturer, the label print goes to a separate printer, the finished inventory ships to a warehouse partner. You see one timeline; we hide the complexity."

**Step 5 — Orders timeline (30 sec).**

> "Once placed, you see this Amazon-style timeline. Every state transition is logged. Every shipment notification fires. If anything goes wrong, you can adjust mid-flight — we'll talk through how that works in the beta."

**Q&A (2 min, hard cap).**

Their questions tell you their concerns. Common ones:
- "What if my creator audience doesn't like the product?" → "That's why we have the sample order with the First Sample Discount before main run. We'll set that up today."
- "What if the partner doesn't ship on time?" → "Real partners, real SLAs. We're hand-picking 4-6 partners. If one fails, I personally reroute you. There's no auto-cancellation drama because I'm in your Slack channel from day 1."
- "How much does this cost me?" → "Real production cost — manufacturer rate per unit, label print, shipping. The 9-15% platform fee that normally applies is waived for the 90-day beta in exchange for your structured exit interview and case-study willingness. So you pay the real cost of the goods + zero platform tax."

---

## Block 3 — Commitments + agreement signing (20-30 min)

### Talking points

**Pavel transitions:**

> "Okay — assuming this matches what you wanted to build, I want to lock a few specific things before we end. Three pieces: pick your first product target, get you on the agreement, and schedule our next touchpoint."

### Decisions to capture on the call

| Decision | What to write down | Where it lives after the call |
| --- | --- | --- |
| First product target | Specific template (or "blank" if from scratch — discourage for cohort 1) + their custom flavor / dose / size | `Product.beta_target` (string note on creator dashboard) + Pavel's beta journal |
| Preferred channel | Shopify URL or TikTok Shop handle | Their User profile + cohort tracking sheet |
| Target launch date | A specific Friday in the next 90 days | Calendar invite + cohort timeline |
| Sample order intent | "Yes, I want to place a sample order in the next 7 days" / "Skip samples, going straight to first run" — strongly recommend samples for first-timers | Pavel's beta journal |
| Audience-size band | The screening-form answer, confirmed verbally | `BetaParticipant.audienceSize` (see schema spec) |
| Stripe payment method | Their card type — we'll add it during onboarding. If they say "I don't have one ready" — yellow flag | Verified during onboarding completion |
| Public participation comfort | "Yes name me / ask me at the end / no never" | `BetaParticipant.publicNameConsent` field |
| Emergency contact channel | Their cell number for the rare critical-issue scenario | Saved to admin, in the welcome message |

### Agreement signing

> "Here's the deal in plain language: you commit to placing at least one production order in the next 60 days, completing a structured exit interview at day 90, and being willing to give us feedback in real time via the shared Slack channel. We commit to founder-direct attention, response time under 2 hours business hours, real partner relationships, and the platform fee waived for 90 days. That's it. Three pages, mostly compliance liability and standard CPG terms. I'll DocuSign you the agreement right now. Sign it tonight if you can."

Send the Creator Agreement via DocuSign before the call ends. Confirm they got it.

If they hesitate on signing:
- Ask why specifically
- Common hesitation: compliance liability language. Walk them through the compliance scan + ack flow + counsel-reviewed language. Often resolved on the call.
- Other common hesitation: "I want to talk to my partner / accountant." Acceptable — agree on a 48-hour window to sign or decline.

### Scheduling next touchpoint

> "I'll send you a calendar invite for our 48-hour check-in tomorrow. We'll get your account set up, walk through the brand quickstart, and pick your first template officially. After that, we have weekly office hours every [day/time] — totally optional, but I find creators who show up move faster. And I'm in your Slack channel from the day your account goes live."

Schedule the next call inside the meeting. Don't promise "I'll send a calendly link" and leave it open — that adds 2-5 days of back-and-forth and is the single biggest cause of cohort drop-off in the kickoff phase.

### Close

> "Last thing — what's the one thing you want me to remember about your launch? In one sentence."

Write down their answer verbatim. Reference it in the post-call follow-up. This is the most important sentence of the entire 30-minute conversation. It comes back at day 30 ("remember when you said X — we're on track / off track / nailed it").

---

## Post-call follow-up email template

Send within 2 hours of the call.

```
Subject: iLaunchify beta — quick recap + next steps

Hey [first name],

Great talking. Quick recap so we're aligned:

- Your first product target: [specific template + customization]
- Your channel: [Shopify URL / TikTok Shop handle]
- Target launch: [Friday, [date]]
- You're [yes/maybe/no] on public participation

What's coming:

1. DocuSign Creator Agreement is in your inbox — please sign by [date 48 hrs out]
2. We have a 48-hour check-in tomorrow at [time] — calendar invite attached
3. I'll send the Slack channel invite the moment your agreement is countersigned
4. Office hours every [day] at [time] — optional but recommended; first one is [date]

The one sentence I'm holding onto: "[their exact quote]." I'll come back to that at day 30.

Anything you want to add before we kick off? Just hit reply.

— Pavel
[cell number]
```

---

## 48-hour touchpoint script (Day 2)

**Format:** 20-minute Zoom. Goal: complete creator 5-step onboarding + brand quickstart + pick template officially.

**Agenda:**

1. **Confirm agreement signed.** If not, address the blocker. No further progress without signature.
2. **Walk them through the 5-step onboarding stepper** per `ilaunchify-creator-onboarding.md`:
   - Step 1: Tell us about you (market = US, region = their state) — auto-fill from application
   - Step 2: Payment (Stripe Customer setup) — they enter card on call
   - Step 3: Connect channel (optional in onboarding, but for cohort 1 we strongly encourage day-2 — they have Shopify or TikTok Shop already, OAuth takes 2 min)
   - Step 4: Brand quickstart at `/brands/new` — upload logo, pick palette + type pair from curated library, voice tags ≤2. We do this together on the call.
   - Step 5: Pick first product — go to marketplace, customize template, save as draft. Don't place an order yet.
3. **Confirm next checkpoint:** "We'll talk on day 7. Between now and then, I want you to play with the Design Studio. Aim for a draft label by end of week."

Capture in `BetaParticipant.onboardingNotes`: any friction, surprises, the customization decisions they made.

---

## 7-day touchpoint script (Day 7)

**Format:** Async Slack thread by default. Promote to 15-min Zoom if anything's stuck.

**Pavel posts in their channel:**

```
Hey [name] — checking in on day 7. Three quick yes/no questions:

1. Is your draft label done?
2. Are you ready to place a sample order this week?
3. Anything blocking you?

If all good, I'll match you with [partner name] for the sample order — they specialize in [their format] and can turn samples in [N] days.

If any blockers, let's hop on Zoom — pick any of these times: [3 windows]
```

If they reply "all good" → match them with partner, create the first dispatch, watch it like a hawk.

If they reply with a blocker → diagnose. Common day-7 blockers:
- Compliance scan flagging something they don't understand → 15-min Zoom to walk through the specific flag
- Indecision on packaging spec → 15-min Zoom to walk through their format options
- Cold feet on real money → empathetic conversation about scope of first sample (≤9 units, lowest possible cost) + reaffirm beta fee waiver

If no reply within 48 hours → Pavel-personal cell text. Day-7 silent treatment is the #1 churn signal.

---

## 14-day touchpoint script (Day 14)

**Format:** Scheduled 20-min Zoom. Goal: sample order placed or explicit blocker captured.

**Agenda:**

1. **State of their first sample.** Placed? Accepted by partner? In production? Delivered?
2. **Walk through the partner-side timeline together.** Show them where their dispatch is in the partner's FSM. Demystify the orchestration.
3. **Pre-empt the main-order question.** "Once your sample arrives and you taste / inspect / show your audience, we'll talk about the main order. Conservative first run is 250-500 units depending on your channel velocity. Don't go bigger on run 1 — almost everyone over-orders the first time."
4. **Push for week-3 design start on main order.** "Even if samples aren't here yet, you can start the main-run label work in parallel. Want to lock that in?"

Capture in `BetaParticipant.notes`: their sample-order experience, any partner-side friction, their main-order quantity intent.

If by day 14 they have not placed even a sample order, schedule a 30-min "is iLaunchify a fit for you right now" conversation. Be honest. Some people are not ready and that's okay. **Better to graceful-exit a not-ready creator at day 14 than to drag them through 76 more days of churn risk.**

---

## What to never do on these calls

- **Never promise a feature that doesn't exist.** If they ask "can you do Amazon push," the answer is "not in V1; that's V1.1 — we expect Q[X]." Not "yes" or "soon."
- **Never frame the fee waiver as charity.** It's a beta-for-feedback exchange. Equal trade.
- **Never apologize for the platform's roughness.** It is genuinely sophisticated. If something's rough, frame it as "you're seeing the production system at week-zero of GA-readiness — your feedback this week is what makes it not-rough by week-eight."
- **Never sell the platform.** They're already past that. Sell the relationship + the founder-direct attention + the partner network.
- **Never let a creator off the call without a written, time-bound next commitment.**
