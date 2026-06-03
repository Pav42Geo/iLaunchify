---
name: ilaunchify-rsc-boundary-config
description: "Don't pass Lucide-icon-bearing config across the server→client boundary in Next 15 / React 19. Hit twice (R15.d AccountTierEditor + AdminSidebar). Import config inside the client component instead."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

Static config that contains React component references (Lucide icons,
shadcn primitives, anything with `$$typeof` + `render`) cannot be passed
as a prop from a Server Component to a Client Component in Next 15 / React 19.
Runtime error: *"Functions cannot be passed directly to Client Components
unless you explicitly expose it by marking it with 'use server'."*

**Why:** React's serialization payload across the RSC boundary only carries
JSON-shaped values. Component references are opaque objects whose `render`
field is a function — there's no protocol to ship them.

**How to apply:** When the config tree contains icons (or any component
reference), the client component imports the config directly. The server
component passes ONLY serializable data — strings, numbers, plain
objects/arrays.

```ts
// ❌ Server component (crashes):
import { CONFIG } from './config'  // CONFIG contains { icon: SomeLucideIcon }
return <ClientTree config={CONFIG} data={data} />

// ✅ Server component (works):
return <ClientTree data={data} />
```

```ts
// ✅ Client component reads config itself:
'use client'
import { CONFIG } from './config'
export function ClientTree({ data }: { data: Data }) {
  return CONFIG.map(...).map(item => <Row icon={item.icon} {...item} />)
}
```

**Incidents:**
- `R15.d-fix` (commit ~5f0e98a) — AccountTierEditor crash when admin actions
  were threaded as props from a server tab to a client drawer. Fix: import
  the actions directly inside the drawer.
- `407c937` (2026-05-31) — AdminSidebar crash passing `SIDEBAR_REGIONS` to
  `AdminSidebarTree`. Same root cause: config contained Lucide icon refs.
  Fix: client tree imports SIDEBAR_REGIONS itself; server only passes the
  `badges` Record.

**Mental model:** If the prop's type would include a function or a
`React.ComponentType` anywhere, that prop cannot cross the server→client
boundary as-is. Refactor so the function/component lives on the side that
needs it.
