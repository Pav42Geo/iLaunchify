import { requireCapability } from '@ilaunchify/auth'
import { getDomainSettings, DOMAIN_KEYS, type DomainKey } from '@ilaunchify/db'
import { DomainTogglesClient, type DomainRow } from './DomainTogglesClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Product Domains — Admin' }

// Per-domain display meta. `flowLive` reflects whether the partner builder has a
// working flow for the domain today (OTC's Drug Facts renderer exists, but the
// OTC formulation flow isn't built — so it ships disabled).
const DOMAIN_META: Record<DomainKey, { label: string; artifact: string; flowLive: boolean }> = {
  FOOD: { label: 'Food / Beverage', artifact: 'Nutrition Facts (21 CFR 101.9)', flowLive: true },
  DIETARY_SUPPLEMENT: { label: 'Supplement', artifact: 'Supplement Facts (21 CFR 101.36)', flowLive: true },
  COSMETIC: { label: 'Cosmetic', artifact: 'INCI declaration (21 CFR 701.3)', flowLive: true },
  PET_PRODUCT: { label: 'Pet', artifact: 'Guaranteed Analysis (AAFCO)', flowLive: true },
  OTC: { label: 'OTC drug', artifact: 'Drug Facts (21 CFR 201.66)', flowLive: false },
}

export default async function ProductDomainsPage() {
  await requireCapability('platform:admin')
  const settings = await getDomainSettings()
  const rows: DomainRow[] = DOMAIN_KEYS.map((k) => ({
    key: k,
    label: DOMAIN_META[k].label,
    artifact: DOMAIN_META[k].artifact,
    flowLive: DOMAIN_META[k].flowLive,
    enabled: settings[k],
  }))

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-[var(--bg-hero)] px-7 py-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-900">Product Domains</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-600">
          Turn each product domain on or off for the partner new-product builder. Disabled domains
          don’t appear in the domain picker, and the change is enforced server-side. OTC (Drug Facts)
          ships disabled until its builder flow is live.
        </p>
      </div>

      <DomainTogglesClient rows={rows} />
    </div>
  )
}
