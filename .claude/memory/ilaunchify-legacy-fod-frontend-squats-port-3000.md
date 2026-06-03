---
name: ilaunchify-legacy-fod-frontend-squats-port-3000
description: "Pavel's Mac runs a legacy `ilaunchify-frontend` Docker container (the old FOD app) on port 3000. ANY localhost:3000 weirdness — 500s, 404s, stale Prisma errors, unfamiliar UI — check `docker ps | grep frontend` first. It silently serves the wrong responses and burns a debugging hour every time."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

When Pavel reports broken behaviour at `localhost:3000` (500s, 404s, "Unknown field" Prisma errors, missing pages, stale UI), the FIRST diagnostic must be:

```bash
docker ps | grep frontend
```

If there's an `ilaunchify-frontend` container listed (it's the legacy FOD frontend rebranded), it's squatting on port 3000 and Pavel's browser has been talking to that — NOT to the new V1 creator dev server. Every Prisma error, every "field doesn't exist", every 404 is misleading because the container has a different codebase and a different database schema.

**Why:** Lived through this 2026-05-30. Spent the better part of an hour debugging a `subscriptionTier` Prisma error that looked like a stale-client issue (and partially was — `[[ilaunchify-dev-prisma-restart]]`), but the deeper root cause was that the old FOD container had been holding port 3000 since a Mac reboot 12 minutes earlier. Even after killing and "restarting" the creator dev server, requests still hit the wrong app because `pnpm dev` failed to bind (`EADDRINUSE`). Pavel landed on Option B (stop the whole legacy stack) and we were unblocked instantly.

**How to apply:**
1. Before deep-diving any localhost:3000 error, ask Pavel to run `docker ps | grep frontend`. If `ilaunchify-frontend` is listed: `docker stop ilaunchify-frontend ilaunchify-data-api ilaunchify-backend` then retry.
2. The full legacy stack to stop if you want a clean slate (keep `cockroach`, `redis`, `minio`, `postgres`, `elasticsearch`): `ilaunchify-frontend`, `ilaunchify-data-api`, `ilaunchify-backend`, `ilaunchify-calc-service`, `ilaunchify-export-worker`, `ilaunchify-inventory-service`, `ilaunchify-payments-service`, `ilaunchify-vendor-order-service`, `ilaunchify-subscriptions-service`, `ilaunchify-nutrition-worker`, `ilaunchify-category-management-service`, `ilaunchify-order-management-service`, `ilaunchify-product-management-service`, `ilaunchify-food-safety-service`, `ilaunchify-user-management-service`, `ilaunchify-creator-marketplace-service`, `ilaunchify-orders-service`, `ilaunchify-pds-service`, `ilaunchify-keycloak`, `ilaunchify-kong`, `ilaunchify-prometheus`, `ilaunchify-jaeger`.
3. `lsof -i:3000` confirms what's listening — if it's a Docker container the PID will be `com.docke` (Docker Desktop).
4. The new V1 ports are 3000 (creator), 3002 (partner), 3003 (admin), 3010 (marketing). Legacy FOD container collisions are on 3000, 3001, and 4000.

Related: [[ilaunchify-dev-prisma-restart]] often gets blamed; in reality the squatting container is the root cause when "restart didn't help."
