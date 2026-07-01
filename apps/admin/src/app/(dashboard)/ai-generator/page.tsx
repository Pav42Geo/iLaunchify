import { AdminPageHeader } from '@/components/AdminPageHeader'
import { getAiGeneratorSettings, listAiOutputPresets } from './actions'
import { AiGeneratorForms } from './AiGeneratorForms'
import { tierLimits, resolveOutputPolicy, providerStatus, type CreatorBillingTier, type TierGenerationLimits, type OutputPolicy } from '@ilaunchify/imagegen'
import { resolveDomainOptions, type LabelingDomain, type DomainPreset } from '@ilaunchify/ai-design'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'AI Generator — Admin' }

const METERED_TIERS: CreatorBillingTier[] = ['builder', 'agency']
const OUTPUT_TIERS: CreatorBillingTier[] = ['maker', 'builder', 'agency']
const DOMAINS: LabelingDomain[] = ['FOOD', 'DIETARY_SUPPLEMENT', 'OTC', 'COSMETIC', 'PET_PRODUCT']

export default async function AiGeneratorSettingsPage() {
  const settings = await getAiGeneratorSettings()
  const presets = await listAiOutputPresets()

  // Effective values = pure-engine defaults merged with the admin overrides.
  const tierLimitsEff: Record<string, TierGenerationLimits> = {}
  for (const t of METERED_TIERS) tierLimitsEff[t] = tierLimits(t, settings.tierLimits[t] as Partial<TierGenerationLimits> | undefined)

  const domainEff: Record<string, DomainPreset> = {}
  for (const d of DOMAINS) domainEff[d] = resolveDomainOptions(d, settings.domainVocab[d] as Partial<DomainPreset> | undefined)

  const outputEff: Record<string, OutputPolicy> = {}
  for (const t of OUTPUT_TIERS) outputEff[t] = resolveOutputPolicy(t, settings.outputPolicies[t] as Partial<OutputPolicy> | undefined)

  const provider = providerStatus(process.env as Record<string, string | undefined>)

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="AI Packaging Generator"
        title="Generator settings"
        description={<>Tier limits, per-domain creative vocabulary, and output presets. Overrides the code defaults with no deploy.</>}
      />
      <AiGeneratorForms
        tierLimits={tierLimitsEff}
        domains={domainEff}
        outputPolicies={outputEff}
        presets={presets}
        gates={settings.gates}
        provider={provider}
      />
    </div>
  )
}
