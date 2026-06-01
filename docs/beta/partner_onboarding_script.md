# Partner Onboarding Script — White-Glove Kickoff Call

**Audience:** Pavel (founder, host)
**Duration:** 30 minutes
**Context:** First call with each accepted production partner after their application clears screening. The whole point is to move them from "we filled out the form" to "Stripe Connect active + first dispatch SLA committed + agreement signed" in one sitting.

Partners are a different conversation from creators. They're businesses, not personalities. They want operational clarity, payment certainty, and a defined commercial relationship. Be specific. Be brisk. Respect their time — most partner principals run real factories and don't have spare cycles for vague conversations.

---

## Pre-call prep checklist (Pavel — 15 min before call)

- [ ] Pull up their partner application form. Note primary + secondary service types, facility locations, capacity, lead times, MOQ, certifications declared, years in business
- [ ] Pull up their website. Skim their About + Capabilities + any case studies. Look for the kind of clients they serve (large CPG brands, small creator brands, both)
- [ ] Pull up their LinkedIn — both the company page and the principal contact's profile. Note their tenure, their network
- [ ] Verify their declared certifications are real (cGMP, NSF, USDA Organic — quick search of their registration number)
- [ ] **Run a Stripe-eligibility sanity check.** Their business class, their state of incorporation, any visible reasons Stripe Connect Express might reject them
- [ ] Map their service portfolio to the cohort:
  - Which creators in the cohort match their format?
  - Which other partners they'll be in workflow-graph dispatches with?
  - What's their likely first dispatch?
- [ ] Open the Partner Agreement DocuSign template in a separate tab
- [ ] Open the admin `/admin/partners/[id]` page (after creating their lead → invited record)
- [ ] **Pre-fill the partner's onboarding accordion in admin** so the call is "walk through what's already structured" not "fill out a form together"

---

## Call agenda (30 minutes)

| Block | Duration | Goal |
| --- | --- | --- |
| Intros + capability deep-dive | 10 min | Verify capabilities; build trust |
| SLA + commercial conversation | 10 min | Lock the commercial relationship verbally |
| Stripe Connect + first dispatch commitment | 10 min | Get them ACTIVE on Stripe; commit to first dispatch creator |

The third block is the load-bearing one. If you don't end the call with a written first-dispatch commitment, the call hasn't converted.

---

## Block 1 — Intros + capability deep-dive (0-10 min)

### Opening

> "Thanks for jumping on. I want to spend the first 10 minutes really understanding what you do and what you're best at. We're recruiting a small group of partners for cohort 1 of our closed beta, and I'm trying to figure out the specific dispatches you're a fit for. Cool to start there?"

### Capability verification questions — tied to the 5-layer onboarding

Per `ilaunchify-partner-onboarding.md`, the 5 layers are Identity, Capability, Standards, Commercial, Integration. The screening application captured Identity at a basic level. The kickoff call deepens Capability + opens Standards.

**Question 1 (Capability — formats):** *"Walk me through your top 3 product formats by volume — what do you make the most of?"*

