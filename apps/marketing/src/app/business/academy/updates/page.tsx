import { AcademyUpdatesPage } from '@/components/academy/pages'
import { updatesMetadata } from '@/components/academy/metadata'

export const dynamic = 'force-dynamic'
export const metadata = updatesMetadata('PARTNER')

export default async function Page() {
  return AcademyUpdatesPage({ audience: "PARTNER" })
}
