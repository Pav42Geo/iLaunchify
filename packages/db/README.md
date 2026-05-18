# @ilaunchify/db

Prisma schema + generated client, shared across all apps and the Python compliance service.

## Status

**Schema is not yet ported.** Week-1 task: copy `FOD-reference/prisma/schema.prisma` here as the starting point, then clean it for V1.

### Port checklist

When porting the schema:

- [ ] Copy `FOD-reference/prisma/schema.prisma` to `packages/db/prisma/schema.prisma`
- [ ] Update `datasource` block — keep `provider = "cockroachdb"`, update `url = env("DATABASE_URL")`
- [ ] Drop models not used in V1 (DesignDraft, AuditLog, SearchIndex, CacheEntry) — or mark them with a comment saying "V2"
- [ ] Add `ManufacturerDisclosure` model (see ARCHITECTURE.md for the spec)
- [ ] Add `OrderDispatch` model if not already a clean abstraction over the existing Order/OrderItem
- [ ] Run `pnpm db:generate` to verify it generates cleanly
- [ ] Run `pnpm db:migrate --name init` to create the initial migration — verify the SQL is sensible
- [ ] Write `prisma/seed.ts` with: 1 admin user, 1 sample creator, 1 sample manufacturer, 1 sample print provider, the US market row, the two rule packs (food + supplements)

## Usage from other workspaces

```ts
import { prisma } from '@ilaunchify/db'

const products = await prisma.product.findMany({ where: { creatorId } })
```

The Prisma client is a singleton wrapped with Next.js-friendly hot-reload handling. See `src/index.ts`.

## Usage from the Python compliance service

The Python service uses [Prisma Python Client](https://prisma-client-py.readthedocs.io/) against the same `schema.prisma`. It's read-heavy; the only writes are `ComplianceCheck` audit-log rows.

```python
from app.db import prisma  # wrapper that initializes the Prisma Python client
products = await prisma.product.find_many(where={"creator_id": creator_id})
```
