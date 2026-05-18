# @ilaunchify/creator

The creator-facing app: signup, product builder, label preview, compliance check, publish, dashboard.

## V1 routes (planned)

```
/                              → Marketing landing
/signup                        → Creator signup (Google / email magic link)
/login                         → Login
/dashboard                     → Creator home: products, orders, stats
/products/new                  → Product builder, step 1: category + template
/products/[id]/recipe          → Recipe builder (ingredients, USDA search)
/products/[id]/label           → Label preview + compliance result
/products/[id]/manufacturer    → Choose manufacturer from filtered list
/products/[id]/print-provider  → Choose print provider
/products/[id]/publish         → Final review → publish to /{handle}/{slug}
/orders                        → Incoming orders list
/orders/[id]                   → Order detail with dispatch status
/settings                      → Profile, payouts, storefront customization
```

## Out of V1

Marketplace browsing of creators, multi-product bundles, Subscribe & Save UI, A/B testing storefronts.
