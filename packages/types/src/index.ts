// Shared TypeScript domain types across all apps.
//
// What goes here:
// - Domain models that map to Prisma but are slimmed for app-side use
// - Zod schemas for runtime validation (especially for forms + API boundaries)
// - Discriminated unions for capability profiles per ServiceType
// - Compliance result types (returned by services/compliance)
//
// What does NOT go here:
// - Prisma client types (those come from @ilaunchify/db)
// - UI-specific types (those live in apps or @ilaunchify/ui)

export * from './compliance'
export * from './service-capabilities'
export * from './brand'
export * from './payments'
// Tier 1.2 (docs/SECURITY_ARCHITECTURE.md) — Zod at server-action boundaries.
export * from './action-input'
// Marketplace filter option constants (§7) — shared by the marketing sidebar
// and the admin product editor so filter slugs never drift.
export * from './marketplace-filters'
