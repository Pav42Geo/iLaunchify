# Keychain vs. iLaunchify — What to Extract for Sustainability

_Prepared 2026-06-14. Strategy memo, not a spec. The disintermediation worry you raised is the right thing to worry about, and the answer is already latent in your own orchestration thesis — it's a sequencing problem, not a strategy problem._

---

## 1. What Keychain actually is (and the one lesson that matters)

Keychain ($68M raised, launched Feb 2024, 30k+ manufacturers, 20k+ brands, >$1B/month in manufacturing projects) started life as **exactly the thing you're afraid of becoming**: an AI sourcing/matching marketplace that helps brands "quickly find the perfect manufacturing partner."

The important part is what they did **next**, because matching is a leaky business and they knew it:

- **KeychainOS** — an AI operating system that *runs the manufacturer's facility* (safety, waste, bottleneck prediction, planning, inventory, compliance, traceability). It explicitly replaces the ERP stack (Oracle/QAD/Plex + TraceGains/Redzone) and "deploys in days, not months."
- **Keychain360** — centralizes supplier discovery, relationship management, and product-development workflow for the brand side.
- **Revenue model** — **brands use it for free; manufacturers pay usage-based SaaS.** They monetize the side that lives in the system every day, not the transaction.

The lesson in one sentence: **they stopped selling the match and started selling the system of record.** A match is consumed once and then the intermediary is dead weight. An operating system is used every day and leaving it is painful. They moved the moat from "we introduced you" to "we run your operations."

Note the irony worth remembering: Keychain's CEO and a co-founder (Hanrahan, Dua) previously built Handy/Angi — a home-services matching marketplace that **bled exactly the disintermediation you described** (customer meets cleaner once, then books direct off-platform forever). They learned this lesson the expensive way. You can learn it for free.

---

## 2. Why your instinct is correct — the structural leak

A pure matching marketplace has a built-in death mechanism:

> The intermediary's value is highest at the moment of introduction and drops toward zero on every reorder. Once buyer and seller trust each other, both sides are financially motivated to cut out the fee. The first order is the only one you're guaranteed.

For iLaunchify specifically, after a creator's first order they now know: the manufacturer's identity, their real capabilities, their per-unit pricing, and that the product works. The reorder is a repeat transaction between two parties who already trust each other — **the single lowest-value moment for an orchestrator.** If your value proposition was "we found you a manufacturer," that value has already been spent.

Your `CLAUDE.md` and memory already say the right thing — *"we are an orchestration platform, not a matching marketplace... we decompose each order into a workflow graph and hide the orchestration."* The problem is that **V1 ships Mode 1 (direct routing)**, which behaviorally *is* a matching marketplace. So V1 is the leaky window. Everything below is about closing it.

---

## 3. The retention playbook — make the reorder *worse* off-platform

The goal is not to trap creators. It's to make staying obviously the lazy, cheaper, safer choice — so that "going direct" means giving up real value, not just dodging a fee. Seven levers, ranked by how much moat they buy and how much you've already built.

### Lever 1 — Own the product's source of truth (the Keychain move; you're half-done)
Become the canonical home of the **regulator-ready product definition**: recipe, FDA-compliant nutrition/supplement/drug-facts label, INCI/AAFCO artifacts, dieline, spec-sheet snapshot, GTIN, brand assets. You already build *all of this* (nutrition engine, label renderer, compliance packs, GTIN model, spec-sheet snapshot, brand asset library). 

If the legally-defensible, print-accurate product definition lives in iLaunchify and every reorder/label update flows from it, then **going direct means rebuilding all of it by hand and self-owning compliance liability.** That is a genuinely scary trade for a creator. This is your biggest lever and it's mostly already in the codebase — the work is *framing and surfacing* it as "this is your product's system of record," not buried plumbing.

### Lever 2 — Abstract the counterparty (the orchestration thesis)
In a multi-partner workflow graph the creator never has a single "the manufacturer" to phone. The order is split across manufacturer + printer + co-packer + warehouse. Even in V1 Mode 1, you control **how much partner identity you expose** — exposing the full manufacturer name + raw per-unit price on the order detail is handing them the disintermediation kit. Decide deliberately what the creator sees. V2 pooling makes going direct *structurally impossible* because no single partner fulfills the order.

### Lever 3 — Aggregate demand so leaving costs them money (your stated V2 moat)
Pooling across creators buys volume pricing a solo creator can never get going direct. This **inverts the economics of leaving**: today the fee is the cost of staying; with pooling, the lost volume discount is the cost of leaving. This is the single cleanest answer to "why wouldn't they go direct" — *because they'd pay more.* Memory already names this as the moat; the strategic point is that until it ships, you're relying on Levers 1, 4–7 to hold the line.

