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