Listen for:
- Capsule vs powder vs liquid vs RTD beverage vs gummy vs treat
- Their preferred size ranges (a partner that does 30-count capsule bottles isn't a fit for 240-count)
- Anything they explicitly won't do (e.g., "we don't do gummies" — important to know)

Cross-reference with cohort's declared products. Confirm overlap.

**Question 2 (Capability — substrate / packaging):** *"What substrates do you keep in stock or have ready supplier relationships for? What's a 4-week lead-time substrate vs. a 1-week one?"*

This maps directly to the `Substrate` + `PackagingMaterial` catalog wiring in G3. The partner's answers populate their `PartnerService.substrates` + `PartnerService.packagingMaterials` junctions.

**Question 3 (Capability — capacity):** *"Realistically, if I send you a 1,500-unit dispatch tomorrow, what's the lead time? What if it's 5,000?"*

Listen for honesty about capacity. A partner that says "anything by next week" is either bluffing or hungry — either way, calibrate.

**Question 4 (Standards — certifications):** *"You listed [cert names] on the application. Talk me through your maintenance cycle — when's your next audit, who's the certifying body, and where are the docs?"*

Verify they can produce the actual cert PDFs (we'll collect during onboarding). Listen for evasiveness — that's the #1 red flag for cert paper-tigers.

**Question 5 (Standards — quality):** *"How do you handle a creator who wants a tweak mid-production — do you do change-orders, do you re-run, what's your policy?"*

This previews the multi-partner approval workflow (`docs/MULTI_PARTNER_APPROVAL_WORKFLOW.md`). Partners who say "no changes once production starts" are honest but inflexible — note it. Partners who say "we can re-run if customer pays" are flexible — better fit for cohort 1 where edge cases are likely.

---

## Block 2 — SLA + commercial conversation (10-20 min)

### The SLA conversation

> "Here's what we're asking of partners during the beta. I want to be explicit so there's no ambiguity later."

**Read the SLA list slowly.** This is a verbal commitment that gets ratified in the Partner Agreement, but the verbal yes matters.

| Commitment | Specifics |
| --- | --- |
| Dispatch acceptance | Accept or decline within 4 business hours of dispatch creation |
| Production start | Begin within 24 hours of acceptance |
| Status update cadence | Move dispatch through state transitions in real time (PRODUCING when started, QUALITY_CHECK when started, etc.) — don't batch-update at end of week |
| Change-request response | Respond to any creator change request within 24 hours via the partner UI |
| Shared Slack channel | Pavel + creator + you. Critical issues go here first |
| QC sign-off | Before SHIPPED, attach photos of the finished goods to the dispatch |
| Tracking | Real tracking number, real carrier. No "delivered" without a tracking event |
| Quality response | If creator files a quality concern, response within 24 hours through Pavel-mediated thread |

Ask after each: *"Anything in there you can't commit to?"*

If they push back on the 4-hour acceptance SLA — that's the one most likely to surface. Negotiate down to 8 hours if necessary; less than that and the beta operational tempo breaks. **Anything looser than 8 hours and they're not a fit for cohort 1.**

### Insurance + cert review timing

> "Before we go live, I'll need:
> - General liability insurance certificate ($1M+ recommended; $2M+ standard for food/supplements) — uploaded to your `/partner/certifications` page
> - Product liability insurance certificate — same
> - Your cGMP / NSF / USDA Organic / kosher / halal certs (whichever you have) — uploaded
> - Your facility registration number (FDA, if applicable)
>
> All of this lives in your partner portal under `/partner/certifications`. We verify each one before activating you. Realistic timing — can you get all this to me in the next 5 business days?"

If they say "5 days is tight" — flag for follow-up. Cohort can't kickoff until everything's verified. Worst case: they finish certs after kickoff and are activated later in cohort 1.

### Commercial conversation

> "Here's the commercial side. Three things to lock today, two to lock during onboarding."

**Lock today:**

1. **Marketplace commission tier.** "Starting tier for cohort 1 is Verified — that's a 15% commission to iLaunchify on creator revenue (note: per `ilaunchify-marketplace-decisions-2026-06-01.md`, partner tiers are still placeholder names; don't make behavioral promises). The way the math works: creator pays $X, of which the platform fee component goes to iLaunchify, the rest goes through Stripe Connect to you, minus the marketplace commission. We can talk through a worked example after this call if helpful."

2. **Pricing model.** "Per our pricing-data model (`packages/marketplace`), creators see prices based on the ladder you set per service per packaging system. Each dispatch flows through your pricing rules. You set base price + volume tiers — we just route. For cohort 1, give me your pricing ladder per product format by end of week so we can publish."

3. **Payout schedule.** "Stripe Connect Express, standard 2-day rolling. You'll get a notification + transfer line item every time a dispatch hits SHIPPED status. We don't accelerate during beta but we also don't delay."

**Lock during onboarding (call-out so they know to expect it):**

4. **Per-creator deal cards.** "Not relevant for cohort 1, but mentioning so it's not a surprise — at GA, premier-tier partners can negotiate per-creator rate cards. Cohort 1 is flat pricing across creators."

5. **Subscribe & Save commitments.** "V1.5+ — not in cohort 1. Mentioned only so you know it's coming."

---

## Block 3 — Stripe Connect + first dispatch commitment (20-30 min)

### Stripe Connect Express setup walk-through

This is the single highest-friction step in partner activation. Do it on the call, not async.

> "Let's set up your Stripe Connect Express account right now while I'm here. It takes about 8 minutes if your business banking docs are handy. I'll stay on while you do it so I can troubleshoot if anything errors."

The partner navigates:
1. `/partner/onboarding` → Section 4 Payment & Contract step
2. Click "Set up Stripe Connect" — opens Stripe-hosted onboarding flow
3. Walk through:
   - Business type (sole prop / LLC / corporation)
   - EIN
   - Business address
   - Bank account routing + account number
   - Principal contact info + SSN (for KYC)
   - Business website
4. Return to `/partner/onboarding` — KYB pending state

If KYB takes more than the call duration: **stay on the line until they're at "submitted" with Stripe.** Anything less and the partner gets distracted and the activation stalls.

If Stripe surfaces an immediate KYB issue (rare but possible — usually business-class or country-code): note it, escalate, schedule a Stripe-issue-specific call within 48 hours.

### Capability layer — finalize on call

While Stripe is processing, walk through their `/partner/services` page together. Confirm:
- All declared services have a `PartnerService` row
- Each `PartnerService` has the correct `substrates[]`, `packagingMaterials[]`, `finishes[]` (G3 + F1 wiring)
- MOQ + base price per service is filled in
- Lead-time range is set

This isn't optional. The dispatch routing logic in `packages/orders/routing.ts` depends on this data being accurate. **If a partner's PartnerService is incomplete, they cannot receive routed dispatches.**

### Standards layer — operational standards stamp

Per W3 (#185), `OPERATIONAL_STANDARDS` section gets stamped when the partner accepts the contract. Walk through what those standards say:

- Acceptance SLA: 4 business hours (or negotiated 8h)
- Production start SLA: 24 hours from acceptance
- Status update real-time policy
- Quality dispute response: 24 hours
- Insurance minimums

Confirm they accept verbally. Send the Partner Agreement via DocuSign in parallel.

### First-dispatch commitment

> "Last thing — which creator are you most likely to take a first dispatch from? Based on what I'm hearing, [creator name] fits your format best. Their target order is [N units of Y format]. Would you commit to accepting their first dispatch when it comes through?"

If they say yes — note in `BetaParticipant.firstDispatchCommitment` (see schema spec). This is the most important call output.

If they say "depends on the spec" — fair. Schedule a 15-min spec-share call within the week to lock.

If they say "we don't have capacity to commit yet" — yellow flag. Capacity is the table-stakes for cohort 1. Address before ending call.

### Close

> "Couple of last things. (1) Watch your inbox for the Partner Agreement DocuSign — sign by [date]. (2) The Slack workspace invite goes out the day your agreement is countersigned. (3) We have weekly partner office hours every [day] — totally optional, drop in for any operational question. (4) My cell number's in the welcome email — for cohort 1 you have direct line to me, period."

---

## Decisions captured on the call

| Decision | Captured to | Notes |
| --- | --- | --- |
| Service types active | `PartnerService` rows | Verified verbally |
| Lead time per service | `PartnerService.leadTimeDays` | Real number |
| MOQ per service | `PartnerService.moq` | Real number |
| Substrates / materials / finishes | `PartnerService.substrates[]`, etc. | Catalog-mapped |
| Cert upload commitment date | `BetaParticipant.certUploadCommitDate` | Hard date |
| SLA commitment (4h or 8h) | Partner Agreement + `BetaParticipant.acceptanceSlaHours` | Captured |
| Stripe Connect submission state | `Partner.stripeConnectStatus` | Live |
| Commission tier | `Partner.tier` = VERIFIED | Per cohort 1 default |
| First-dispatch creator commitment | `BetaParticipant.firstDispatchCommitment` | The most important field |
| Insurance certificate status | `BetaParticipant.insuranceCertStatus` | "Submitted / Outstanding" |

---

## Post-call follow-up email template

Send within 2 hours.

```
Subject: iLaunchify partner beta — recap + your action items

Hi [first name],

Great talking. Recap:

What we agreed:
- Service tiers active: [list]
- Lead times: [list]
- Acceptance SLA: [4 or 8] business hours
- Commission tier: Verified (15% commission to iLaunchify)
- First dispatch likely match: [creator name + format + units]

Your action items (next 5 business days):
1. DocuSign Partner Agreement → in your inbox, please sign by [date 48 hrs out]
2. Upload to `/partner/certifications`: insurance (GL + product), cGMP/NSF/etc. — link in your portal
3. Finalize pricing ladder per service — I'll send a template; takes ~20 min
4. Complete Stripe Connect (if still pending) — link in onboarding

Once 1-3 are done, you go ACTIVE in our system and start receiving dispatches.

The Slack workspace invite goes out the moment your agreement is countersigned. I'll be in your channel from day 1.

Anything else, hit reply or call me — [cell].

— Pavel
```

---

## 48-hour touchpoint (Day 2)

**Format:** Async Slack thread or 15-min Zoom if Stripe KYB hit a snag.

Goals:
- Confirm DocuSign signed
- Confirm Stripe Connect cleared KYB
- Confirm cert uploads in progress

If any are blocked — hop on a 15-min Zoom and resolve live.

---

## 7-day touchpoint (Day 7)

**Format:** 15-min Zoom or async Slack.

**Pavel posts in their channel:**

```
Hey [name] — checking in on day 7. Quick status:

1. Are all your certs uploaded?
2. Pricing ladder ready?
3. Stripe Connect ACTIVE?
4. PartnerService rows complete in the admin?

If all four yeses, you're activation-ready. I'll move you to UNDER_REVIEW today and you should be ACTIVE in 24-48 hours.

If any nos, what do you need from me?
```

Goal: every partner is ACTIVE by day 7. **Cannot do production routing to a non-ACTIVE partner.**

---

## 14-day touchpoint (Day 14)

**Format:** 20-min Zoom. Goal: first dispatch accepted and in PRODUCING.

**Agenda:**

1. **Their first dispatch.** Walk through their inbox. Confirm they understand the partner UI.
2. **Demystify the workflow.** Show them where the creator's design lives, where the order manifest is, where the multi-partner approval gate is.
3. **Pre-emptive Q&A.** "What questions do you have that haven't come up yet?"
4. **Schedule first SHIPPED check-in.** Once their first dispatch hits READY, we sync 1:1 to walk through the SHIPPED transition (Stripe transfer fires).

Capture: any partner-side friction, any open product / spec questions, any creator-side issues that the partner is seeing first.

---

## What to never do on these calls

- **Never promise routing volume.** "You'll get X dispatches per week" — we don't know yet. Frame as "we're routing the cohort's organic order flow."
- **Never overstate the platform's automated state.** If a flow requires Pavel-in-the-loop manual orchestration during beta, say so. Partners respect honesty about operational reality more than they tolerate "everything's automated" mis-sets.
- **Never apologize for the commission rate.** It's standard for orchestration platforms. If they push back, explain what they get for it: orchestration, payment guarantee, dispute mediation, marketplace placement.
- **Never let them off the call without a Stripe-Connect-submitted state.** Even if KYB is pending, the submission has to happen on the call.
- **Never skip the operational standards walk-through.** Partners who don't hear the SLA verbally + accept it verbally tend to forget it.
- **Never promise a creator's order to a specific partner before the screening is complete on both sides.**
- **Never let partner-side anxiety about "what if a creator stiffs me" go unaddressed.** Explain Stripe Connect, escrow during dispatch, how the application fee mechanic protects them. Partners deserve to feel financially safe.