### Lever 4 — Make reorder one-click and make it *feel free*
Re-ordering on-platform must be so frictionless (saved config, saved pricing tier, buffer inventory, one button) that the effort of going direct — re-sourcing, re-negotiating MOQs, re-sending artwork, re-running compliance, arranging freight, setting payment terms — dwarfs any fee saved. Friction is a moat. A direct reorder is *work*; yours should be a click.

### Lever 5 — Fix the fee model so loyalty isn't punished (the Keychain pricing lesson)
Keychain makes the buyer side free and charges the operational side. Look hard at your creator-paid per-order production fee: **a visible line-item "platform fee" on every reorder is a recurring reminder of the cost of staying** — it actively teaches creators to resent you and shop around. Options:
- Blend the fee into a single creator price (no visible "iLaunchify tax").
- Shift more monetization to a **flat subscription** (you already have Maker/Builder/Agency) so the marginal reorder feels free — "production at cost + membership" beats "rake per order" for retention.
- Consider charging more on the partner side, which is operationally stickier.

This one is cheap to change and directly attacks the psychology of leaving.

### Lever 6 — Own the channel + data layer
Sync to Shopify / TikTok Shop, pull sales velocity, trigger reorders automatically from inventory thresholds. Once iLaunchify is the connective tissue between their sales channel and production, **going direct breaks their automation** — they'd be trading a system that reorders for them for spreadsheets and emails.

### Lever 7 — Anti-circumvention in the partner contract
Your fixed standard partner contract (V1) should carry a non-solicitation / no-direct-dealing clause for relationships originated through the platform. Weak on its own and hard to police, but it raises the cost and supports every other lever. Partners also benefit from pooling/buffer demand, so their incentive to defect is lower than the creator's.

---

## 4. The reframe

Stop selling **matchmaking**. Start selling **"we run the boring, risky, regulated, multi-vendor operations of being a CPG brand so you never have to."** The match is a loss-leader to acquire the creator; the operating system around the match is the actual business. That is precisely Keychain's arc — and it's already written into your own thesis. The gap is only that V1 leads with the leakiest mode, so the retention levers above need to be *visible to the creator in V1*, not parked in V2.

---

## 5. Recommended priority for V1 (closing the leak before pooling ships)

1. **Reframe the product surface around "your product's system of record"** — make the creator feel the compliance/label/spec/GTIN value they'd forfeit by leaving. (Mostly built; needs surfacing + narrative.)
2. **Decide your counterparty-exposure policy** — stop auto-exposing manufacturer identity + raw unit cost on order/reorder views unless there's a reason to.
3. **Audit the fee model** — kill or hide the per-reorder line-item rake; lean on subscription so reorders feel free. (Cheapest, highest-psychology-ROI change.)
4. **Build one-click reorder** off saved configs.
5. **Sequence pooling (Lever 3) as the headline V2 moat** and start messaging "you get volume pricing you couldn't get alone" *now*, as the reason to consolidate orders on iLaunchify.

You already have the right thesis. The risk you feel is real but narrow: it lives in the V1 window where you behave like a matching marketplace. Close it with system-of-record framing, counterparty abstraction, a smarter fee model, and frictionless reorder — then let pooling make the question moot.

---

### Sources
- [PR Newswire — Keychain $30M Series B / KeychainOS launch](https://www.prnewswire.com/news-releases/keychain-raises-30-million-series-b-and-launches-keychainos-an-ai-operating-system-set-to-power-the-future-of-cpg-manufacturing-302532859.html)
- [AlleyWatch — Keychain $30M Series B](https://www.alleywatch.com/2025/08/keychain-cpg-supply-chain-workflow-manufacturing-automation-platform-oisin-hanrahan/)
- [AlleyWatch — Keychain $10M private-label round (Nov 2025)](https://www.alleywatch.com/2025/11/private-label-manufacturing-cpg-retail-supply-chain-platform/)
- [AgFunderNews — Keychain $30M Series B / AI OS](https://agfundernews.com/keychain-raises-30m-series-b-launches-ai-powered-operating-system-for-cpg)
- [VentureBeat — Keychain $30M / AI operating system](https://venturebeat.com/ai/keychain-raises-30m-and-launches-ai-operating-system-for-cpg-manufacturers)
- [Traxtech — KeychainOS / Keychain360 feature breakdown](https://www.traxtech.com/ai-in-supply-chain/keychains-ai-operating-system-transforms-cpg-manufacturing-speed-and-intelligence)
