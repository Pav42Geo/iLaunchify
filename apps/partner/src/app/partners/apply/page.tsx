import { Brand } from '@ilaunchify/ui'
import { getPublicBrandLogos, getLogoPlacement, prisma } from '@ilaunchify/db'
import { marketingUrl } from '@/lib/marketing-url'
import { resolveCertBadgeUrls } from '@/lib/cert-badges'
import { ApplicationWizard } from './ApplicationWizard'

export const metadata = { title: 'Apply to join the iLaunchify partner network' }

type ServiceT = 'MANUFACTURING' | 'COPACKING' | 'LABEL_PRINTING' | 'WAREHOUSE'
const VALID = new Set<ServiceT>(['MANUFACTURING', 'COPACKING', 'LABEL_PRINTING', 'WAREHOUSE'])

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const raw = (await searchParams).type as ServiceT | undefined
  const type: ServiceT = raw && VALID.has(raw) ? raw : 'MANUFACTURING'

  const [logos, placement] = await Promise.all([
    getPublicBrandLogos(),
    getLogoPlacement('businessHeader'),
  ])

  // Certificate library for the step-4 picker.
  const certTypes = await prisma.certificateType.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, slug: true, name: true, description: true, thumbnailFileId: true },
    orderBy: { name: 'asc' },
  })
  const badgeUrls = await resolveCertBadgeUrls(certTypes.map((t) => t.thumbnailFileId))
  const certOptions = certTypes.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    description: t.description,
    thumbnailUrl: t.thumbnailFileId ? (badgeUrls.get(t.thumbnailFileId) ?? null) : null,
  }))

  // Real Region data for the company-location state/region dropdown (same source
  // onboarding uses). State-level only; active only.
  const regionRows = await prisma.region.findMany({
    where: { kind: 'STATE_PROVINCE', isActive: true },
    select: { code: true, name: true },
    orderBy: { name: 'asc' },
  })
  const regions = regionRows.map((r) => ({ code: r.code, name: r.name }))

  return (
    <div className="min-h-screen bg-ink-50">
      {/* Dark appbar — business-landing logo + the Application → Onboarding →
          Activation stepper (Application active), matching the approved prototype. */}
      <header className="sticky top-0 z-40 bg-ink-900 text-white">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <a href={marketingUrl('/business')} className="flex items-center">
            <Brand
              label="iLaunchify"
              sublabel={placement.sublabel ?? 'Business'}
              imageSrc={logos.fullDark}
              wordmarkClassName="text-white"
              sublabelClassName="text-neon-500"
            />
          </a>
          <nav className="flex items-center gap-1 rounded-full bg-white/10 p-1">
            <span className="rounded-full bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-ink-900">
              Application
            </span>
            <span className="rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-ink-300">
              Onboarding
            </span>
            <span className="rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-ink-300">
              Activation Setup
            </span>
          </nav>
          <span className="ml-auto text-[12px] text-ink-300">✦ Private beta · ~2 min</span>
        </div>
      </header>

      <ApplicationWizard defaultServiceTypes={[type]} certOptions={certOptions} regions={regions} />
    </div>
  )
}
