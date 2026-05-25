// Dropdown options for the packaging forms. Mirrors the enums in
// packages/db/prisma/schema.prisma — keep in sync with PackagingTopology /
// FlavorMode / FlavorPolicy / PackagingStatus.

import type {
  PackagingTopology,
  FlavorMode,
  FlavorPolicy,
  PackagingStatus,
} from '@prisma/client'

export const TOPOLOGY_OPTIONS: Array<{ value: PackagingTopology; label: string; hint: string }> = [
  { value: 'SINGLE_CONTAINER', label: 'Single container', hint: 'One jar, bottle, pouch, can, or box.' },
  { value: 'MULTI_CONTAINER_BOX', label: 'Multi-container box', hint: 'Outer carton holding N inner containers (variety pack).' },
  { value: 'STICK_PACK', label: 'Stick pack', hint: 'Single-serve sticks (powder, supplement).' },
  { value: 'SACHET', label: 'Sachet', hint: 'Single-serve flexible sachets.' },
  { value: 'CASE', label: 'Case / shipper', hint: 'Wholesale unit (24-pack, etc.).' },
  { value: 'CAPSULE_JAR', label: 'Capsule jar', hint: 'Bottle of capsules/tablets (supplement form factor).' },
  { value: 'POUCH_STAND_UP', label: 'Stand-up pouch', hint: 'With resealable zipper.' },
  { value: 'POUCH_FLAT', label: 'Flat pouch', hint: 'Flat sealed pouch.' },
  { value: 'TUBE', label: 'Squeeze tube', hint: 'Sauces, gels.' },
  { value: 'OTHER', label: 'Other', hint: 'Not listed above.' },
]

export const FLAVOR_MODE_OPTIONS: Array<{ value: FlavorMode; label: string; hint: string }> = [
  { value: 'SINGLE', label: 'Single flavor', hint: 'One flavor per unit (1 jar = 1 flavor).' },
  { value: 'MULTI', label: 'Multi-flavor', hint: 'Multiple flavors per unit (variety pack).' },
]

export const FLAVOR_POLICY_OPTIONS: Array<{ value: FlavorPolicy; label: string; hint: string }> = [
  { value: 'CREATOR_PICK', label: 'Creator picks flavors', hint: 'Creator selects flavor(s) per unit.' },
  { value: 'PARTNER_FIXED', label: 'Partner-fixed assortment', hint: 'Creator can&apos;t customize the mix.' },
]

export const STATUS_LABELS: Record<PackagingStatus, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  ACTIVE: { label: 'Active', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  RETIRED: { label: 'Retired', cls: 'bg-amber-100 text-amber-800 ring-amber-200' },
}

// Quick lookup for the topology pill on the list page
export function topologyLabel(t: PackagingTopology): string {
  return TOPOLOGY_OPTIONS.find((o) => o.value === t)?.label ?? t
}
