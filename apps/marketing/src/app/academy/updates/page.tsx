import { AcademyUpdatesPage } from '@/components/academy/pages'
import { updatesMetadata } from '@/components/academy/metadata'

export const dynamic = 'force-dynamic'
export const metadata = updatesMetadata('CREATOR')

export default async function Page() {
  return AcademyUpdatesPage({ audience: "CREATOR" })
}
