---
name: clarify-audience-before-building-customer-facing-flows
description: "Before building any \"consumer-facing\" or \"checkout\" flow, explicitly confirm who pays and who owns the customer relationship. Hidden assumption cost an entire app (apps/storefront) of wasted work in May 2026."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

Before scaffolding anything that involves checkout, customer accounts, cart, or consumer-facing pages on iLaunchify, **explicitly confirm with Pavel**:

1. Who pays whom? (creator → iLaunchify, consumer → iLaunchify, consumer → creator's channel?)
2. Who owns the customer relationship? (iLaunchify, creator, partner, channel?)
3. What surface receives the order? (iLaunchify, an external channel like Shopify?)

**Why:** During the May 2026 rebuild I built `apps/storefront` (Hero / ProductGrid / Cart / CartItem / ConsumerUser / brand-themed pages / Stripe consumer checkout) under the assumption that iLaunchify hosted a consumer storefront. Pavel had said multiple times that "frontstores are just connects to creator's channels" — but the implication (iLaunchify is B2B production, not consumer-facing) didn't register. Result: an entire app's worth of code had to be deleted, plus schema cleanup (Cart, CartItem, ConsumerUser models). See [[ilaunchify-business-model]] for the corrected model.

**How to apply:** When the user mentions anything storefront-shaped, channel-shaped, or sales-shaped, pause and trace the money + the customer relationship explicitly before writing schema or routes. A 30-second clarifying question would have saved a week.

Pattern to watch for: anything named "store" / "shop" / "storefront" / "checkout" / "cart" / "consumer" — none of these terms have an obvious owner in a multi-party marketplace. Ask before assuming.
